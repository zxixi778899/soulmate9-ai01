/**
 * Prompt Library — SoulMate AI
 * Optimized for Western market (欧美市场) adult aesthetic.
 *
 * Design Principles:
 * - Photorealistic editorial quality (not anime/CG)
 * - Natural lighting with cinematic depth
 * - Diverse ethnicities and body types
 * - Implied intimacy / suggestive without being explicit
 * - High fashion photography aesthetic
 */

export type GirlfriendId = 'luna' | 'ruby' | 'summer' | 'scarlet';
export type OutfitCategory = 'evening-gown' | 'casual' | 'lingerie' | 'fantasy' | 'sporty' | 'kimono';
export type SceneType = 'portrait' | 'full-body' | 'environmental' | 'intimate' | 'editorial';

export interface GirlfriendPrompt {
  name: string;
  baseDescription: string;
  /** Physical description for consistency */
  appearance: string;
  /** Personality keywords */
  personality: string[];
  /** Scene-specific prompt builders */
}

interface PresetEntry {
  label: string;
  positive: string;
  negative: string;
}

/**
 * Universal negative prompt - applied to all generations
 * Focused on removing AI artifacts and ensuring photorealistic quality
 */
export const UNIVERSAL_NEGATIVE = `nsfw, nude, explicit, pornographic, sexual, 
(deformed, distorted, disfigured:1.3), poorly drawn, bad anatomy, wrong anatomy, 
extra limb, missing limb, floating limbs, disconnected limbs, mutation, mutated, 
ugly, disgusting, blurry, amputation, 
text, watermark, logo, signature, username, 
bad proportions, gross proportions, unnatural body, 
oversaturated, overexposed, low contrast, 
cartoon, 3d render, cgi, illustration, anime, manga, painting, drawing, 
airbrushed, plastic, smooth skin, perfect skin, 
(unrealistic lighting:1.2), studio lighting, flat lighting,
stiff, unnatural, artificial, dead eyes, blank expression, gloomy, depressing, 
dark shadows, harsh contrast, uncanny valley, symmetrical pose, rigid posture, 
forced smile, mannequin-like, wax figure, doll-like`;

/**
 * Preset prompts for quick selection
 * 基于参考图片优化 - 强调美女/女友/性感/自然表情
 */
export const PRESET_TEMPLATES: PresetEntry[] = [
  {
    label: '花园典雅',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, elegant in a sunlit garden, soft morning light filtering through leaves, wearing flowing silk dress that flatters her figure, warm golden hour lighting, shallow depth of field, bokeh background, romantic atmosphere, editorial photography, natural skin texture with pores, subtle dewy makeup, wind-swept hair, 85mm lens f/1.8, warm vibrant colors, radiant glowing skin, soft warm genuine smile showing teeth, eyes sparkling with natural catchlights, magazine cover quality, intimate genuine moment',
    negative: 'harsh shadows, direct sunlight, busy background, cluttered, neon colors, artificial, plastic skin, overexposed, stiff, unnatural, dead eyes, gloomy, depressing, dark shadows, harsh contrast, uncanny valley, symmetrical pose, rigid posture, forced smile, mannequin-like',
  },
  {
    label: '赛博朋克',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, edgy urban fashion in neon-lit city at night, cyberpunk aesthetic, vibrant purple and blue neons, rain-slicked streets reflecting city lights, leather and metallic textures, dramatic side lighting, high contrast, energetic atmosphere, cinematic grain, editorial fashion photography, textured skin with natural pores, natural imperfections, 35mm lens, available light, confident knowing smile, direct eye contact, self-assured, relaxed features, captivating gaze',
    negative: 'cartoon, anime, video game, plastic, clean, sterile, daytime, bright, washed out, flat lighting, airbrushed, stiff, unnatural, dead eyes, blank expression, gloomy, depressing, uncanny valley, symmetrical pose, rigid posture, forced smile, mannequin-like',
  },
  {
    label: '阳光运动',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, athletic in natural outdoor setting, golden hour beach or park, active pose, sporty casual wear that shows her figure, genuine bright warm smile, eyes crinkling at corners, natural midday sun with fill flash, freckles, sun-kissed glowing skin, motion blur on hair, lifestyle photography, Canon 5D, natural candid moment, dewy skin, authentic joyful expression, vibrant warm colors, girlfriend-next-door vibe',
    negative: 'studio lighting, artificial pose, stiff, mannequin-like, heavy makeup, photoshopped, airbrushed, plastic skin, grumpy, angry, gloomy, depressing, dead eyes, blank expression, uncanny valley, symmetrical pose, rigid posture, forced smile',
  },
  {
    label: '暗黑哥特',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, dark aesthetic portrait, moody dim lighting with single rim light, pale skin, dark flowing fabrics, lace details, vintage Victorian-inspired fashion, dramatic shadows, chiaroscuro lighting, deep blacks, film photography aesthetic, natural skin texture with visible pores, mysterious alluring expression, editorial dark fashion, medium format film, captivating intense gaze, lips slightly parted, sultry bedroom eyes, sensual mood',
    negative: 'bright, cheerful, colorful, comic, cartoon, anime, flat lighting, overexposed, plastic, airbrushed, happy, smiling, studio clean, stiff, unnatural, dead eyes, blank expression, uncanny valley, symmetrical pose, rigid posture, forced smile, mannequin-like',
  },
  {
    label: '时尚杂志',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, high fashion editorial shot, minimalist studio with architectural lighting, striking pose, avant-garde fashion that flatters her figure, clean composition with negative space, sharp focus on eyes, textured skin with natural makeup, high contrast, warm vibrant colors, Vogue editorial style, Hasselblad medium format, radiant glowing skin, confident knowing smile, direct eye contact, self-assured, magazine cover quality, captivating natural beauty',
    negative: 'cluttered background, amateur, snapshot, casual, messy lighting, oversaturated, plastic, smooth skin, Instagram filter, low quality, blurry, stiff, unnatural, dead eyes, blank expression, uncanny valley, symmetrical pose, rigid posture, forced smile, mannequin-like',
  },
  {
    label: '清晨居家',
    positive: 'stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, intimate bedroom scene at dawn, soft window light creating gentle shadows, warm morning ambiance, subtle warm smile, cozy sheets and natural fabrics, relaxed pose, genuine candid moment, film grain, authentic skin texture with pores, minimal makeup, messy natural hair, warm color temperature, documentary photography style, available light only, radiant glowing skin, inviting girlfriend-next-door vibe, soft warm genuine smile, eyes sparkling with natural catchlights, lips slightly parted',
    negative: 'harsh lighting, studio flash, artificial, posed, stiff, heavy makeup, formal, bright colors, neon, oversaturated, plastic skin, gloomy, depressing, dead eyes, blank expression, uncanny valley, symmetrical pose, rigid posture, forced smile, mannequin-like',
  },
];

/**
 * Girlfriend-specific prompt builders
 */
const GIRLFRIEND_PROFILES: Record<GirlfriendId, { appearance: string; personality: string[] }> = {
  luna: {
    appearance: 'east-asian woman, long dark silky hair, almond-shaped eyes, porcelain skin with natural warmth, petite athletic build, 5ft4, delicate features, minimal natural makeup',
    personality: ['gentle', 'mysterious', 'nurturing', 'elegant', 'reserved'],
  },
  ruby: {
    appearance: 'mixed-race woman (black and white), natural curly afro-textured hair, amber-brown eyes, warm olive skin tone with freckles, athletic curvy build, 5ft8, confident posture, full lips',
    personality: ['confident', 'bold', 'adventurous', 'playful', 'dominant'],
  },
  summer: {
    appearance: 'caucasian woman, surfer-blonde wavy hair, blue-green eyes, sun-kissed skin with light freckles, athletic lean build, 5ft6, girl-next-door aesthetic, natural beauty',
    personality: ['warm', 'optimistic', 'free-spirited', 'affectionate', 'outgoing'],
  },
  scarlet: {
    appearance: 'pale-skinned woman, dark auburn hair with subtle waves, piercing green eyes, slender elegant build, 5ft9, porcelain skin, gothic-inspired aesthetic, high cheekbones',
    personality: ['mysterious', 'intense', 'passionate', 'independent', 'enigmatic'],
  },
};

/**
 * Build a prompt for a specific girlfriend in a given scene
 */
export function buildGirlfriendPrompt(
  girlfriendId: GirlfriendId,
  sceneType: SceneType,
  customDetails?: string,
): { prompt: string; negative_prompt: string } {
  const profile = GIRLFRIEND_PROFILES[girlfriendId];
  if (!profile) throw new Error(`Unknown girlfriend: ${girlfriendId}`);

  const sceneTemplates: Record<SceneType, string> = {
    portrait: `portrait of {appearance}, {personality} expression, {scene}, professional headshot style, dramatic yet natural lighting, sharp focus on eyes, natural skin texture with visible pores, editorial fashion photography, Canon R5, 85mm f/1.4, shallow depth of field, cinematic color grading`,
    'full-body': `full body shot of {appearance}, standing confidently, {personality} aura, {scene}, natural lighting, editorial full-body fashion photography, textured skin, realistic proportions, lifestyle photography, natural environment, 35mm, environmental portrait`,
    environmental: `lifestyle environmental shot of {appearance}, {personality} personality, {scene}, candid moment captured naturally, documentary photography style, available light, film grain, authentic expression, real textures, natural imperfections, 50mm, Leica M6`,
    intimate: `intimate bedroom scene with {appearance}, {personality} vibe, soft window light, {scene}, sensual but tasteful, implied intimacy, editorial boudoir photography, natural skin texture, film aesthetic, shallow depth of field, vintage tones, warm temperature`,
    editorial: `editorial fashion shot of {appearance}, {personality} character, {scene}, avant-garde styling, dramatic lighting, high contrast, textured skin, fashion magazine quality, medium format, raw emotion, striking composition, monochromatic palette`,
  };

  const defaultScenes: Record<SceneType, string> = {
    portrait: 'elegant and refined atmosphere',
    'full-body': 'natural outdoor setting, urban or nature',
    environmental: 'beautiful curated space, natural light',
    intimate: 'luxury bedroom with satin sheets',
    editorial: 'minimalist studio with architectural elements',
  };

  const personalityStr = profile.personality.slice(0, 2).join(' ');
  const scene = customDetails || defaultScenes[sceneType];
  const template = sceneTemplates[sceneType];

  const prompt = template
    .replace('{appearance}', profile.appearance)
    .replace('{personality}', personalityStr)
    .replace('{scene}', scene);

  return { prompt, negative_prompt: UNIVERSAL_NEGATIVE };
}

/**
 * Build prompts for outfit previews
 */
export function buildOutfitPrompt(
  category: OutfitCategory,
  details?: string,
): { prompt: string; negative_prompt: string } {
  const outfitTemplates: Record<OutfitCategory, string> = {
    'evening-gown': 'elegant evening gown on fashion model, {details}, dramatic runway lighting, full body shot, high fashion editorial, luxurious fabric textures, silk and sequins detail, photorealistic, natural skin texture, studio with softboxes, medium format photography',
    casual: 'casual everyday outfit on model, {details}, natural outdoor lighting, lifestyle street photography, relaxed authentic pose, real fabric textures, natural skin, candid moment, golden hour, 35mm film aesthetic',
    lingerie: 'intimate boudoir fashion, {details}, soft diffused lighting, sensual elegant aesthetic, fine lace and silk textures, boudoir editorial photography, natural skin texture with visible detail, film grain, tasteful composition, warm tones',
    fantasy: 'fantasy themed costume on model, {details}, dramatic theatrical lighting, editorial fashion with fantasy elements, intricate fabric details, creative studio setup, high fashion meets fantasy, textured fabrics, cinematic lighting, medium format',
    sporty: 'athletic sportswear on fit model, {details}, active dynamic pose, gym or outdoor setting, natural lighting with motion, performance fabric textures, genuine athletic physique, lifestyle fitness photography, Canon 5D, natural skin',
    kimono: 'japanese kimono on model, {details}, traditional meets modern fashion editorial, elegant drapery, intricate fabric patterns, soft natural lighting, cultural appreciation photography, silk textures, obi detail, editorial portrait, medium format',
  };

  const template = outfitTemplates[category];
  const fill = details || 'beautiful design, perfect fit';

  return {
    prompt: template.replace('{details}', fill),
    negative_prompt: UNIVERSAL_NEGATIVE,
  };
}

/**
 * Build prompts for Hero / Banner images
 */
export function buildHeroPrompt(theme: 'romantic' | 'mysterious' | 'luxury'): { prompt: string; negative_prompt: string } {
  const heroes: Record<string, string> = {
    romantic: 'cinematic wide shot of a romantic intimate moment between a man and a beautiful woman, golden sunset light filtering through sheer curtains, luxurious bedroom with city view, warm ambient lighting, shallow depth of field, passionate atmosphere, high-end editorial photography, film grain, 35mm, natural textures, authentic emotion',
    mysterious: 'dark cinematic scene of a mysterious feminine silhouette, single beam of moonlight creating dramatic shadows, luxurious dark interior with velvet textures, film noir aesthetic, deep shadows, subtle rim lighting, enigmatic atmosphere, cinematic color grading, medium format, textured shadows',
    luxury: 'luxury lifestyle establishing shot, elegant penthouse with panoramic city skyline view at dusk, warm ambient lighting, sophisticated atmosphere, high-end interior design, tasteful and refined, editorial photography, architectural digest style, warm tones, natural light mixing with warm interior lighting, 24mm wide angle',
  };

  return {
    prompt: heroes[theme] || heroes.romantic,
    negative_prompt: UNIVERSAL_NEGATIVE,
  };
}