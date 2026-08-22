import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import { buildIdReferencePrompt } from '@/lib/companion-prompt-pipeline';
import { buildStudioPromptEnhancement, studioNegativePrompt } from '@/lib/comfy-console/studio-profile';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { buildReferenceGenerationPlan } from '@/lib/reference-generation-plan';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import { translatePromptToEnglish } from '@/lib/prompt-translate';
import { resolveModelLoraPlan } from '@/lib/model-lora-routing';
import type { ImageSurface } from '@/lib/image-generation-routing';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/creator/generate-prompt
 *
 * Accepts creator form data and returns an LLM-enhanced image generation prompt.
 * This endpoint does NOT generate images — it only crafts the prompt.
 * Used by the creator wizard to show users the prompt before starting image generation.
 *
 * Response includes structured metadata for UI transparency panel:
 * - prompt, negative_prompt: editable text fields
 * - model_info: checkpoint, family, parameters (steps, cfg, sampler)
 * - lora_stack: selected LoRAs with strengths and trigger words
 * - route_reason: why this model was chosen (for user education)
 */

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

function buildBasePrompt(input: {
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
  personality?: string;
  skin_tone?: string;
  bust_shape?: string;
  height?: string;
  genome_prompt?: string;
}): string {
  const name = (input.name || 'an adult companion').trim();
  const ethnicity = input.ethnicity || 'mixed';
  const gender = input.gender || 'Female';
  const face = input.face_shape || 'oval';
  const hairStyle = input.hair_style || 'long flowing';
  const hairColor = hairColorName(input.hair_color || 'brown');
  const eyeColor = input.eye_color || 'brown';
  const bodyType = input.body_type || 'slim';
  const fashion = input.fashion_style || 'casual';
  const visual = (input.visual_style || 'realistic').toLowerCase();
  const extra = sanitizeBlurKeywords(
    [input.appearance_prompt, input.personality].filter(Boolean).join(', '),
  );
  const skinTone = sanitizeBlurKeywords(String(input.skin_tone || '').trim());
  const bustShape = sanitizeBlurKeywords(String(input.bust_shape || '').trim());
  const heightFrag = sanitizeBlurKeywords(String(input.height || '').trim());
  const genomeExtra = sanitizeBlurKeywords(String(input.genome_prompt || '').trim());

  // 风格化提示词优化：写实/二次元/3D 的提示词特征不同，
  // medium 定画面媒介，styleQuality 注入该风格的质感/光影/镜头关键词。
  const isAnime = visual === '2d' || visual === 'anime';
  const is3d = visual === '3d';
  const medium = isAnime
    ? 'a polished 2D anime character portrait with fully rendered colors and deliberate cel shading'
    : is3d
      ? 'a polished 3D animated character portrait with coherent materials and studio character lighting'
      : 'a natural editorial photograph with believable skin texture and soft directional light';
  const styleQuality = isAnime
    ? 'fully colored finished anime illustration, vibrant saturated cel shading, expressive detailed anime eyes, smooth clean color fills, high-fidelity illustration finish'
    : is3d
      ? 'stylized 3D character render, subsurface scattering skin, soft global illumination, Pixar-grade material fidelity'
      : 'natural skin texture with visible pores, shallow depth of field, 85mm portrait lens, professional photography lighting';
  const category = normalizeCompanionCategory({ gender });
  const bodyDescription = category === 'male'
    ? `${bodyType} adult masculine build with broad shoulders and a defined torso`
    : category === 'transgender'
      ? `${bodyType} adult feminine silhouette with visibly mixed masculine and feminine physical traits`
      : `${bodyType} adult feminine figure with natural proportions`;

  const parts = [
    medium,
    styleQuality,
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

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || 'Companion');
    const gender = String(body.gender || 'Female');
    const visualStyle = String(body.visual_style || 'realistic');
    const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(body.nsfw_level ?? 1))));

    // Build base deterministic prompt from form selections
    const basePrompt = buildBasePrompt({
      name,
      visual_style: visualStyle,
      ethnicity: body.ethnicity as string | undefined,
      gender,
      face_shape: body.face_shape as string | undefined,
      hair_style: body.hair_style as string | undefined,
      hair_color: body.hair_color as string | undefined,
      eye_color: body.eye_color as string | undefined,
      body_type: body.body_type as string | undefined,
      fashion_style: body.fashion_style as string | undefined,
      appearance_prompt: body.appearance_prompt as string | undefined,
      personality: body.personality as string | undefined,
      skin_tone: body.skin_tone as string | undefined,
      bust_shape: body.bust_shape as string | undefined,
      height: body.height as string | undefined,
      genome_prompt: body.genome_prompt as string | undefined,
    });

    // Enhance with studio prompt (same pipeline as generate-portrait)
    const category = normalizeCompanionCategory({ gender });
    const renderStyle = normalizeCompanionRenderStyle({
      visualStyle,
      renderStyle: body.render_style,
      animeRenderStyle: body.anime_render_style,
      tags: body.tags,
    });

    const config = await loadComfyConfig();
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle,
      nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
    });
    const referencePlan = buildReferenceGenerationPlan({
      surface: 'companion',
      category,
      renderStyle,
      modelFamily: route.modelFamily,
      nsfwLevel,
      allowIdentity: false,
      controls: config.reference_control,
      assets: config.reference_assets || [],
    });

    // Translate to English if needed (same as generate-portrait)
    const translatedPrompt = await translatePromptToEnglish({
      text: basePrompt,
      intensity: nsfwLevel,
      mode: 'positive',
      supabase: undefined,
      userId: user.id,
    });
    const finalBase = translatedPrompt || basePrompt;

    // Build enhanced prompt with studio pipeline
    const enhancedPrompt = buildStudioPromptEnhancement({
      category,
      intensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
      animeStyle: renderStyle,
      identity: finalBase,
      scene: [
        buildIdReferencePrompt('waist-up'),
        ...referencePlan.promptHints,
      ].join('. '),
    });

    // Enhanced: Resolve LoRA plan for UI display
    const loraInput = {
      modelFamily: route.modelFamily,
      category,
      intensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
      animeStyle: renderStyle,
      surface: 'companion' as ImageSurface,
    };
    const loraPlan = resolveModelLoraPlan(loraInput);
    
    const negativePrompt = studioNegativePrompt(category, renderStyle);

    logger.info('[creator/generate-prompt] Prompt generated', {
      userId: user.id,
      name,
      category,
      renderStyle,
      nsfwLevel,
      promptLength: enhancedPrompt.length,
      loraCount: loraPlan.selected.length,
      checkpoint: route.checkpoint,
    });

    return NextResponse.json({
      success: true,
      prompt: enhancedPrompt,
      negative_prompt: negativePrompt,
      base_prompt: basePrompt,
      meta: {
        category,
        renderStyle,
        nsfwLevel,
        modelFamily: route.modelFamily,
        checkpoint: route.checkpoint,
        steps: route.steps,
        cfg: route.cfg,
        fluxGuidance: route.fluxGuidance,
        sampler: route.sampler,
        scheduler: route.scheduler,
        width: route.width,
        height: route.height,
        presetId: route.presetId,
        reason: route.reason,
      },
      lora_info: {
        selected: loraPlan.selected.map(l => ({
          name: l.name,
          strength_model: l.strength_model,
          strength_clip: l.strength_clip,
        })),
        configured: loraPlan.configured,
        missing: loraPlan.missing,
        inventorySource: loraPlan.inventorySource,
        triggerWords: loraPlan.triggerWords,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[creator/generate-prompt] Error', { error: errMsg });
    return NextResponse.json({ error: errMsg, success: false }, { status: 500 });
  }
}
