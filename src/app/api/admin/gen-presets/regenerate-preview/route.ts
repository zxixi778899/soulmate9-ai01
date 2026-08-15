/**
 * POST /api/admin/gen-presets/regenerate-preview
 *
 * Offline preview-thumbnail generation for one catalog preset per call
 * (same queued/resume pattern as admin/preset-portraits so each request
 * stays inside maxDuration). Result is stored at
 * presets/thumbs/{category}-{slug}.{ext} and written back to preview_url.
 *
 * NSFW presets (level ≥ 3) get a sanitized SFW preview prompt — the
 * thumbnail is only a style cue and is blur-locked client-side until the
 * intimacy gate unlocks it, so explicit content is never pre-rendered.
 *
 * body: { category?, slug, force?, job_id? }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { runpodClient } from '@/lib/runpod';
import { routeImageGeneration } from '@/lib/image-router';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { decodeImagePayload, uploadFixedKeyFile } from '@/lib/storage';
import {
  detectImageExt,
  getPresetBySlug,
  isGenPresetCategory,
  presetThumbKey,
  updatePresetPreview,
  type GenPreset,
  type GenPresetCategory,
} from '@/lib/gen-presets/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MIME_BY_EXT: Record<'png' | 'jpeg' | 'webp', string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** SFW stand-ins so NSFW presets never pre-render explicit thumbnails. */
function safePreviewDescription(preset: GenPreset): string {
  if (preset.nsfw_level >= 5) {
    return 'a romantic couple portrait, fully clothed intimate embrace, warm cinematic light';
  }
  if (preset.nsfw_level >= 4) {
    return 'a romantic boudoir portrait, fully clothed elegant sensual outfit, warm low-key light';
  }
  if (preset.nsfw_level >= 3) {
    return 'an elegant fine-art boudoir portrait, tasteful implied presentation with full coverage, soft studio light';
  }
  return preset.prompt_fragment || 'a tasteful portrait scene';
}

async function writebackPreview(
  supabase: SupabaseClient,
  preset: GenPreset,
  imagePayload: string,
): Promise<string | null> {
  try {
    const buffer = decodeImagePayload(imagePayload);
    const ext = detectImageExt(buffer);
    const key = presetThumbKey(preset.category, preset.slug, ext);
    const { url } = await uploadFixedKeyFile(buffer, key, MIME_BY_EXT[ext]);
    await updatePresetPreview(supabase, preset.category, preset.slug, url);
    return url;
  } catch (e) {
    logger.warn('[admin/gen-presets] preview writeback failed', {
      category: preset.category,
      slug: preset.slug,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const categoryParam = String(body.category || 'scene').toLowerCase();
  if (!isGenPresetCategory(categoryParam)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }
  const category: GenPresetCategory = categoryParam;
  const slug = String(body.slug || '').trim().toLowerCase();
  const force = Boolean(body.force);
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const preset = await getPresetBySlug(admin.supabase, category, slug);
  if (!preset) {
    return NextResponse.json(
      { error: `preset not found: ${category}/${slug}` },
      { status: 404 },
    );
  }

  if (!force && preset.preview_url) {
    return NextResponse.json({
      success: true,
      cached: true,
      category,
      slug,
      preview_url: preset.preview_url,
    });
  }

  // ─── Resume path: poll a previously queued GPU job instead of resubmitting ───
  const resumeJobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (resumeJobId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(resumeJobId)) {
      return NextResponse.json({ error: 'invalid job_id' }, { status: 400 });
    }
    try {
      const polled = await runpodClient.pollJob(resumeJobId, {
        poll_budget_ms: 140_000,
        on_timeout: 'pending',
      });
      if (polled.pending || !polled.images?.[0]) {
        return NextResponse.json(
          {
            success: false,
            pending: true,
            job_id: resumeJobId,
            category,
            slug,
            message: 'GPU job still queued — POST again with the same slug + job_id later',
          },
          { status: 202 },
        );
      }
      const url = await writebackPreview(admin.supabase, preset, polled.images[0]);
      if (!url) {
        return NextResponse.json(
          { error: 'job completed but preview writeback failed' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, cached: true, category, slug, preview_url: url, resumed: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[admin/gen-presets] preview resume failed', { category, slug, err: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    // Preview art is always produced on the SFW channel.
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    });
    const prompt = [
      'a polished square portrait thumbnail preview',
      safePreviewDescription(preset),
      'chest-up framing, clear face, both eyes sharp, professional quality, centered composition',
    ].join(', ');

    logger.info('[admin/gen-presets] generating preview', {
      category,
      slug,
      nsfwLevel: preset.nsfw_level,
      modelFamily: route.modelFamily,
    });

    const result = await routeImageGeneration({
      prompt,
      negative_prompt:
        'explicit nudity, sexual acts, exposed genitals, lowres, blurry face, extra fingers, watermark, text',
      width: 768,
      height: 768,
      num_inference_steps: route.steps,
      guidance_scale: route.cfg,
      ckpt_name: route.checkpoint,
      sampler_name: route.sampler,
      scheduler: route.scheduler,
      clip_skip: route.clipSkip,
      model_family: route.modelFamily,
      force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
      endpoint_id: route.endpointId || undefined,
      nsfw: false,
    });

    if (result.pending || !result.images?.[0]) {
      return NextResponse.json(
        {
          success: false,
          pending: true,
          job_id: result.job_id,
          category,
          slug,
          message:
            'GPU job queued — POST again with {category, slug, job_id: "' +
            result.job_id +
            '"} in ~1 minute to resume (do NOT retry without job_id, that submits a new job)',
        },
        { status: 202 },
      );
    }

    const url = await writebackPreview(admin.supabase, preset, result.images[0]);
    if (!url) {
      return NextResponse.json(
        { error: 'generation succeeded but preview writeback failed' },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, cached: true, category, slug, preview_url: url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/gen-presets] preview generation failed', { category, slug, err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
