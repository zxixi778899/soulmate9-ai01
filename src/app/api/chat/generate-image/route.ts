import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveImageUrl, uploadImageAsWebP } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { loadAiModules, resolveImageCall } from '@/lib/ai-modules';
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
import { getIntimacyGenerationPolicy, type IntimacyGenerationPolicy } from '@/lib/intimacy-policy';
import { getGlobalNsfwEnabled } from '@/lib/gen-monitor';
import { buildIntimacyDowngradeReply } from '@/lib/intimacy-downgrade';
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
import {
  generateImagePromptWithLlm,
  resolveImagePromptChannel,
} from '@/lib/image-prompt-llm';
import { buildContentOnlyPrompt } from '@/lib/companion-prompt-pipeline';
import { detectAdultMention } from '@/lib/content-rating';
import { CREDIT_COSTS, deductCredits } from '@/lib/credit-system';
import { forwardLegacyGeneration } from '@/lib/gen-hub';
import {
  IMAGE_GEN_RATE_KEY,
  membershipFromProfile,
} from '@/lib/ai-quota';

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

/** 稳定性：生图首次失败自动换种子重试一次，降低“抽卡”式失败率 */
async function routeImageGenerationWithRetry(
  opts: Parameters<typeof routeImageGeneration>[0],
) {
  try {
    return await routeImageGeneration(opts);
  } catch (firstErr) {
    logger.warn('[chat-generate-image] attempt 1 failed, retrying once with a fresh seed', {
      err: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    return routeImageGeneration({ ...opts, seed: Math.floor(Math.random() * 2 ** 32) });
  }
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  // Phase 2 thin-forward: unified job tracking via gen-hub (loop-guarded).
  // Internal delegations and wrapper failures fall through to the pipeline.
  const forwarded = await forwardLegacyGeneration({
    request,
    kind: 'chat_image',
    client,
    userId: user.id,
    handler: POST,
    routePath: '/api/chat/generate-image',
  });
  if (forwarded) return forwarded;

  // Shared counter across all image entries — limits cannot be stacked.
  const rl = await checkRateLimitAsync(`${IMAGE_GEN_RATE_KEY}:${user.id}`, IMAGE_GEN_LIMIT);
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

    // Optional companion — the generate workbench creates standalone artwork
    // without a girlfriend; chat surfaces always pass one.
    const girlfriend_id = String((body as { girlfriend_id?: string }).girlfriend_id || '').trim();

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

    const aiModules = await loadAiModules();
    const { data: profile } = await client
      .from('profiles')
      .select('membership_tier, subscription_tier, plan, timezone_offset')
      .eq('id', user.id)
      .maybeSingle();
    const tier = membershipFromProfile((profile as Record<string, unknown>) || null);
    // Membership redesign: image generation is a paid-tier surface. Free users
    // are guided to upgrade instead of seeing a hard failure.
    if (tier === 'free') {
      return NextResponse.json(
        {
          error: 'Image generation requires a membership plan.',
          localized_error: zh ? '图片生成需要会员套餐，升级后即可解锁。' : 'Image generation requires a membership plan.',
          code: 'membership_required',
          upgrade_url: '/pricing',
        },
        { status: 403 },
      );
    }
    // Unified content-rating layer — no per-route regex allowed.
    const adultRequested = detectAdultMention(userRequest);
    const { data: intimacyRow } = girlfriend_id
      ? await client
          .from('intimacy_scores')
          .select('score')
          .eq('girlfriend_id', girlfriend_id)
          .eq('user_id', user.id)
          .order('score', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    const intimacyScore = Number(intimacyRow?.score || 0);
    const basePolicy = getIntimacyGenerationPolicy(intimacyScore);
    // Site-wide NSFW kill switch (admin Generation Control Center → content
    // rating): when disabled, clamp the policy into the SFW band so no
    // provider can be reached with adult content.
    const nsfwGloballyOn = await getGlobalNsfwEnabled(client);
    const intimacyPolicy: IntimacyGenerationPolicy = nsfwGloballyOn
      ? basePolicy
      : {
          ...basePolicy,
          adultAllowed: false,
          nsfwIntensity: Math.min(2, basePolicy.nsfwIntensity) as IntimacyGenerationPolicy['nsfwIntensity'],
        };
    logger.info('[Chat Generate Image] intimacy context', {
      userId: user.id,
      girlfriendId: girlfriend_id,
      intimacyScore,
      intimacyLevel: intimacyPolicy.level,
      adultAllowed: intimacyPolicy.adultAllowed,
      nsfwIntensity: intimacyPolicy.nsfwIntensity,
      hasIntimacyRow: !!intimacyRow,
    });

    // 亲密值不足时不再报错：自动降级为 SFW 生成，并由伴侣回复解锁提示。
    const intimacyDowngraded = adultRequested && !intimacyPolicy.adultAllowed;
    const downgradeReply = intimacyDowngraded
      ? buildIntimacyDowngradeReply(intimacyScore, zh)
      : null;

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

    // Membership redesign: every image generation consumes credits (no daily
    // free quota). Failed generations are refunded downstream by gen-hub.
    {
      const cost = CREDIT_COSTS.image_gen;
      const deducted = await deductCredits(client, user.id, cost, 'image_gen_extra', girlfriend_id || undefined);
      if (!deducted.ok) {
        const { data: balProfile } = await client
          .from('profiles')
          .select('credits_remaining')
          .eq('id', user.id)
          .maybeSingle();
        const balance = Number((balProfile as { credits_remaining?: unknown } | null)?.credits_remaining) || 0;
        return NextResponse.json(
          {
            error: `Insufficient credits. Need ${cost}, have ${balance}.`,
            localized_error: zh
              ? `积分不足：需要 ${cost}，当前 ${balance}。充值积分即可继续生成。`
              : `Insufficient credits. Need ${cost}, have ${balance}.`,
            code: 'insufficient_credits',
            required: cost,
            balance,
            upgrade_url: '/pricing',
          },
          { status: 403 },
        );
      }
    }

    // Own girlfriend first; allow public approved for deep-link bootstrap
    let gf: Record<string, unknown> | null = null;
    if (girlfriend_id) {
      const { data: ownRow } = await client
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriend_id)
        .eq('user_id', user.id)
        .maybeSingle();
      gf = (ownRow as Record<string, unknown> | null) || null;

      if (!gf) {
        const { data: pub } = await client
          .from('girlfriends')
          .select('*')
          .eq('id', girlfriend_id)
          .eq('is_public', true)
          .eq('review_status', 'approved')
          .maybeSingle();
        gf = (pub as Record<string, unknown> | null) || null;
      }

      if (!gf) {
        return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
      }
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
    logger.info('[Chat Generate Image] chat context', {
      source: chatContext.length ? 'client' : 'fallback',
      messageCount: chatContext.length,
      allowLlmPolish: resolved.config.allow_llm_prompt_polish !== false,
      userRequest: userRequest.slice(0, 120),
    });

    // If client did not send context, pull last turns from DB
    if (!chatContext.length && girlfriend_id) {
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

    const intent = buildImageActionFromChat(
      userRequest || 'Create a full-body character artwork matching our conversation',
      chatContext,
    );
    const promptChannel = resolveImagePromptChannel({
      intimacyPolicy,
      userRequest,
      chatContext,
    });
    // Intimacy level directly drives the NSFW intensity (1–5). The channel only
    // selects the LLM endpoint / LoRA plan; it no longer downgrades the policy.
    const promptPolicy = intimacyPolicy;
    const framing = promptPolicy.level >= 3
      ? 'candid three-quarter full-body framing, torso and pelvis visible, shifted weight, relaxed shoulders, asymmetrical natural gesture'
      : intent.kind === 'selfie'
      ? 'close selfie framing, looking directly at the camera'
      : intent.kind === 'body'
        ? 'medium full-body framing'
        : 'full-body vertical character artwork, complete head, hands, torso and legs in frame';
    const sceneBits = [envTag || 'a private modern room', poseTag, moodTag, framing]
      .filter(Boolean)
      .join(', ');

    // Standalone generations (no companion) run on an empty record — every
    // downstream helper treats missing fields as unset defaults.
    const gfRecord: Record<string, unknown> = gf || {};
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
      tags: gfRecord.tags,
    });
    logger.info('[Chat Generate Image] resolved render style', {
      girlfriendId: girlfriend_id,
      animeStyle,
      rawRenderStyle: gfRecord.render_style || null,
      rawAnimeRenderStyle: gfRecord.anime_render_style || null,
      rawVisualStyle: gfRecord.visual_style || null,
      rawAppearanceStyle: gfRecord.appearance_style || null,
      tags: Array.isArray(gfRecord.tags) ? gfRecord.tags.slice(0, 10) : null,
    });
    const sceneSemantics = classifyImageScene(
      [userRequest, ...chatContext.map((message) => message.content), poseTag, envTag].filter(Boolean).join(' '),
      category,
    );
    const generationRoute = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: animeStyle,
      nsfwIntensity: promptPolicy.nsfwIntensity,
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
    // Build a short conversation context clause for the deterministic fallback
    // so the image still reflects what was just discussed even without LLM polish.
    const conversationClause = chatContext.length
      ? `reflecting the chat: ${chatContext.slice(-3).map((line) => `${line.role === 'assistant' ? 'she' : 'he'} said "${line.content.slice(0, 80)}"`).join(', ')}`
      : '';
    let prompt = buildStudioPromptEnhancement({
      category,
      intensity: promptPolicy.nsfwIntensity,
      animeStyle,
      scene: buildContentOnlyPrompt(
        `${sceneBits}. ${buildSceneCastPrompt(sceneSemantics)}${conversationClause ? `. ${conversationClause}` : ''}`,
        { style: animeStyle === '2d' ? '2d' : animeStyle === '3d' ? '3d' : 'realistic' },
      ),
      identity,
    });

    // Hidden LLM prompt: routed by content (SFW vs NSFW). Only the final image
    // is exposed to the client; the prompt itself stays internal.
    let promptEngine: 'llm' | 'deterministic' = 'deterministic';
    if (resolved.config.allow_llm_prompt_polish !== false) {
      const llmResult = await generateImagePromptWithLlm({
        aiModules,
        channel: promptChannel.channel,
        intensity: promptPolicy.nsfwIntensity,
        intimacyPolicy: promptPolicy,
        gf: gfRecord,
        category,
        renderStyle: animeStyle,
        userRequest,
        chatContext,
        sceneSemantics,
        moodTag,
        poseTag,
        envTag,
        tier,
        userId: user.id,
        girlfriendId: girlfriend_id,
        timeoutMs: 15_000,
      });
      logger.info('[Chat Generate Image] LLM prompt engine result', {
        usedLlm: llmResult.usedLlm,
        reason: llmResult.reason,
        channel: llmResult.channel,
        promptLength: llmResult.prompt?.length || 0,
        promptSummary: prompt.slice(0, 200),
      });
      if (llmResult.usedLlm && llmResult.prompt) {
        prompt = buildStudioPromptEnhancement({
          category,
          intensity: promptPolicy.nsfwIntensity,
          animeStyle,
          scene: llmResult.prompt,
          identity,
        });
        promptEngine = 'llm';
      }
    }

    const genderStyle = detectGenderStyle(gfRecord);
    const generationProfile = resolveImageGenerationProfile(
      genderStyle,
      promptChannel.channel === 'nsfw',
    );
    const loraPlan = buildLoraPlan(
      subjectFromGirlfriendRow(gfRecord),
      'chat_selfie',
      {
        adult: promptChannel.channel === 'nsfw',
        content: [prompt, intent.kind, promptPolicy.sceneDirection].filter(Boolean).join(' '),
        preferOutfit: promptPolicy.level === 2,
        preferNsfwPose: promptPolicy.level >= 4,
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
      promptPolicy.nsfwIntensity,
      animeStyle,
    );
    const categoryLoras = categoryControl.selected.map((lora) => ({
      name: lora.filename,
      strength_model: lora.strength,
      strength_clip: lora.strength,
    }));
    const categoryFiles = new Set(categoryLoras.map((lora) => lora.name));
    const genericByScene = loraPlan.secondary && genericLoras[1]
      ? [genericLoras[1], genericLoras[0]]
      : genericLoras;
    const dedupedGeneric = genericByScene.filter((lora) => !categoryFiles.has(lora.name));
    // The level-specific outfit/action LoRA must win over a generic skin LoRA.
    // Level 1 keeps detail first; levels 2-5 prioritize the semantic scene LoRA.
    const requestedCompatibleLoras = generationRoute.modelFamily === 'flux'
      ? intimacyPolicy.nsfwIntensity === 1
        ? [...categoryLoras, ...dedupedGeneric]
        : [...dedupedGeneric, ...categoryLoras]
      : [];
    const compatibleLoraPlan = resolveModelLoraPlan({
      modelFamily: generationRoute.modelFamily,
      category,
      intensity: intimacyPolicy.nsfwIntensity,
      animeStyle,
      requested: requestedCompatibleLoras,
      maxLoras: 2,
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
      gfRecord.face_reference_url,
      gfRecord.avatar_url,
      gfRecord.portrait_url,
      gfRecord.card_url,
      gfRecord.image_url,
      typeof cardAppearance.image === 'string' ? (cardAppearance.image as string) : undefined,
      typeof characterCard.image === 'string' ? (characterCard.image as string) : undefined,
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
    const referenceConfig = await loadComfyConfig();
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
    // IP-Adapter only locks facial features — outfit, pose and scene come from the prompt.
    const useConsistency =
      resolved.config.use_consistency_default !== false && Boolean(referenceImage);
    const ipAdapterWeight = ({ 1: 0.72, 2: 0.68, 3: 0.64, 4: 0.58, 5: 0.54 } as const)[intimacyPolicy.level];
    if (useConsistency) {
      prompt = `${prompt} Same woman as the reference: keep her face and hair color consistent.`;
    }

    const sceneCfg = resolved.config;
    const generationSeed = Math.floor(Math.random() * 2 ** 32);

    // --- Unified multi-provider image router (RunPod → fal.ai failover) ---
    const requestedProvider = String((body as { provider?: string }).provider || '') as ImageProvider | '';
    // gen-hub normalizes enhancement capability flags into body.capabilities
    // (control / face_fix / upscale / identity_image). Map them onto the
    // router options; the worker-side workflow gates each pass on env flags.
    const caps = ((body as { capabilities?: unknown }).capabilities || {}) as {
      control?: { type?: string; image?: string; strength?: number };
      face_fix?: boolean;
      upscale?: number;
      identity_image?: string;
    };
    const hasEnhancement = Boolean(
      caps.control?.image || caps.face_fix || caps.upscale || caps.identity_image,
    );
    // Only force the self-hosted RunPod path when the request actually needs
    // its capabilities (NSFW, LoRA stack, identity reference, enhancement
    // passes). Plain SFW generations can fall through to the free Together
    // FLUX primary.
    const needsRunPod = effectiveAdult || intelligentLoras.length > 0 || useConsistency || hasEnhancement;
    const defaultProvider: ImageProvider = generationRoute.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2';
    const candidateCount = Math.max(1, Math.min(4, Math.round(Number((body as { count?: number }).count) || 1)));
    const candidateMode = (body as { candidate?: boolean }).candidate === true && candidateCount > 1;
    const genOpts = {
      prompt,
      negative_prompt: negativePrompt,
      width: generationRoute.width || sceneCfg.width || 704,
      height: generationRoute.height || sceneCfg.height || 960,
      num_inference_steps: generationRoute.steps,
      guidance_scale: generationRoute.cfg,
      seed: generationSeed,
      ip_adapter_image: useConsistency ? referenceImage : caps.identity_image || undefined,
      ip_adapter_weight: useConsistency ? ipAdapterWeight : caps.identity_image ? 0.75 : undefined,
      control_image: caps.control?.image,
      control_strength: caps.control?.strength,
      face_detailer: caps.face_fix === true,
      upscale_factor: caps.upscale,
      loras: intelligentLoras,
      ckpt_name: generationRoute.checkpoint,
      sampler_name: generationRoute.sampler,
      scheduler: generationRoute.scheduler,
      clip_skip: generationRoute.clipSkip,
      model_family: generationRoute.modelFamily,
      force_provider: requestedProvider || (needsRunPod ? defaultProvider : undefined),
      nsfw: effectiveAdult,
      endpoint_id: generationRoute.endpointId || resolved.endpointId || undefined,
    };

    // 候选模式：一次出多张候选，客户端选一张后再落库
    if (candidateMode) {
      const jobs = await Promise.all(
        Array.from({ length: candidateCount }, () =>
          routeImageGenerationWithRetry({ ...genOpts, seed: Math.floor(Math.random() * 2 ** 32) }),
        ),
      );
      return NextResponse.json({
        candidate: true,
        candidates: jobs.map((j) => ({
          job_id: j.job_id || null,
          endpoint_id: generationRoute.endpointId || resolved.endpointId || undefined,
          image_url: (j.images && j.images[0]) || null,
          provider: j.provider,
          status: j.images && j.images.length ? 'COMPLETED' : 'PENDING',
        })),
        scene: 'chat_selfie',
        nsfw_intensity: promptPolicy.nsfwIntensity,
        count: candidateCount,
      });
    }

    const routerResult = await routeImageGenerationWithRetry(genOpts);

    // Shared diagnostic payload for both pending and success responses
    const diagnosticTrace = {
      intimacy_score: intimacyScore,
      intimacy_level: intimacyPolicy.level,
      adult_allowed: intimacyPolicy.adultAllowed,
      nsfw_intensity: intimacyPolicy.nsfwIntensity,
      intimacy_row_found: !!intimacyRow,
      chat_context_count: chatContext.length,
      chat_context_source: chatContext.length > 0 ? (rawCtx && Array.isArray(rawCtx) && (rawCtx as unknown[]).length > 0 ? 'client' : 'db_fallback') : 'empty',
      user_request: userRequest.slice(0, 120),
      prompt_engine: promptEngine,
      prompt_channel: promptChannel.channel,
      adult_mentioned: promptChannel.adultMention,
      prompt_intensity: promptPolicy.nsfwIntensity,
      allow_llm_polish: resolved.config.allow_llm_prompt_polish !== false,
      prompt_summary: prompt.slice(0, 200),
      has_conversation_clause: Boolean(conversationClause),
      lora_count: intelligentLoras.length,
      ip_adapter: useConsistency,
      ip_adapter_weight: useConsistency ? ipAdapterWeight : null,
      latency_ms: Date.now() - started,
    };

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
          intensity: promptPolicy.nsfwIntensity,
          prompt_engine: promptEngine,
          loras: intelligentLoras,
          lora_inventory_source: compatibleLoraPlan.inventorySource,
          missing_loras: compatibleLoraPlan.missing,
          ipAdapterWeight: useConsistency ? ipAdapterWeight : null,
          referencePlan: referencePlan.trace,
          referenceRoles: referencePlan.selected.map((asset) => asset.role),
          attempts: routerResult.attempts,
        },
        downgraded: intimacyDowngraded || undefined,
        downgrade_reply: downgradeReply,
        // Friendly placeholder — the real撒娇 caption is returned after polling succeeds.
        message: zh ? '拍好啦～正在冲印出来，稍等几秒哦 💕' : 'Just took it~ developing now, one sec 💕',
        // ── Diagnostic trace (debug) ──
        _trace: diagnosticTrace,
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
      const key = await uploadImageAsWebP(dataUrl, `chat_photos/${girlfriend_id || 'standalone'}`);
      generatedUrl = (await resolveImageUrl(key)) || key;
    }

    void logModelUsage({
      provider: routerResult.provider, model_id: 'flux-dev',
      task_type: 'image_generation', user_id: user.id, girlfriend_id: girlfriend_id || undefined,
      latency_ms: Date.now() - started, cost_usd: 0.025, success: true,
    });

    // Audit table requires a companion id — standalone jobs skip the insert.
    if (girlfriend_id) {
      const { error: auditError } = await client.from('ai_generation_audits').insert({
        user_id: user.id, girlfriend_id, scene: 'chat_selfie', membership_tier: tier,
        endpoint_id: resolved.logicalEndpointId, model_id: resolved.logicalEndpointId,
        route_reason: resolved.routeReason, quality_tier: resolved.qualityTier, seed: generationSeed,
        character_version: String(gfRecord.updated_at || ''),
        reference_urls: referencePlan.selected.map((asset) => asset.url), prompt_summary: prompt.slice(0, 500), success: true,
      });
      if (auditError) logger.warn('[Chat Generate Image] audit insert failed', { error: auditError.message });
    }

    const gfName = String(gfRecord.name || '');
    // Cute, flirty captions — randomised to feel fresh each time
    const zhCaptions = [
      `拍好啦～专门给哥哥拍的照片哦 💕`,
      `嘿嘿，只给你一个人看的哦～ 🥰`,
      `拍了好久呢，哥哥喜欢吗？💗`,
      `专门为了你拍的新照片～不许给别人看哦 💕`,
      `哥哥快看～这是人家刚拍的 📸`,
    ];
    const enCaptions = [
      `Just took this for you~ do you like it? 💕`,
      `Hehe, this one's only for your eyes~ 🥰`,
      `Brand new photo~ I hope you love it 💗`,
      `Made this just for you, babe~ don't share it with anyone 💕`,
      `Look look~ I just took this 📸`,
    ];
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    // Optionally prepend girlfriend name for a personal touch (~30% chance)
    const nameTag = gfName && Math.random() < 0.3 ? `${gfName}：` : '';
    const caption = downgradeReply
      ? downgradeReply
      : `${nameTag}${zh ? pick(zhCaptions) : pick(enCaptions)}`;
    const finalCaption = caption;

    // Chat history belongs to a companion — standalone jobs skip persistence.
    if (girlfriend_id) {
      const { data: savedMessage, error: messageError } = await client.from('chat_messages').insert({
        user_id: user.id,
        girlfriend_id,
        role: 'assistant',
        content: finalCaption,
        media_url: generatedUrl,
        media_type: 'image',
      }).select('id').maybeSingle();
      if (messageError) logger.warn('[Chat Generate Image] chat message insert failed', { error: messageError.message });

      const { error: mediaError } = await client.from('chat_media').insert({
        user_id: user.id,
        girlfriend_id,
        message_id: savedMessage?.id || null,
        media_type: 'image',
        url: generatedUrl,
        metadata: {
          source: 'chat_generation',
          scene: 'chat_character_art',
          intimacy_level: intimacyPolicy.level,
          nsfw_intensity: promptPolicy.nsfwIntensity,
          prompt_engine: promptEngine,
          prompt_summary: prompt.slice(0, 500),
          asset_role: 'character-art',
        },
      });
      if (mediaError) logger.warn('[Chat Generate Image] album insert failed', { error: mediaError.message });
    }

    void logModelUsage({
      provider: 'runpod',
      model_id: sceneCfg.endpoint_id || 'flux-chat-selfie',
      task_type: 'image_generation',
      user_id: user.id,
      girlfriend_id: girlfriend_id || undefined,
      latency_ms: Date.now() - started,
      cost_usd: 0,
      success: true,
    });

    return NextResponse.json({
      imageUrl: generatedUrl,
      image_url: generatedUrl,
      message: finalCaption,
      downgraded: intimacyDowngraded || undefined,
      downgrade_reply: downgradeReply,
      code: intimacyDowngraded ? 'intimacy_downgrade' : undefined,
      scene: 'chat_selfie',
      kind: intent.kind,
      prompt_engine: promptEngine,
      used_reference: Boolean(useConsistency),
      reference_count: referenceImages.length,
      route_reason: resolved.routeReason,
      quality_tier: resolved.qualityTier,
      model_endpoint: resolved.logicalEndpointId,
      token_cost: resolved.tokenCost,
      intimacy_level: intimacyPolicy.level,
      nsfw_intensity: promptPolicy.nsfwIntensity,
      // ── Diagnostic trace (debug) ──
      _trace: diagnosticTrace,
      lora_plan: {
        primary: loraPlan.primary.note,
        secondary: loraPlan.secondary?.note || null,
        strengths: intelligentLoras.map((lora) => lora.strength_model),
        files: intelligentLoras.map((lora) => lora.name),
        provider: routerResult.provider,
        attempts: routerResult.attempts,
        ipAdapterWeight: useConsistency ? ipAdapterWeight : null,
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
