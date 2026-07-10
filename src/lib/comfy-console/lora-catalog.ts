/**
 * LoRA 清单：从 data/lora-catalog.json 加载，供 Comfy 默认配置与后台展示。
 * 单源：改 JSON 即可同步下载脚本清单与 Admin UI。
 */
import catalogJson from '../../../data/lora-catalog.json';

export type LoraCategoryId = 'body' | 'action' | 'outfit' | 'prop' | 'detail' | string;

export type CatalogLora = {
  id: string;
  label: string;
  category: LoraCategoryId;
  filename: string;
  default_strength: number;
  nsfw?: boolean;
  usage: string;
  trigger_words: string[];
  workflows?: string[];
  source?: string;
  page_url?: string;
  search_keywords?: string;
  download?: { type?: string; hint?: string };
};

export type LoraApplyRecipe = {
  id: string;
  label: string;
  workflow_id: string;
  lora_id: string;
  lora_strength: number;
  append_triggers?: boolean;
  positive_extra?: string;
};

export type LoraCatalog = {
  version: number;
  base_model: string;
  target_volume: string;
  region: string;
  notes: string[];
  categories: Array<{ id: string; label: string; order: number }>;
  loras: CatalogLora[];
  stacking_tips: string[];
  apply_recipes?: LoraApplyRecipe[];
};

export const LORA_CATALOG = catalogJson as LoraCatalog;

export function getCatalogLoras(): CatalogLora[] {
  return LORA_CATALOG.loras || [];
}

export function getCatalogLoraById(id: string): CatalogLora | undefined {
  return getCatalogLoras().find((l) => l.id === id);
}

/** Map catalog entries to Comfy console LoraAsset shape (+ extended fields). */
export function catalogToLoraAssets(): Array<{
  id: string;
  label: string;
  filename: string;
  default_strength: number;
  tags?: string[];
  category?: string;
  nsfw?: boolean;
  usage?: string;
  trigger_words?: string[];
  page_url?: string;
  search_keywords?: string;
  workflows?: string[];
}> {
  const none = {
    id: 'none',
    label: '（不使用 LoRA）',
    filename: '',
    default_strength: 0,
    tags: [],
    category: 'none',
  };

  const items = getCatalogLoras().map((l) => ({
    id: l.id,
    label: `${categoryPrefix(l.category)}${l.label}`,
    filename: l.filename,
    default_strength: l.default_strength,
    tags: [l.category, ...(l.nsfw ? ['nsfw'] : []), ...(l.workflows || [])],
    category: l.category,
    nsfw: !!l.nsfw,
    usage: l.usage,
    trigger_words: l.trigger_words || [],
    page_url: l.page_url,
    search_keywords: l.search_keywords,
    workflows: l.workflows,
  }));

  return [none, ...items];
}

function categoryPrefix(cat: string): string {
  switch (cat) {
    case 'body':
      return '[身材] ';
    case 'action':
      return '[动作] ';
    case 'outfit':
      return '[服装] ';
    case 'prop':
      return '[道具] ';
    case 'detail':
      return '[细节] ';
    default:
      return '';
  }
}

export function groupLorasByCategory(): Record<string, CatalogLora[]> {
  const groups: Record<string, CatalogLora[]> = {};
  for (const l of getCatalogLoras()) {
    const k = l.category || 'other';
    if (!groups[k]) groups[k] = [];
    groups[k].push(l);
  }
  return groups;
}

/** Build prompt snippet from trigger words. */
export function triggersToPrompt(lora: CatalogLora, max = 4): string {
  return (lora.trigger_words || []).slice(0, max).join(', ');
}
