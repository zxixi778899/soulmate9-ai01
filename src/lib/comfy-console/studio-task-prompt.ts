import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily } from '@/lib/image-generation-routing';
import { randomFluxPrompt } from '@/lib/comfy-console/flux-prompt-presets';
import { encodeFamilyPrompt, resolvePromptSubject } from '@/lib/prompt/prompt-protocols';

export type StudioPromptTask = 'identity' | 'portrait' | 'outfit' | 'pose' | 'background' | 'video';

type PromptInput = {
  task: StudioPromptTask;
  modelFamily: ImageModelFamily | 'wan22';
  companion?: Record<string, unknown> | null;
  scene: string;
  framing?: string;
  loraTriggers?: string[];
  category: CompanionCategory;
  renderStyle: AnimeRenderStyle;
  hasIdentityReference?: boolean;
};

export function buildStudioSceneDraft(input: {
  task: StudioPromptTask;
  modelFamily: PromptInput['modelFamily'];
  currentPrompt?: string;
  intensity: NsfwIntensity;
  renderStyle: AnimeRenderStyle;
}): string {
  const existing = text(input.currentPrompt).replace(/[,.\s]+$/, '');
  
  // ⚠️ CRITICAL FIX: Never inject hard-coded scene templates into user's prompt.
  // User input is the absolute source of truth for image generation.
  // This function should only provide suggestions when currentPrompt is empty.
  if (existing) {
    // Return user's original input unchanged - do NOT append any templates
    return existing;
  }
  
  // Only generate random draft when user has NO input yet
  const randomScene = input.modelFamily === 'flux' 
    ? randomFluxPrompt({ category: 'female', style: input.renderStyle, intensity: input.intensity })
    : '';
  
  return randomScene;
}

const text = (value: unknown): string => String(value || '').trim();

function companionIdentity(companion?: Record<string, unknown> | null): string {
  if (!companion) return '';
  return [
    text(companion.name),
    text(companion.age) ? `${text(companion.age)}-year-old adult` : '',
    text(companion.gender),
    text(companion.appearance_race),
    text(companion.appearance_hair_color),
    text(companion.appearance_hair),
    text(companion.appearance_eyes),
    text(companion.appearance_body),
    text(companion.style),
    text(companion.appearance),
  ].filter(Boolean).join(', ');
}

function qualityForModel(modelFamily: PromptInput['modelFamily'], renderStyle: AnimeRenderStyle): string {
  if (modelFamily === 'wan22') {
    return 'stable camera, natural motion';
  }
  // tag 族的画质开头由 encodeFamilyPrompt 的 qualityPrefix 提供，此处不再叠加。
  if (modelFamily === 'pony' || modelFamily === 'illustrious') {
    return '';
  }
  if (renderStyle === '2d') {
    return '2D anime illustration, fully colored finished artwork, vibrant cel shading';
  }
  return 'real-camera photograph, face and full body clearly illuminated, no crushed shadows, natural skin, soft practical light';
}

export function buildStudioTaskPrompt(input: PromptInput): string {
  const identity = input.task === 'identity' || !input.hasIdentityReference ? companionIdentity(input.companion) : '';
  const scene = text(input.scene);
  const framing = text(input.framing);
  const triggers = [...new Set((input.loraTriggers || []).map(text).filter(Boolean))].slice(0, 8);

  // ── SDXL 家族：按族原生协议（pony score tags / illustrious danbooru tags）组装 ──
  if (input.modelFamily === 'pony' || input.modelFamily === 'illustrious') {
    return encodeFamilyPrompt({
      family: input.modelFamily,
      subject: resolvePromptSubject(input.category, input.renderStyle),
      identity,
      scene,
      framing: framing || (scene ? '' : 'medium shot'),
      loraTriggers: triggers,
    });
  }

  // ── FLUX 家族：自然语言协议（用户提示词为主轴）──
  // 用户输入的 scene 是生图指令的唯一来源，仅附加模型质量词 / LoRA 触发词。
  // 禁止叠加任务模板句 / 随机场景片段，防止提示词被"锁死"在硬编码文本上。
  if (scene) {
    const quality = qualityForModel(input.modelFamily, input.renderStyle);
    const loraTags = input.modelFamily === 'flux' && triggers.length > 0 ? triggers.join(', ') : '';
    const identityNote = input.hasIdentityReference
      ? 'use the ID reference for identity only, do not copy its framing or crop'
      : '';
    // 严格遵循：scene → quality/lora → identity-note，总长度≤520 字符
    return [scene, quality, loraTags, identityNote]
      .filter(Boolean)
      .join(', ')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim()
      .slice(0, 520);
  }
  const parts = [
    identity,
    qualityForModel(input.modelFamily, input.renderStyle),
    input.modelFamily === 'flux' ? triggers.join(', ') : '',
  ].filter(Boolean);
  return parts.join(', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim().slice(0, 520);
}
