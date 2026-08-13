export type EnhancerId = 'controlnet' | 'adetailer' | 'upscale';

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
      model: process.env.RUNPOD_ADETAILER_MODEL || 'face_yolov8m.pt',
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
