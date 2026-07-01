/**
 * PromptDSL 统一入口 — 根据 type 分发到对应 preset
 *
 * 使用：
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
  /** Girlfriend 类型才需要的主体特征 */
  subject?: GirlfriendSubject;
  /** 用户/上游手动指定的 negative，append 到 preset 内置 negative 之后 */
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
