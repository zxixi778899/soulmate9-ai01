import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';

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
  clipSkip: 1 | 2;
  width: number;
  height: number;
  presetId: string;
  promptPrefix: string;
  reason: string;
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  sceneText?: string;
  sceneSemantics?: ImageSceneSemantics;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', input.category || 'female');
  const complexScene = isComplexAdultScene(semantics);
  const fluxEndpoint = env('RUNPOD_ENDPOINT_ID_FLUX', env('RUNPOD_ENDPOINT_ID', ''));
  const sdxlEndpoint = env('RUNPOD_ENDPOINT_ID_SDXL', env('RUNPOD_ENDPOINT_ID_DC2', ''));

  if (input.surface === 'companion' && renderStyle === '2d') {
    return {
      surface: input.surface,
      modelFamily: 'illustrious',
      endpointEnv: 'RUNPOD_ENDPOINT_ID_SDXL',
      endpointId: sdxlEndpoint,
      checkpoint: env('RUNPOD_ILLUSTRIOUS_CHECKPOINT', 'waiMatureIllustrious_v20.safetensors'),
      sampler: complexScene ? 'dpmpp_sde' : 'dpmpp_2m',
      scheduler: 'karras',
      steps: complexScene ? 34 : 28,
      cfg: complexScene ? 6.5 : 5.5,
      clipSkip: 2,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'illustrious-2d-multi-control' : 'illustrious-2d-portrait',
      promptPrefix: 'masterpiece, best quality, very aesthetic, mature adult character, consistent design, clean line work.',
      reason: complexScene
        ? 'Multi-character 2D art uses a higher-control Illustrious preset on CD2.'
        : 'Single-character 2D art uses the Illustrious portrait preset on CD2.',
    };
  }

  const needsAdultAnatomy = input.surface === 'companion' && renderStyle === 'realistic' &&
    (intensity >= 3 || input.category === 'transgender' || complexScene);
  if (needsAdultAnatomy) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return {
      surface: input.surface,
      modelFamily: 'pony',
      endpointEnv: 'RUNPOD_ENDPOINT_ID_SDXL',
      endpointId: sdxlEndpoint,
      checkpoint: env('RUNPOD_PONY_CHECKPOINT', 'ponyRealism_V22.safetensors'),
      sampler: highControl ? 'dpmpp_sde' : 'dpmpp_2m',
      scheduler: 'karras',
      steps: highControl ? 36 : complexScene ? 34 : 30,
      cfg: highControl ? 6.5 : 6,
      clipSkip: 2,
      width: complexScene ? 896 : 832,
      height: complexScene ? 1152 : 1216,
      presetId: highControl ? 'pony-adult-composition-control' : complexScene ? 'pony-adult-pair' : 'pony-adult-portrait',
      promptPrefix: 'score_9, score_8_up, score_7_up, source_realistic. Natural adult editorial photography with coherent anatomy, candid body language, realistic skin texture, and uncluttered composition.',
      reason: input.category === 'transgender'
        ? 'Transgender anatomy uses the Pony-native adult pipeline on CD2.'
        : 'Explicit or multi-person adult anatomy uses the Pony-native adult pipeline on CD2.',
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
    clipSkip: 1,
    width: input.surface === 'companion' ? 832 : 1024,
    height: input.surface === 'companion' ? 1216 : 1024,
    presetId: input.surface === 'companion' ? 'flux-companion-natural' : `flux-${input.surface}-product`,
    promptPrefix: input.surface === 'companion'
      ? 'Natural editorial portrait photography with relaxed posture and believable skin texture.'
      : 'Clean commercial product photography with accurate materials and controlled lighting.',
    reason: renderStyle === '3d'
      ? '3D companion rendering stays on FLUX CD1.'
      : `${input.surface} generation uses the FLUX product pipeline on CD1.`,
  };
}
