/**
 * RunPod resources + Comfy console defaults for Oxmate AI.
 * Network volume LoRAs/models are listed as filenames Comfy sees after mount.
 * LoRA 清单单源：data/lora-catalog.json → catalogToLoraAssets()
 */
import { catalogToLoraAssets, LORA_CATALOG } from './lora-catalog';
import type { LibraryItem } from '@/lib/model-library';
import { getVerifiedInstalledLoraSet } from '@/lib/runpod-loras';
import {
  DEFAULT_REFERENCE_CONTROLS,
  type ReferenceAsset,
  type ReferenceControlSettings,
} from '@/lib/reference-generation-plan';

export type WorkflowKind = 'girlfriend' | 'outfit' | 'prop' | 'advert' | 'custom';

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
  description_zh?: string;
  compatibility_zh?: string;
  authenticity_zh?: string;
  risk_zh?: string;
  trigger_words?: string[];
  page_url?: string;
  search_keywords?: string;
  workflows?: string[];
  source?: string;
  base_model?: 'FLUX.1' | 'Pony' | 'Illustrious' | 'SDXL';
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
  reference_control?: ReferenceControlSettings;
  reference_assets?: ReferenceAsset[];
};

export const COMFY_CONFIG_KEY = 'comfy_console';


/** Merge static catalog + model-library LoRAs for Comfy dropdown. */
export function mergeLoraAssets(libraryItems?: LibraryItem[]): LoraAsset[] {
  // 只暴露 worker 上真实存在的 LoRA（运行时清单为准），避免选到已删除文件后
  // 提交被 RunPod 校验拒绝；运行时清单缺失时退回展示全量（下载/管理场景）。
  const installed = getVerifiedInstalledLoraSet();
  const hasInventory = installed.size > 0;
  const base = (catalogToLoraAssets() as LoraAsset[]).filter(
    (l) => !hasInventory || !l.filename || installed.has(l.filename),
  );
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
    // 运行时清单存在时，资料库条目同样只暴露 worker 上真实存在的文件
    if (hasInventory && !installed.has(it.filename)) continue;
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
      base_model: /illustrious/i.test(it.base_model || '') ? 'Illustrious' : /pony/i.test(it.base_model || '') ? 'Pony' : /sdxl/i.test(it.base_model || '') ? 'SDXL' : 'FLUX.1',
    });
  }
  return [...base, ...extra];
}

export function createDefaultComfyConfig(libraryItems?: LibraryItem[]): ComfyConsoleConfig {
  const loras = mergeLoraAssets(libraryItems);

  return {
    version: 3,
    updated_at: new Date().toISOString(),
    lora_catalog_version: LORA_CATALOG.version,
    reference_control: { ...DEFAULT_REFERENCE_CONTROLS },
    reference_assets: [],
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
        id: 'comfy-unified',
        label: 'ComfyUI (FLUX + Pony + Illustrious)',
        endpoint_id: process.env.RUNPOD_ENDPOINT_ID || 'wozrrlcdipyl3p',
        kind: 'comfy',
        notes: '统一端点：所有模型(FLUX/Pony/Illustrious)和LoRA均挂载在同一worker',
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
        id: 'flux-unchained',
        label: 'Flux Unchained by SCG（fp8 无审查）',
        filename: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
        type: 'checkpoint',
      },
      {
        id: 'flux-dev',
        label: 'FLUX.1 dev (full)',
        filename: 'flux1-dev.safetensors',
        type: 'checkpoint',
      },
      {
        id: 'pony-realism-v22',
        label: 'Pony Realism V2.2 · CD2',
        filename: 'ponyRealism_V22.safetensors',
        type: 'checkpoint',
      },
      {
        id: 'wai-mature-illustrious-v20',
        label: 'WAI Mature Illustrious V2 · CD2',
        filename: 'waiMatureIllustrious_v20.safetensors',
        type: 'checkpoint',
      },
    ],
    loras,
    workflows: [
      {
        id: 'wf-girlfriend',
        name: '人物肖像 · 3/4 全身',
        kind: 'girlfriend',
        description: '性感伴侣卡：特征+动作+环境+质量；3/4 身材展示；明亮面部光；可挂身材/质感 LoRA',
        defaults: {
          ckpt_id: 'flux-unchained',
          lora_id: 'none',
          lora_strength: 0,
          width: 832,
          height: 1216,
          steps: 8,
          cfg: 1,
          denoise: 1,
          endpoint_key: 'comfy-flux-cd1',
          positive:
            'beautiful seductive adult woman, distinctive face and hairstyle, alluring eye contact, relaxed asymmetrical three-quarter pose, elegant revealing outfit, soft directional key light on face with natural rim light, photorealistic editorial portrait, crisp eyes, fine skin texture, realistic hair, high-resolution detail, sharp focus',
          negative:
            'blurry, soft focus, stiff mannequin pose, waxy plastic skin, bad anatomy, deformed hands, underexposed face, child, underage, watermark, text',
        },
      },
      {
        id: 'wf-outfit',
        name: '服装道具 · 无模特',
        kind: 'outfit',
        description: '游戏服装 / cos 道具，无真人，ghost mannequin',
        defaults: {
          ckpt_id: 'flux-unchained',
          lora_id: 'outfit-ghost-mannequin',
          lora_strength: 0.7,
          width: 1024,
          height: 1024,
          steps: 8,
          cfg: 1,
          endpoint_key: 'comfy-flux-cd1',
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
          ckpt_id: 'flux-unchained',
          lora_id: 'prop-magical',
          lora_strength: 0.75,
          width: 1024,
          height: 1024,
          steps: 8,
          cfg: 1,
          endpoint_key: 'comfy-flux-cd1',
          positive:
            'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, centered product, 8k',
          negative: 'person, face, body, blurry, watermark, text, logo',
        },
      },
      {
        id: 'wf-tryon',
        name: '换装 · 伴侣图 img2img',
        kind: 'girlfriend',
        description: '参考图保持脸，提示词换衣服（denoise 0.5–0.6）；推荐服装 LoRA',
        defaults: {
          ckpt_id: 'flux-unchained',
          lora_id: 'outfit-lingerie',
          lora_strength: 0.65,
          width: 832,
          height: 1216,
          steps: 8,
          cfg: 1,
          denoise: 0.55,
          endpoint_key: 'comfy-flux-cd1',
          positive:
            'same young adult woman as reference, identity preserved, wearing elegant outfit, three-quarter body, photorealistic 8k',
          negative: 'different person, face change, deformed, child, watermark',
        },
      },
      {
        id: 'wf-advert',
        name: '广告图 · 商品视觉',
        kind: 'advert',
        description: '商城横幅、活动主视觉与商品广告，不混用人物身体或服装 LoRA',
        defaults: {
          ckpt_id: 'flux-unchained',
          lora_id: 'style-photoreal',
          lora_strength: 0.45,
          width: 1216,
          height: 832,
          steps: 8,
          cfg: 1,
          endpoint_key: 'comfy-flux-cd1',
          positive: 'premium commercial product campaign, clear hero product, controlled studio lighting, intentional negative space for copy, polished advertising photography',
          negative: 'person, malformed product, duplicate product, unreadable text, watermark, clutter',
        },
      },
      {
        id: 'wf-custom',
        name: '自定义',
        kind: 'custom',
        description: '空白参数，完全手动',
        defaults: {
          ckpt_id: 'flux-unchained',
          lora_id: null,
          width: 832,
          height: 1216,
          steps: 8,
          cfg: 1,
          endpoint_key: 'comfy-flux-cd1',
          positive: '',
          negative: 'blurry, low quality, watermark, text',
        },
      },
    ],
  };
}
