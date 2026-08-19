import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl, resolveImageUrl, toPublicUrl } from '@/lib/storage';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import { buildIdReferencePrompt, type IdFraming } from '@/lib/companion-prompt-pipeline';
import { buildStudioPromptEnhancement, studioNegativePrompt } from '@/lib/comfy-console/studio-profile';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { routeImageGeneration } from '@/lib/image-router';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import { buildReferenceGenerationPlan } from '@/lib/reference-generation-plan';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { normalizeCreatorPreset, type CreatorPreset } from '@/lib/creator-presets';
import {
  findCachedPresetPortrait,
  recordPresetPortraitStat,
  writebackPresetPortrait,
  visualMatchesPreset,
} from '@/lib/preset-portrait-cache';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';
import { buildAutoLoraStack, buildKeywordLoras } from '@/lib/auto-lora';
import { sanitizeLoraForVolume, getVerifiedInstalledLoraSet } from '@/lib/runpod-loras';
import { translatePromptToEnglish } from '@/lib/prompt-translate';
import { forwardLegacyGeneration } from '@/lib/gen-hub';
import { resolveIdentityKit, resolveIpAdapterWeight, type IdentityKitSupabaseClient } from '@/lib/identity-kit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PORTRAIT_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

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

function buildPortraitPrompt(input: {
  name?: string;
  visual_style?: string;
  ethnicity?: string;
  gender?: string;
  face_shape?: string;
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  body_type?: string;
  fashion_style?: string;
  appearance_prompt?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  bodyType?: string;
  style?: string;
  personality?: string;
  /** Parts-library (forge genome) fragments: skin tone / bust shape / height / combined extras. */
  skin_tone?: string;
  bust_shape?: string;
  height?: string;
  genome_prompt?: string;
}): string {
  const name = (input.name || 'an adult companion').trim();
  const ethnicity = input.ethnicity || 'mixed';
  const gender = input.gender || 'Female';
  const face = input.face_shape || 'oval';
  const hairStyle = input.hair_style || input.hairStyle || 'long flowing';
  const hairColor = hairColorName(input.hair_color || input.hairColor || 'brown');
  const eyeColor = input.eye_color || input.eyeColor || 'brown';
  const bodyType = input.body_type || input.bodyType || 'slim';
  const fashion = input.fashion_style || input.style || 'casual';
  const visual = (input.visual_style || 'realistic').toLowerCase();
  const extra = sanitizeBlurKeywords(
    [input.appearance_prompt, input.personality].filter(Boolean).join(', '),
  );
  const skinTone = sanitizeBlurKeywords(String(input.skin_tone || '').trim());
  const bustShape = sanitizeBlurKeywords(String(input.bust_shape || '').trim());
  const heightFrag = sanitizeBlurKeywords(String(input.height || '').trim());
  const genomeExtra = sanitizeBlurKeywords(String(input.genome_prompt || '').trim());

  const medium =
    visual === '2d' || visual === 'anime'
      ? 'a polished 2D anime character portrait with clean line art and deliberate cel shading'
      : visual === '3d'
        ? 'a polished 3D animated character portrait with coherent materials and studio character lighting'
        : 'a natural editorial photograph with believable skin texture and soft directional light';
  const category = normalizeCompanionCategory({ gender });
  const bodyDescription = category === 'male'
    ? `${bodyType} adult masculine build with broad shoulders and a defined torso`
    : category === 'transgender'
      ? `${bodyType} adult feminine silhouette with visibly mixed masculine and feminine physical traits`
      : `${bodyType} adult feminine figure with natural proportions`;

  const parts = [
    medium,
    `gorgeous young adult ${gender.toLowerCase()} age 22-28 named ${name}`,
    `${ethnicity} features, ${face} face shape${skinTone ? `, ${skinTone}` : ''}`,
    `${hairStyle} ${hairColor} hair`,
    `${eyeColor} eyes looking at viewer`,
    bodyDescription,
    bustShape,
    heightFrag,
    `wearing flattering ${fashion} outfit`,
    genomeExtra.slice(0, 200),
    extra.slice(0, 180),
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

async function generateImage(input: {
  prompt: string;
  negativePrompt: string;
  category: ReturnType<typeof normalizeCompanionCategory>;
  renderStyle: ReturnType<typeof normalizeCompanionRenderStyle>;
  endpointId?: string;
  referenceImage?: string;
  /** NSFW 级别 1-5：捏脸系统不锁定，SFW/NSFW 均可生成 */
  nsfwLevel?: number;
  /** 每张图独立随机种子，避免 4 张完全相同 */
  seed?: number;
  /** 自动 LoRA 栈（已按运行卷校验） */
  loras?: Array<{ name: string; strength_model: number; strength_clip: number }>;
  /** IP-Adapter identity reference */
  ipAdapterImage?: string;
  ipAdapterWeight?: number;
}): Promise<{ image?: string; jobId?: string; endpointId?: string; pending?: boolean }> {
  const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(input.nsfwLevel) || 1)));
  const route = resolveImageGenerationRoute({
    surface: 'companion',
    category: input.category,
    renderStyle: input.renderStyle,
    nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
  });
  const result = await routeImageGeneration({
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    width: 768,
    height: 1024,
    num_inference_steps: route.steps,
    guidance_scale: route.cfg,
    seed: input.seed,
    ip_adapter_image: input.ipAdapterImage || input.referenceImage || undefined,
    ip_adapter_weight: input.ipAdapterWeight ?? (input.referenceImage ? 0.65 : undefined),
    ckpt_name: route.checkpoint,
    sampler_name: route.sampler,
    scheduler: route.scheduler,
    clip_skip: route.clipSkip,
    model_family: route.modelFamily,
    force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
    endpoint_id: input.endpointId || route.endpointId || undefined,
    nsfw: nsfwLevel >= 3,
    loras: input.loras?.length ? input.loras : undefined,
  });
  if (result.pending) {
    return { jobId: result.job_id, endpointId: input.endpointId || route.endpointId || undefined, pending: true };
  }
  return { image: result.images[0] };
}

async function uploadToStorage(base64Data: string, name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'companion';
  const dataUrl = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/png;base64,${base64Data}`;
  const key = await uploadDataUrl(dataUrl, `portraits/${safeName}_${Date.now()}`);
  const resolved = (await resolveImageUrl(key)) || toPublicUrl(key) || key;
  return resolved;
}

export async function POST(request: NextRequest) {
  try {
    const { user, client, error: authError } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    // Phase 2 thin-forward: unified job tracking via gen-hub (loop-guarded).
    if (client) {
      const forwarded = await forwardLegacyGeneration({
        request,
        kind: 'portrait',
        client,
        userId: user.id,
        handler: POST,
        routePath: '/api/girlfriends/generate-portrait',
      });
      if (forwarded) return forwarded;
    }

    const rl = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many portrait generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, PORTRAIT_GEN_LIMIT) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || 'Companion');
    // ID 参考图取景：waist-up（腰部以上，默认）或 close-up（头部特写）
    const framing: IdFraming = body.framing === 'close-up' ? 'close-up' : 'waist-up';
    const gfIdForRef = String(body.girlfriend_id || body.girlfriendId || '').trim();

    // Batch generation (creator v3 generates 4 candidate portraits at once).
    // Each extra image consumes one rate-limit slot of the same hourly budget.
    const count = Math.max(1, Math.min(4, Math.round(Number(body.count) || 1)));
    for (let i = 1; i < count; i++) {
      const extra = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
      if (!extra.allowed) {
        return NextResponse.json(
          { error: 'Too many portrait generation requests. Please try again later.' },
          { status: 429, headers: rateLimitHeaders(extra, PORTRAIT_GEN_LIMIT) },
        );
      }
    }

    // ── M3: shared preset portrait cache ────────────────────────────────
    const rawPresetSlug =
      typeof body.preset_slug === 'string' ? body.preset_slug.trim().toLowerCase() : '';
    let cachePreset: CreatorPreset | null = null;
    let cacheEligible = false;
    if (rawPresetSlug) {
      try {
        const sb = getSupabaseClient();
        const { data: presetRowData } = await sb
          .from('character_presets')
          .select('*')
          .eq('slug', rawPresetSlug)
          .eq('is_active', true)
          .maybeSingle();
        if (presetRowData) {
          cachePreset = normalizeCreatorPreset(presetRowData as Record<string, unknown>);
          cacheEligible = Boolean(cachePreset && visualMatchesPreset(cachePreset, body));
        }
      } catch (e) {
        logger.warn('[Generate Portrait] preset lookup failed', {
          slug: rawPresetSlug,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (cacheEligible && cachePreset?.slug) {
      const cachedUrl = await findCachedPresetPortrait(cachePreset.slug);
      if (cachedUrl) {
        void recordPresetPortraitStat(cachePreset.slug, 'hit', cachedUrl);
        logger.info('[Generate Portrait] preset cache hit — skipping GPU', {
          slug: cachePreset.slug,
        });
        return NextResponse.json({
          success: true,
          imageUrl: cachedUrl,
          portrait_url: cachedUrl,
          url: cachedUrl,
          images: [cachedUrl],
          cached: true,
          preset_slug: cachePreset.slug,
          key: null,
        });
      }
      void recordPresetPortraitStat(cachePreset.slug, 'miss');
    }

    // Preset scene + outfit enrich the prompt so the portrait matches the
    // companion's opening scene (quality) while staying cache-keyed by slug.
    const presetExtraParts: string[] = [];
    if (cachePreset) {
      if (cachePreset.portrait_outfit) presetExtraParts.push(cachePreset.portrait_outfit);
      if (cachePreset.scene_id) {
        const sceneId = cachePreset.scene_id;
        const recipe = GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === sceneId);
        if (recipe) presetExtraParts.push(`${recipe.env}, ${recipe.light}`);
      }
    }
    const combinedAppearancePrompt = [
      typeof body.appearance_prompt === 'string' ? body.appearance_prompt : '',
      ...presetExtraParts,
    ]
      .filter(Boolean)
      .join(', ');

    const prompt = buildPortraitPrompt({
      name,
      visual_style: body.visual_style as string | undefined,
      ethnicity: body.ethnicity as string | undefined,
      gender: body.gender as string | undefined,
      face_shape: body.face_shape as string | undefined,
      hair_style: body.hair_style as string | undefined,
      hair_color: body.hair_color as string | undefined,
      eye_color: body.eye_color as string | undefined,
      body_type: body.body_type as string | undefined,
      fashion_style: body.fashion_style as string | undefined,
      appearance_prompt: combinedAppearancePrompt || undefined,
      hairStyle: body.hairStyle as string | undefined,
      hairColor: body.hairColor as string | undefined,
      eyeColor: body.eyeColor as string | undefined,
      bodyType: body.bodyType as string | undefined,
      style: body.style as string | undefined,
      personality: body.personality as string | undefined,
      skin_tone: body.skin_tone as string | undefined,
      bust_shape: body.bust_shape as string | undefined,
      height: body.height as string | undefined,
      genome_prompt: body.genome_prompt as string | undefined,
    });

    const category = normalizeCompanionCategory({ gender: body.gender });
    const renderStyle = normalizeCompanionRenderStyle({
      visualStyle: body.visual_style,
      renderStyle: body.render_style,
      animeRenderStyle: body.anime_render_style,
      tags: body.tags,
    });
    // 捏脸系统取消 NSFW 锁定：支持 1-5 全部级别（默认 1 = SFW，传 nsfw_level/intensity 可生成任意级别）
    const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(body.nsfw_level ?? body.intensity) || 1)));
    const config = await loadComfyConfig();
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle,
      nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
    });
    const negativePrompt = studioNegativePrompt(category, renderStyle);

    // ── Custom prompt bypass: if client already generated a prompt via
    //    /api/creator/generate-prompt, use it directly (text-to-image mode). ──
    const customPrompt = typeof body.custom_prompt === 'string' ? body.custom_prompt.trim() : '';
    let naturalPrompt: string;
    let finalIdentity: string;
    let identityKit: Awaited<ReturnType<typeof resolveIdentityKit>> | null = null;

    if (customPrompt) {
      // Pre-built prompt from the creator wizard — skip internal prompt building
      naturalPrompt = customPrompt;
      finalIdentity = customPrompt;
      logger.info('[Generate Portrait] Using custom prompt (text-to-image mode)', {
        name, promptLen: customPrompt.length,
      });
    } else {
      // First resolve identity kit for ANY branch (custom or not)
      const sb = getSupabaseClient();
      identityKit = await resolveIdentityKit(
        gfIdForRef,
        sb as unknown as IdentityKitSupabaseClient,
        body as Record<string, unknown>
      ).catch((err) => {
        logger.warn('[Generate Portrait] resolveIdentityKit failed', { err: err instanceof Error ? err.message : String(err) });
        return null;
      });

      const referencePlan = buildReferenceGenerationPlan({
        surface: 'companion',
        category,
        renderStyle,
        modelFamily: route.modelFamily,
        companionId: gfIdForRef,
        nsfwLevel,
        allowIdentity: true,
        controls: config.reference_control,
        assets: config.reference_assets || [],
      });
      // 中文自由描述自动转英文（与后台控制台同一套翻译逻辑）
      const translatedIdentity = await translatePromptToEnglish({
        text: prompt,
        intensity: nsfwLevel,
        mode: 'positive',
        supabase: undefined,
        userId: user.id,
      });
      finalIdentity = translatedIdentity || prompt;
      naturalPrompt = buildStudioPromptEnhancement({
        category,
        intensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
        animeStyle: renderStyle,
        identity: finalIdentity,
        scene: [
          buildIdReferencePrompt(framing),
          ...referencePlan.promptHints,
        ].join('. '),
      });
    }

    // 自动 LoRA：与后台一致（性别/风格固定组合 + 提示词关键词触发，仅用运行卷已验证文件）
    const installedSet = [...getVerifiedInstalledLoraSet()];
    const autoPicks = buildAutoLoraStack(config, body.gender, body.visual_style, nsfwLevel, installedSet);
    const keywordPicks = buildKeywordLoras(finalIdentity + ', ' + naturalPrompt, config, installedSet);
    const combinedPicks = [...autoPicks, ...keywordPicks];
    const seenIds = new Set<string>();
    const loraStack: Array<{ name: string; strength_model: number; strength_clip: number }> = [];
    for (const p of combinedPicks) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      if (loraStack.length >= 3) break;
      const asset = config.loras.find((l) => l.id === p.id);
      if (!asset?.filename) continue;
      const san = sanitizeLoraForVolume(asset.filename, { fallback: null, allowNull: true });
      if (!san.lora_name) continue;
      const strength = Math.min(1.5, Math.max(0, Number(p.strength ?? asset.default_strength ?? 0.7) || 0.7));
      loraStack.push({ name: san.lora_name, strength_model: strength, strength_clip: strength });
    }
    const totalStrength = loraStack.reduce((s, l) => s + l.strength_model, 0);
    const scale = totalStrength > 1.55 ? 1.55 / totalStrength : 1;
    const normalizedLoras = loraStack.map((l) => ({
      ...l,
      strength_model: Number((l.strength_model * scale).toFixed(3)),
      strength_clip: Number((l.strength_clip * scale).toFixed(3)),
    }));

    // ── Batch path: N parallel jobs → N candidate portraits ──────────────
    if (count > 1) {
      logger.info('[Generate Portrait] Batch generating', {
        name, count, category, renderStyle, promptLen: naturalPrompt.length,
        identityReference: identityKit?.anchorImageUrl ? 'enabled' : 'disabled',
        prioritizeVariety: true,  // ✅ Enable variety for initial generations
      });
      const identityReferenceUrl = identityKit?.anchorImageUrl || '';
      // Prioritize variety on first generation, then balance with identity
      const identityWeight = identityKit ? resolveIpAdapterWeight('avatar-closeup', undefined, 'flux', true) : 0;
      
      const jobs = await Promise.all(
        Array.from({ length: count }, () =>
          generateImage({
            prompt: naturalPrompt,
            negativePrompt,
            category,
            renderStyle,
            endpointId: route.endpointId || undefined,
            nsfwLevel,
            // 每张图独立随机种子：拉高随机值，避免 4 张完全相同
            seed: Math.floor(Math.random() * 2_147_483_647),
            loras: normalizedLoras.length ? normalizedLoras : undefined,
            ipAdapterImage: identityReferenceUrl,
            ipAdapterWeight: identityWeight,
          }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
        ),
      );
      const syncImages: string[] = [];
      const pendingJobs: Array<{ job_id: string; endpoint_id?: string }> = [];
      const errors: string[] = [];
      for (const j of jobs) {
        const r = j as { image?: string; jobId?: string; endpointId?: string; pending?: boolean; error?: string };
        if (r.error) errors.push(r.error);
        else if (r.pending && r.jobId) pendingJobs.push({ job_id: r.jobId, endpoint_id: r.endpointId });
        else if (r.image) syncImages.push(r.image);
      }
      if (!syncImages.length && !pendingJobs.length) {
        return NextResponse.json(
          { error: errors[0] || 'Portrait generation failed', success: false },
          { status: 500 },
        );
      }
      const uploaded = await Promise.all(syncImages.map((b64) => uploadToStorage(b64, name)));
      // M3 lazy writeback from the first sync image (shared preset cache)
      if (cacheEligible && cachePreset?.slug && syncImages[0]) {
        const writebackSlug = cachePreset.slug;
        writebackPresetPortrait(writebackSlug, syncImages[0]).catch((e) =>
          logger.warn('[Generate Portrait] preset writeback failed', {
            slug: writebackSlug,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      }
      return NextResponse.json({
        success: true,
        count,
        images: uploaded,
        pending_jobs: pendingJobs,
        ...(errors.length ? { errors } : {}),
      });
    }

    logger.info('[Generate Portrait] Generating', {
      name,
      category,
      renderStyle,
      promptLen: naturalPrompt.length,
      customPromptUsed: !!customPrompt,
      identityReference: identityKit?.anchorImageUrl ? 'enabled' : 'disabled',
    });
    const result = await generateImage({
      prompt: naturalPrompt,
      negativePrompt,
      category,
      renderStyle,
      endpointId: route.endpointId || undefined,
      nsfwLevel,
      seed: Math.floor(Math.random() * 2_147_483_647),
      loras: normalizedLoras.length ? normalizedLoras : undefined,
      ipAdapterImage: identityKit?.anchorImageUrl || '',
      ipAdapterWeight: identityKit ? resolveIpAdapterWeight('avatar-closeup', undefined, 'flux', true) : 0,
    });

    // If still pending, return job_id for client-side polling
    if (result.pending || !result.image) {
      return NextResponse.json({
        success: true,
        pending: true,
        job_id: result.jobId,
        endpoint_id: result.endpointId,
        generation_trace: {
          category,
          renderStyle,
          modelFamily: route.modelFamily,
          checkpoint: route.checkpoint,
          customPrompt: !!customPrompt,
        },
        message: 'Portrait is being generated. Poll /api/ai/status?job_id=' + result.jobId,
      });
    }

    const imageUrl = await uploadToStorage(result.image, name);

    // M3 lazy writeback: first successful sync generation fills the shared cache
    if (cacheEligible && cachePreset?.slug && result.image) {
      const writebackSlug = cachePreset.slug;
      writebackPresetPortrait(writebackSlug, result.image).catch((e) =>
        logger.warn('[Generate Portrait] preset writeback failed', {
          slug: writebackSlug,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    // 首张图自动存为 ID 参考图（人物一致性闭环：后续立绘/换装/视频默认引用）
    if (gfIdForRef && imageUrl) {
      try {
        const { data: gfRow } = await client
          .from('girlfriends')
          .select('face_reference_url, portrait_url')
          .eq('id', gfIdForRef)
          .maybeSingle();
        if (gfRow && !String((gfRow as Record<string, unknown>).face_reference_url || '').trim()) {
          await client
            .from('girlfriends')
            .update({
              face_reference_url: imageUrl,
              portrait_url:
                String((gfRow as Record<string, unknown>).portrait_url || '') || imageUrl,
            })
            .eq('id', gfIdForRef);
        }
      } catch (e) {
        logger.warn('[Generate Portrait] face_reference save failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      portrait_url: imageUrl,
      url: imageUrl,
      key: null,
      optimizedPrompt: naturalPrompt,
      ...(cacheEligible && cachePreset?.slug ? { preset_slug: cachePreset.slug } : {}),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Generate Portrait] Error', { data: errMsg });
    return NextResponse.json({ error: errMsg, success: false }, { status: 500 });
  }
}
