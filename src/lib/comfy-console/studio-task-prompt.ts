import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily } from '@/lib/image-generation-routing';
import { randomFluxPrompt } from '@/lib/comfy-console/flux-prompt-presets';

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
  const levelScene: Record<NsfwIntensity, string> = {
    1: 'wearing a complete stylish everyday outfit with nipples and genitals fully covered, confident natural expression',
    2: 'wearing coordinated adult lingerie with realistic fabric detail, sensual posing, nipples and genitals covered, no sexual act',
    3: 'unmistakably adult nude portrait with natural anatomy clearly visible, nonsexual presentation, no sexual act',
    4: 'unmistakably adult explicit solo scene with clearly visible self-touch, anatomically coherent action and purposeful hands',
    5: 'unmistakably consenting adult explicit partner scene with clearly readable sexual interaction, coherent anatomy and physical contact',
  };
  const taskScene: Record<StudioPromptTask, string> = {
    identity: 'canonical identity portrait against a clean neutral background, relaxed symmetrical posture',
    portrait: 'complete editorial character portrait with a readable environment, intentional pose, wardrobe and camera composition',
    outfit: 'wardrobe-focused image preserving the established person while clearly presenting the requested clothing',
    pose: 'pose-focused image with balanced weight, clear limb placement, purposeful hands and readable gesture',
    background: 'environment-focused image with consistent perspective, contact shadows and subject-matched lighting',
    video: 'natural five-second motion preserving the exact person, clothing, background and camera position',
  };
  const modelNote = input.modelFamily === 'wan22'
    ? 'stable temporal continuity, no morphing and no scene cut'
    : 'FLUX-ready natural-language scene with concrete camera, materials and physical relationships';
  const lighting = 'bright soft key light, balanced frontal fill light, correct exposure, face and body clearly illuminated, visible shadow detail, no crushed shadows';
  const existingLower = existing.toLowerCase();
  const randomScene = input.modelFamily === 'flux' && !existing
    ? randomFluxPrompt({ category: 'female', style: input.renderStyle, intensity: input.intensity })
    : '';
  return [existing || randomScene, taskScene[input.task], levelScene[input.intensity], modelNote, lighting]
    .filter((part, index) => Boolean(part) && (index === 0 || !existingLower.includes(part.toLowerCase())))
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (renderStyle === '2d') {
    return '2D anime illustration, clean linework';
  }
  if (renderStyle === '3d') {
    return '3D character render, natural materials';
  }
  return 'natural photograph, soft practical light';
}

function taskInstruction(task: StudioPromptTask, hasIdentityReference: boolean): string {
  if (task !== 'identity' && !hasIdentityReference) return 'No ID reference is available, so preserve identity from the supplied companion profile and create only the requested change.';
  if (task === 'portrait') return 'Use the supplied ID reference as the only authority for face, hair, body proportions and identity. Describe the new scene, action, wardrobe, lighting and camera composition.';
  if (task === 'outfit') return 'Use the ID reference for identity and the outfit reference for clothing shape, material and details. Change only wardrobe; preserve the established person, pose and background unless requested.';
  if (task === 'pose') return 'Use the ID reference for identity and the pose reference for body position, gesture, gaze and framing. Preserve the established appearance and wardrobe unless requested.';
  if (task === 'background') return 'Use the ID reference for identity and the background reference for environment, perspective and lighting. Preserve the established person, wardrobe and pose unless requested.';
  if (task === 'video') return 'Animate the supplied source image without redesigning the person or scene.';
  return 'Create the canonical identity reference from the companion profile. Keep the composition simple, readable and suitable for later IP-Adapter identity control.';
}

export function buildStudioTaskPrompt(input: PromptInput): string {
  const identity = input.task === 'identity' || !input.hasIdentityReference ? companionIdentity(input.companion) : '';
  const scene = text(input.scene);
  const framing = text(input.framing);
  const triggers = [...new Set((input.loraTriggers || []).map(text).filter(Boolean))].slice(0, 8);
  const parts = [
    framing || 'medium shot',
    scene,
    input.hasIdentityReference ? 'use the ID reference for identity only' : '',
    identity,
    qualityForModel(input.modelFamily, input.renderStyle),
    input.modelFamily === 'flux' ? triggers.join(', ') : '',
  ].filter(Boolean);
  return parts.join(', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim().slice(0, 520);
}
