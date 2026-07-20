import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { resolveImageUrl, uploadDataUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { loadAiModules, resolveImageCall, type MembershipTier } from '@/lib/ai-modules';
import { logModelUsage } from '@/lib/model-usage';
import { assembleGirlfriendFromRow, GIRLFRIEND_NEGATIVE_FLUX } from '@/lib/prompt/girlfriend';
import {
  buildImageActionFromChat,
  type ChatContextLine,
} from '@/lib/chat-image-intent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const IMAGE_GEN_LIMIT = { maxRequests: 12, windowMs: 60 * 60 * 1000 };

const MOOD_TAGS: Record<string, string> = {
  romantic: 'warm romantic atmosphere, soft golden light, loving gaze',
  playful: 'playful smirk, bright energetic mood, cheeky expression',
  sweet: 'sweet soft smile, tender girlfriend vibe',
  passionate: 'intense smoldering gaze, sultry desire, bedroom eyes',
  cozy: 'comfortable relaxed mood, soft warm lighting',
  cheerful: 'bright cheerful smile, lively energy',
};

const POSE_TAGS: Record<string, string> = {
  sitting: 'sitting gracefully with relaxed elegant posture',
  standing: 'standing confidently in a full-body glamorous pose',
  lying_down: 'lying down comfortably in an intimate angle',
  walking: 'caught mid-step, natural candid walking pose',
  dancing: 'mid-dance movement, dynamic sexy pose',
  close_up: 'intimate close-up portrait, face filling the frame',
};

const ENV_TAGS: Record<string, string> = {
  bedroom: 'cozy bedroom with soft sheets and warm lamp light',
  beach: 'sunny beach with ocean and golden light',
  garden: 'lush garden with soft dappled sunlight',
  city: 'urban night city lights soft bokeh',
  cozy_room: 'warm cozy indoor room',
  outdoor: 'natural outdoor daylight setting',
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const girlfriend_id = String((body as { girlfriend_id?: string }).girlfriend_id || '').trim();
    if (!girlfriend_id) {
      return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
    }

    const userRequest = String(
      (body as { user_request?: string; prompt?: string; message?: string }).user_request ||
        (body as { prompt?: string }).prompt ||
        (body as { message?: string }).message ||
        '',
    ).trim();
    const locale = String((body as { locale?: string }).locale || 'en')
      .toLowerCase()
      .startsWith('zh')
      ? 'zh'
      : 'en';
    const zh = locale === 'zh';

    const aiModules = await loadAiModules(client);
    const { data: profile } = await client
      .from('profiles')
      .select('membership_tier, subscription_tier, plan')
      .eq('id', user.id)
      .maybeSingle();
    const tier = membershipFromProfile((profile as Record<string, unknown>) || null);
    const adultRequested = /\\b(nude|naked|nsfw|explicit|sex|lingerie)\\b/i.test(userRequest);
    const resolved = resolveImageCall(aiModules, { scene: 'chat_selfie', tier, adult: adultRequested });

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
            localized_error: zh
              ? `今日图片生成次数已用完（${resolved.dailyLimit} 次），请升级套餐或明天再试。`
              : `Daily image limit reached (${resolved.dailyLimit}). Upgrade or try again tomorrow.`,
            code: 'daily_limit',
            limit: resolved.dailyLimit,
            used: count || 0,
          },
          { status: 403 },
        );
      }
    }

    // Own girlfriend first; allow public approved for deep-link bootstrap
    let { data: gf } = await client
      .from('girlfriends')
      .select('*')
      .eq('id', girlfriend_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!gf) {
      const { data: pub } = await client
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriend_id)
        .eq('is_public', true)
        .eq('review_status', 'approved')
        .maybeSingle();
      gf = pub;
    }

    if (!gf) {
      return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
    }

    const mood = (body as { mood?: string }).mood;
    const pose = (body as { pose?: string }).pose;
    const environment = (body as { environment?: string }).environment;
    const moodTag = mood ? MOOD_TAGS[mood] || mood : '';
    const poseTag = pose ? POSE_TAGS[pose] || pose : '';
    const envTag = environment ? ENV_TAGS[environment] || environment : '';

    // Optional recent chat lines so the photo matches the conversation
    const rawCtx = (body as { chat_context?: unknown }).chat_context;
    const chatContext: ChatContextLine[] = Array.isArray(rawCtx)
      ? rawCtx
          .slice(-10)
          .map((row) => {
            const r = row as { role?: string; content?: string };
            return {
              role: String(r?.role || 'user'),
              content: String(r?.content || '').slice(0, 400),
            };
          })
          .filter((r) => r.content.trim())
      : [];

    // If client did not send context, pull last turns from DB
    if (!chatContext.length) {
      const { data: recent } = await client
        .from('chat_messages')
        .select('role, content')
        .eq('girlfriend_id', girlfriend_id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8);
      for (const row of recent || []) {
        chatContext.push({
          role: String((row as { role?: string }).role || 'user'),
          content: String((row as { content?: string }).content || '').slice(0, 400),
        });
      }
      chatContext.reverse();
    }

    const intent = buildImageActionFromChat(userRequest || 'send me a selfie', chatContext);
    const actionBits = [intent.action, poseTag, envTag, moodTag].filter(Boolean).join(', ');

    // Character-consistent NL: identity + what they talked about + quality
    const assembled = assembleGirlfriendFromRow(
      gf as Record<string, unknown>,
      actionBits ||
        'taking a flirty intimate selfie for her boyfriend matching their chat, looking at camera',
    );

    const prompt = assembled.positive;
    const negativePrompt =
      typeof (body as { negative_prompt?: string }).negative_prompt === 'string' &&
      (body as { negative_prompt: string }).negative_prompt.trim()
        ? (body as { negative_prompt: string }).negative_prompt
        : assembled.negative || resolved.defaultNegative || GIRLFRIEND_NEGATIVE_FLUX;

    // Face / body reference for character consistency
    const refCandidates = [
      (gf as { face_reference_url?: string }).face_reference_url,
      (gf as { portrait_url?: string }).portrait_url,
      (gf as { avatar_url?: string }).avatar_url,
      (gf as { card_url?: string }).card_url,
    ];
    const referenceImages: string[] = [];
    for (const raw of refCandidates) {
      if (!raw || typeof raw !== 'string' || referenceImages.length >= resolved.maxReferences) continue;
      try {
        const url = (await resolveImageUrl(raw)) || raw;
        if ((url.startsWith('http') || url.startsWith('data:image/')) && !referenceImages.includes(url)) referenceImages.push(url);
      } catch {
        if (String(raw).startsWith('http') && !referenceImages.includes(String(raw))) referenceImages.push(String(raw));
      }
    }
    const referenceImage = referenceImages[0];

    // Preserve identity from the saved portrait without copying its composition.
    const useConsistency =
      resolved.config.use_consistency_default !== false && Boolean(referenceImage);
    const denoise = useConsistency ? 0.78 : 1;

    const sceneCfg = resolved.config;
    const generationSeed = Math.floor(Math.random() * 2 ** 32);
    const gen = await runpodClient.generate({
      prompt,
      negative_prompt: negativePrompt,
      input_image: useConsistency ? referenceImage : undefined,
      denoising_strength: useConsistency ? denoise : undefined,
      width: sceneCfg.width || 704,
      height: sceneCfg.height || 960,
      num_images: 1,
      seed: generationSeed,
      num_inference_steps: sceneCfg.steps || 20,
      guidance_scale: Math.min(Math.max(sceneCfg.cfg || 2.5, 1.0), 3.5),
      endpoint_id: resolved.endpointId || undefined,
      ckpt_name: sceneCfg.ckpt_name || undefined,
      lora_name: sceneCfg.lora_name || undefined,
      lora_strength_model: sceneCfg.lora_strength_model,
      lora_strength_clip: sceneCfg.lora_strength_clip,
      sampler_name: sceneCfg.sampler_name || undefined,
      scheduler: sceneCfg.scheduler || undefined,
      throw_on_pending: false,
    });

    // If still pending, return job_id for client-side polling
    if (gen.pending) {
      return NextResponse.json({
        pending: true,
        job_id: gen.job_id,
        status: gen.status || 'IN_QUEUE',
        scene: 'chat_selfie',
        message: 'Image is being generated. Poll /api/runpod/status?job_id=' + gen.job_id,
      });
    }

    const base64 = gen.images[0];
    if (!base64) throw new Error('Failed to generate image');

    const dataUrl = `data:image/png;base64,${base64}`;
    const key = await uploadDataUrl(dataUrl, `chat_photos/${girlfriend_id}`);
    const generatedUrl = (await resolveImageUrl(key)) || key;

    const { error: auditError } = await client.from('ai_generation_audits').insert({
      user_id: user.id, girlfriend_id, scene: 'chat_selfie', membership_tier: tier,
      endpoint_id: resolved.logicalEndpointId, model_id: resolved.logicalEndpointId,
      route_reason: resolved.routeReason, quality_tier: resolved.qualityTier, seed: generationSeed,
      character_version: String((gf as { updated_at?: string }).updated_at || ''),
      reference_urls: referenceImages, prompt_summary: prompt.slice(0, 500), success: true,
    });
    if (auditError) logger.warn('[Chat Generate Image] audit insert failed', { error: auditError.message });

    const gfName = String((gf as { name?: string }).name || 'She');
    const caption = zh
      ? intent.kind === 'selfie'
        ? `${gfName} 给你发来一张全新自拍 💕`
        : intent.kind === 'body'
          ? `${gfName} 给你发来一张只给你看的新照片 🔥`
          : `${gfName} 给你发来一张全新照片 📸`
      : intent.kind === 'selfie'
        ? `${gfName} sends you a brand-new selfie 💕`
        : intent.kind === 'body'
          ? `${gfName} sends you a new teasing photo—just for you 🔥`
          : `${gfName} sends you a brand-new photo 📸`;

    await client.from('chat_messages').insert({
      user_id: user.id,
      girlfriend_id,
      role: 'assistant',
      content: caption,
      media_url: generatedUrl,
      media_type: 'image',
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
      message: caption,
      scene: 'chat_selfie',
      kind: intent.kind,
      prompt_preview: prompt.slice(0, 220),
      used_reference: Boolean(useConsistency),
      reference_count: referenceImages.length,
      route_reason: resolved.routeReason,
      quality_tier: resolved.qualityTier,
      model_endpoint: resolved.logicalEndpointId,
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
    return NextResponse.json(
      {
        error: /timeout|queue|cold|not configured|FAILED/i.test(errMsg)
          ? `${errMsg} — retry in 20–40s if the GPU is waking up.`
          : errMsg,
        code: 'image_gen_failed',
      },
      { status: 500 },
    );
  }
}
