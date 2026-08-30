import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadImageAsWebP, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  loadAiModules,
  resolveImageCall,
  type ImageModuleConfig,
} from '@/lib/ai-modules';
import { logModelUsage } from '@/lib/model-usage';
import { CREDIT_COSTS, deductCredits, refundCredits } from '@/lib/credit-system';
import { resolveImageGenerationRoute, type ImageSurface } from '@/lib/image-generation-routing';
import { classifyImageScene } from '@/lib/image-scene-semantics';
import type { CompanionCategory } from '@/lib/companion-category';
import { resolveModelLoraPlan } from '@/lib/model-lora-routing';
import {
  IMAGE_GEN_RATE_KEY,
  countTodayImageUsage,
  loadQuotaProfile,
  membershipFromProfile,
  timezoneOffsetFromProfile,
} from '@/lib/ai-quota';
import { computeCacheKey, lookupCache, writeCache } from '@/lib/generation-cache';
import { forwardLegacyGeneration } from '@/lib/gen-hub';

const HOURLY_HARD_CAP = { maxRequests: 20, windowMs: 60 * 60 * 1000 };

type ImageScene = keyof ImageModuleConfig['scenes'];

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

  // Phase 2 thin-forward: unified job tracking via gen-hub (loop-guarded).
  const forwarded = await forwardLegacyGeneration({
    request,
    kind: 'image',
    client,
    userId: user.id,
    handler: POST,
    routePath: '/api/generate-image',
  });
  if (forwarded) return forwarded;

  // Shared counter across all image entries — limits cannot be stacked.
  const rl = await checkRateLimitAsync(`${IMAGE_GEN_RATE_KEY}:${user.id}`, HOURLY_HARD_CAP);
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
    const aiModules = await loadAiModules();

    const profile = await loadQuotaProfile(client, user.id);
    const tier = membershipFromProfile(profile);
    const resolved = resolveImageCall(aiModules, { scene, tier });

    // Membership redesign: generation surfaces are paid-tier only — free users
    // get a structured code so the frontend shows an upgrade guide.
    if (tier === 'free') {
      return NextResponse.json(
        {
          error: 'Image generation requires a membership plan.',
          code: 'membership_required',
          upgrade_url: '/pricing',
        },
        { status: 403 },
      );
    }

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

    const sceneCfg = resolved.config;
    const surface: ImageSurface = body.generation_surface === 'advert'
      ? 'advert'
      : body.generation_surface === 'prop' || scene === 'shop_item'
        ? 'prop'
        : body.generation_surface === 'outfit' || scene === 'outfit_prop'
          ? 'outfit'
          : 'companion';

    if (surface === 'companion') {
      // Membership redesign: companion image generation always consumes credits
      // (no daily free quota). Admin asset surfaces keep the legacy quota path.
      const cost = CREDIT_COSTS.image_gen;
      const balance = Number(profile?.credits_remaining) || 0;
      if (balance < cost) {
        return NextResponse.json(
          {
            error: 'Insufficient credits (need ' + cost + '). Buy credits to keep generating!',
            code: 'insufficient_credits',
            required: cost,
            balance,
            upgrade_url: '/pricing',
          },
          { status: 403 },
        );
      }
      const deductResult = await deductCredits(client, user.id, cost, 'image_gen_extra');
      if (!deductResult.ok) {
        return NextResponse.json(
          { error: 'Failed to deduct credits.', code: 'credit_deduct_failed' },
          { status: 500 },
        );
      }
    } else if (resolved.dailyLimit != null) {
      // Legacy daily quota for admin asset surfaces (advert/prop/outfit).
      const usage = await countTodayImageUsage(
        client,
        user.id,
        timezoneOffsetFromProfile(profile),
      );
      if (usage.used >= resolved.dailyLimit) {
        const cost = CREDIT_COSTS.image_gen;
        const balance = Number(profile?.credits_remaining) || 0;
        if (balance < cost) {
          return NextResponse.json(
            {
              error: 'Daily image limit reached. Insufficient credits (need ' + cost + '). Buy credits or upgrade!',
              code: 'insufficient_credits',
              required: cost,
              balance,
            },
            { status: 403 },
          );
        }
        const deductResult = await deductCredits(client, user.id, cost, 'image_gen_extra');
        if (!deductResult.ok) {
          return NextResponse.json(
            { error: 'Failed to deduct credits.', code: 'credit_deduct_failed' },
            { status: 500 },
          );
        }
      }
    }
    const requestedCategory = String(body.companion_category || 'female') as CompanionCategory;
    const category: CompanionCategory = requestedCategory === 'anime' ? 'female' : requestedCategory;
    const sceneSemantics = classifyImageScene(prompt, category);
    const renderStyle = body.anime_render_style === '2d' ? '2d' : 'realistic';
    const nsfwIntensity = Math.min(5, Math.max(1, Number(body.nsfw_intensity || 1))) as 1 | 2 | 3 | 4 | 5;
    const generationRoute = resolveImageGenerationRoute({
      surface,
      category,
      renderStyle,
      nsfwIntensity,
      sceneSemantics,
    });
    const modelLoraPlan = resolveModelLoraPlan({
      modelFamily: generationRoute.modelFamily,
      category,
      intensity: nsfwIntensity,
      animeStyle: renderStyle,
      requested: generationRoute.modelFamily === 'flux' && sceneCfg.lora_name
        ? [{
            name: sceneCfg.lora_name,
            strength_model: sceneCfg.lora_strength_model ?? 0.6,
            strength_clip: sceneCfg.lora_strength_clip ?? sceneCfg.lora_strength_model ?? 0.6,
          }]
        : [],
      maxLoras: generationRoute.modelFamily === 'flux' ? 3 : 2,
    });
    let width = generationRoute.width || sceneCfg.width;
    let height = generationRoute.height || sceneCfg.height;
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
    const steps = Math.max(generationRoute.steps, Number(body.steps) || sceneCfg.steps || generationRoute.steps);
    const guidance = generationRoute.modelFamily === 'flux'
      ? Math.min(Math.max(Number(body.cfg ?? body.guidance_scale ?? generationRoute.cfg), 1), 3.5)
      : Math.min(Math.max(Number(body.cfg ?? body.guidance_scale ?? generationRoute.cfg), 3), 9);
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

    // Generation cache: identical prompt+params skip the GPU entirely.
    // Only for single-image, reference-free requests (deterministic scenes).
    const cacheable = count === 1 && typeof body.input_image !== 'string';
    const cacheKey = cacheable
      ? computeCacheKey({
          prompt,
          negativePrompt: negative,
          width,
          height,
          steps,
          guidance,
          model: generationRoute.checkpoint || generationRoute.modelFamily,
          kind: 'image',
        })
      : null;
    if (cacheKey) {
      const cachedOssKey = await lookupCache(cacheKey, 'image');
      if (cachedOssKey) {
        const cachedUrl = await resolveImageUrl(cachedOssKey).catch(() => null);
        if (cachedUrl) {
          logger.info('[generate-image] cache hit', { cacheKey });
          return NextResponse.json({
            images: [{ url: cachedUrl, key: cachedOssKey, prompt }],
            scene,
            cached: true,
            token_cost: resolved.tokenCost,
            settings: { width, height, steps, cfg: guidance, count, endpoint_env: resolved.runpodEndpointEnv },
          });
        }
      }
    }

    const result = await runpodClient.generate({
      prompt,
      negative_prompt: negative,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidance,
      endpoint_id: generationRoute.endpointId || resolved.endpointId || undefined,
      model_family: generationRoute.modelFamily,
      input_image: typeof body.input_image === 'string' ? body.input_image : undefined,
      denoising_strength:
        typeof body.denoising_strength === 'number' ? body.denoising_strength : undefined,
      ckpt_name: generationRoute.checkpoint || sceneCfg.ckpt_name || undefined,
      loras: modelLoraPlan.selected,
      sampler_name: generationRoute.sampler,
      scheduler: generationRoute.scheduler,
      clip_skip: generationRoute.clipSkip,
      num_images: count,
      submit_only: true,
    });

    // If still pending, return job_id for client-side polling
    if (result.pending) {
      return NextResponse.json({
        pending: true,
        job_id: result.job_id,
        endpoint_id: result.endpoint_id || generationRoute.endpointId || resolved.endpointId || undefined,
        status: result.status || 'IN_QUEUE',
        scene,
        message: 'Image is being generated. Poll /api/ai/status?job_id=' + result.job_id,
      });
    }

    const images = await Promise.all(
      result.images.map(async (base64Data, index) => {
        if (!base64Data) return { url: '', prompt };
        try {
          const dataUrl = `data:image/png;base64,${base64Data}`;
          const key = await uploadImageAsWebP(dataUrl, 'chat-images');
          const signed = await resolveImageUrl(key);
          // Warm the generation cache with the first successful output.
          if (index === 0 && cacheKey && signed) {
            await writeCache(cacheKey, 'image', key);
          }
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
      model_id: sceneCfg.endpoint_id || 'fluxUnchainedBySCG_hyfu8StepHybridV10',
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
    // Best-effort refund — surfaces never charge users for failures.
    // Both call sites (companion surface + daily-quota overflow) use the
    // same 'image_gen_extra' reason with no ref_id, so a single refund
    // matches either path (the second deduct is unreachable when the
    // first failed, and the first one is the only one that runs in the
    // happy path).
    await refundCredits(client, user.id, CREDIT_COSTS.image_gen).catch(() => undefined);
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
