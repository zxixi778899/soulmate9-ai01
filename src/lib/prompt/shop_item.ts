/**
 * Shop prop / gift item (商城道具) image prompt
 * - Special-effects game prop
 * - Fantasy VFX item icon style
 * - No person
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

export const SHOP_ITEM_DSL = {
  shotType:
    'fantasy game prop icon, special effects item render, RPG loot asset, ' +
    'magical collectible game item, VFX-enhanced product showcase',
  composition:
    'single prop as sole hero subject, perfectly centered, floating in frame, ' +
    'fills about 55-65 percent of the canvas, clear silhouette',
  effects:
    'magical particle effects, glowing aura, energy wisps, soft sparkles, ' +
    'arcane runes light trails, luminous core, volumetric light rays, ' +
    'special effect trails, enchantment glow',
  style:
    'game UI inventory icon aesthetic, premium mobile game shop item, ' +
    'polished 3D game asset, stylized fantasy prop design',
  background:
    'dark gradient game UI backdrop, subtle bokeh orbs of light, ' +
    'clean void space, mystical ambient fog near base',
  lighting:
    'emissive self-illumination on the prop, soft rim light, ' +
    'specular highlights, balanced fill so form stays readable',
  detail:
    'ultra-detailed surface materials, metal crystal gem fabric, ' +
    'reflections, engravings, craftsmanship, crisp edges',
  quality:
    '4K 8K UHD, ultra sharp, Unreal Engine 5 style render, ' +
    'masterpiece game asset, commercial shop item hero shot',
} as const;

export const SHOP_ITEM_DEFAULT_SUBJECT =
  'a single magical special-effects game prop with glowing enchantment';

export const SHOP_ITEM_NEGATIVE =
  'person, people, human, face, body, hands, hair, skin, model, mannequin, ' +
  'woman, man, girl, boy, clothing on body, wearing, ' +
  'two objects, multiple objects, off-center composition, ' +
  'blurry, soft focus, out of focus, motion blur, low quality, lowres, ' +
  'pixelated, watermark, text, logo, signature, jpeg artifacts, ' +
  'cluttered background, busy background, pure black empty scene, underexposed';

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

/** Build from shop_items list/DB row */
export function assembleShopItemFromRow(row: Record<string, unknown>): AssembledPrompt {
  const parts = [
    String(row.name || 'magical game prop'),
    row.item_type ? `${row.item_type} type special effects item` : 'special effects game prop',
    row.category ? `${row.category} category` : '',
    row.description ? String(row.description).slice(0, 200) : '',
    'fantasy loot, enchanted item',
  ];
  return assembleShopItemPrompt({ rawPrompt: parts.filter(Boolean).join(', ') });
}
