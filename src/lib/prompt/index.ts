/**
 * Prompt DSL by entity type.
 *
 *   import { assemblePrompt, assembleFromItem } from '@/lib/prompt';
 *   const { positive, negative } = assemblePrompt('outfit', { rawPrompt });
 */
import {
  assembleGirlfriendPrompt,
  assembleGirlfriendFromRow,
  subjectFromGirlfriendRow,
  type GirlfriendSubject,
} from './girlfriend';
import { assembleOutfitPrompt, assembleOutfitFromRow } from './outfit';
import { assembleShopItemPrompt, assembleShopItemFromRow } from './shop_item';
import type { AssembledPrompt, PresetContext, PromptType } from './shared';

export * from './shared';
export * from './flux-presets';
// re-export name helpers used by admin UI / list APIs
export * as Girlfriend from './girlfriend';
export * as Outfit from './outfit';
export * as ShopItem from './shop_item';
export {
  assembleGirlfriendFromRow,
  subjectFromGirlfriendRow,
  GIRLFRIEND_BODY_FIXED,
  GIRLFRIEND_FRAMING,
  GIRLFRIEND_NEGATIVE,
  GIRLFRIEND_NEGATIVE_FLUX,
} from './girlfriend';
export { assembleOutfitFromRow, OUTFIT_NEGATIVE } from './outfit';
export { assembleShopItemFromRow, SHOP_ITEM_NEGATIVE } from './shop_item';

export interface AssembleOptions extends PresetContext {
  subject?: GirlfriendSubject;
  extraNegative?: string;
}

export function assemblePrompt(type: PromptType, options: AssembleOptions): AssembledPrompt {
  let result: AssembledPrompt;
  switch (type) {
    case 'outfit':
      result = assembleOutfitPrompt(options);
      break;
    case 'shop_item':
      result = assembleShopItemPrompt(options);
      break;
    case 'girlfriend':
    default:
      result = assembleGirlfriendPrompt(options, options.subject || {});
      break;
  }
  if (options.extraNegative && options.extraNegative.trim().length > 0) {
    return {
      positive: result.positive,
      negative: result.negative
        ? `${options.extraNegative.trim()}, ${result.negative}`
        : options.extraNegative.trim(),
    };
  }
  return result;
}

/**
 * Build full positive/negative from an admin list item / DB row.
 * Girlfriend: traits + fixed sexy body + 3/4 framing
 * Outfit: no model, sexy cos game prop
 * Shop: VFX special-effects game prop
 */
export function assembleFromItem(
  type: PromptType,
  row: Record<string, unknown>,
  rawPrompt = '',
): AssembledPrompt {
  switch (type) {
    case 'outfit':
      return rawPrompt
        ? assembleOutfitPrompt({ rawPrompt })
        : assembleOutfitFromRow(row);
    case 'shop_item':
      return rawPrompt
        ? assembleShopItemPrompt({ rawPrompt })
        : assembleShopItemFromRow(row);
    case 'girlfriend':
    default:
      return assembleGirlfriendFromRow(row, rawPrompt);
  }
}
