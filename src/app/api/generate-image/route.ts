import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  loadAiModules,
  resolveImageCall,
  type MembershipTier,
  type ImageModuleConfig,
} from '@/lib/ai-modules';
import { logModelUsage } from '@/lib/model-usage';

const HOURLY_HARD_CAP = { maxRequests: 20, windowMs: 60 * 60 * 1000 };

type ImageScene = keyof ImageModuleConfig['scenes'];

function membershipFromProfile(profile: Record<string, unknown> | null): MembershipTier {
  const raw = String(
    profile?.membership_tier || profile?.subscription_tier || profile?.plan || 'free',
  ).toLowerCase();
  if (raw.includes('unlimit') || raw === 'admin') return 'unlimited';
  if (raw.includes('pro') || raw.includes('plus') || raw.includes('premium')) return 'pro';
  return 'free';
}

function parseScene(raw: unknown): ImageScene {
  const s = String(raw || 'chat_selfie');
  const allowed: ImageScene[] = [
    'girlfriend_portrait',
    'chat_selfie',
    'outfit_prop',
    'shop_item',
    'admin_batch',
  ];
  return (allowed.includes(s as ImageScene) ? s : 'chat_selfie') as ImageScene;
}

/**
 * POST /api/generate-image
 *
 * Generates an image using RunPod FLUX, driven by AI module scene presets.
 * Body: { prompt, scene?, size?, negative_prompt?, input_image?, count? }
 */
export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`gen-img:${user.id}`, HOURLY_HARD_CAP);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, HOURLY_HARD_CAP) },
    );
  }

  const started = Date.now();
  try {
    const body = await request.json();
    const prompt = body.prompt;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const scene = parseScene(body.scene);
    const aiModules = await loadAiModules(client);

    const { data: profile } = await client
      .from('profiles')
      .select('membership_tier, subscription_tier, plan')
      .eq('id', user.id)
      .maybeSingle();

    const tier = membershipFromProfile((profile as Record<string, unknown>) || null);
    const resolved = resolveImageCall(aiModules, { scene, tier });

    if (!resolved.enabled) {
      const msg =
        resolved.blockedReason === 'image_module_disabled'
          ? 'Image generation is temporarily disabled.'
          : 'Image generation is not configured. Set RunPod API key and endpoint.';
      return NextResponse.json(
        { error: msg, code: resolved.blockedReason || 'disabled' },
        { status: 503 },
      );
    }

    if (resolved.dailyLimit != null) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await client
        .from('ai_model_usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('task_type', 'image_generation')
        .eq('success', true)
        .gte('created_at', dayStart.toISOString());
      if ((count || 0) >= resolved.dailyLimit) {
        return NextResponse.json(
          {
            error: `Daily image limit reached (${resolved.dailyLimit}). Upgrade or try again tomorrow.`,
            code: 'daily_limit',
            limit: resolved.dailyLimit,
          },
          { status: 403 },
        );
      }
    }

    const sceneCfg = resolved.config;
    let width = sceneCfg.width;
    let height = sceneCfg.height;
    if (typeof body.size === 'string' && body.size.includes('x')) {
      const [w, h] = body.size.split('x').map(Number);
      if (w > 0 && h > 0) {
        width = w;
        height = h;
      }
    }
    if (typeof body.width === 'number' && body.width > 0) width = body.width;
    if (typeof body.height === 'number' && body.height > 0) height = body.height;

    const count = Math.min(Math.max(Number(body.count) || sceneCfg.count || 1, 1), 4);
    const steps = Number(body.steps) || sceneCfg.steps || 28;
    const guidance = Math.min(
      Math.max(Number(body.cfg ?? body.guidance_scale ?? sceneCfg.cfg) || 1.0, 1.0),
      3.5,
    );
    const negative =
      typeof body.negative_prompt === 'string'
        ? body.negative_prompt
        : resolved.defaultNegative || '';

    if (!runpodClient.isConfigured && !resolved.endpointId) {
      return NextResponse.json(
        { error: 'Image generation is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.' },
        { status: 500 },
      );
    }

    const result = await runpodClient.generate({
      prompt,
      negative_prompt: negative,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidance,
      endpoint_id: resolved.endpointId || undefined,
      input_image: typeof body.input_image === 'string' ? body.input_image : undefined,
      denoising_strength:
        typeof body.denoising_strength === 'number' ? body.denoising_strength : undefined,
      ckpt_name: sceneCfg.ckpt_name || undefined,
      lora_name: sceneCfg.lora_name || undefined,
      lora_strength_model: sceneCfg.lora_strength_model,
      lora_strength_clip: sceneCfg.lora_strength_clip,
      sampler_name: sceneCfg.sampler_name || undefined,
      scheduler: sceneCfg.scheduler || undefined,
      num_images: count,
      throw_on_pending: false,
    });

    // If still pending, return job_id for client-side polling
    if (result.pending) {
      return NextResponse.json({
        pending: true,
        job_id: result.job_id,
        status: result.status || 'IN_QUEUE',
        scene,
        message: 'Image is being generated. Poll /api/runpod/status?job_id=' + result.job_id,
      });
    }

    const images = await Promise.all(
      result.images.map(async (base64Data) => {
        if (!base64Data) return { url: '', prompt };
        try {
          const dataUrl = `data:image/png;base64,${base64Data}`;
          const key = await uploadDataUrl(dataUrl, 'chat-images');
          const signed = await resolveImageUrl(key);
          return { url: signed, key, prompt };
        } catch (e) {
          logger.error('Upload failed for generated image:', { data: e });
          return { url: '', prompt };
        }
      }),
    );

    const latency = Date.now() - started;
    void logModelUsage({
      provider: 'runpod',
      model_id: sceneCfg.endpoint_id || 'flux1-dev-fp8',
      task_type: 'image_generation',
      user_id: user.id,
      latency_ms: latency,
      cost_usd: 0,
      success: images.some((i) => !!i.url),
    });

    return NextResponse.json({
      images,
      job_id: result.job_id,
      scene,
      token_cost: resolved.tokenCost,
      settings: {
        width,
        height,
        steps,
        cfg: guidance,
        count,
        endpoint_env: resolved.runpodEndpointEnv,
      },
    });
  } catch (error) {
    logger.error('Image generation error:', { data: error });
    void logModelUsage({
      provider: 'runpod',
      model_id: 'flux',
      task_type: 'image_generation',
      user_id: user.id,
      latency_ms: Date.now() - started,
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed' },
      { status: 500 },
    );
  }
}
