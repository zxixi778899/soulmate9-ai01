/**
 * Character Production Pipeline — 4-stage automated character asset creation.
 *
 * Stages:
 *   1. txt2img → 半身头像 (avatar-closeup)
 *   2. IP-Adapter + txt2img → 三视图参考图 (identity-turnaround, face locked, composition free)
 *   3. img2img → 角色立绘 (character-art, auto-select avatar + turnaround as references)
 *   4. img2video → 动态视频 (animation, auto-select avatar/turnaround as reference)
 *
 * Each stage auto-generates prompts via AI (Qwen3-8B), auto-selects LoRAs,
 * and auto-resolves reference images from previously generated assets.
 */

import { buildCompanionIdentityBrief } from './companion-generation';
import { getCharacterProductionPreset, styleProductionHint, type CharacterAssetRole } from './character-asset-production';
import { resolveModelLoraPlan, type RoutedLora } from './model-lora-routing';
import { logger } from './logger';

/**
 * Set to true once ComfyUI_IPAdapter_plus + models are installed on the worker.
 * Until then, IP-Adapter nodes are skipped and the pipeline falls back to
 * pure txt2img (no face lock) for the turnaround stage.
 */
const IP_ADAPTER_INSTALLED = process.env.RUNPOD_IPADAPTER_INSTALLED === '1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineStageId = 'avatar' | 'turnaround' | 'character-art' | 'video';

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
    description: '文生图生成半身像头像，作为后续所有阶段的身份锚点。',
    assetRole: 'avatar-closeup',
    mode: 'txt2img',
    useIpAdapter: false,
    width: 832,
    height: 1216,
    steps: 28,
    guidance: 3.0,
    referenceStages: [],
  },
  {
    id: 'turnaround',
    label: '三视图 · 外观参考',
    shortLabel: '三视图',
    description: '生成正面/侧面/背面全身外观参考图，记录角色精确外貌特征，为立绘和视频提供一致性锚定。',
    assetRole: 'identity-turnaround',
    mode: 'txt2img',
    useIpAdapter: true,
    width: 1216,
    height: 832,
    steps: 28,
    guidance: 3.0,
    ipAdapterWeight: 0.75,
    referenceStages: ['avatar'],
  },
  {
    id: 'character-art',
    label: '角色立绘 · 广告主视觉',
    shortLabel: '立绘',
    description: '基于头像+三视图一致性参考，生成伴侣广告级立绘主视觉，用于推广展示。',
    assetRole: 'character-art',
    mode: 'img2img',
    useIpAdapter: true,
    width: 832,
    height: 1216,
    steps: 28,
    guidance: 3.0,
    denoise: 0.92,
    ipAdapterWeight: 0.65,
    referenceStages: ['avatar', 'turnaround'],
  },
  {
    id: 'video',
    label: '动态视频 · 图生视频',
    shortLabel: '视频',
    description: '图生视频自动选择半身头像 + 三视图 + 提示词，生成角色动态短视频。',
    assetRole: 'animation',
    mode: 'img2video',
    useIpAdapter: false,
    width: 512,
    height: 768,
    steps: 20,
    guidance: 7.0,
    referenceStages: ['avatar', 'turnaround'],
    video: {
      durationSeconds: 5,
      fps: 8,
      motionStrength: 5,
    },
  },
];

// ─── AI Prompt Generation ─────────────────────────────────────────────────────

const PROMPT_SYSTEM_TEMPLATE = `You are an expert FLUX.1 image prompt engineer. Generate a concise, optimized prompt for the given stage.
Rules:
- Output ONLY the prompt text, no explanation.
- Keep under 300 characters.
- For avatar: waist-up studio portrait, natural expression, plain background, soft light. This is an identity anchor — clarity over artistry.
- For turnaround: neutral full-body appearance reference sheet, three views (front, side, back) side by side, plain white background, even flat lighting, relaxed standing pose, full head to feet visible. Purpose: document the character's exact appearance (face, hair, body, outfit) for consistency. NOT artistic — clinical and clear.
- For character-art: premium companion advertising key visual. Full-height, alluring confident pose, signature outfit, cinematic lighting, magazine-cover quality. This is the FINAL PRODUCT used for promotion — make it stunning, aspirational, and eye-catching. Sell the fantasy.
- For video: describe subtle natural motion (breathing, hair sway, gentle smile, slight body turn).
- Use natural photography language. Never use: orthographic, wireframe, T-pose, character sheet, reference sheet.
- Include the character's key features briefly (hair, eyes, build).
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
  const apiKey = process.env.RUNPOD_API_KEY || '';
  const endpointId = process.env.RUNPOD_VLLM_ENDPOINT_ID || 'm4va2u0uqugd9v';
  if (!apiKey) return null;

  const userMessage = `Stage: ${stage.id} (${stage.description})
Character: ${brief}
Style: ${ctx.animeStyle}
Category: ${ctx.category}

Generate the optimal FLUX prompt for this stage:`;

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      input: {
        messages: [
          { role: 'system', content: PROMPT_SYSTEM_TEMPLATE },
          { role: 'user', content: userMessage },
        ],
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
      return `${anti3d}, close-up, headshot, face only, cropped shoulders, bokeh, blurry`;
    case 'turnaround':
      // Neutral reference: reject artistic/dramatic styling, keep it clinical
      return `${anti3d}, single view, one view only, headshot, half-body, portrait, collage, overlapping figures, dramatic lighting, artistic, bokeh, blurry, background scenery`;
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
  if (stage.mode === 'img2video') return []; // AnimateDiff uses its own model
  const plan = resolveModelLoraPlan({
    modelFamily: 'flux',
    category: ctx.category === 'anime' ? 'female' : ctx.category,
    intensity: stage.id === 'avatar' || stage.id === 'turnaround' ? 1 : (ctx.nsfwIntensity as 1 | 2 | 3 | 4 | 5),
    animeStyle: ctx.animeStyle,
    maxLoras: 3,
  });
  return plan.selected;
}

// ─── Reference Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the best reference image URL for a stage from existing assets.
 * Priority: avatar-closeup > identity-turnaround > character-art
 */
export function resolveStageReference(
  stage: PipelineStageConfig,
  ctx: PipelineContext,
): { inputImage?: string; ipAdapterImage?: string } {
  if (stage.referenceStages.length === 0) return {};

  const avatarUrl = ctx.existingAssets['avatar-closeup'] || '';
  const turnaroundUrl = ctx.existingAssets['identity-turnaround'] || '';

  switch (stage.id) {
    case 'turnaround':
      // IP-Adapter face reference = avatar (locks face, not composition)
      return { ipAdapterImage: avatarUrl || undefined };
    case 'character-art':
      // img2img input = turnaround (composition reference), IP-Adapter = avatar (face)
      return {
        inputImage: turnaroundUrl || avatarUrl || undefined,
        ipAdapterImage: avatarUrl || undefined,
      };
    case 'video':
      // AnimateDiff reference = avatar (best face clarity)
      return { inputImage: avatarUrl || turnaroundUrl || undefined };
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
    num_images: 1,
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

  if (IP_ADAPTER_INSTALLED && stage.useIpAdapter && refs.ipAdapterImage) {
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
