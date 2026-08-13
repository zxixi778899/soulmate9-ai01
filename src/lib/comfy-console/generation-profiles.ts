import type { AnimeRenderStyle, NsfwIntensity } from './studio-profile';

export type GenerationProfile = {
  id: 'sfw-flux' | 'adult-flux';
  checkpointEnv: string;
  fallbackCheckpoint: string;
  minSteps: number;
  defaultSteps: number;
  guidance: number;
  maxLoras: number;
  maxLoraStrength: number;
  ipAdapterWeight: number;
  promptMode: 'authored' | 'authored-plus-level-description';
};

export const SFW_FLUX_PROFILE: GenerationProfile = {
  id: 'sfw-flux', checkpointEnv: 'RUNPOD_PHOTOREAL_CHECKPOINT', fallbackCheckpoint: 'flux1-dev-fp8.safetensors',
  minSteps: 20, defaultSteps: 26, guidance: 3.5, maxLoras: 2, maxLoraStrength: 1.0, ipAdapterWeight: 0.3,
  promptMode: 'authored',
};

export const ADULT_FLUX_PROFILE: GenerationProfile = {
  id: 'adult-flux', checkpointEnv: 'RUNPOD_FLUX_NSFW_CHECKPOINT', fallbackCheckpoint: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
  minSteps: 8, defaultSteps: 8, guidance: 1.5, maxLoras: 3, maxLoraStrength: 0.8, ipAdapterWeight: 0.3,
  promptMode: 'authored-plus-level-description',
};

export function resolveGenerationProfile(input: { intensity: NsfwIntensity; renderStyle?: AnimeRenderStyle }): GenerationProfile {
  return input.intensity >= 3 ? ADULT_FLUX_PROFILE : SFW_FLUX_PROFILE;
}
