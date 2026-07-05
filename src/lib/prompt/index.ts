/**
 * PromptDSL    type  preset
 *
 * 
 *   import { assemblePrompt } from '@/lib/prompt';
 *   const { positive, negative } = assemblePrompt('outfit', { rawPrompt });
 */
import { assembleGirlfriendPrompt, type GirlfriendSubject } from './girlfriend';
import { assembleOutfitPrompt } from './outfit';
import { assembleShopItemPrompt } from './shop_item';
import type { AssembledPrompt, PresetContext, PromptType } from './shared';

export * from './shared';
export * as Girlfriend from './girlfriend';
export * as Outfit from './outfit';
export * as ShopItem from './shop_item';

export interface AssembleOptions extends PresetContext {
  /** Girlfriend  */
  subject?: GirlfriendSubject;
  /** / negativeappend  preset  negative  */
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
