/**
 * Outfit image prompts — FLUX-friendly product / ghost mannequin
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

export const OUTFIT_DSL = {
  shotType:
    'game wardrobe item product render, sexy cosplay costume as collectible prop, ' +
    'high-end fashion asset showcase',
  composition:
    'costume as sole hero subject, perfectly centered, full garment from neckline to hem',
  display:
    'invisible ghost mannequin silhouette, garment holds feminine 3D shape with natural drape, ' +
    'headless faceless form, clothing only',
  style:
    'sexy cosplay fashion, seductive cut details, satin and lace accents, game inventory item look',
  background:
    'dark game inventory backdrop, subtle purple-pink rim glow, clean studio void',
  lighting:
    'bright key light on fabric texture, clear rim light, specular on satin and metal, well-lit product',
  detail:
    'ultra-detailed fabric weave, stitching, lace, ribbons, zippers, embroidery, crisp edges',
  quality:
    '8k sharp product shot, game art quality, commercial asset presentation, clear and vibrant',
} as const;

export const OUTFIT_DEFAULT_SUBJECT =
  'sexy cosplay costume game wardrobe item with exquisite craftsmanship';

/** Keep person ban short — FLUX handles short negatives better */
export const OUTFIT_NEGATIVE =
  'person, people, human, face, hands, skin, model, mannequin head, blurry, low quality, watermark, text, logo';

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
    'clothing only, empty costume display',
  ]);

  return { positive, negative: OUTFIT_NEGATIVE };
}

export function assembleOutfitFromRow(row: Record<string, unknown>): AssembledPrompt {
  const parts = [
    String(row.name || ''),
    String(row.description || ''),
    String(row.category || ''),
    String(row.tier || ''),
  ].filter(Boolean);
  return assembleOutfitPrompt({ rawPrompt: parts.join(', ') });
}
