import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl, resolveImageUrl, toPublicUrl } from '@/lib/storage';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import { buildStudioPromptEnhancement, studioNegativePrompt } from '@/lib/comfy-console/studio-profile';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { routeImageGeneration } from '@/lib/image-router';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import { buildReferenceGenerationPlan } from '@/lib/reference-generation-plan';

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
    `${ethnicity} features, ${face} face shape`,
    `${hairStyle} ${hairColor} hair`,
    `${eyeColor} eyes looking at viewer`,
    bodyDescription,
    `wearing flattering ${fashion} outfit`,
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
}): Promise<{ image?: string; jobId?: string; endpointId?: string; pending?: boolean }> {
  const route = resolveImageGenerationRoute({
    surface: 'companion',
    category: input.category,
    renderStyle: input.renderStyle,
    nsfwIntensity: 1,
  });
  const result = await routeImageGeneration({
    prompt: `${route.promptPrefix} ${input.prompt}`,
    negative_prompt: input.negativePrompt,
    width: route.width,
    height: route.height,
    num_inference_steps: route.steps,
    guidance_scale: route.cfg,
    image_url: input.referenceImage,
    strength: input.referenceImage ? 0.38 : undefined,
    ckpt_name: route.checkpoint,
    sampler_name: route.sampler,
    scheduler: route.scheduler,
    clip_skip: route.clipSkip,
    model_family: route.modelFamily,
    force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
    endpoint_id: input.endpointId || route.endpointId || undefined,
    nsfw: false,
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

    const rl = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many portrait generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, PORTRAIT_GEN_LIMIT) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || 'Companion');
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
      appearance_prompt: body.appearance_prompt as string | undefined,
      hairStyle: body.hairStyle as string | undefined,
      hairColor: body.hairColor as string | undefined,
      eyeColor: body.eyeColor as string | undefined,
      bodyType: body.bodyType as string | undefined,
      style: body.style as string | undefined,
      personality: body.personality as string | undefined,
    });

    const category = normalizeCompanionCategory({ gender: body.gender });
    const renderStyle = normalizeCompanionRenderStyle({
      visualStyle: body.visual_style,
      renderStyle: body.render_style,
      animeRenderStyle: body.anime_render_style,
    });
    const config = await loadComfyConfig(client);
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
      identity: prompt,
      scene: [
        'a relaxed three-quarter portrait with natural posture and clear face',
        ...referencePlan.promptHints,
      ].join('. '),
    });
    const negativePrompt = studioNegativePrompt(category, renderStyle);
    logger.info('[Generate Portrait] Generating', {
      name,
      category,
      renderStyle,
      promptLen: naturalPrompt.length,
      referenceRoles: referencePlan.selected.map((asset) => asset.role),
    });
    const result = await generateImage({
      prompt: naturalPrompt,
      negativePrompt,
      category,
      renderStyle,
      endpointId: route.endpointId || undefined,
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
          referencePlan: referencePlan.trace,
        },
        message: 'Portrait is being generated. Poll /api/runpod/status?job_id=' + result.jobId,
      });
    }

    const imageUrl = await uploadToStorage(result.image, name);

    return NextResponse.json({
      success: true,
      imageUrl,
      portrait_url: imageUrl,
      url: imageUrl,
      key: null,
      optimizedPrompt: naturalPrompt,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Generate Portrait] Error', { data: errMsg });
    return NextResponse.json({ error: errMsg, success: false }, { status: 500 });
  }
}
