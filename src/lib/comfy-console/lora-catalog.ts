/**
 * LoRA catalog: load from data/lora-catalog.json for Comfy defaults + admin UI.
 * Single source: edit JSON to sync download scripts and Admin UI.
 */
import catalogJson from '../../../data/lora-catalog.json';

export type LoraCategoryId = 'body' | 'action' | 'outfit' | 'prop' | 'detail' | 'style' | 'checkpoint' | string;

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
  version_id?: number;
  sha256?: string;
  download_url?: string;
  search_keywords?: string;
  base_model?: 'FLUX.1' | 'Pony' | 'Illustrious' | 'SDXL';
  download?: { type?: string; hint?: string };
  family?: string;
  installed?: boolean;
  size_mb?: number;
  routing?: Record<string, boolean>;
  civitai_model_id?: number;
  civitai_version_id?: number;
  notes?: string;
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
  updated?: string;
  base_model?: string;
  target_volume: string;
  volume_path?: string;
  region: string;
  notes: string[];
  families?: string[];
  categories: Array<{ id: string; label: string; order: number }>;
  loras: CatalogLora[];
  routing_rules?: Record<string, Record<string, string[]>> & { description?: string };
  generation_params?: Record<string, { steps: number; cfg: number; sampler: string; scheduler: string; clip_skip?: number }>;
  stacking_tips: string[];
  apply_recipes?: LoraApplyRecipe[];
};

export const LORA_CATALOG = catalogJson as unknown as LoraCatalog;

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
  base_model?: 'FLUX.1' | 'Pony' | 'Illustrious' | 'SDXL';
}> {
  const none = {
    id: 'none',
    label: '(不使用 LoRA)',
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
    base_model: /illustrious/i.test(l.base_model || l.family || LORA_CATALOG.base_model || '') ? 'Illustrious' as const : /pony/i.test(l.base_model || l.family || LORA_CATALOG.base_model || '') ? 'Pony' as const : /sdxl/i.test(l.base_model || l.family || LORA_CATALOG.base_model || '') ? 'SDXL' as const : 'FLUX.1' as const,
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
    case 'style':
      return '[风格] ';
    case 'checkpoint':
      return '[主模] ';
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
