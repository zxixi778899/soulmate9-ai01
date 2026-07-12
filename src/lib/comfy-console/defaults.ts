/**
 * RunPod resources + Comfy console defaults for Soulmate9.
 * Network volume LoRAs/models are listed as filenames Comfy sees after mount.
 * LoRA 清单单源：data/lora-catalog.json → catalogToLoraAssets()
 */
import { catalogToLoraAssets, LORA_CATALOG } from './lora-catalog';
import type { LibraryItem } from '@/lib/model-library';

export type WorkflowKind = 'girlfriend' | 'outfit' | 'prop' | 'custom';

export type RunPodEndpointConfig = {
  id: string;
  label: string;
  /** RunPod serverless endpoint id */
  endpoint_id: string;
  kind: 'comfy' | 'vllm' | 'other';
  notes?: string;
};

export type ModelAsset = {
  id: string;
  label: string;
  /** Filename relative to Comfy models/checkpoints */
  filename: string;
  type: 'checkpoint';
};

export type LoraAsset = {
  id: string;
  label: string;
  /** Filename relative to Comfy models/loras */
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
  source?: string;
};

export type WorkflowPreset = {
  id: string;
  name: string;
  kind: WorkflowKind;
  description: string;
  /** If set, used as full Comfy graph; else server builds FLUX graph */
  workflow_json?: Record<string, unknown> | null;
  defaults: {
    ckpt_id: string;
    lora_id?: string | null;
    lora_strength?: number;
    width: number;
    height: number;
    steps: number;
    cfg: number;
    denoise?: number;
    positive: string;
    negative: string;
    endpoint_key: string;
  };
};

export type ComfyConsoleConfig = {
  version: number;
  updated_at: string;
  network_volume: {
    name: string;
    region: string;
    /** Path on worker where volume is mounted (typical Comfy paths) */
    mount_hint: string;
    checkpoints_dir: string;
    loras_dir: string;
    setup_notes: string[];
  };
  endpoints: RunPodEndpointConfig[];
  checkpoints: ModelAsset[];
  loras: LoraAsset[];
  workflows: WorkflowPreset[];
  /** 叠用建议 + 一键配方（只读展示，来自 catalog） */
  lora_stacking_tips?: string[];
  lora_recipes?: Array<{
    id: string;
    label: string;
    workflow_id: string;
    lora_id: string;
    lora_strength: number;
    append_triggers?: boolean;
    positive_extra?: string;
  }>;
  lora_catalog_version?: number;
};

export const COMFY_CONFIG_KEY = 'comfy_console';


/** Merge static catalog + model-library LoRAs for Comfy dropdown. */
export function mergeLoraAssets(libraryItems?: LibraryItem[]): LoraAsset[] {
  const base = catalogToLoraAssets() as LoraAsset[];
  if (!libraryItems?.length) return base;

  const byFilename = new Map<string, LoraAsset>();
  const byId = new Map<string, LoraAsset>();
  for (const l of base) {
    if (l.filename) byFilename.set(l.filename.toLowerCase(), l);
    byId.set(l.id, l);
  }

  const extra: LoraAsset[] = [];
  for (const it of libraryItems) {
    if (it.kind !== 'lora' || !it.filename) continue;
    // catalog seeds already in base
    if (it.source === 'catalog') {
      const bare = it.id.replace(/^catalog:/, '');
      if (byId.has(bare) || byFilename.has(it.filename.toLowerCase())) continue;
    }
    const id =
      it.id.startsWith('civitai:') || it.id.startsWith('manual:')
        ? it.id
        : it.id.startsWith('catalog:')
          ? it.id.replace(/^catalog:/, '')
          : it.id;
    if (byId.has(id)) continue;
    const existing = byFilename.get(it.filename.toLowerCase());
    if (existing && existing.id !== 'none') {
      if ((it.trigger_words?.length || 0) > (existing.trigger_words?.length || 0)) {
        existing.trigger_words = it.trigger_words;
      }
      if (it.page_url && !existing.page_url) existing.page_url = it.page_url;
      continue;
    }
    const prefix = it.source === 'civitai' || it.source === 'manual' ? '[库] ' : '';
    extra.push({
      id,
      label: `${prefix}${it.label}`,
      filename: it.filename,
      default_strength: it.default_strength ?? 0.7,
      tags: [it.category, ...(it.nsfw ? ['nsfw'] : []), it.source, 'library'],
      category: it.category || 'style',
      nsfw: !!it.nsfw,
      usage: it.usage,
      trigger_words: it.trigger_words || [],
      page_url: it.page_url,
      search_keywords: it.notes,
      workflows: ['wf-girlfriend'],
      source: it.source,
    });
  }
  return [...base, ...extra];
}

export function createDefaultComfyConfig(libraryItems?: LibraryItem[]): ComfyConsoleConfig {
  const loras = mergeLoraAssets(libraryItems);

  return {
    version: 2,
    updated_at: new Date().toISOString(),
    lora_catalog_version: LORA_CATALOG.version,
    lora_stacking_tips: LORA_CATALOG.stacking_tips || [],
    lora_recipes: LORA_CATALOG.apply_recipes || [],
    network_volume: {
      name: LORA_CATALOG.target_volume || 'soulmate-models-ca2',
      region: LORA_CATALOG.region || 'US-CA-2',
      mount_hint: '/runpod-volume 或 ComfyUI/models（以你镜像为准）',
      checkpoints_dir: 'models/checkpoints',
      loras_dir: 'models/loras',
      setup_notes: [
        '1. 网络卷 soulmate-models-ca2 挂到 ComfyUI Serverless 模板的 Network Volume',
        '2. 目录结构：models/checkpoints/*.safetensors 与 models/loras/*.safetensors',
        '3. fp8 已有则跳过；LoRA 用 scripts/runpod/download-loras.sh 一键准备',
        '4. LoRA 文件名必须与后台清单 filename 一致（仅文件名，不要绝对路径）',
        '5. Serverless 端点（ComfyUI / soulmate-portrait）都要挂同一网络卷',
        '6. 冷启动后首次读卷可能稍慢，属正常',
        '7. 详细清单与用法见后台「LoRA 清单」Tab 与 scripts/runpod/README-LORA.md',
        '8. 从 Civitai 入库：后台「Civitai 模型库」搜索→加入→导出 lora-urls.txt→download-loras.sh',
      ],
    },
    endpoints: [
      {
        id: 'comfy-default',
        label: 'ComfyUI 5.8.6',
        endpoint_id: process.env.RUNPOD_ENDPOINT_ID || '',
        kind: 'comfy',
        notes: '通用 ComfyUI；可填你的真实 Endpoint ID',
      },
      {
        id: 'portrait-v9',
        label: 'soulmate-portrait:v9',
        endpoint_id: process.env.RUNPOD_PORTRAIT_ENDPOINT_ID || process.env.RUNPOD_ENDPOINT_ID || '',
        kind: 'comfy',
        notes: '自定义肖像镜像 zhanxixi/soulmate-portrait:v9',
      },
      {
        id: 'vllm-luminaid',
        label: 'soulmate-vllm-luminaid',
        endpoint_id: '',
        kind: 'vllm',
        notes: '聊天用 vLLM，不是出图；RUNPOD_VLLM_URL 使用',
      },
    ],
    checkpoints: [
      {
        id: 'flux-fp8',
        label: 'FLUX.1 dev fp8（已有）',
        filename: 'flux1-dev-fp8.safetensors',
        type: 'checkpoint',
      },
      {
        id: 'flux-dev',
        label: 'FLUX.1 dev (full)',
        filename: 'flux1-dev.safetensors',
        type: 'checkpoint',
      },
    ],
    loras,
    workflows: [
      {
        id: 'wf-girlfriend',
        name: '人物肖像 · 3/4 全身',
        kind: 'girlfriend',
        description: '性感女友卡：3/4 构图 + 固定体态词，可挂身材/动作/服装 LoRA',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'body-curvy-flux',
          lora_strength: 0.75,
          width: 832,
          height: 1216,
          steps: 28,
          cfg: 3.5,
          denoise: 1,
          endpoint_key: 'portrait-v9',
          positive:
            'three-quarter body portrait of a stunningly beautiful young adult woman, curvy body, hourglass figure, large breasts, wide hips, sexy alluring, looking at viewer, ultra photorealistic, 8k, soft cinematic lighting',
          negative:
            'blurry, deformed, bad anatomy, child, underage, watermark, text, logo, flat chest',
        },
      },
      {
        id: 'wf-outfit',
        name: '服装道具 · 无模特',
        kind: 'outfit',
        description: '游戏服装 / cos 道具，无真人，ghost mannequin',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'outfit-ghost-mannequin',
          lora_strength: 0.7,
          width: 1024,
          height: 1024,
          steps: 24,
          cfg: 3.5,
          endpoint_key: 'comfy-default',
          positive:
            'sexy cosplay costume game prop, invisible ghost mannequin, no person no face, full garment front view, game inventory showcase, 8k',
          negative:
            'person, people, human, face, hands, skin, model, mannequin head, blurry, watermark',
        },
      },
      {
        id: 'wf-prop',
        name: '商城特效道具',
        kind: 'prop',
        description: 'RPG 特效道具 icon / VFX',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'prop-magical',
          lora_strength: 0.75,
          width: 1024,
          height: 1024,
          steps: 22,
          cfg: 3.5,
          endpoint_key: 'comfy-default',
          positive:
            'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, centered product, 8k',
          negative: 'person, face, body, blurry, watermark, text, logo',
        },
      },
      {
        id: 'wf-tryon',
        name: '换装 · 女友图 img2img',
        kind: 'girlfriend',
        description: '参考图保持脸，提示词换衣服（denoise 0.5–0.6）；推荐服装 LoRA',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'outfit-lingerie',
          lora_strength: 0.65,
          width: 832,
          height: 1216,
          steps: 26,
          cfg: 3.5,
          denoise: 0.55,
          endpoint_key: 'portrait-v9',
          positive:
            'same young adult woman as reference, identity preserved, wearing elegant outfit, three-quarter body, photorealistic 8k',
          negative: 'different person, face change, deformed, child, watermark',
        },
      },
      {
        id: 'wf-custom',
        name: '自定义',
        kind: 'custom',
        description: '空白参数，完全手动',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: null,
          width: 832,
          height: 1216,
          steps: 28,
          cfg: 3.5,
          endpoint_key: 'comfy-default',
          positive: '',
          negative: 'blurry, low quality, watermark, text',
        },
      },
    ],
  };
}
