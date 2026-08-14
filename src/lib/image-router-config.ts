/**
 * Image router configuration shared between the routing engine and the
 * provider-routes store. Keeping routes/types/cache here breaks the static
 * import cycle between `@/lib/image-router` and `@/lib/provider-routes-store`.
 */

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

let routeCache: { routes: ImageRouteConfig[]; at: number } | null = null;
const ROUTE_CACHE_MS = 15_000;

export function getImageRoutes(): ImageRouteConfig[] {
  return routeCache?.routes ?? DEFAULT_IMAGE_ROUTES;
}

export function setImageRoutesCache(routes: ImageRouteConfig[]): void {
  routeCache = { routes, at: Date.now() };
}

export function invalidateImageRouteCache(): void {
  routeCache = null;
}

export function getImageRouteCacheTtlMs(): number {
  return ROUTE_CACHE_MS;
}

export function getImageRouteCacheAt(): number | null {
  return routeCache?.at ?? null;
}

export function stampImageRouteCache(): void {
  routeCache = { routes: routeCache?.routes ?? DEFAULT_IMAGE_ROUTES, at: Date.now() };
}
