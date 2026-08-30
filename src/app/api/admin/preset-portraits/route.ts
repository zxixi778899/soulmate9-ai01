/**
 * Admin API: preset shared portrait cache (M3)
 *
 * GET  /api/admin/preset-portraits  → cache status for every library preset
 * POST /api/admin/preset-portraits  → generate + cache ONE preset portrait
 *      body: { slug: string, force?: boolean, job_id?: string }
 *      When job_id is provided, resumes a previously queued GPU job instead of
 *      regenerating (polls up to ~2.5 min, writes back on completion).
 *      multipart/form-data { slug, file } → admin 手工上传图片直接入缓存。
 * DELETE /api/admin/preset-portraits?slug=xxx → 删除该预设的共享立绘。
 *
 * One portrait per request keeps the route inside maxDuration; call it in a
 * loop (admin UI / script) to batch-fill all 24 presets offline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';
import {
  normalizeCompanionCategory,
  normalizeCompanionRenderStyle,
} from '@/lib/companion-category';
import {
  buildStudioPromptEnhancement,
  studioNegativePrompt,
} from '@/lib/comfy-console/studio-profile';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { routeImageGeneration } from '@/lib/image-router';
import { runpodClient } from '@/lib/runpod';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import { buildReferenceGenerationPlan } from '@/lib/reference-generation-plan';
import { normalizeCreatorPreset, type CreatorPreset } from '@/lib/creator-presets';
import {
  findCachedPresetPortrait,
  writebackPresetPortrait,
  presetPortraitKey,
  markPresetPortraitCached,
  clearPresetPortraitCache,
} from '@/lib/preset-portrait-cache';
import { uploadFixedKeyFile } from '@/lib/storage';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const SLUG_PATTERN = /^[a-z0-9-_]+$/;

function hairColorName(hexOrName: string): string {
  const v = (hexOrName || '').trim();
  if (!v.startsWith('#')) return v || 'brown';
  const map: Record<string, string> = {
    '#000000': 'black',
    '#4a3728': 'dark brown',
    '#6b3a2a': 'brown',
    '#d4a574': 'blonde',
    '#f5d742': 'golden blonde',
    '#e84393': 'pink',
    '#d946ef': 'magenta',
    '#8b5cf6': 'purple',
    '#3b82f6': 'blue',
    '#ef4444': 'red',
    '#ffffff': 'white',
  };
  return map[v.toLowerCase()] || 'colored';
}

/** Portrait prompt assembled purely from preset fields (deterministic per slug). */
function buildPresetPortraitPrompt(preset: CreatorPreset): string {
  const name = (preset.default_name || preset.name || 'an adult companion').trim();
  const visual = (preset.visual_style || 'realistic').toLowerCase();
  const category = normalizeCompanionCategory({ gender: preset.gender });
  const bodyDescription =
    category === 'male'
      ? `${preset.body_type} adult masculine build with broad shoulders and a defined torso`
      : category === 'transgender'
        ? `${preset.body_type} adult feminine silhouette with visibly mixed masculine and feminine physical traits`
        : `${preset.body_type} adult feminine figure with natural proportions`;
  const medium =
    visual === '2d' || visual === 'anime'
      ? 'a polished 2D anime character portrait with fully rendered colors and deliberate cel shading'
      : 'a natural editorial photograph with believable skin texture and soft directional light';

  const sceneParts: string[] = [];
  if (preset.portrait_outfit) sceneParts.push(preset.portrait_outfit);
  if (preset.scene_id) {
    const recipe = GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === preset.scene_id);
    if (recipe) sceneParts.push(`${recipe.env}, ${recipe.light}`);
  }

  const parts = [
    medium,
    `gorgeous young adult ${preset.gender.toLowerCase()} age ${preset.age || 22}-${(preset.age || 22) + 6} named ${name}`,
    `${preset.ethnicity} features, ${preset.face_shape} face shape`,
    `${preset.hair_style} ${hairColorName(preset.hair_color)} hair`,
    `${preset.eye_color} eyes looking at viewer`,
    bodyDescription,
    `wearing flattering ${preset.fashion_style} outfit`,
    sanitizeBlurKeywords(sceneParts.join(', ')).slice(0, 180),
    'clear eyes, complete head in frame, relaxed shoulders, natural asymmetrical posture, coherent hands',
  ].filter(Boolean);

  let prompt = parts.join(', ').replace(/\s{2,}/g, ' ').trim();
  if (prompt.length > 900) {
    prompt = prompt.slice(0, 900);
    const lastComma = prompt.lastIndexOf(',');
    if (lastComma > 700) prompt = prompt.slice(0, lastComma);
  }
  return prompt;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const { data: presets, error } = await admin.supabase
    .from('character_presets')
    .select('id, name, name_zh, slug, rarity, gender, visual_style, sort_order')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('sort_order', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: stats } = await admin.supabase.from('preset_portrait_stats').select('*');
  const statBySlug = new Map(
    ((stats || []) as Record<string, unknown>[]).map((s) => [String(s.slug), s]),
  );

  const rows: Array<Record<string, unknown>> = [];
  for (const p of (presets || []) as Record<string, unknown>[]) {
    const slug = String(p.slug || '');
    if (!slug) continue;
    const cachedUrl = await findCachedPresetPortrait(slug);
    const stat = statBySlug.get(slug) as Record<string, unknown> | undefined;
    rows.push({
      slug,
      name: p.name,
      name_zh: p.name_zh,
      rarity: p.rarity,
      gender: p.gender,
      visual_style: p.visual_style,
      cached: Boolean(cachedUrl),
      portrait_url: cachedUrl || (stat?.portrait_url as string | undefined) || null,
      hits: Number(stat?.hits || 0),
      misses: Number(stat?.misses || 0),
    });
  }

  return NextResponse.json({
    presets: rows,
    total: rows.length,
    cached_count: rows.filter((r) => r.cached).length,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  // ─── Upload path: multipart { slug, file } → 手工上传图片直接写入共享缓存 ───
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await request.formData();
      const slug = String(formData.get('slug') || '').trim().toLowerCase();
      const file = formData.get('file') as File | null;
      if (!slug || !SLUG_PATTERN.test(slug)) {
        return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
      }
      if (!file) {
        return NextResponse.json({ error: 'Missing file' }, { status: 400 });
      }
      if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type. Allowed: ${UPLOAD_ALLOWED_TYPES.join(', ')}` },
          { status: 400 },
        );
      }
      if (file.size > UPLOAD_MAX_SIZE) {
        return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      // 固定 key preset-portraits/{slug}.png 保证 findCachedPresetPortrait 命中
      const { url } = await uploadFixedKeyFile(buffer, presetPortraitKey(slug), file.type);
      await markPresetPortraitCached(slug, url);
      logger.info('[admin/preset-portraits] manual upload cached', { slug });
      return NextResponse.json({ success: true, cached: true, slug, portrait_url: url, uploaded: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[admin/preset-portraits] upload failed', { err: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = String(body.slug || '').trim().toLowerCase();
  const force = Boolean(body.force);
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const { data: presetRow, error: presetErr } = await admin.supabase
    .from('character_presets')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (presetErr || !presetRow) {
    return NextResponse.json(
      { error: presetErr?.message || `preset not found: ${slug}` },
      { status: 404 },
    );
  }
  const preset = normalizeCreatorPreset(presetRow as Record<string, unknown>);
  if (!preset) {
    return NextResponse.json({ error: 'preset row invalid' }, { status: 500 });
  }

  if (!force) {
    const existing = await findCachedPresetPortrait(slug);
    if (existing) {
      return NextResponse.json({ success: true, cached: true, slug, portrait_url: existing });
    }
  }

  // ─── Resume path: poll a previously queued GPU job instead of regenerating ───
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
            slug,
            message: 'GPU job still queued — POST again with the same slug + job_id later',
          },
          { status: 202 },
        );
      }
      const url = await writebackPresetPortrait(slug, polled.images[0]);
      if (!url) {
        return NextResponse.json({ error: 'job completed but cache writeback failed' }, { status: 500 });
      }
      return NextResponse.json({ success: true, cached: true, slug, portrait_url: url, resumed: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[admin/preset-portraits] resume failed', { slug, job_id: resumeJobId, err: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const identityPrompt = buildPresetPortraitPrompt(preset);
    const category = normalizeCompanionCategory({ gender: preset.gender });
    const renderStyle = normalizeCompanionRenderStyle({ visualStyle: preset.visual_style });
    // Use default cache/file path to avoid SiteSettingsClient type instantiation depth
    const config = await loadComfyConfig();
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle,
      nsfwIntensity: 1,
    });
    const referencePlan = buildReferenceGenerationPlan({
      surface: 'companion',
      category,
      renderStyle,
      modelFamily: route.modelFamily,
      nsfwLevel: 1,
      allowIdentity: false,
      controls: config.reference_control,
      assets: config.reference_assets || [],
    });
    const naturalPrompt = buildStudioPromptEnhancement({
      category,
      intensity: 1,
      animeStyle: renderStyle,
      identity: identityPrompt,
      scene: [
        'a chest-up identity portrait at eye level, face large and unobstructed, both eyes sharp, full hairline and chin visible, shoulders relaxed, looking naturally toward the camera, plain warm neutral background',
        ...referencePlan.promptHints,
      ].join('. '),
    });
    const negativePrompt = studioNegativePrompt(category, renderStyle);

    logger.info('[admin/preset-portraits] generating', { slug, modelFamily: route.modelFamily });

    const result = await routeImageGeneration({
      prompt: naturalPrompt,
      negative_prompt: negativePrompt,
      width: 768,
      height: 1024,
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
          slug,
          message:
            'GPU job queued — POST again with {slug, job_id: "' +
            result.job_id +
            '"} in ~1 minute to resume (do NOT retry without job_id, that submits a new job)',
        },
        { status: 202 },
      );
    }

    const url = await writebackPresetPortrait(slug, result.images[0]);
    if (!url) {
      return NextResponse.json({ error: 'generation succeeded but cache writeback failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, cached: true, slug, portrait_url: url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/preset-portraits] generation failed', { slug, err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/preset-portraits?slug=xxx
 * Remove the preset's shared portrait (storage object + cache flag).
 */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const { searchParams } = new URL(request.url);
  const slug = String(searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  await clearPresetPortraitCache(slug);
  return NextResponse.json({ success: true, slug, cached: false });
}
