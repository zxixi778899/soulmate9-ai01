/**
 * Shop prop / gift — FLUX-friendly VFX product shot
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

export const SHOP_ITEM_DSL = {
  shotType:
    'fantasy game prop icon, special effects item render, RPG loot asset, magical collectible',
  composition:
    'single prop centered, floating in frame, fills 55-65 percent of canvas, clear silhouette',
  effects:
    'magical particles, glowing aura, energy wisps, soft sparkles, luminous core, light rays',
  style: 'game UI inventory icon, premium mobile game shop item, polished 3D game asset',
  background: 'dark gradient game UI backdrop, clean void, mystical ambient fog near base',
  lighting:
    'bright readable lighting on the prop, emissive glow accents, soft rim light, clear form',
  detail:
    'ultra-detailed materials, metal crystal gem, reflections, engravings, crisp edges',
  quality: '8k sharp game asset, commercial shop item hero shot, clear vibrant colors',
} as const;

export const SHOP_ITEM_DEFAULT_SUBJECT =
  'a single magical special-effects game prop with glowing enchantment';

export const SHOP_ITEM_NEGATIVE =
  'person, face, body, hands, model, blurry, low quality, watermark, text, logo, pure black empty';

export function assembleShopItemPrompt(ctx: PresetContext): AssembledPrompt {
  const cleaned = sanitizeBlurKeywords(ctx.rawPrompt || '');
  const objectSubject =
    cleaned && cleaned.trim().length > 0
      ? cleaned.trim().replace(/[.,\s]+$/g, '')
      : SHOP_ITEM_DEFAULT_SUBJECT;

  const positive = joinParts([
    objectSubject,
    SHOP_ITEM_DSL.shotType,
    SHOP_ITEM_DSL.composition,
    SHOP_ITEM_DSL.effects,
    SHOP_ITEM_DSL.style,
    SHOP_ITEM_DSL.background,
    SHOP_ITEM_DSL.lighting,
    SHOP_ITEM_DSL.detail,
    SHOP_ITEM_DSL.quality,
    'special effects prop, game item, magical VFX',
  ]);

  return { positive, negative: SHOP_ITEM_NEGATIVE };
}

export function assembleShopItemFromRow(row: Record<string, unknown>): AssembledPrompt {
  const parts = [
    String(row.name || ''),
    String(row.description || ''),
    String(row.item_type || ''),
    String(row.category || ''),
  ].filter(Boolean);
  return assembleShopItemPrompt({ rawPrompt: parts.join(', ') });
}
