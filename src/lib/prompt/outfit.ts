/**
 * Outfit () Prompt Preset
 *    +  ghost mannequin +  + 
 *
 * FLUX  75 tokens 
 */
import { sanitizeBlurKeywords, joinParts, type AssembledPrompt, type PresetContext } from './shared';

/** Outfit    */
export const OUTFIT_DSL = {
  shotType: 'ultra-luxurious haute couture editorial product photography',
  composition:
    'the garment as the sole hero subject perfectly centered and symmetrically framed ' +
    'in the middle of the composition',
  mannequin:
    'headless invisible ghost mannequin support so the garment holds a dimensional 3D body shape ' +
    'with sensual feminine silhouette and natural drape, ' +
    'full front view showing the entire outfit from neckline to hem',
  background:
    'displayed against a moody dark charcoal black gradient seamless studio backdrop ' +
    'with subtle atmospheric mist',
  lighting:
    'dramatic colored rim light glowing from behind the garment creating a luminous halo edge silhouette, ' +
    'soft key light highlighting fabric texture from the front, additional accent spotlight from above',
  mood: 'premium luxurious sensual mood, high-end magazine fashion editorial aesthetic',
  detail:
    'ultra-detailed fabric weave stitching buttons zippers seams pleats lace embroidery sequins and silhouette, ' +
    'vivid saturated rich fabric color with deep blacks and shimmer highlights, ' +
    'opulent material quality silk satin lace leather velvet visible',
  quality:
    'RAW photo, 4K, 8K UHD, ultra-high resolution, tack sharp focus, crisp details, hyperrealistic, ' +
    'shot on Hasselblad H6D-100c, 50mm prime lens at f/8 deep focus everything in focus, ' +
    'commercial product shot, masterpiece, Vogue editorial style',
} as const;

/** Outfit rawPrompt  */
export const OUTFIT_DEFAULT_SUBJECT = 'luxury high-fashion garment with exquisite craftsmanship';

/** Outfit  +  +  */
export const OUTFIT_NEGATIVE =
  'person, people, human, woman, man, girl, boy, child, lady, female, male, model, real person, photoreal human, ' +
  'mannequin head, mannequin face, visible head, face, eyes, eyeballs, mouth, lips, nose, ears, hair, scalp, ' +
  'skin, flesh, skin texture, neck, shoulders, collarbone, cleavage, hands, fingers, arms, elbows, legs, knees, feet, toes, ' +
  'naked body, nude, body parts, anatomy, ' +
  'two outfits, multiple outfits, multiple garments, duplicated garment, cropped garment, ' +
  'off-center composition, asymmetric framing, tilted subject, ' +
  'blurry, blur, blurred, soft focus, out of focus, defocused, hazy, dreamy, ethereal, motion blur, ' +
  'depth of field, shallow depth of field, bokeh, ' +
  'dark image, completely black, pitch black, all black canvas, empty scene, underexposed, ' +
  'low quality, cheap fabric, dull material, lowres, pixelated, watermark, text, logo, signature, jpeg artifacts, ' +
  'cluttered background, plain white background, busy background';

export function assembleOutfitPrompt(ctx: PresetContext): AssembledPrompt {
  const cleaned = sanitizeBlurKeywords(ctx.rawPrompt || '');
  const garmentSubject =
    cleaned && cleaned.trim().length > 0
      ? cleaned.trim().replace(/[.,\s]+$/g, '')
      : OUTFIT_DEFAULT_SUBJECT;

  const positive = joinParts([
    garmentSubject, // 
    OUTFIT_DSL.shotType,
    OUTFIT_DSL.composition,
    OUTFIT_DSL.mannequin,
    OUTFIT_DSL.background,
    OUTFIT_DSL.lighting,
    OUTFIT_DSL.mood,
    OUTFIT_DSL.detail,
    OUTFIT_DSL.quality,
  ]);

  return { positive, negative: OUTFIT_NEGATIVE };
}
