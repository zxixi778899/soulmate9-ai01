/**
 * Built-in FLUX.1 portrait presets for admin image console.
 * Natural-language captions, bright/sharp lighting, short or empty negatives.
 */

export type FluxParamPresetId =
  | 'flux_portrait'
  | 'flux_fast'
  | 'flux_quality'
  | 'flux_consistency';

export type FluxParamPreset = {
  id: FluxParamPresetId;
  label: string;
  hint: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  sampler: string;
  scheduler: string;
  /** img2img denoise when consistency is on */
  denoise: number;
};

/** Recommended generation parameter packs for FLUX fp8 */
export const FLUX_PARAM_PRESETS: FluxParamPreset[] = [
  {
    id: 'flux_portrait',
    label: 'FLUX 肖像（推荐）',
    hint: '清晰人像 · CFG 1.0 · 空负面',
    steps: 28,
    cfg: 1.0,
    width: 832,
    height: 1216,
    sampler: 'euler',
    scheduler: 'simple',
    denoise: 0.55,
  },
  {
    id: 'flux_fast',
    label: '快速预览',
    hint: '20 steps · 略低分辨率',
    steps: 20,
    cfg: 1.0,
    width: 768,
    height: 1024,
    sampler: 'euler',
    scheduler: 'simple',
    denoise: 0.55,
  },
  {
    id: 'flux_quality',
    label: '高质量',
    hint: '36 steps · 更细腻',
    steps: 36,
    cfg: 1.5,
    width: 832,
    height: 1216,
    sampler: 'euler',
    scheduler: 'simple',
    denoise: 0.5,
  },
  {
    id: 'flux_consistency',
    label: '一致性（img2img）',
    hint: '保留脸型 · denoise 0.45',
    steps: 28,
    cfg: 1.0,
    width: 832,
    height: 1216,
    sampler: 'euler',
    scheduler: 'simple',
    denoise: 0.45,
  },
];

export type ScenePromptPreset = {
  id: string;
  label: string;
  category: 'girlfriend' | 'outfit' | 'shop_item' | 'all';
  /** Scene fragment to append / use as positive */
  positivePrompt: string;
  /** FLUX: prefer empty for girlfriend */
  negativePrompt: string;
};

/** Scene presets — FLUX natural language, no soft/bokeh blur cues */
export const FLUX_SCENE_PRESETS: ScenePromptPreset[] = [
  {
    id: 'flux_studio_portrait',
    label: '影棚肖像',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter body portrait of a gorgeous young adult woman, 23-28 years old, looking at viewer, ' +
      'sharp focus, detailed face and eyes, natural skin texture, bright studio softbox lighting, clean seamless backdrop, ' +
      'professional fashion photography, 8k, vibrant clear colors',
    negativePrompt: '',
  },
  {
    id: 'flux_golden_hour',
    label: '金色时刻',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter portrait of a stunning young woman outdoors at golden hour, warm sunlight on face, ' +
      'looking at viewer with soft smile, sharp detailed face, natural skin, bright well-lit, ' +
      'romantic atmosphere, crisp details, 8k ultra photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_boudoir',
    label: '卧室私房',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter portrait of a gorgeous young woman reclining on white sheets, looking at viewer, ' +
      'seductive expression, soft parted lips, sharp focus face, natural skin pores, bright window light, well-lit bedroom, ' +
      'intimate editorial, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_cafe',
    label: '咖啡馆',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter portrait of a charming young woman at a cafe table, looking at viewer, ' +
      'warm smile, coffee cup, natural daylight through window, sharp detailed face, bright clear image, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_city_night',
    label: '城市夜景',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter portrait of a stylish young woman on a city street at night, neon reflections, ' +
      'looking at viewer confidently, sharp face, well-lit by neon and street lights, crisp details, 8k cinematic photoreal',
    negativePrompt: '',
  },
  {
    id: 'flux_poolside',
    label: '泳池假日',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter portrait of a gorgeous young woman by a turquoise pool, sun-kissed skin, ' +
      'looking at viewer playfully, bright midday sunlight, sharp focus, detailed face, vibrant colors, 8k photorealistic',
    negativePrompt: '',
  },
  {
    id: 'flux_outfit_display',
    label: '服装展示',
    category: 'outfit',
    positivePrompt:
      'sexy cosplay costume as game wardrobe item, invisible ghost mannequin, full garment front view, ' +
      'centered product, dark studio inventory backdrop, sharp fabric detail, 8k game asset render, no person no face',
    negativePrompt:
      'person, face, hands, skin, model, blurry, low quality, watermark, text',
  },
  {
    id: 'flux_prop_vfx',
    label: '特效道具',
    category: 'shop_item',
    positivePrompt:
      'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, ' +
      'centered product, dark UI backdrop, sharp details, 8k game asset, no person',
    negativePrompt:
      'person, face, body, hands, blurry, low quality, watermark, text',
  },
];

/** Default FLUX gen params for admin UI */
export const FLUX_DEFAULT_GEN_PARAMS = {
  steps: 28,
  cfg: 1.0,
  seed: -1,
  width: 832,
  height: 1216,
  sampler: 'euler',
  scheduler: 'simple',
  denoise: 0.55,
} as const;
