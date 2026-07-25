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
    id: 'body-transgender-presentation-flux', label: '跨性别女性外观（MtF）', category: 'body',
    filename: 'realistic-mtf-trans.safetensors', default_strength: 0.5, nsfw: false,
    usage: '跨性别女性外观控制：强化成年 MtF 的女性面部、胸部与曲线。它不单独负责生殖结构，需与跨性别双特征 LoRA 配合。',
    trigger_words: ['MtF trans'], workflows: ['wf-girlfriend', 'wf-tryon'], source: 'civitai',
    page_url: 'https://civitai.com/models/918039', version_id: 1027537,
    sha256: '04C9A25E61C5141CA9A5B7E874A2A05117EB849740D230ED7E96C8B085F3543F',
    download_url: 'https://civitai.com/api/download/models/1027537',
    search_keywords: 'FLUX realistic MtF transgender',
    download: { type: 'civitai_version', hint: 'FLUX.1 D；触发词 MtF trans；SafeTensor 扫描通过' },
  },
  {
    id: 'body-transgender-anatomy-flux', label: '跨性别双特征结构', category: 'body',
    filename: 'Anet_Valence_futanari_FLUX-000004.safetensors', default_strength: 0.68, nsfw: true,
    usage: '跨性别双特征结构控制：用于女性胸部与男性外生殖特征同时入镜。Lv3-Lv5 建议 0.62-0.78，并使用胸部到骨盆完整构图。',
    trigger_words: ['adult transgender woman', 'developed breasts and penis'], workflows: ['wf-girlfriend'], source: 'civitai',
    page_url: 'https://civitai.com/models/737321', version_id: 824543,
    sha256: '7E901AB1C18760C8129218C7D05DB7156749E3A25E71973A2A9F034566A7C759',
    download_url: 'https://civitai.com/api/download/models/824543',
    search_keywords: 'FLUX transgender dual anatomy',
    download: { type: 'civitai_version', hint: 'FLUX.1 D；SafeTensor 扫描通过；下载后需用测试种子人工验收' },
  },
  {
    id: 'body-masculine-flux', label: '成年男性体型 MASC', category: 'body',
    filename: 'MASC V1.0.safetensors', default_strength: 0.62, nsfw: false,
    usage: '男性外观与体型控制：强化成年男性面部、肩背、胸腹和阳刚轮廓；生殖结构仍由提示词与底模负责。',
    trigger_words: ['adult masculine man', 'masculine physique'], workflows: ['wf-girlfriend'], source: 'civitai',
    page_url: 'https://civitai.com/models/879573', version_id: 1967998,
    sha256: 'AB521113F14E583263FE9E6BB819F8ED32E6B605CDCC08F4942B3C61EEADF79E',
    download_url: 'https://civitai.com/api/download/models/1967998',
    search_keywords: 'FLUX realistic masculine men MASC',
    download: { type: 'civitai_version', hint: 'FLUX.1 D；SafeTensor 扫描通过' },
  },
  {
    id: 'style-anime-2d-flux', label: '二次元 2D 赛璐璐', category: 'style',
    filename: 'rdanimefluxv1rapid.safetensors', default_strength: 0.72, nsfw: false,
    usage: '2D 动漫插画：稳定线稿、赛璐璐上色、动漫五官和发型；不要与写实风格 LoRA 叠加。',
    trigger_words: ['anime'],
    workflows: ['wf-girlfriend'], source: 'civitai',
    page_url: 'https://civitai.com/models/772320',
    version_id: 863817,
    sha256: '49D581E274F0D50492E4A7A72DA49BA8F3C69DD3549AEF6FD86554F1A2B28F5F',
    download_url: 'https://civitai.com/api/download/models/863817',
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
