import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

export type ImageGenerationRoute = {
  surface: ImageSurface;
  modelFamily: ImageModelFamily;
  endpointEnv: 'RUNPOD_ENDPOINT_ID_FLUX' | 'RUNPOD_ENDPOINT_ID_SDXL';
  endpointId: string;
  checkpoint: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  reason: string;
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const fluxEndpoint = env('RUNPOD_ENDPOINT_ID_FLUX', env('RUNPOD_ENDPOINT_ID', ''));
  const sdxlEndpoint = env('RUNPOD_ENDPOINT_ID_SDXL', env('RUNPOD_ENDPOINT_ID_DC2', ''));

  if (input.surface === 'companion' && renderStyle === '2d') {
    return {
      surface: input.surface,
      modelFamily: 'illustrious',
      endpointEnv: 'RUNPOD_ENDPOINT_ID_SDXL',
      endpointId: sdxlEndpoint,
      checkpoint: env('RUNPOD_ILLUSTRIOUS_CHECKPOINT', 'waiMatureIllustrious_v20.safetensors'),
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: 30,
      cfg: 5.5,
      reason: '2D companion art uses the native Illustrious checkpoint on CD2.',
    };
  }

  const needsAdultAnatomy =
    input.surface === 'companion' &&
    renderStyle === 'realistic' &&
    (intensity >= 3 || input.category === 'transgender');
  if (needsAdultAnatomy) {
    return {
      surface: input.surface,
      modelFamily: 'pony',
      endpointEnv: 'RUNPOD_ENDPOINT_ID_SDXL',
      endpointId: sdxlEndpoint,
      checkpoint: env('RUNPOD_PONY_CHECKPOINT', 'ponyRealism_V22.safetensors'),
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: 32,
      cfg: 6,
      reason: input.category === 'transgender'
        ? 'Transgender anatomy uses the Pony-native adult pipeline on CD2.'
        : 'Explicit adult anatomy uses the Pony-native adult pipeline on CD2.',
    };
  }

  return {
    surface: input.surface,
    modelFamily: 'flux',
    endpointEnv: 'RUNPOD_ENDPOINT_ID_FLUX',
    endpointId: fluxEndpoint,
    checkpoint: env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors'),
    sampler: 'euler',
    scheduler: 'simple',
    steps: input.surface === 'companion' ? 28 : 24,
    cfg: 1,
    reason: renderStyle === '3d'
      ? '3D companion rendering stays on FLUX CD1.'
      : `${input.surface} generation uses the FLUX product pipeline on CD1.`,
  };
}
