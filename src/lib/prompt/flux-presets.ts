/**
 * Built-in FLUX.1 portrait presets for admin image console.
 * Natural-language captions, bright/sharp lighting, short or empty negatives.
 * Scene pack reverse-engineered from premium reference images.
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
    steps: 8,
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
    hint: '20 steps · 稍低分辨率',
    steps: 8,
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
    steps: 12,
    cfg: 1.0,
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
    steps: 8,
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

/**
 * Scene presets reverse-engineered from high-retention reference images.
 * Use as admin one-click scene chips; character traits still come from card fields.
 */
export const FLUX_SCENE_PRESETS: ScenePromptPreset[] = [
  {
    id: 'flux_rooftop_night',
    label: '天台夜景红皮衣',
    category: 'girlfriend',
    positivePrompt:
      'luxury rooftop terrace at night, city skyline bokeh-free sharp lights, shiny red snakeskin crop top and matching leggings, ' +
      'leaning over glass table, arched back, diamond earrings, blue twilight sky, glamorous nightlife editorial, soft natural light on face, natural skin texture, natural exposure',
    negativePrompt: '',
  },
  {
    id: 'flux_mirror_selfie',
    label: '浴室自拍闪灯',
    category: 'girlfriend',
    positivePrompt:
      'candid bathroom mirror selfie, phone in hand, cropped black graphic tee lifted, low-rise ripped jeans, ' +
      'messy wavy hair, one arm in hair, bright hard flash on face, natural skin texture, natural exposure, raw intimate energy, tattoos optional',
    negativePrompt: '',
  },
  {
    id: 'flux_city_apartment',
    label: '粉色公寓沙发',
    category: 'girlfriend',
    positivePrompt:
      'sitting on beige sofa in pink apartment, teal velvet corset with gold hooks, tiny denim shorts, ' +
      'framed night city skyline prints, calm soft smile, soft warm indoor light on face, natural skin texture, polished girlfriend editorial',
    negativePrompt: '',
  },
  {
    id: 'flux_window_sunlight',
    label: '窗边蕾丝日光',
    category: 'girlfriend',
    positivePrompt:
      'standing by tall window with white lace curtains, strong golden side light, lace shadow patterns on skin, ' +
      'looking back over shoulder with soft smile, soft golden window light on face, natural skin texture, intimate sunlit body portrait',
    negativePrompt: '',
  },
  {
    id: 'flux_pink_bedroom',
    label: '粉色卧室吊带袜',
    category: 'girlfriend',
    positivePrompt:
      'kneeling on pastel pink bed with LED strip lights and plush toys, black lingerie garter and sheer stockings, ' +
      'looking back over shoulder with bright flirty smile, natural skin texture, soft warm light on face, playful NSFW bedroom vibe',
    negativePrompt: '',
  },
  {
    id: 'flux_gothic_throne',
    label: '哥特王座女王',
    category: 'girlfriend',
    positivePrompt:
      'seated on ornate black gothic throne, black lace lingerie, jeweled crown and sapphire jewelry, smoke god rays, ' +
      'legs open throne pose, alive eyes, soft natural light on face, natural skin texture, dark background only, dark queen fantasy',
    negativePrompt: '',
  },
  {
    id: 'flux_studio_portrait',
    label: '影棚肖像',
    category: 'girlfriend',
    positivePrompt:
      'photorealistic three-quarter body portrait, looking at viewer, sharp focus, detailed face and eyes, ' +
      'natural skin texture, soft diffused studio light on face, clean seamless backdrop, professional fashion photography',
    negativePrompt: '',
  },
  {
    id: 'flux_golden_hour',
    label: '金色时刻',
    category: 'girlfriend',
    positivePrompt:
      'outdoors at golden hour, warm sunlight fully on face, natural soft smile, sharp detailed face, natural skin texture, bright well-lit, romantic atmosphere, crisp details',
    negativePrompt: '',
  },
  {
    id: 'flux_boudoir',
    label: '私房白床单',
    category: 'girlfriend',
    positivePrompt:
      'reclining on white sheets, looking at viewer, seductive expression, soft parted lips, ' +
      'soft window light on face, natural skin texture, well-lit bedroom, intimate editorial',
    negativePrompt: '',
  },
  {
    id: 'flux_cafe',
    label: '咖啡馆',
    category: 'girlfriend',
    positivePrompt:
      'at a cafe table, warm smile, coffee cup, soft daylight on face, natural skin texture, natural smile, sharp detailed face, bright clear image',
    negativePrompt: '',
  },
  {
    id: 'flux_city_night',
    label: '城市夜景街拍',
    category: 'girlfriend',
    positivePrompt:
      'stylish young woman on a city street at night, neon reflections, confident look at viewer, ' +
      'soft practical light on face, neon only in background, natural skin texture, crisp details, cinematic photoreal',
    negativePrompt: '',
  },
  {
    id: 'flux_poolside',
    label: '泳池假日',
    category: 'girlfriend',
    positivePrompt:
      'by a turquoise pool, natural skin texture, playful natural smile, soft midday sunlight on face, sharp focus, vibrant colors',
    negativePrompt: '',
  },
  {
    id: 'flux_outfit_display',
    label: '服装展示',
    category: 'outfit',
    positivePrompt:
      'sexy cosplay costume as game wardrobe item, invisible ghost mannequin, full garment front view, ' +
      'centered product, dark studio inventory backdrop, sharp fabric detail, 8k game asset render, no person no face',
    negativePrompt: 'person, face, hands, skin, model, blurry, low quality, watermark, text',
  },
  {
    id: 'flux_prop_vfx',
    label: '特效道具',
    category: 'shop_item',
    positivePrompt:
      'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, ' +
      'centered product, dark UI backdrop, sharp details, 8k game asset, no person',
    negativePrompt: 'person, face, body, hands, blurry, low quality, watermark, text',
  },
];

/** Default FLUX gen params for admin UI */
export const FLUX_DEFAULT_GEN_PARAMS = {
  steps: 8,
  cfg: 1.0,
  seed: -1,
  width: 832,
  height: 1216,
  sampler: 'euler',
  scheduler: 'simple',
  denoise: 0.55,
} as const;
