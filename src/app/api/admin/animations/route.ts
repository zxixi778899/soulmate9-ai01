import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { DEFAULT_ANIMATION_PRESETS, getPresetById } from '@/lib/animation-presets';
import {
  isAnimationConfigured,
  generateAnimation,
  getCompanionAnimations,
} from '@/lib/animation-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/animations
 * List all animations + presets + status.
 * Optional query: ?companion_id=xxx to filter by companion.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { supabase } = guard;
  const companionId = req.nextUrl.searchParams.get('companion_id');

  try {
    let animations: unknown[] = [];

    if (companionId) {
      animations = await getCompanionAnimations(companionId, supabase);
    } else {
      const { data, error } = await supabase
        .from('companion_animations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        logger.warn('[admin/animations] list failed', { error: error.message });
      } else {
        animations = data || [];
      }
    }

    return NextResponse.json({
      configured: isAnimationConfigured(),
      presets: DEFAULT_ANIMATION_PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        category: p.category,
        frames: p.frames,
        fps: p.fps,
        motion_strength: p.motion_strength,
        loop: p.loop,
        tags: p.tags,
      })),
      animations,
      total: animations.length,
    });
  } catch (e) {
    logger.error('[admin/animations] GET error', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/animations
 * Body: { action: 'generate', companion_id: string, preset_ids: string[] }
 * Triggers batch animation generation for a companion.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { supabase } = guard;

  try {
    const body = await req.json();
    const action = String(body.action || '');

    if (action !== 'generate' && action !== 'generate_custom') {
      return NextResponse.json(
        { error: 'Unknown action. Use "generate" or "generate_custom".' },
        { status: 400 },
      );
    }

    const animationLimit = { maxRequests: 12, windowMs: 60 * 60 * 1000 };
    const rateLimit = await checkRateLimitAsync(`admin-animation:${guard.user!.id}`, {
      maxRequests: 12,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '生成过于频繁，请稍后再试' },
        { status: 429, headers: rateLimitHeaders(rateLimit, animationLimit) },
      );
    }

    if (!isAnimationConfigured()) {
      return NextResponse.json(
        {
          error: 'AnimateDiff endpoint not configured. Set RUNPOD_ANIMATEDIFF_ENDPOINT env.',
          configured: false,
        },
        { status: 503 },
      );
    }

    const companionId = String(body.companion_id || '');
    if (action === 'generate_custom' && !String(body.prompt || '').trim()) {
      return NextResponse.json({ error: 'prompt is required for custom animation' }, { status: 400 });
    }
    const presetIds: string[] = action === 'generate_custom'
      ? [`custom-${Date.now()}`]
      : Array.isArray(body.preset_ids) ? body.preset_ids : [];

    if (!companionId) {
      return NextResponse.json({ error: 'companion_id is required' }, { status: 400 });
    }
    if (presetIds.length === 0) {
      return NextResponse.json({ error: 'preset_ids array is required' }, { status: 400 });
    }

    // Validate preset IDs
    const invalid = action === 'generate_custom'
      ? []
      : presetIds.filter((id) => !getPresetById(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid preset_ids: ${invalid.join(', ')}` },
        { status: 400 },
      );
    }

    // Fetch companion reference image
    const { data: companion, error: gfError } = await supabase
      .from('girlfriends')
      .select('id, name, portrait_url, avatar_url')
      .eq('id', companionId)
      .maybeSingle();

    if (gfError || !companion) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    const suppliedReference = typeof body.input_image === 'string' ? body.input_image.trim() : '';
    const referenceImage = suppliedReference || companion.portrait_url || companion.avatar_url || '';
    if (!referenceImage) {
      return NextResponse.json(
        { error: 'Companion has no portrait/avatar image to use as reference' },
        { status: 400 },
      );
    }

    // Trigger generation for each preset (fire-and-forget batch)
    const results: Array<{ preset_id: string; status: string; video_url?: string; animation_id?: string; error?: string }> = [];

    for (const presetId of presetIds) {
      try {
        const animation = await generateAnimation(
          companionId,
          presetId,
          referenceImage,
          supabase,
          action === 'generate_custom'
            ? {
                prompt: String(body.prompt || ''),
                negativePrompt: String(body.negative_prompt || ''),
                durationSeconds: Number(body.duration_seconds || 5),
                fps: Number(body.fps || 8),
                motionStrength: Number(body.motion_strength || 5),
                steps: Number(body.steps || 20),
                cfg: Number(body.cfg || 7),
                sampler: String(body.sampler || 'euler_ancestral'),
                scheduler: String(body.scheduler || 'normal'),
              }
            : undefined,
        );
        const { error: assetError } = await supabase.from('generation_assets').insert({
          created_by: guard.user!.id,
          girlfriend_id: companionId,
          kind: 'animation',
          storage_key: `portraits/${companionId}/animations/${presetId}.webm`,
          url: animation.video_url,
          prompt: String(body.prompt || ''),
          negative_prompt: String(body.negative_prompt || ''),
          meta: { asset_role: 'animation', preset_id: presetId, duration_seconds: Number(body.duration_seconds || 5), source_image: referenceImage },
        });
        if (assetError) {
          logger.warn('[admin/animations] generation_assets insert failed', { error: assetError.message, companionId, presetId });
        }
        results.push({
          preset_id: presetId,
          status: 'ready',
          video_url: animation.video_url,
          animation_id: animation.id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('[admin/animations] generation failed for preset', {
          companionId,
          presetId,
          error: msg,
        });
        results.push({ preset_id: presetId, status: 'failed', error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      companion_id: companionId,
      results,
    });
  } catch (e) {
    logger.error('[admin/animations] POST error', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/animations
 * Query: ?id=xxx (single animation) or ?companion_id=xxx (all for companion)
 */
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const { supabase } = guard;
  const id = req.nextUrl.searchParams.get('id');
  const companionId = req.nextUrl.searchParams.get('companion_id');

  if (!id && !companionId) {
    return NextResponse.json(
      { error: 'Provide ?id=xxx or ?companion_id=xxx' },
      { status: 400 },
    );
  }

  try {
    if (id) {
      // Delete single animation record + storage file
      const { data: anim } = await supabase
        .from('companion_animations')
        .select('id, video_url, companion_id, preset_id')
        .eq('id', id)
        .maybeSingle();

      if (!anim) {
        return NextResponse.json({ error: 'Animation not found' }, { status: 404 });
      }

      // Remove storage file (best-effort)
      if (anim.video_url && !anim.video_url.startsWith('http')) {
        await supabase.storage.from('portraits').remove([anim.video_url]);
      } else if (anim.companion_id && anim.preset_id) {
        const storagePath = `portraits/${anim.companion_id}/animations/${anim.preset_id}.webm`;
        await supabase.storage.from('portraits').remove([storagePath]);
      }

      const { error } = await supabase.from('companion_animations').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, deleted: 1 });
    }

    // Delete all animations for a companion
    const { data: anims } = await supabase
      .from('companion_animations')
      .select('id, preset_id')
      .eq('companion_id', companionId!);

    // Remove storage files (best-effort)
    if (anims && anims.length > 0) {
      const paths = anims.map(
        (a) => `portraits/${companionId}/animations/${a.preset_id}.webm`,
      );
      await supabase.storage.from('portraits').remove(paths);
    }

    const { error, count } = await supabase
      .from('companion_animations')
      .delete()
      .eq('companion_id', companionId!);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: count ?? anims?.length ?? 0 });
  } catch (e) {
    logger.error('[admin/animations] DELETE error', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}
