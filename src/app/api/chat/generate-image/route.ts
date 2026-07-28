import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveImageUrl, uploadDataUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { loadAiModules, resolveImageCall, type MembershipTier } from '@/lib/ai-modules';
import { logModelUsage } from '@/lib/model-usage';
import {
  buildLoraPlan,
  detectGenderStyle,
  GIRLFRIEND_NEGATIVE_FLUX,
  planToLorasArray,
  subjectFromGirlfriendRow,
} from '@/lib/prompt/girlfriend';
import { resolveImageGenerationProfile } from '@/lib/image-generation-profile';
import { routeImageGeneration, type ImageProvider } from '@/lib/image-router';
import {
  buildImageActionFromChat,
  type ChatContextLine,
} from '@/lib/chat-image-intent';
import { getIntimacyGenerationPolicy, getIntimacyUnlockPayload } from '@/lib/intimacy-policy';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import {
  buildStudioPromptEnhancement,
  resolveCategoryLoraControls,
  studioNegativePrompt,
  type AnimeRenderStyle,
} from '@/lib/comfy-console/studio-profile';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { buildSceneCastPrompt, classifyImageScene } from '@/lib/image-scene-semantics';
import { resolveModelLoraPlan } from '@/lib/model-lora-routing';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import {
  buildReferenceGenerationPlan,
  companionIdentityAssets,
} from '@/lib/reference-generation-plan';

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
    const adultRequested = /\b(nude|naked|nsfw|explicit|sex|sexy|lingerie|fuck|cock|pussy|dick|cum|orgasm|blowjob|anal|breast|nipple|horny|moan|undress|strip|bdsm|spank|ride|aroused|climax|erotic|hardcore|fetish|kink|threesome|oral|deepthroat|creampie|facial|bondage|dominat|submiss|collar|leash|whip|gag|choker|thigh.?high|garter|corset|bustier|negligee|see.?through|topless|bottomless|spread|bent.?over|on.?knees|suck|lick|tease|seduce)\b|裸|自慰|高潮|乳房|阴道|阴茎|精液|性爱|口交|肛交|内衣|露点|色情|调教/i.test(userRequest);
    const { data: intimacyRow } = await client
      .from('intimacy_scores')
      .select('score')
      .eq('girlfriend_id', girlfriend_id)
      .eq('user_id', user.id)
      .maybeSingle();
    const intimacyScore = Number(intimacyRow?.score || 0);
    const intimacyPolicy = getIntimacyGenerationPolicy(intimacyScore);

    if (adultRequested && !intimacyPolicy.adultAllowed) {
      return NextResponse.json({
        error: zh ? '亲密值达到 300 后解锁成人聊天与生图。' : 'Reach 300 intimacy to unlock adult chat and image generation.',
        code: 'intimacy_locked',
        ...getIntimacyUnlockPayload(intimacyScore),
      }, { status: 403 });
    }

    const effectiveAdult = intimacyPolicy.adultAllowed;
    const resolved = resolveImageCall(aiModules, { scene: 'chat_selfie', tier, adult: effectiveAdult });

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
    const framing = intimacyPolicy.level >= 3
      ? 'candid three-quarter full-body framing, torso and pelvis visible, shifted weight, relaxed shoulders, asymmetrical natural gesture'
      : intent.kind === 'selfie'
      ? 'close selfie framing, looking directly at the camera'
      : intent.kind === 'body'
        ? 'medium full-body framing'
        : 'balanced portrait framing';
    const sceneBits = [envTag || 'a private modern room', poseTag, moodTag, framing]
      .filter(Boolean)
      .join(', ');

    const gfRecord = gf as Record<string, unknown>;
    const category = normalizeCompanionCategory({
      gender: gfRecord.gender,
      style: gfRecord.appearance_style,
      tags: gfRecord.tags,
    });
    const metadata = gfRecord.metadata && typeof gfRecord.metadata === 'object'
      ? gfRecord.metadata as Record<string, unknown>
      : {};
    const characterCard = gfRecord.character_card && typeof gfRecord.character_card === 'object'
      ? gfRecord.character_card as Record<string, unknown>
      : {};
    const cardAppearance = characterCard.appearance && typeof characterCard.appearance === 'object'
      ? characterCard.appearance as Record<string, unknown>
      : {};
    const animeStyle: AnimeRenderStyle = normalizeCompanionRenderStyle({
      renderStyle: gfRecord.render_style || metadata.render_style || characterCard.render_style,
      animeRenderStyle: gfRecord.anime_render_style || metadata.anime_render_style,
      visualStyle: gfRecord.visual_style || metadata.visual_style || cardAppearance.render_style,
      appearanceStyle: gfRecord.appearance_style,
    });
    const sceneSemantics = classifyImageScene(
      [userRequest, ...chatContext.map((message) => message.content), poseTag, envTag].filter(Boolean).join(' '),
      category,
    );
    const generationRoute = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: animeStyle,
      nsfwIntensity: intimacyPolicy.nsfwIntensity,
      sceneSemantics,
    });
    const identity = [
      gfRecord.name,
      gfRecord.age ? `age ${String(gfRecord.age)}` : 'age 25 or older',
      gfRecord.ethnicity,
      gfRecord.appearance_race,
      gfRecord.appearance_hair_color,
      gfRecord.appearance_hair,
      gfRecord.appearance_eyes,
      gfRecord.appearance_body,
      gfRecord.appearance_face,
      gfRecord.appearance_skin,
      gfRecord.appearance,
      gfRecord.distinguishing_features,
    ].filter(Boolean).map(String).join(', ');
    let prompt = buildStudioPromptEnhancement({
      category,
      intensity: intimacyPolicy.nsfwIntensity,
      animeStyle,
      scene: `${sceneBits}. ${buildSceneCastPrompt(sceneSemantics)}`,
      identity,
    });

    prompt = `${generationRoute.promptPrefix} ${prompt}`;

    const genderStyle = detectGenderStyle(gfRecord);
    const generationProfile = resolveImageGenerationProfile(genderStyle, effectiveAdult);
    const loraPlan = buildLoraPlan(
      subjectFromGirlfriendRow(gf as Record<string, unknown>),
      'chat_selfie',
      {
        adult: effectiveAdult,
        content: [prompt, intent.kind, intimacyPolicy.sceneDirection].filter(Boolean).join(' '),
        preferOutfit: intimacyPolicy.level === 2,
        preferNsfwPose: intimacyPolicy.level >= 4,
        preferDetail: /selfie|portrait|close.?up|face|skin/i.test(`${userRequest} ${intent.kind}`),
      },
    );
    const genericLoras = planToLorasArray(loraPlan).map((lora) => ({
      ...lora,
      strength_model: Math.min(0.9, Math.max(0.2, lora.strength_model * intimacyPolicy.loraStrengthMultiplier)),
      strength_clip: Math.min(0.9, Math.max(0.2, lora.strength_clip * intimacyPolicy.loraStrengthMultiplier)),
    }));
    const categoryControl = resolveCategoryLoraControls(
      category,
      intimacyPolicy.nsfwIntensity,
      animeStyle,
    );
    const categoryLoras = categoryControl.selected.map((lora) => ({
      name: lora.filename,
      strength_model: lora.strength,
      strength_clip: lora.strength,
    }));
    const categoryFiles = new Set(categoryLoras.map((lora) => lora.name));
    const useCategoryOnly = categoryControl.selected.length > 0;
    const requestedCompatibleLoras = generationRoute.modelFamily === 'flux'
      ? [
          ...categoryLoras,
          ...(useCategoryOnly ? [] : genericLoras.filter((lora) => !categoryFiles.has(lora.name))),
        ]
      : [];
    const compatibleLoraPlan = resolveModelLoraPlan({
      modelFamily: generationRoute.modelFamily,
      category,
      intensity: intimacyPolicy.nsfwIntensity,
      animeStyle,
      requested: requestedCompatibleLoras,
      maxLoras: intimacyPolicy.nsfwIntensity >= 3 ? 3 : 2,
    });
    const intelligentLoras = compatibleLoraPlan.selected;
    const modelLoraTriggers = compatibleLoraPlan.triggerWords;
    const triggerWords = categoryControl.selected.flatMap((lora) => lora.triggerWords);
    const allLoraTriggers = [...new Set([...triggerWords, ...modelLoraTriggers])];
    if (allLoraTriggers.length > 0) {
      prompt = `${allLoraTriggers.join(', ')}. ${prompt}`;
    }
    const baseNegativePrompt =
      typeof (body as { negative_prompt?: string }).negative_prompt === 'string' &&
      (body as { negative_prompt: string }).negative_prompt.trim()
        ? (body as { negative_prompt: string }).negative_prompt
        : resolved.defaultNegative || GIRLFRIEND_NEGATIVE_FLUX;

    const negativePrompt = `${studioNegativePrompt(category, animeStyle)}, ${baseNegativePrompt}, ${generationProfile.negativePrompt}`;
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
    const referenceConfig = await loadComfyConfig(client);
    const referencePlan = buildReferenceGenerationPlan({
      surface: 'companion',
      category,
      renderStyle: animeStyle,
      modelFamily: generationRoute.modelFamily,
      companionId: girlfriend_id,
      nsfwLevel: intimacyPolicy.nsfwIntensity,
      controls: referenceConfig.reference_control,
      assets: [
        ...companionIdentityAssets(girlfriend_id, referenceImages, {
          category,
          renderStyle: animeStyle,
          modelFamily: generationRoute.modelFamily,
        }),
        ...(referenceConfig.reference_assets || []),
      ],
    });
    if (referencePlan.promptHints.length > 0) {
      prompt = `${prompt} ${referencePlan.promptHints.join('. ')}`;
    }
    const referenceImage = referencePlan.primaryIdentity?.url;

    // Preserve identity from the saved portrait without copying its composition.
    const useConsistency =
      resolved.config.use_consistency_default !== false && Boolean(referenceImage);
    const denoise = useConsistency
      ? intimacyPolicy.level >= 3
        ? 0.58
        : 0.42
      : 1;

    const sceneCfg = resolved.config;
    const generationSeed = Math.floor(Math.random() * 2 ** 32);

    // --- Unified multi-provider image router (RunPod → fal.ai failover) ---
    const requestedProvider = String((body as { provider?: string }).provider || '') as ImageProvider | '';
    const routerResult = await routeImageGeneration({
      prompt,
      negative_prompt: negativePrompt,
      width: generationRoute.width || sceneCfg.width || 704,
      height: generationRoute.height || sceneCfg.height || 960,
      num_inference_steps: generationRoute.steps,
      guidance_scale: generationRoute.cfg,
      seed: generationSeed,
      image_url: useConsistency ? referenceImage : undefined,
      strength: useConsistency ? denoise : undefined,
      loras: intelligentLoras,
      ckpt_name: generationRoute.checkpoint,
      sampler_name: generationRoute.sampler,
      scheduler: generationRoute.scheduler,
      clip_skip: generationRoute.clipSkip,
      model_family: generationRoute.modelFamily,
      force_provider: requestedProvider || (generationRoute.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2'),
      nsfw: effectiveAdult,
      endpoint_id: generationRoute.endpointId || resolved.endpointId || undefined,
    });

    // If RunPod queued (pending), return job_id for client-side polling
    if (routerResult.pending) {
      return NextResponse.json({
        pending: true,
        job_id: routerResult.job_id,
        endpoint_id: generationRoute.endpointId || resolved.endpointId || undefined,
        status: 'IN_QUEUE',
        scene: 'chat_selfie',
        provider: routerResult.provider,
        generation_trace: {
          category,
          intensity: intimacyPolicy.nsfwIntensity,
          prompt: prompt.slice(0, 800),
          loras: intelligentLoras,
          lora_inventory_source: compatibleLoraPlan.inventorySource,
          missing_loras: compatibleLoraPlan.missing,
          referenceDenoise: useConsistency ? denoise : null,
          referencePlan: referencePlan.trace,
          referenceRoles: referencePlan.selected.map((asset) => asset.role),
          attempts: routerResult.attempts,
        },
        message: 'Image is being generated. Poll /api/ai/status?job_id=' + routerResult.job_id,
      });
    }

    // Resolve final URL: images[] contains URLs or base64 strings
    let generatedUrl: string;
    const firstImage = routerResult.images[0];
    if (!firstImage) {
      throw new Error('Image router returned no image data');
    }
    if (firstImage.startsWith('http://') || firstImage.startsWith('https://')) {
      generatedUrl = firstImage;
    } else {
      const dataUrl = `data:image/png;base64,${firstImage}`;
      const key = await uploadDataUrl(dataUrl, `chat_photos/${girlfriend_id}`);
      generatedUrl = (await resolveImageUrl(key)) || key;
    }

    void logModelUsage({
      provider: routerResult.provider, model_id: 'flux-dev',
      task_type: 'image_generation', user_id: user.id, girlfriend_id,
      latency_ms: Date.now() - started, cost_usd: 0.025, success: true,
    });

    const { error: auditError } = await client.from('ai_generation_audits').insert({
      user_id: user.id, girlfriend_id, scene: 'chat_selfie', membership_tier: tier,
      endpoint_id: resolved.logicalEndpointId, model_id: resolved.logicalEndpointId,
      route_reason: resolved.routeReason, quality_tier: resolved.qualityTier, seed: generationSeed,
      character_version: String((gf as { updated_at?: string }).updated_at || ''),
      reference_urls: referencePlan.selected.map((asset) => asset.url), prompt_summary: prompt.slice(0, 500), success: true,
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
      intimacy_level: intimacyPolicy.level,
      nsfw_intensity: intimacyPolicy.nsfwIntensity,
      lora_plan: {
        primary: loraPlan.primary.note,
        secondary: loraPlan.secondary?.note || null,
        strengths: intelligentLoras.map((lora) => lora.strength_model),
        files: intelligentLoras.map((lora) => lora.name),
        provider: routerResult.provider,
        attempts: routerResult.attempts,
        referenceDenoise: useConsistency ? denoise : null,
        missingCategoryLoras: categoryControl.missing.map((item) => item.id),
      },
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
