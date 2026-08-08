/**
 * Unified Image Generation Router
 *
 * Multi-provider routing with automatic timeout-based failover:
 *   RunPod (primary, LoRA support) → fal.ai (fast fallback, 3-5s)
 *
 * Features:
 *   - Circuit breaker per provider (opens after N failures, auto-resets)
 *   - Configurable timeout before switching to next provider
 *   - Queue-aware: if RunPod returns IN_QUEUE, can auto-switch to fal.ai
 *   - Admin-configurable via site_settings (provider_routes)
 *   - Detailed logging for observability
 */

import { logger } from '@/lib/logger';
import { isGpuCapacityError, runpodClient } from '@/lib/runpod';
import { falGenerate, isFalConfigured } from '@/lib/fal-client';
import type { ImageModelFamily } from '@/lib/image-generation-routing';

// ─── Types ───────────────────────────────────────────────────

export type ImageProvider = 'runpod' | 'fal' | 'runpod_dc2' | 'together';

export interface ImageRouteConfig {
  id: string;
  provider: ImageProvider;
  label: string;
  enabled: boolean;
  priority: number; // lower = tried first
  timeout_ms: number; // max wait before switching
  /** If RunPod returns IN_QUEUE and this is true, immediately try next provider */
  switch_on_queue: boolean;
  /** Circuit breaker: open after this many consecutive failures */
  failure_threshold: number;
  /** Circuit breaker: reset after this many ms */
  reset_ms: number;
  /** Supports LoRA (only RunPod self-hosted) */
  supports_lora: boolean;
  /** Supports img2img reference */
  supports_reference: boolean;
  /** NSFW capable */
  nsfw_capable: boolean;
  /** Optional endpoint override env var */
  endpoint_env?: string;
  notes?: string;
}

export interface ImageRouterOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  /** Reference image for character consistency */
  image_url?: string;
  strength?: number;
  /** Identity reference for txt2img. Preserves identity without copying composition. */
  ip_adapter_image?: string;
  ip_adapter_weight?: number;
  /** LoRA stack (only used if provider supports it) */
  loras?: Array<{ name: string; strength_model?: number; strength_clip?: number }>;
  /** Checkpoint name */
  ckpt_name?: string;
  sampler_name?: string;
  scheduler?: string;
  clip_skip?: number;
  model_family?: ImageModelFamily;
  /** Force a specific provider (admin override) */
  force_provider?: ImageProvider;
  /** Whether NSFW content is requested */
  nsfw?: boolean;
  /** Endpoint ID override for RunPod */
  endpoint_id?: string;
}

export function shouldSwitchFromQueuedRunPod(
  route: Pick<ImageRouteConfig, 'switch_on_queue'>,
  needsLora: boolean,
): boolean {
  return route.switch_on_queue && !needsLora;
}

export interface ImageRouterResult {
  images: string[]; // base64 or URLs
  provider: ImageProvider;
  latency_ms: number;
  seed?: number;
  /** True if we switched away from the primary provider */
  fallback_used: boolean;
  /** Which providers were tried and failed */
  attempts: Array<{ provider: ImageProvider; success: boolean; error?: string; latency_ms: number }>;
  /** If RunPod returned a job for polling */
  pending?: boolean;
  job_id?: string;
}

// ─── Circuit Breaker ─────────────────────────────────────────

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const circuits = new Map<string, CircuitState>();

function isCircuitOpen(config: ImageRouteConfig): boolean {
  const state = circuits.get(config.id);
  if (!state?.openedAt) return false;
  if (Date.now() - state.openedAt >= config.reset_ms) {
    circuits.delete(config.id);
    return false;
  }
  return true;
}

function recordFailure(config: ImageRouteConfig): void {
  const state = circuits.get(config.id) || { failures: 0, openedAt: null };
  state.failures += 1;
  if (state.failures >= config.failure_threshold) {
    state.openedAt = Date.now();
    logger.warn('[image-router] circuit opened', { provider: config.id, failures: state.failures });
  }
  circuits.set(config.id, state);
}

function recordSuccess(config: ImageRouteConfig): void {
  circuits.delete(config.id);
}

/** Open the circuit immediately for systemic GPU-capacity failures. */
function openCircuit(config: ImageRouteConfig): void {
  const state = circuits.get(config.id) || { failures: 0, openedAt: null };
  state.failures = config.failure_threshold;
  state.openedAt = Date.now();
  circuits.set(config.id, state);
  logger.warn('[image-router] circuit opened (gpu capacity)', { provider: config.id });
}

// ─── Default Route Configuration ─────────────────────────────

export const DEFAULT_IMAGE_ROUTES: ImageRouteConfig[] = [
  {
    id: 'together-flux-primary',
    provider: 'together',
    label: 'Together FLUX Schnell (Free, SFW)',
    enabled: true,
    priority: 1,
    timeout_ms: 45_000,
    switch_on_queue: false,
    failure_threshold: 5,
    reset_ms: 30_000,
    supports_lora: false,
    supports_reference: false,
    nsfw_capable: false,
    notes: 'FREE FLUX.1-schnell. 3-5s inference. SFW primary — no GPU cost.',
  },
  {
    id: 'fal-fast',
    provider: 'fal',
    label: 'fal.ai FLUX (SFW emergency fallback)',
    enabled: true,
    priority: 5,
    timeout_ms: 60_000,
    switch_on_queue: false,
    failure_threshold: 5,
    reset_ms: 30_000,
    supports_lora: false,
    supports_reference: true,
    nsfw_capable: false,
    notes: 'Fast SFW fallback only. It cannot preserve the local character LoRA stack.',
  },
  {
    id: 'runpod-lora',
    provider: 'runpod',
    label: 'RunPod FLUX (SFW + product LoRAs)',
    enabled: true,
    priority: 10,
    timeout_ms: 30_000,
    switch_on_queue: true,
    failure_threshold: 3,
    reset_ms: 60_000,
    supports_lora: true,
    supports_reference: true,
    nsfw_capable: true,
    notes: 'Self-hosted FLUX for SFW companions, identity assets, 3D and product generation.',
  },
  {
    id: 'runpod-dc2',
    provider: 'runpod_dc2',
    label: 'RunPod Pony / Illustrious',
    enabled: true,
    priority: 15,
    timeout_ms: 30_000,
    switch_on_queue: true,
    failure_threshold: 3,
    reset_ms: 60_000,
    supports_lora: true,
    supports_reference: true,
    nsfw_capable: true,
    endpoint_env: 'RUNPOD_ENDPOINT_ID_SDXL',
    notes: 'Dedicated SDXL endpoint: Pony for adult realism/transgender; Illustrious for 2D.',
  },
];

// ─── Route Loading (from site_settings or defaults) ──────────

let routeCache: { routes: ImageRouteConfig[]; at: number } | null = null;
const ROUTE_CACHE_MS = 15_000;

export function getImageRoutes(): ImageRouteConfig[] {
  if (routeCache && Date.now() - routeCache.at < ROUTE_CACHE_MS) {
    return routeCache.routes;
  }
  routeCache = { routes: DEFAULT_IMAGE_ROUTES, at: Date.now() };
  return routeCache.routes;
}

export function setImageRoutesCache(routes: ImageRouteConfig[]): void {
  routeCache = { routes, at: Date.now() };
}

export function invalidateImageRouteCache(): void {
  routeCache = null;
}

// ─── Provider Executors ──────────────────────────────────────

async function executeRunPod(
  config: ImageRouteConfig,
  opts: ImageRouterOptions,
): Promise<{ images: string[]; pending?: boolean; job_id?: string; seed?: number }> {
  const endpointId = config.endpoint_env
    ? process.env[config.endpoint_env] || opts.endpoint_id
    : opts.endpoint_id;

  const gen = await runpodClient.generate({
    prompt: opts.prompt,
    negative_prompt: opts.negative_prompt,
    input_image: config.supports_reference ? opts.image_url : undefined,
    denoising_strength: opts.image_url ? (opts.strength ?? 0.78) : undefined,
    ip_adapter_image: config.supports_reference ? opts.ip_adapter_image : undefined,
    ip_adapter_weight: opts.ip_adapter_image ? (opts.ip_adapter_weight ?? 0.7) : undefined,
    width: opts.width || 704,
    height: opts.height || 960,
    num_images: 1,
    seed: opts.seed,
    num_inference_steps: opts.num_inference_steps || 20,
    guidance_scale: opts.guidance_scale ?? 2.5,
    endpoint_id: endpointId || undefined,
    ckpt_name: opts.ckpt_name,
    loras: config.supports_lora && opts.loras?.length
      ? opts.loras.map((l) => ({
          name: l.name,
          strength_model: l.strength_model,
          strength_clip: l.strength_clip,
        }))
      : undefined,
    sampler_name: opts.sampler_name,
    scheduler: opts.scheduler,
    clip_skip: opts.clip_skip,
    model_family: opts.model_family,
    submit_only: true,
  });

  if (gen.pending) {
    return { images: [], pending: true, job_id: gen.job_id };
  }

  return { images: gen.images || [], seed: opts.seed };
}

async function executeFal(
  _config: ImageRouteConfig,
  opts: ImageRouterOptions,
): Promise<{ images: string[]; seed?: number }> {
  const result = await falGenerate({
    prompt: opts.prompt,
    negative_prompt: opts.negative_prompt,
    width: opts.width || 704,
    height: opts.height || 960,
    num_inference_steps: opts.num_inference_steps || 28,
    guidance_scale: opts.guidance_scale ?? 3.5,
    seed: opts.seed,
    image_url: opts.image_url,
    strength: opts.image_url ? (opts.strength ?? 0.75) : undefined,
    model: 'dev',
  });

  return { images: result.images, seed: result.seed };
}

async function executeTogether(
  _config: ImageRouteConfig,
  opts: ImageRouterOptions,
): Promise<{ images: string[]; seed?: number }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error('TOGETHER_API_KEY not configured');

  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'black-forest-labs/FLUX.1-schnell-Free',
      prompt: opts.prompt,
      width: opts.width || 704,
      height: opts.height || 960,
      steps: opts.num_inference_steps || 4,
      n: 1,
      seed,
    }),
    signal: AbortSignal.timeout(40_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Together FLUX HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> };
  const images: string[] = [];
  for (const item of data.data || []) {
    if (item.url) images.push(item.url);
    else if (item.b64_json) images.push(item.b64_json);
  }
  if (!images.length) throw new Error('Together FLUX returned no images');
  return { images, seed };
}

// ─── Main Router ─────────────────────────────────────────────

/**
 * Route an image generation request through available providers.
 * Tries providers in priority order with timeout-based failover.
 */
export async function routeImageGeneration(opts: ImageRouterOptions): Promise<ImageRouterResult> {
  const started = Date.now();
  const attempts: ImageRouterResult['attempts'] = [];

  // Get sorted, enabled routes
  let routes = getImageRoutes()
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Filter by NSFW capability if needed
  if (opts.nsfw) {
    routes = routes.filter((r) => r.nsfw_capable);
  }

  // Force provider override (admin testing)
  if (opts.force_provider) {
    routes = routes.filter((r) => r.provider === opts.force_provider);
    if (!routes.length) {
      throw new Error(`Forced provider '${opts.force_provider}' not available or disabled`);
    }
  }

  // Skip providers that need LoRA but don't support it
  const needsLora = (opts.loras?.length ?? 0) > 0;

  let lastError: Error | null = null;

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];

    // Skip if circuit is open
    if (isCircuitOpen(route)) {
      attempts.push({ provider: route.provider, success: false, error: 'circuit_open', latency_ms: 0 });
      logger.info('[image-router] skipping (circuit open)', { provider: route.id });
      continue;
    }

    // Skip fal.ai if not configured
    if (route.provider === 'fal' && !isFalConfigured()) {
      attempts.push({ provider: route.provider, success: false, error: 'not_configured', latency_ms: 0 });
      continue;
    }

    // If LoRA is required and provider doesn't support it, skip unless last resort
    if (needsLora && !route.supports_lora && i < routes.length - 1) {
      const remaining = routes.slice(i + 1).filter((r) => r.supports_lora);
      if (remaining.length > 0) {
        attempts.push({ provider: route.provider, success: false, error: 'no_lora_support', latency_ms: 0 });
        continue;
      }
    }

    const attemptStart = Date.now();
    logger.info('[image-router] trying provider', {
      provider: route.id,
      priority: route.priority,
      timeout_ms: route.timeout_ms,
    });

    try {
      let result: { images: string[]; pending?: boolean; job_id?: string; seed?: number };

      if (route.provider === 'runpod' || route.provider === 'runpod_dc2') {
        // Race RunPod against timeout
        result = await Promise.race([
          executeRunPod(route, opts),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`timeout:${route.timeout_ms}ms`)), route.timeout_ms),
          ),
        ]);

        // If RunPod queued and switch_on_queue is enabled, try next provider
        // But never switch if force_provider is set or no remaining providers exist
        const hasRemainingProviders = i + 1 < routes.length;
        if (result.pending && shouldSwitchFromQueuedRunPod(route, needsLora) && !opts.force_provider && hasRemainingProviders) {
          const queueLatency = Date.now() - attemptStart;
          attempts.push({ provider: route.provider, success: false, error: 'queued_switch', latency_ms: queueLatency });
          logger.info('[image-router] RunPod queued, switching to next provider', {
            provider: route.id,
            job_id: result.job_id,
            queue_latency_ms: queueLatency,
          });
          continue;
        }

        // If pending but switch_on_queue is false, return the job for polling
        if (result.pending) {
          recordSuccess(route);
          return {
            images: [],
            provider: route.provider,
            latency_ms: Date.now() - started,
            seed: opts.seed,
            fallback_used: attempts.some((a) => !a.success),
            attempts,
            pending: true,
            job_id: result.job_id,
          };
        }
      } else if (route.provider === 'fal') {
        result = await executeFal(route, opts);
      } else if (route.provider === 'together') {
        result = await executeTogether(route, opts);
      } else {
        throw new Error(`Unknown provider: ${route.provider}`);
      }

      if (!result.images?.length) {
        throw new Error('No images returned');
      }

      // Success!
      recordSuccess(route);
      const latency = Date.now() - attemptStart;
      attempts.push({ provider: route.provider, success: true, latency_ms: latency });
      logger.info('[image-router] success', {
        provider: route.id,
        latency_ms: latency,
        total_ms: Date.now() - started,
        fallback_used: attempts.filter((a) => !a.success).length > 0,
      });

      return {
        images: result.images,
        provider: route.provider,
        latency_ms: Date.now() - started,
        seed: result.seed ?? opts.seed,
        fallback_used: attempts.filter((a) => !a.success).length > 0,
        attempts,
      };
    } catch (error) {
      const latency = Date.now() - attemptStart;
      const errMsg = error instanceof Error ? error.message : String(error);
      attempts.push({ provider: route.provider, success: false, error: errMsg, latency_ms: latency });
      lastError = error instanceof Error ? error : new Error(errMsg);

      // Don't open circuit for timeouts (transient) — only for real failures.
      // GPU-capacity errors (OOM / no workers / 429-5xx) are systemic: open the
      // circuit at once so later requests skip the dead endpoint.
      if (isGpuCapacityError(errMsg) && (route.provider === 'runpod' || route.provider === 'runpod_dc2')) {
        openCircuit(route);
      } else if (!errMsg.startsWith('timeout:') && errMsg !== 'queued_switch') {
        recordFailure(route);
      }

      logger.warn('[image-router] provider failed, trying next', {
        provider: route.id,
        error: errMsg,
        latency_ms: latency,
      });
    }
  }

  // All providers exhausted
  logger.error('[image-router] all providers failed', {
    attempts: attempts.map((a) => ({ p: a.provider, e: a.error })),
    total_ms: Date.now() - started,
  });

  throw lastError || new Error('All image providers failed');
}

// ─── Health Check (for admin dashboard) ──────────────────────

export interface ImageProviderHealth {
  id: string;
  provider: ImageProvider;
  label: string;
  enabled: boolean;
  circuit_open: boolean;
  failures: number;
  configured: boolean;
}

export function getImageProviderHealth(): ImageProviderHealth[] {
  const routes = getImageRoutes();
  return routes.map((r) => {
    const state = circuits.get(r.id);
    const configured =
      r.provider === 'fal' ? isFalConfigured() :
      r.provider === 'runpod' ? !!process.env.RUNPOD_API_KEY :
      r.provider === 'runpod_dc2' ? !!(r.endpoint_env && process.env[r.endpoint_env]) :
      r.provider === 'together' ? !!process.env.TOGETHER_API_KEY :
      false;
    return {
      id: r.id,
      provider: r.provider,
      label: r.label,
      enabled: r.enabled,
      circuit_open: isCircuitOpen(r),
      failures: state?.failures || 0,
      configured,
    };
  });
}
