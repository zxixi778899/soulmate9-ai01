import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';

export type FluxPromptPreset = { id: string; category: CompanionCategory; style: AnimeRenderStyle; intensity: NsfwIntensity; prompt: string };
const SCENES = ['standing beside a sunlit window', 'sitting on a quiet apartment sofa', 'leaning against a hotel balcony', 'walking through a softly lit bedroom', 'resting beside a pool at dusk', 'standing in a warm dressing room', 'sitting at a small cafe table', 'turning in a rain-washed city street', 'standing near a fireplace', 'lying on crisp white sheets'] as const;
const ACTIONS = ['looking calmly into the camera', 'smiling with relaxed confidence', 'turning over one shoulder'] as const;
const SUBJECT: Record<CompanionCategory, string> = { female: 'a consenting adult woman with natural proportions', male: 'a consenting adult man with natural proportions', transgender: 'a consenting adult transgender woman with consistent feminine anatomy', anime: 'an unmistakably adult anime character with mature proportions' };
const STYLE: Record<AnimeRenderStyle, string> = { realistic: 'natural real-camera photography with soft practical light', '2d': 'clean 2D anime artwork with stable linework and cel shading', '3d': 'polished 3D character render with coherent PBR materials' };
const LEVEL: Record<NsfwIntensity, string> = { 1: 'wearing a complete stylish outfit, intimate but fully covered', 2: 'wearing adult lingerie, sensual pose, intimate areas covered', 3: 'fully nude, mature anatomy visible, nonsexual pose', 4: 'consensual adult solo erotic pose with clear hand placement', 5: 'consensual adult partner intimacy with readable physical contact' };

export function getFluxPromptPresets(input: { category: CompanionCategory; style: AnimeRenderStyle; intensity: NsfwIntensity }): FluxPromptPreset[] {
  return SCENES.flatMap((scene, sceneIndex) => ACTIONS.map((action, actionIndex) => ({ id: `${input.category}-${input.style}-${sceneIndex * ACTIONS.length + actionIndex + 1}`, category: input.category, style: input.style, intensity: input.intensity, prompt: `${SUBJECT[input.category]} ${scene}, ${action}, ${LEVEL[input.intensity]}, ${STYLE[input.style]}.` })));
}

export function randomFluxPrompt(input: { category: CompanionCategory; style: AnimeRenderStyle; intensity: NsfwIntensity; framing?: string; random?: () => number }): string {
  const presets = getFluxPromptPresets(input);
  const index = Math.min(presets.length - 1, Math.max(0, Math.floor((input.random || Math.random)() * presets.length)));
  const framing = String(input.framing || '').trim();
  return framing ? `${presets[index].prompt} Camera framing: ${framing}.` : presets[index].prompt;
}
