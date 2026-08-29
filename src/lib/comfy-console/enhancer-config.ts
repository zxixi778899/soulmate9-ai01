export type EnhancerId = 'controlnet' | 'adetailer' | 'upscale' | 'ipadapter';

export type EnhancerStatus = {
  id: EnhancerId;
  enabled: boolean;
  nodePackage: string;
  model: string;
  configured: boolean;
};

const envFlag = (name: string): boolean => process.env[name]?.trim().toLowerCase() === 'true';

export function getEnhancerStatuses(): EnhancerStatus[] {
  return [
    {
      id: 'ipadapter',
      enabled: envFlag('RUNPOD_IPADAPTER_INSTALLED'),
      nodePackage: 'Shakker-Labs/ComfyUI-IPAdapter-Flux',
      model: process.env.RUNPOD_IPADAPTER_MODEL || 'ip-adapter.bin',
      configured: Boolean(process.env.RUNPOD_IPADAPTER_MODEL?.trim()),
    },
    {
      id: 'controlnet',
      enabled: envFlag('RUNPOD_CONTROLNET_READY'),
      nodePackage: 'XLabs-AI/x-flux-comfyui + Fannovel16/comfyui_controlnet_aux',
      model: process.env.RUNPOD_CONTROLNET_MODEL || 'flux-depth-controlnet.safetensors',
      configured: Boolean(process.env.RUNPOD_CONTROLNET_MODEL?.trim()),
    },
    {
      id: 'adetailer',
      enabled: envFlag('RUNPOD_ADETAILER_READY'),
      nodePackage: 'ltdrdata/ComfyUI-Impact-Pack (ADetailer-compatible detail pass)',
      model: process.env.RUNPOD_ADETAILER_MODEL || 'bbox/face_yolov8m.pt',
      configured: Boolean(process.env.RUNPOD_ADETAILER_MODEL?.trim()),
    },
    {
      id: 'upscale',
      enabled: envFlag('RUNPOD_UPSCALE_READY'),
      nodePackage: 'ComfyUI built-in UpscaleModelLoader',
      model: process.env.RUNPOD_UPSCALE_MODEL || '4x-UltraSharp.pth',
      configured: Boolean(process.env.RUNPOD_UPSCALE_MODEL?.trim()),
    },
  ];
}

export function assertEnhancersReady(requested: Partial<Record<EnhancerId, boolean>>): void {
  const status = new Map(getEnhancerStatuses().map((item) => [item.id, item]));
  for (const id of ['controlnet', 'adetailer', 'upscale'] as const) {
    if (requested[id] && !status.get(id)?.enabled) {
      throw new Error(`${id} 未安装或未配置：请先执行 scripts/runpod/install-image-enhancers.sh 并设置 RUNPOD_${id.toUpperCase()}_READY=true`);
    }
  }
}

/**
 * Impact-Subpack UltralyticsDetectorProvider 强制按目录枚举模型
 * (bbox/ 或 segm/)。如果 env 变量只填了裸文件名（例如
 * `face_yolov8m.pt`），自动补上 `bbox/` 前缀避免 worker 上
 * `value_not_in_list` 报错。已带前缀的保持不动。
 *
 * 集中在此供 `buildFluxWorkflow` (runpod.ts) 与
 * `applyFaceDetailer` (comfy-builders/enhance-blocks.ts) 共用，避免
 * 两条 workflow 构建路径出现行为漂移。
 */
export function normalizeAdetailerModelName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('bbox/') || trimmed.startsWith('segm/')) return trimmed;
  return `bbox/${trimmed}`;
}
