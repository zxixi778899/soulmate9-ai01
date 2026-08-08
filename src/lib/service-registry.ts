/**
 * AI Service Registry
 * Central reference for all RunPod/API endpoints used by Oxmate AI.
 * Used by admin dashboard for status display and health checks.
 */

export interface ServiceEndpoint {
  id: string;
  label: string;
  category: 'chat' | 'image' | 'voice' | 'video' | 'animation';
  provider: 'runpod' | 'together' | 'openrouter' | 'openai';
  endpoint_env: string;
  api_key_env: string;
  gpu_type?: string;
  model_name: string;
  status: 'active' | 'standby' | 'planned';
  cost_per_hour?: number;
  health_url?: string;
  notes?: string;
}

export const SERVICE_REGISTRY: ServiceEndpoint[] = [
  // ── Chat / LLM ──────────────────────────────────────────
  {
    id: 'vllm-8b-pro',
    label: 'vLLM Qwen3-8B Pro NSFW',
    category: 'chat',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_PRO_CHAT_URL',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB (ADA_24)',
    model_name: 'Qwen3-8B',
    status: 'active',
    cost_per_hour: 0.34,
    notes: 'Endpoint: m4va2u0uqugd9v. Workers 0-2. Primary NSFW chat. sampling_params嵌套.',
  },
  {
    id: 'vllm-30b-unlimited',
    label: 'vLLM Qwen3-30B Unlimited',
    category: 'chat',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_UNLIMITED_CHAT_URL',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '80GB (AMPERE_80 / A100)',
    model_name: 'Qwen3-30B-A3B (MoE)',
    status: 'active',
    cost_per_hour: 1.19,
    notes: 'Endpoint: pe83m495wybb9d. Workers 0-1. Premium roleplay / long context.',
  },

  // ── Image Generation ────────────────────────────────────
  {
    id: 'comfyui-flux-image',
    label: 'ComfyUI FLUX 生图',
    category: 'image',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_ENDPOINT_ID',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB (ADA_24)',
    model_name: 'FLUX.1-dev-fp8 / FLUX Unchained',
    status: 'active',
    cost_per_hour: 0.44,
    notes: 'SFW companion, identity portraits, 3D, outfit, prop and advert generation. FLUX LoRAs only.',
  },
  {
    id: 'comfyui-sdxl-image',
    label: 'ComfyUI SDXL 生图',
    category: 'image',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_ENDPOINT_ID_SDXL',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB+ (48GB recommended)',
    model_name: 'Pony Realism V2.2 + WAI Mature Illustrious V2',
    status: 'standby',
    cost_per_hour: 0.44,
    notes: 'Realistic NSFW/transgender/complex anatomy and 2D companion generation. SDXL LoRAs only.',
  },

  // ── Voice / TTS ─────────────────────────────────────────
  {
    id: 'fish-speech-tts',
    label: 'Fish-Speech TTS',
    category: 'voice',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_TTS_ENDPOINT_ID',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB (ADA_24)',
    model_name: 'fish-speech-1.5',
    status: 'active',
    cost_per_hour: 0.34,
    notes: 'Endpoint: ysbf487seprlal. Workers 0-2. 7情感TTS. API /api/ai/voice.',
  },

  // ── Animation ───────────────────────────────────────────
  // ── Video Generation ────────────────────────────────────
  {
    id: 'wan-video',
    label: 'Wan 2.2 视频生成',
    category: 'video',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_WAN_VIDEO_ENDPOINT',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '48GB+ (A6000 / A100)',
    model_name: 'Wan2.2-14B with LoRA',
    status: 'active',
    cost_per_hour: 0.79,
    notes: 'Primary user video route. Image-to-video first, 5s/10s presets, text-to-video admin-only.',
  },
];

/**
 * Returns services split by whether their required env vars are configured.
 */
export function getServiceStatus(): {
  configured: ServiceEndpoint[];
  unconfigured: ServiceEndpoint[];
} {
  const configured: ServiceEndpoint[] = [];
  const unconfigured: ServiceEndpoint[] = [];

  for (const svc of SERVICE_REGISTRY) {
    const endpointSet = !!process.env[svc.endpoint_env];
    const keySet = !!process.env[svc.api_key_env];
    if (endpointSet && keySet) {
      configured.push(svc);
    } else {
      unconfigured.push(svc);
    }
  }

  return { configured, unconfigured };
}

/**
 * Filter services by category.
 */
export function getServicesByCategory(
  category: ServiceEndpoint['category']
): ServiceEndpoint[] {
  return SERVICE_REGISTRY.filter((s) => s.category === category);
}

/**
 * Look up a single service by its id.
 */
export function getServiceById(id: string): ServiceEndpoint | undefined {
  return SERVICE_REGISTRY.find((s) => s.id === id);
}
