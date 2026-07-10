/**
 * RunPod resources + Comfy console defaults for Soulmate9.
 * Network volume LoRAs/models are listed as filenames Comfy sees after mount.
 */

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
};

export const COMFY_CONFIG_KEY = 'comfy_console';

export function createDefaultComfyConfig(): ComfyConsoleConfig {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    network_volume: {
      name: 'soulmate-models-ca2',
      region: 'US-CA-2',
      mount_hint: '/runpod-volume 或 ComfyUI/models（以你镜像为准）',
      checkpoints_dir: 'models/checkpoints',
      loras_dir: 'models/loras',
      setup_notes: [
        '1. 网络卷 soulmate-models-ca2 挂到 ComfyUI Serverless 模板的 Network Volume',
        '2. 目录结构：models/checkpoints/*.safetensors 与 models/loras/*.safetensors',
        '3. 用 model-downloader Pod（同区域 US-CA-2）把文件下载到网络卷',
        '4. LoRA 文件名必须与 Comfy 列表一致（仅文件名，不要绝对路径）',
        '5. Serverless 端点（ComfyUI / soulmate-portrait）都要挂同一网络卷',
        '6. 冷启动后首次读卷可能稍慢，属正常',
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
        label: 'FLUX.1 dev fp8',
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
    loras: [
      {
        id: 'none',
        label: '（不使用 LoRA）',
        filename: '',
        default_strength: 0,
      },
      {
        id: 'style-soft',
        label: '示例：柔光人像 LoRA（请换成你卷上的真实文件名）',
        filename: 'portrait_soft_v1.safetensors',
        default_strength: 0.75,
        tags: ['girlfriend', 'portrait'],
      },
      {
        id: 'outfit-silk',
        label: '示例：丝质服装 LoRA',
        filename: 'outfit_silk_v1.safetensors',
        default_strength: 0.8,
        tags: ['outfit'],
      },
      {
        id: 'prop-glow',
        label: '示例：特效道具 LoRA',
        filename: 'prop_glow_v1.safetensors',
        default_strength: 0.7,
        tags: ['prop'],
      },
    ],
    workflows: [
      {
        id: 'wf-girlfriend',
        name: '人物肖像 · 3/4 全身',
        kind: 'girlfriend',
        description: '性感女友卡：3/4 构图 + 固定体态词，可挂人像 LoRA',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'style-soft',
          lora_strength: 0.75,
          width: 832,
          height: 1216,
          steps: 28,
          cfg: 3.5,
          denoise: 1,
          endpoint_key: 'portrait-v9',
          positive:
            'three-quarter body portrait of a stunningly beautiful young woman, large breasts, wide hips, big round butt, sexy alluring, looking at viewer, ultra photorealistic, 8k, soft cinematic lighting',
          negative:
            'blurry, deformed, bad anatomy, child, underage, watermark, text, logo, flat chest',
        },
      },
      {
        id: 'wf-outfit',
        name: '服装道具 · 无模特',
        kind: 'outfit',
        description: '游戏服装/ cos 道具，无真人，ghost mannequin',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: 'outfit-silk',
          lora_strength: 0.8,
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
          lora_id: 'prop-glow',
          lora_strength: 0.7,
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
        description: '参考图保持脸，提示词换衣服（denoise 0.5–0.6）',
        defaults: {
          ckpt_id: 'flux-fp8',
          lora_id: null,
          width: 832,
          height: 1216,
          steps: 26,
          cfg: 3.5,
          denoise: 0.55,
          endpoint_key: 'portrait-v9',
          positive:
            'same young woman as reference, identity preserved, wearing elegant outfit, three-quarter body, photorealistic 8k',
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
