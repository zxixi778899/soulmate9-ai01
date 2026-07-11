import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { resolveImageUrl, uploadDataUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { loadAiModules, resolveImageCall, type MembershipTier } from '@/lib/ai-modules';
import { logModelUsage } from '@/lib/model-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

const MOOD_TAGS: Record<string, string> = {
  romantic:
    'warm dreamy atmosphere, soft golden lighting, loving gaze, gentle warm smile, radiant glowing skin, vibrant warm colors',
  playful:
    'cheeky expression, playful smirk, bright energetic lighting, candid moment, bright eyes sparkling with joy, vibrant colors',
  sweet:
    'sweet innocent smile, warm cozy glow, soft pastel tones, tender expression, radiant skin, inviting girlfriend-next-door vibe',
  passionate:
    'intense smoldering gaze, dramatic warm lighting, sultry expression, confident pose, captivating alluring presence, glowing skin',
  cozy:
    'comfortable relaxed vibe, soft warm lighting, natural genuine smile, homely atmosphere, warm inviting glow, radiant skin',
  cheerful:
    'bright sunny expression, energetic pose, vibrant colors, laughing joyfully, eyes sparkling with happiness, sun-kissed glowing skin',
};

const POSE_TAGS: Record<string, string> = {
  sitting: 'sitting gracefully, hands resting naturally, relaxed elegant posture, natural expression',
  standing: 'standing confidently, full body shot, natural elegant stance, warm genuine smile',
  lying_down: 'lying down comfortably, relaxed pose, intimate angle, soft bedding visible, dreamy expression',
  walking: 'caught in motion, natural walking pose, candid street style, hair flowing, bright smile',
  dancing: 'mid-dance movement, flowing dress/hair, graceful dynamic pose, joyful expression',
  close_up:
    'intimate close-up portrait, face filling frame, detailed features, warm genuine expression, sparkling eyes',
};

const ENV_TAGS: Record<string, string> = {
  bedroom:
    'cozy bedroom setting, soft bed sheets, warm lamp light, intimate indoor atmosphere, warm vibrant colors',
  beach:
    'sunny beach background, ocean waves, golden sand, natural sunlight, seaside breeze, vibrant summer colors',
  garden:
    'lush garden setting, blooming flowers, green foliage, soft dappled sunlight, warm romantic atmosphere',
  city: 'urban cityscape, modern architecture, street lights, city vibe background, vibrant energetic atmosphere',
  cozy_room:
    'warm cozy indoor space, comfortable furniture, soft lighting, homey atmosphere, warm inviting glow',
  outdoor:
    'natural outdoor setting, open sky, scenic landscape, fresh air ambiance, bright warm sunlight',
};

function membershipFromProfile(profile: Record<string, unknown> | null): MembershipTier {
  const raw = String(
    profile?.membership_tier || profile?.subscription_tier || profile?.plan || 'free',
  ).toLowerCase();
  if (raw.includes('unlimit') || raw === 'admin') return 'unlimited';
  if (raw.includes('pro') || raw.includes('plus') || raw.includes('premium')) return 'pro';
  return 'free';
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`chat-img-gen:${user.id}`, IMAGE_GEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, IMAGE_GEN_LIMIT) },
    );
  }

  const started = Date.now();
  try {
    const body = await request.json();
    const girlfriend_id = body.girlfriend_id as string | undefined;
    if (!girlfriend_id) {
      return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
    }

    const aiModules = await loadAiModules(client);
    const { data: profile } = await client
      .from('profiles')
      .select('membership_tier, subscription_tier, plan')
      .eq('id', user.id)
      .maybeSingle();
    const tier = membershipFromProfile((profile as Record<string, unknown>) || null);
    const resolved = resolveImageCall(aiModules, { scene: 'chat_selfie', tier });

    if (!resolved.enabled) {
      return NextResponse.json(
        {
          error:
            resolved.blockedReason === 'image_module_disabled'
              ? 'Image generation is temporarily disabled.'
              : 'Image generation is not configured.',
          code: resolved.blockedReason || 'disabled',
        },
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
            used: count || 0,
          },
          { status: 403 },
        );
      }
    }

    const { data: gf } = await client
      .from('girlfriends')
      .select(
        'name, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, appearance_race, portrait_url',
      )
      .eq('id', girlfriend_id)
      .eq('user_id', user.id)
      .single();

    if (!gf) {
      return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
    }

    const appearanceDesc = [
      gf.appearance_race ? gf.appearance_race : '',
      gf.appearance_hair_color && gf.appearance_hair
        ? `${gf.appearance_hair_color} ${gf.appearance_hair}`
        : '',
      gf.appearance_eyes ? `${gf.appearance_eyes} eyes` : '',
      gf.appearance_body ? `${gf.appearance_body} body type` : '',
      gf.appearance_style ? `wearing ${gf.appearance_style}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const mood = body.mood as string | undefined;
    const pose = body.pose as string | undefined;
    const environment = body.environment as string | undefined;
    const moodTag = mood ? MOOD_TAGS[mood] || mood : 'warm expression, natural smile';
    const poseTag = pose ? POSE_TAGS[pose] || pose : 'natural pose';
    const envTag = environment ? ENV_TAGS[environment] || environment : 'soft clean background';

    const prompt = `Stunningly beautiful gorgeous young woman ${gf.name}, ${appearanceDesc}. ${poseTag}. ${envTag}. ${moodTag}. Intimate selfie-style photo, looking at camera, ultra photorealistic, shot on Canon EOS R5 85mm f/1.4, ultra high quality, 8K, sharp focus, natural skin texture, professional photography, warm vibrant colors, radiant glowing skin, magazine cover quality, captivating presence.`;

    const negativePrompt =
      typeof body.negative_prompt === 'string' ? body.negative_prompt : resolved.defaultNegative || '';

    let referenceImage: string | undefined;
    if (resolved.config.use_consistency_default && gf.portrait_url) {
      try {
        referenceImage = (await resolveImageUrl(gf.portrait_url)) || gf.portrait_url;
      } catch {
        referenceImage = gf.portrait_url;
      }
    }

    const sceneCfg = resolved.config;
    const gen = await runpodClient.generate({
      prompt,
      negative_prompt: negativePrompt,
      input_image: referenceImage,
      denoising_strength: referenceImage ? 0.62 : 1,
      width: sceneCfg.width || 768,
      height: sceneCfg.height || 1024,
      num_images: 1,
      num_inference_steps: sceneCfg.steps || 22,
      guidance_scale: Math.min(Math.max(sceneCfg.cfg || 1.0, 1.0), 3.5),
      endpoint_id: resolved.endpointId || undefined,
      ckpt_name: sceneCfg.ckpt_name || undefined,
      lora_name: sceneCfg.lora_name || undefined,
      lora_strength_model: sceneCfg.lora_strength_model,
      lora_strength_clip: sceneCfg.lora_strength_clip,
      sampler_name: sceneCfg.sampler_name || undefined,
      scheduler: sceneCfg.scheduler || undefined,
    });
    const base64 = gen.images[0];
    if (!base64) throw new Error('Failed to generate image');

    const dataUrl = `data:image/png;base64,${base64}`;
    const key = await uploadDataUrl(dataUrl, `chat_photos/${girlfriend_id}`);
    const generatedUrl = (await resolveImageUrl(key)) || key;

    const message = `${gf.name} sends you a photo  [${[mood, pose, environment].filter(Boolean).join(', ')}]`;

    await client.from('chat_messages').insert({
      user_id: user.id,
      girlfriend_id,
      role: 'assistant',
      content: message,
      media_url: generatedUrl,
    });

    void logModelUsage({
      provider: 'runpod',
      model_id: sceneCfg.endpoint_id || 'flux-chat-selfie',
      task_type: 'image_generation',
      user_id: user.id,
      girlfriend_id,
      latency_ms: Date.now() - started,
      cost_usd: 0,
      success: true,
    });

    return NextResponse.json({
      imageUrl: generatedUrl,
      image_url: generatedUrl,
      message,
      scene: 'chat_selfie',
      token_cost: resolved.tokenCost,
      daily_limit: resolved.dailyLimit,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Chat Generate Image] Error:', { data: errMsg });
    void logModelUsage({
      provider: 'runpod',
      model_id: 'flux-chat-selfie',
      task_type: 'image_generation',
      user_id: user.id,
      latency_ms: Date.now() - started,
      success: false,
      error_message: errMsg,
    });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
