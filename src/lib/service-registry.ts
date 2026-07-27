/**
 * AI Service Registry
 * Central reference for all RunPod/API endpoints used by SoulMate9.
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
    id: 'vllm-chat',
    label: 'vLLM Chat (Qwen3-8B)',
    category: 'chat',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_VLLM_URL',
    api_key_env: 'RUNPOD_VLLM_API_KEY',
    gpu_type: '24GB (RTX 4090)',
    model_name: 'Qwen3-8B',
    status: 'active',
    cost_per_hour: 0.34,
    notes: 'Primary NSFW-capable chat. Endpoint ID: 7dacw6sk3tp1vi',
  },
  {
    id: 'together-chat',
    label: 'Together AI Chat',
    category: 'chat',
    provider: 'together',
    endpoint_env: 'TOGETHER_MODEL',
    api_key_env: 'TOGETHER_API_KEY',
    model_name: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    status: 'active',
    notes: 'SFW fallback in LLM chain',
  },
  {
    id: 'openrouter-chat',
    label: 'OpenRouter Chat',
    category: 'chat',
    provider: 'openrouter',
    endpoint_env: 'OPENROUTER_API_KEY',
    api_key_env: 'OPENROUTER_API_KEY',
    model_name: 'various',
    status: 'active',
    notes: 'NSFW fallback / alternative routing',
  },

  // ── Image Generation ────────────────────────────────────
  {
    id: 'comfyui-image',
    label: 'ComfyUI Image Gen (FLUX+Pony+Illustrious)',
    category: 'image',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_ENDPOINT_ID',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB (RTX 4090)',
    model_name: 'FLUX.1-dev + Pony + Illustrious',
    status: 'active',
    cost_per_hour: 0.44,
    notes: 'Endpoint ID: comfyui-wozrrlcdipyl3p. Supports LoRA switching.',
  },

  // ── Voice / TTS ─────────────────────────────────────────
  {
    id: 'fish-speech-tts',
    label: 'Fish-Speech TTS',
    category: 'voice',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_TTS_ENDPOINT_ID',
    api_key_env: 'RUNPOD_TTS_API_KEY',
    gpu_type: '24GB (RTX 4090 / A5000)',
    model_name: 'fish-speech-1.5',
    status: 'standby',
    cost_per_hour: 0.34,
    notes: 'On-demand (minWorkers=0). API key falls back to RUNPOD_API_KEY.',
  },

  // ── Animation ───────────────────────────────────────────
  {
    id: 'animatediff-portraits',
    label: 'AnimateDiff Dynamic Portraits',
    category: 'animation',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_ANIMATEDIFF_ENDPOINT',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '24GB (A5000 / RTX 4090)',
    model_name: 'RealisticVision + AnimateDiff mm_sd_v15_v2',
    status: 'standby',
    cost_per_hour: 0.44,
    notes: 'On-demand (minWorkers=0). Uses soulmate-model network volume.',
  },

  // ── Video Generation (Future) ───────────────────────────
  {
    id: 'wan-video',
    label: 'Wan 2.1 Video Generation',
    category: 'video',
    provider: 'runpod',
    endpoint_env: 'RUNPOD_WAN_VIDEO_ENDPOINT',
    api_key_env: 'RUNPOD_API_KEY',
    gpu_type: '48GB+ (A6000 / A100)',
    model_name: 'Wan2.1-14B',
    status: 'planned',
    cost_per_hour: 0.79,
    notes: 'Phase 2. NOT YET CREATED. Requires 48GB+ VRAM.',
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
