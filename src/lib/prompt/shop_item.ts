/**
 * Shop Item (道具) Prompt Preset
 * 输出：高级博物馆/画册风产品摄影 — 中性灰渐变背景 + 柔光勾勒 + 主体居中
 *
 * 参考用户提供的画册参考图：不要纯黑，要能体现出产品细节
 */
import { sanitizeBlurKeywords, joinParts, type AssembledPrompt, type PresetContext } from './shared';

/** Shop Item 视觉规范 */
export const SHOP_ITEM_DSL = {
  shotType: 'ultra-luxurious editorial product photography',
  composition:
    'the product as the sole hero subject perfectly centered and symmetrically framed ' +
    'in the middle of the composition filling roughly 60 percent of the frame',
  background:
    'isolated still life on a smooth neutral gradient studio backdrop ' +
    'transitioning from medium cool gray at the top to soft light gray near the bottom, ' +
    'clean minimalist museum-gallery aesthetic with generous negative space around the product',
  lighting:
    'soft diffused key light coming from the front-top-left direction ' +
    'gently sculpting the form and revealing every surface detail and material texture, ' +
    'balanced soft fill light from the opposite side reducing harsh shadows so all details remain clearly visible, ' +
    'subtle catchlight highlights on glossy surfaces, ' +
    'gentle natural shadow grounding the product on the soft matte floor below',
  emphasis:
    'the product clearly visible with crisp edges and rich material detail not lost in darkness',
  mood:
    'premium luxurious mood, cool neutral color temperature, high-end magazine commercial aesthetic',
  detail:
    'ultra-detailed material surface textures reflections highlights and craftsmanship, opulent material quality',
  quality:
    'RAW photo, 4K, 8K UHD, ultra-high resolution, tack sharp focus on the product, crisp details, hyperrealistic, ' +
    'shot on Hasselblad H6D-100c, macro lens at f/8 deep focus everything in focus, ' +
    'commercial product shot, masterpiece, product hero shot',
} as const;

export const SHOP_ITEM_DEFAULT_SUBJECT = 'a single luxury collectible item with exquisite craftsmanship';

export const SHOP_ITEM_NEGATIVE =
  'person, people, human, face, body, body part, hands, hair, skin, model, mannequin, ' +
  'two objects, multiple objects, off-center composition, asymmetric framing, ' +
  'blurry, blur, blurred, soft focus, out of focus, defocused, hazy, dreamy, motion blur, ' +
  'depth of field, shallow depth of field, bokeh, ' +
  'dark image, completely black, pitch black, all black canvas, all black background, pure black background, ' +
  'underexposed, crushed blacks, product hidden in shadow, empty scene, ' +
  'low quality, lowres, pixelated, watermark, text, logo, signature, jpeg artifacts, ' +
  'cluttered background, busy background, harsh shadows, dramatic spotlight';

export function assembleShopItemPrompt(ctx: PresetContext): AssembledPrompt {
  const cleaned = sanitizeBlurKeywords(ctx.rawPrompt || '');
  const objectSubject =
    cleaned && cleaned.trim().length > 0
      ? cleaned.trim().replace(/[.,，。\s]+$/g, '')
      : SHOP_ITEM_DEFAULT_SUBJECT;

  const positive = joinParts([
    objectSubject, // 主体前置
    SHOP_ITEM_DSL.shotType,
    SHOP_ITEM_DSL.composition,
    SHOP_ITEM_DSL.background,
    SHOP_ITEM_DSL.lighting,
    SHOP_ITEM_DSL.emphasis,
    SHOP_ITEM_DSL.mood,
    SHOP_ITEM_DSL.detail,
    SHOP_ITEM_DSL.quality,
  ]);

  return { positive, negative: SHOP_ITEM_NEGATIVE };
}
