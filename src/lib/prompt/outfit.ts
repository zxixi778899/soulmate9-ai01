/**
 * Outfit / costume (服装道具) image prompt
 * - NO model / no person
 * - Game item / cosplay prop presentation
 * - Sexy cos aesthetic
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

/** Outfit presentation DSL — no human model */
export const OUTFIT_DSL = {
  shotType:
    'game item icon style product render, sexy cosplay costume as collectible game prop, ' +
    'high-end fantasy fashion asset, stylized game UI showcase',
  composition:
    'the costume alone as the sole hero subject, perfectly centered, ' +
    'full garment visible from neckline to hem, no crop',
  display:
    'invisible ghost mannequin, empty hollow form, garment holds a sensual feminine 3D silhouette, ' +
    'natural fabric drape and curves, headless faceless, no human skin, no body, no model',
  style:
    'sexy cosplay fashion, seductive design details, revealing cut, lace straps, ' +
    'glossy satin and sheer fabric accents, game wardrobe item aesthetic',
  background:
    'dark moody game inventory backdrop, subtle purple-pink neon rim glow, ' +
    'soft particle sparkles, clean studio void, RPG item showcase',
  lighting:
    'dramatic rim light, soft front key light on fabric texture, ' +
    'specular highlights on satin and metal hardware, magical ambient glow',
  detail:
    'ultra-detailed fabric weave, stitching, lace, ribbons, zippers, buckles, ' +
    'embroidery, sequins, glossy materials, crisp silhouette edges',
  quality:
    '4K 8K UHD, ultra sharp, game art product shot, Unreal Engine style material quality, ' +
    'masterpiece, commercial game asset presentation',
} as const;

export const OUTFIT_DEFAULT_SUBJECT =
  'sexy cosplay costume game wardrobe item with exquisite craftsmanship';

/** Strongly ban people / models */
export const OUTFIT_NEGATIVE =
  'person, people, human, woman, man, girl, boy, child, lady, female, male, model, real person, ' +
  'photoreal human, face, eyes, mouth, lips, nose, ears, hair, scalp, skin, flesh, hands, fingers, ' +
  'arms, legs, feet, cleavage skin, neck skin, mannequin head, mannequin face, visible head, ' +
  'naked body, nude, body parts, anatomy, wearing on person, model posing, ' +
  'two outfits, multiple garments, duplicated garment, cropped garment, ' +
  'off-center, blurry, soft focus, out of focus, bokeh, low quality, lowres, ' +
  'watermark, text, logo, signature, jpeg artifacts, cluttered background';

export function assembleOutfitPrompt(ctx: PresetContext): AssembledPrompt {
  const cleaned = sanitizeBlurKeywords(ctx.rawPrompt || '');
  const garmentSubject =
    cleaned && cleaned.trim().length > 0
      ? cleaned.trim().replace(/[.,\s]+$/g, '')
      : OUTFIT_DEFAULT_SUBJECT;

  const positive = joinParts([
    garmentSubject,
    OUTFIT_DSL.shotType,
    OUTFIT_DSL.composition,
    OUTFIT_DSL.display,
    OUTFIT_DSL.style,
    OUTFIT_DSL.background,
    OUTFIT_DSL.lighting,
    OUTFIT_DSL.detail,
    OUTFIT_DSL.quality,
    'no person, no model, empty costume only, sexy game prop',
  ]);

  return { positive, negative: OUTFIT_NEGATIVE };
}

/** Build from outfit list/DB row */
export function assembleOutfitFromRow(row: Record<string, unknown>): AssembledPrompt {
  const parts = [
    String(row.name || 'sexy costume'),
    row.category ? `${row.category} style cosplay outfit` : 'cosplay outfit',
    row.tier ? `${row.tier} tier game wardrobe item` : 'game wardrobe item',
    row.description ? String(row.description).slice(0, 200) : '',
  ];
  return assembleOutfitPrompt({ rawPrompt: parts.filter(Boolean).join(', ') });
}
