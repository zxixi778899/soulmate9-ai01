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
import {
  getBreakerState,
  memoryGetBreaker,
  openBreakerNow,
  recordBreakerFailure,
  resetBreaker,
} from '@/lib/image-breaker-store';
import {
  getImageRoutes,
  stampImageRouteCache,
  getImageRouteCacheTtlMs,
  getImageRouteCacheAt,
  type ImageProvider,
  type ImageRouteConfig,
} from '@/lib/image-router-config';

// Re-export types/config so existing consumers keep working.
export type { ImageProvider, ImageRouteConfig } from '@/lib/image-router-config';
export {
  DEFAULT_IMAGE_ROUTES,
  getImageRoutes,
  setImageRoutesCache,
  invalidateImageRouteCache,
} from '@/lib/image-router-config';

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
// Shared across instances via Upstash Redis (image-breaker-store); the local
// memory mirror serves hot-path health reads and the no-Redis fallback.

async function isCircuitOpen(config: ImageRouteConfig): Promise<boolean> {
  const state = await getBreakerState(config.id);
  if (!state?.openedAt) return false;
  if (Date.now() - state.openedAt >= config.reset_ms) {
    await resetBreaker(config.id);
    return false;
  }
  return true;
}

async function recordFailure(config: ImageRouteConfig): Promise<void> {
  const state = await recordBreakerFailure(config.id, config.failure_threshold, config.reset_ms);
  if (state.openedAt && state.failures >= config.failure_threshold) {
    logger.warn('[image-router] circuit opened', { provider: config.id, failures: state.failures });
  }
}

async function recordSuccess(config: ImageRouteConfig): Promise<void> {
  await resetBreaker(config.id);
}

/** Open the circuit immediately for systemic GPU-capacity failures. */
async function openCircuit(config: ImageRouteConfig): Promise<void> {
  await openBreakerNow(config.id, config.failure_threshold, config.reset_ms);
  logger.warn('[image-router] circuit opened (gpu capacity)', { provider: config.id });
}

// ─── Route Loading (from site_settings or defaults) ──────────

/**
 * Ensure admin-configured provider routes (site_settings `provider_routes`)
 * are loaded before routing a request. Previously only admin routes called
 * loadProviderRoutes, so user-facing traffic always used the hardcoded
 * defaults. Dynamic imports keep this module free of a circular dependency
 * on provider-routes-store.
 */
export async function syncImageRoutesWithSettings(): Promise<void> {
  const routeCacheAt = getImageRouteCacheAt();
  if (routeCacheAt && Date.now() - routeCacheAt < getImageRouteCacheTtlMs()) return;
  try {
    const [{ loadProviderRoutes }, { getSupabaseClient }] = await Promise.all([
      import('@/lib/provider-routes-store'),
      import('@/storage/database/supabase-client'),
    ]);
    // Cast via unknown: full SupabaseClient generics are too deep for direct
    // structural matching against the duck-typed SiteSettingsClient (TS2589).
    await loadProviderRoutes(getSupabaseClient() as unknown as import('@/lib/site-settings-client').SiteSettingsClient);
    // loadProviderRoutes seeds setImageRoutesCache; stamp the refresh time so
    // we don't hit the DB again inside the TTL window.
    stampImageRouteCache();
  } catch (err) {
    // Keep serving defaults when the settings store is unavailable.
    stampImageRouteCache();
    logger.warn('[image-router] provider routes sync failed, using defaults', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
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

  // Apply admin-configured routes (site_settings) before selecting providers.
  await syncImageRoutesWithSettings();

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
    if (await isCircuitOpen(route)) {
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
          await recordSuccess(route);
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
      await recordSuccess(route);
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
        await openCircuit(route);
      } else if (!errMsg.startsWith('timeout:') && errMsg !== 'queued_switch') {
        await recordFailure(route);
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

/**
 * Synchronous health snapshot from the local memory mirror (admin panels).
 * The mirror is refreshed on every Redis read and always written on record.
 */
export function getImageProviderHealth(): ImageProviderHealth[] {
  const routes = getImageRoutes();
  return routes.map((r) => {
    const state = memoryGetBreaker(r.id);
    const configured =
      r.provider === 'fal' ? isFalConfigured() :
      r.provider === 'runpod' ? !!process.env.RUNPOD_API_KEY :
      r.provider === 'runpod_dc2' ? !!(r.endpoint_env && process.env[r.endpoint_env]) :
      r.provider === 'together' ? !!process.env.TOGETHER_API_KEY :
      false;
    const openedAt = state?.openedAt || null;
    const circuitOpen = !!openedAt && Date.now() - openedAt < r.reset_ms;
    return {
      id: r.id,
      provider: r.provider,
      label: r.label,
      enabled: r.enabled,
      circuit_open: circuitOpen,
      failures: state?.failures || 0,
      configured,
    };
  });
}

/** Async variant that pulls the shared Redis state first (cross-instance). */
export async function getImageProviderHealthAsync(): Promise<ImageProviderHealth[]> {
  await Promise.all(getImageRoutes().map((r) => getBreakerState(r.id)));
  return getImageProviderHealth();
}
