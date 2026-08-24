/**
 * Character Production Pipeline — 3-stage automated character asset creation.
 *
 * Stages:
 *   1. txt2img → 半身头像 (avatar-closeup) — the IP-Adapter identity anchor
 *   2. txt2img + IP-Adapter → 角色立绘 (character-art, face locked from avatar,
 *      composition/content fully driven by the prompt — no img2img structure copy)
 *   3. img2video → 动态视频 (animation, avatar as reference)
 *
 * The three-view turnaround stage was removed: FLUX cannot reliably render a
 * clean separated front/side/back sheet from a single identity reference, so the
 * avatar alone now anchors identity for every downstream stage via IP-Adapter.
 *
 * Each stage auto-generates prompts via AI (Qwen-Plus), auto-selects LoRAs,
 * and auto-resolves reference images from previously generated assets.
 */

import { buildCompanionIdentityBrief } from './companion-generation';
import { getCharacterProductionPreset, styleProductionHint, type CharacterAssetRole } from './character-asset-production';
import { resolveModelLoraPlan, type RoutedLora } from './model-lora-routing';
import { resolveIpAdapterWeight } from './identity-kit';
import { logger } from './logger';


// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStageId = 'avatar' | 'character-art' | 'video';

export interface PipelineStageConfig {
  id: PipelineStageId;
  label: string;
  shortLabel: string;
  description: string;
  /** Asset role used for storage/lookup */
  assetRole: string;
  /** Generation mode */
  mode: 'txt2img' | 'img2img' | 'img2video';
  /** Whether IP-Adapter face reference is used */
  useIpAdapter: boolean;
  /** Output dimensions */
  width: number;
  height: number;
  /** KSampler steps */
  steps: number;
  /** FLUX guidance_scale */
  guidance: number;
  /** Denoising strength (img2img only) */
  denoise?: number;
  /** IP-Adapter weight (face similarity) */
  ipAdapterWeight?: number;
  /** Number of images to generate (avatar stage generates 4 for quality selection) */
  numImages?: number;
  /** Which previous stage outputs to use as reference */
  referenceStages: PipelineStageId[];
  /** Video-specific params */
  video?: {
    durationSeconds: number;
    fps: number;
    motionStrength: number;
  };
}

export interface PipelineStageResult {
  stageId: PipelineStageId;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  prompt?: string;
  negative?: string;
  imageUrl?: string;
  videoUrl?: string;
  jobId?: string;
  error?: string;
  loras?: RoutedLora[];
}

export interface PipelineContext {
  companionId: string;
  companion: Record<string, unknown>;
  category: 'female' | 'male' | 'transgender' | 'anime';
  animeStyle: 'realistic' | '2d' | '3d';
  nsfwIntensity: number;
  /** URLs of previously generated assets keyed by stage/role */
  existingAssets: Record<string, string>;
}

// ─── Pipeline Definition ──────────────────────────────────────────────────────

export const CHARACTER_PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    id: 'avatar',
    label: '半身头像 · 文生图',
    shortLabel: '半身头像',
    description: '文生图生成半身像头像，作为后续所有阶段的 IP-Adapter 身份锚点（锁脸参考图）。',
    assetRole: 'avatar-closeup',
    mode: 'txt2img',
    useIpAdapter: false,
    width: 768,
    height: 1024,
    steps: 28,
    guidance: 3.0,
    // Generate 4 candidates for automatic face quality selection
    numImages: 4,
    referenceStages: [],
  },
  {
    id: 'character-art',
    label: '角色立绘 · 广告主视觉',
    shortLabel: '立绘',
    description: '文生图 + IP-Adapter 锁脸：仅用半身头像锁定五官身份，构图、姿势、服装与场景完全由提示词控制，生成伴侣广告级全身立绘主视觉。',
    assetRole: 'character-art',
    mode: 'txt2img',
    useIpAdapter: true,
    width: 832,
    height: 1216,
    steps: 28,
    guidance: 3.0,
    // 0.8 from identity-kit resolver: raised from 0.72 for better face consistency
    ipAdapterWeight: resolveIpAdapterWeight('character-art', undefined, 'flux'),
    referenceStages: ['avatar'],
  },
  {
    id: 'video',
    label: '动态视频 · 图生视频',
    shortLabel: '视频',
    description: '图生视频自动选择半身头像 + 提示词，生成角色动态短视频。',
    assetRole: 'animation',
    mode: 'img2video',
    useIpAdapter: false,
    width: 512,
    height: 768,
    steps: 20,
    guidance: 7.0,
    referenceStages: ['avatar'],
    video: {
      durationSeconds: 5,
      fps: 8,
      motionStrength: 5,
    },
  },
];

// ─── AI Prompt Generation ─────────────────────────────────────────────────────

const PROMPT_SYSTEM_TEMPLATE = `You are an expert FLUX.1 image prompt engineer. Write one concise positive prompt for the given stage.
Rules:
- Output ONLY the prompt text, no explanation, no quotes.
- Keep it between 35 and 80 words. Every requested identity, action, wardrobe, framing and setting detail must remain represented.
- FLUX best practices: write simple natural-language sentences in Subject + Action + Style + Context order, like a photographer directing one shot. No weighting syntax, comma-tag lists, ALL-CAPS, or negative instructions.
- Put the adult subject, exact action and framing first, followed by wardrobe, setting, lighting and secondary detail.
- For avatar: a waist-up studio portrait of the character from their basic attributes (age, gender, ethnicity, hair color and style, eye color, build, temperament). Plain warm-gray background, soft diffused daylight, relaxed natural expression, clean eye contact. This is the identity anchor that later stages lock onto, so the face must be clear and unobstructed.
- For character-art: the face is already locked by IP-Adapter, so describe the adult companion's exact action, body language, gaze, wardrobe, lived-in setting and mood. Use these exact adult-only levels: 1=everyday sexy clothing with nipples and genitals covered; 2=lingerie, nightwear, or adult fantasy costume with genitals covered and no sexual act; 3=full nudity with breasts and/or genitals visible but no sexual act; 4=clearly visible solo masturbation; 5=clearly visible consensual sex between unmistakably adult partners, including the requested act and any requested sexual fluids. Keep every relevant adult, face, hand, contact point and action readable. Use a varied believable private or lifestyle setting instead of defaulting to a generic sofa or empty boudoir. Keep the whole body in frame from head to feet with margin above and below.
- For video: describe subtle natural motion only (gentle breathing, soft hair sway, a slow smile, a slight body turn).
- Never use: orthographic, wireframe, T-pose, character sheet, reference sheet, turnaround, multiple views, 3D render.
- Language: English only.`;

/**
 * Generate an optimized prompt for a pipeline stage using AI (Qwen3-8B).
 * Falls back to template-based prompt if AI is unavailable.
 */
export async function generateStagePrompt(
  stage: PipelineStageConfig,
  ctx: PipelineContext,
): Promise<{ prompt: string; negative: string }> {
  const brief = buildCompanionIdentityBrief(ctx.companion);
  const preset = getCharacterProductionPreset(stage.assetRole as CharacterAssetRole);
  const styleHint = styleProductionHint(ctx.animeStyle);

  // Try AI generation first
  try {
    const aiPrompt = await callLlmForPrompt(stage, brief, ctx);
    if (aiPrompt && aiPrompt.length > 20 && aiPrompt.length < 500) {
      const negative = buildStageNegative(stage);
      return { prompt: aiPrompt, negative };
    }
  } catch (err) {
    logger.warn('[pipeline] AI prompt generation failed, using template', {
      stage: stage.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback: template-based prompt (scene preset + brief identity)
  const prompt = `${preset.scene}, ${brief}, ${styleHint}`;
  const negative = buildStageNegative(stage);
  return { prompt, negative };
}

async function callLlmForPrompt(
  stage: PipelineStageConfig,
  brief: string,
  ctx: PipelineContext,
): Promise<string | null> {
  const userMessage = `Stage: ${stage.id} (${stage.description})
Character: ${brief}
Style: ${ctx.animeStyle}
Category: ${ctx.category}
NSFW level: ${ctx.nsfwIntensity}/5

Generate the optimal FLUX prompt for this stage:`;

  const messages = [
    { role: 'system', content: PROMPT_SYSTEM_TEMPLATE },
    { role: 'user', content: userMessage },
  ];

  // 1) DashScope (Bailian) — stable, no cold start, covered by savings plan.
  const dashscopeKey = process.env.DASHSCOPE_API_KEY || '';
  if (dashscopeKey) {
    try {
      const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dashscopeKey}` },
        body: JSON.stringify({
          model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
          messages,
          max_tokens: 200,
          temperature: 0.7,
          top_p: 0.9,
          enable_thinking: false,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) return String(content).trim();
      }
    } catch {
      // fall through to RunPod
    }
  }

  // 2) RunPod vLLM runsync (uncensored, but cold starts / capacity issues)
  const apiKey = process.env.RUNPOD_API_KEY || '';
  const endpointId = process.env.RUNPOD_VLLM_ENDPOINT_ID || 'm4va2u0uqugd9v';
  if (!apiKey) return null;

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input: {
        messages,
        sampling_params: {
          max_tokens: 200,
          temperature: 0.7,
          top_p: 0.9,
          repetition_penalty: 1.05,
        },
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  // RunPod vLLM output format: output[0].choices[0].tokens (array) or choices[0].message.content
  const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
  if (Array.isArray(tokens) && tokens.length > 0) return tokens.join('').trim();
  const content = data?.output?.choices?.[0]?.message?.content;
  if (content) return String(content).trim();
  return null;
}

function buildStageNegative(stage: PipelineStageConfig): string {
  // Anti-3D terms FIRST (FLUX negative truncated at 300 chars)
  const anti3d = '3D render, CG, mannequin, doll, plastic skin, wireframe, clay render, T-pose';
  switch (stage.id) {
    case 'avatar':
      return `${anti3d}, full body, distant subject, tiny face, cropped forehead, cropped chin, obscured face, profile view, bokeh, blurry`;
    case 'character-art':
      // Advertising quality: reject anything that looks amateur or non-promotional
      return `${anti3d}, close-up, headshot, half-body, cropped legs, bokeh, blurry, low quality, amateur, flat lighting, passport photo, mugshot, ID photo`;
    case 'video':
      return `${anti3d}, static, frozen, jitter, flicker, distorted face, extra limbs`;
    default:
      return anti3d;
  }
}

// ─── Auto LoRA Selection ──────────────────────────────────────────────────────

export function resolvePipelineLoras(
  stage: PipelineStageConfig,
  ctx: PipelineContext,
): RoutedLora[] {
  if (stage.mode === 'img2video') return []; // Wan2.2 uses the approved source frame, not image LoRAs.
  const plan = resolveModelLoraPlan({
    modelFamily: 'flux',
    category: ctx.category === 'anime' ? 'female' : ctx.category,
    intensity: stage.id === 'avatar' ? 1 : (ctx.nsfwIntensity as 1 | 2 | 3 | 4 | 5),
    animeStyle: ctx.animeStyle,
    maxLoras: stage.id === 'avatar' ? 1 : 2,
    identityAsset: stage.id === 'avatar',
  });
  return plan.selected;
}

// ─── Reference Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the best reference image URL for a stage from existing assets.
 * The avatar-closeup is the single identity anchor for every downstream stage.
 */
export function resolveStageReference(
  stage: PipelineStageConfig,
  ctx: PipelineContext,
): { inputImage?: string; ipAdapterImage?: string } {
  if (stage.referenceStages.length === 0) return {};

  const avatarUrl = ctx.existingAssets['avatar-closeup'] || '';

  switch (stage.id) {
    case 'character-art':
      // txt2img + IP-Adapter only: the avatar locks facial identity, while the
      // prompt fully controls composition, pose, wardrobe and scene. Deliberately
      // NO inputImage — feeding the avatar as an img2img base dragged the output
      // back into a portrait crop instead of a full-height advertising key visual.
      return {
        ipAdapterImage: avatarUrl || undefined,
      };
    case 'video':
      // Wan2.2 image-to-video reference = avatar (best face clarity).
      return { inputImage: avatarUrl || undefined };
    default:
      return {};
  }
}

// ─── Pipeline Orchestration Helper ───────────────────────────────────────────

/**
 * Build the complete generation parameters for a pipeline stage.
 * Used by both the server route and the frontend to construct API calls.
 */
export function buildStageGenerationParams(
  stage: PipelineStageConfig,
  prompt: string,
  negative: string,
  loras: RoutedLora[],
  refs: { inputImage?: string; ipAdapterImage?: string },
) {
  const base: Record<string, unknown> = {
    prompt,
    negative_prompt: negative,
    width: stage.width,
    height: stage.height,
    num_inference_steps: stage.steps,
    guidance_scale: stage.guidance,
    num_images: stage.numImages ?? 1,
    asset_role: stage.assetRole,
    character_consistency: stage.id !== 'avatar',
    loras: loras.map((l) => ({
      id: l.name,
      name: l.name,
      strength: l.strength_model,
      strength_model: l.strength_model,
      strength_clip: l.strength_clip,
    })),
  };

  if (stage.mode === 'img2img' && refs.inputImage) {
    base.input_image = refs.inputImage;
    base.denoising_strength = stage.denoise ?? 0.58;
  }

  if (stage.useIpAdapter && refs.ipAdapterImage) {
    base.ip_adapter_image = refs.ipAdapterImage;
    base.ip_adapter_weight = stage.ipAdapterWeight ?? 0.75;
  }

  if (stage.mode === 'img2video') {
    base.input_image = refs.inputImage;
    base.gen_mode = 'img2video';
    if (stage.video) {
      base.duration_seconds = stage.video.durationSeconds;
      base.fps = stage.video.fps;
      base.motion_strength = stage.video.motionStrength;
    }
  }

  return base;
}

/**
 * Determine which stages can run given the current asset state.
 * A stage is runnable if all its reference stages have completed assets.
 */
export function getRunnableStages(ctx: PipelineContext): PipelineStageConfig[] {
  return CHARACTER_PIPELINE_STAGES.filter((stage) => {
    if (stage.referenceStages.length === 0) return true;
    return stage.referenceStages.every((refId) => {
      const refStage = CHARACTER_PIPELINE_STAGES.find((s) => s.id === refId);
      const refRole = refStage?.assetRole || refId;
      return !!ctx.existingAssets[refRole];
    });
  });
}

/**
 * Get the next stage to execute in the pipeline.
 */
export function getNextStage(ctx: PipelineContext): PipelineStageConfig | null {
  for (const stage of CHARACTER_PIPELINE_STAGES) {
    const role = stage.assetRole;
    if (ctx.existingAssets[role]) continue; // already done
    // Check dependencies
    const depsReady = stage.referenceStages.every((refId) => {
      const refStage = CHARACTER_PIPELINE_STAGES.find((s) => s.id === refId);
      return !!ctx.existingAssets[refStage?.assetRole || refId];
    });
    if (depsReady) return stage;
  }
  return null; // all done
}
