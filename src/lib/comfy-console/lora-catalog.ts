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

const PRACTICAL_LORAS: CatalogLora[] = [
  {
    id: 'body-transgender-flux', label: '跨性别身体结构', category: 'body',
    filename: 'flux_body_transgender_v1.safetensors', default_strength: 0.62, nsfw: true,
    usage: '跨性别成年人物：稳定女性外观、胸部曲线与跨性别外生殖结构；建议强度 0.5-0.7。',
    trigger_words: ['adult transgender woman', 'feminine curves', 'coherent transgender anatomy'],
    workflows: ['wf-girlfriend', 'wf-tryon'], source: 'civitai',
    page_url: 'https://civitai.com/models?types=LORA&baseModels=Flux.1%20D&query=transgender%20anatomy',
    search_keywords: 'FLUX transgender woman anatomy adult',
    download: { type: 'manual_or_script', hint: '仅选择明确标注 FLUX.1 D 且有真实样图的版本' },
  },
  {
    id: 'style-anime-2d-flux', label: '二次元 2D 赛璐璐', category: 'style',
    filename: 'flux_style_anime_2d_v1.safetensors', default_strength: 0.72, nsfw: true,
    usage: '2D 动漫插画：稳定线稿、赛璐璐上色、动漫五官和发型；不要与写实风格 LoRA 叠加。',
    trigger_words: ['2d anime illustration', 'clean line art', 'cel shading'],
    workflows: ['wf-girlfriend'], source: 'civitai',
    page_url: 'https://civitai.com/models?types=LORA&baseModels=Flux.1%20D&query=anime%202d',
    search_keywords: 'FLUX anime 2D cel shading',
    download: { type: 'manual_or_script', hint: '优先选择 FLUX.1 D 原生 2D 动漫 LoRA' },
  },
  {
    id: 'style-anime-3d-flux', label: '二次元 3D CGI', category: 'style',
    filename: 'flux_style_anime_3d_v1.safetensors', default_strength: 0.68, nsfw: true,
    usage: '3D 动漫 CGI：稳定角色建模、PBR 材质、发丝和电影灯光；不要与 2D 线稿 LoRA 叠加。',
    trigger_words: ['3d anime cgi', 'stylized PBR character', 'cinematic render'],
    workflows: ['wf-girlfriend'], source: 'civitai',
    page_url: 'https://civitai.com/models?types=LORA&baseModels=Flux.1%20D&query=anime%203d%20cgi',
    search_keywords: 'FLUX anime 3D CGI PBR',
    download: { type: 'manual_or_script', hint: '优先选择 FLUX.1 D 原生 3D 动漫 LoRA' },
  },
];

export function getCatalogLoras(): CatalogLora[] {
  const existing = new Set((LORA_CATALOG.loras || []).map((lora) => lora.id));
  return [...(LORA_CATALOG.loras || []), ...PRACTICAL_LORAS.filter((lora) => !existing.has(lora.id))];
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
