/**
 * Provider Routes Store
 *
 * Persists image + LLM provider routing configuration in site_settings.
 * Admin can add/modify/prioritize/enable-disable routes without redeployment.
 *
 * Key: 'provider_routes' in site_settings table.
 * Fallback: data/provider-routes.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import {
  DEFAULT_IMAGE_ROUTES,
  setImageRoutesCache,
  invalidateImageRouteCache,
  type ImageRouteConfig,
} from '@/lib/image-router-config';

export const PROVIDER_ROUTES_KEY = 'provider_routes';

// ─── LLM Route Config ────────────────────────────────────────

export interface LlmRouteConfig {
  id: string;
  label: string;
  provider: 'runpod' | 'together' | 'openrouter' | 'openai' | 'anthropic';
  model_id: string;
  enabled: boolean;
  priority: number;
  nsfw_capable: boolean;
  /** Which tiers can use this route */
  tiers: string[];
  /** Channel: sfw, nsfw, or both */
  channel: 'sfw' | 'nsfw' | 'both';
  timeout_ms: number;
  failure_threshold: number;
  reset_ms: number;
  api_base_url?: string;
  api_base_env?: string;
  api_key_env?: string;
  notes?: string;
}

export interface ProviderRoutesConfig {
  version: number;
  updated_at: string;
  image_routes: ImageRouteConfig[];
  llm_routes: LlmRouteConfig[];
  /** Global settings */
  settings: {
    /** Max time to wait before showing "switching provider" to user */
    user_notify_switch_ms: number;
    /** Enable automatic failover (if false, only manual routing) */
    auto_failover: boolean;
    /** Log all routing decisions to ai_model_usage_logs */
    verbose_logging: boolean;
  };
}

export const DEFAULT_LLM_ROUTES: LlmRouteConfig[] = [
  {
    id: 'runpod-nsfw-primary',
    label: 'RunPod Qwen3.5 9B Abliterated (NSFW Primary)',
    provider: 'runpod',
    model_id: 'soulmate-qwen35-9b-nsfw',
    enabled: true,
    priority: 1,
    nsfw_capable: true,
    tiers: ['pro', 'unlimited', 'admin'],
    channel: 'nsfw',
    timeout_ms: 25000,
    failure_threshold: 3,
    reset_ms: 60000,
    api_base_env: 'RUNPOD_PRO_CHAT_URL',
    api_key_env: 'RUNPOD_VLLM_API_KEY',
    notes: 'Self-hosted uncensored Qwen. Best NSFW quality.',
  },
  {
    id: 'runpod-nsfw-30b',
    label: 'RunPod Qwen3 30B Roleplay (NSFW Premium)',
    provider: 'runpod',
    model_id: 'soulmate-qwen3-30b-roleplay',
    enabled: true,
    priority: 2,
    nsfw_capable: true,
    tiers: ['unlimited', 'admin'],
    channel: 'nsfw',
    timeout_ms: 60000,
    failure_threshold: 3,
    reset_ms: 120000,
    api_base_env: 'RUNPOD_UNLIMITED_CHAT_URL',
    api_key_env: 'RUNPOD_VLLM_API_KEY',
    notes: 'Qwen3-30B-A3B MoE on 80GB A100. Cold start 5min. Higher quality for Unlimited.',
  },
  {
    id: 'runpod-dc2-nsfw',
    label: 'RunPod DC2 Qwen3 (NSFW Backup)',
    provider: 'runpod',
    model_id: 'soulmate-qwen3-dc2',
    enabled: false,
    priority: 5,
    nsfw_capable: true,
    tiers: ['pro', 'unlimited', 'admin'],
    channel: 'nsfw',
    timeout_ms: 25000,
    failure_threshold: 3,
    reset_ms: 90000,
    api_base_env: 'RUNPOD_DC2_CHAT_URL',
    api_key_env: 'RUNPOD_VLLM_API_KEY',
    notes: 'DISABLED: US-TX-3 no GPU supply. Enable when 32GB+ GPU available.',
  },
  {
    id: 'openrouter-lumimaid',
    label: 'OpenRouter Lumimaid 9B (NSFW Fallback)',
    provider: 'openrouter',
    model_id: 'lumimaid-v02-9b',
    enabled: true,
    priority: 10,
    nsfw_capable: true,
    tiers: ['pro', 'unlimited', 'admin'],
    channel: 'nsfw',
    timeout_ms: 30000,
    failure_threshold: 3,
    reset_ms: 60000,
    api_base_url: 'https://openrouter.ai/api/v1',
    api_key_env: 'OPENROUTER_API_KEY',
    notes: 'Uncensored NSFW fallback when all RunPod endpoints are down.',
  },
  {
    id: 'openrouter-noromaid',
    label: 'OpenRouter Noromaid 20B (NSFW Quality Fallback)',
    provider: 'openrouter',
    model_id: 'noromaid-20b',
    enabled: true,
    priority: 12,
    nsfw_capable: true,
    tiers: ['unlimited', 'admin'],
    channel: 'nsfw',
    timeout_ms: 35000,
    failure_threshold: 3,
    reset_ms: 60000,
    api_base_url: 'https://openrouter.ai/api/v1',
    api_key_env: 'OPENROUTER_API_KEY',
    notes: 'Higher quality NSFW fallback for Unlimited.',
  },
  {
    id: 'together-sfw-primary',
    label: 'Together Qwen3 235B (SFW Primary)',
    provider: 'together',
    model_id: 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput',
    enabled: true,
    priority: 1,
    nsfw_capable: false,
    tiers: ['pro', 'unlimited', 'admin'],
    channel: 'sfw',
    timeout_ms: 30000,
    failure_threshold: 3,
    reset_ms: 60000,
    api_base_url: 'https://api.together.xyz/v1',
    api_key_env: 'TOGETHER_API_KEY',
    notes: 'High quality SFW roleplay.',
  },
  {
    id: 'together-sfw-economy',
    label: 'Together Qwen3.5 9B (SFW Economy)',
    provider: 'together',
    model_id: 'Qwen/Qwen3.5-9B',
    enabled: true,
    priority: 1,
    nsfw_capable: false,
    tiers: ['free', 'basic'],
    channel: 'sfw',
    timeout_ms: 25000,
    failure_threshold: 3,
    reset_ms: 60000,
    api_base_url: 'https://api.together.xyz/v1',
    api_key_env: 'TOGETHER_API_KEY',
    notes: 'Cheap SFW chat for free/basic tiers.',
  },
];

function createDefaultConfig(): ProviderRoutesConfig {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    image_routes: DEFAULT_IMAGE_ROUTES,
    llm_routes: DEFAULT_LLM_ROUTES,
    settings: {
      user_notify_switch_ms: 8000,
      auto_failover: true,
      verbose_logging: true,
    },
  };
}

// ─── Persistence ─────────────────────────────────────────────

function filePath(): string {
  return path.join(process.cwd(), 'data', 'provider-routes.json');
}

let memoryCache: { config: ProviderRoutesConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadProviderRoutes(supabase?: SiteSettingsClient): Promise<ProviderRoutesConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', PROVIDER_ROUTES_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const config = mergeWithDefaults(value as Partial<ProviderRoutesConfig>);
        memoryCache = { config, at: Date.now() };
        // Sync image router cache
        setImageRoutesCache(config.image_routes);
        return config;
      }
    } catch (e) {
      logger.warn('[provider-routes] db load failed', { err: String(e) });
    }
  }

  // File fallback
  try {
    const raw = await readFile(filePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProviderRoutesConfig>;
    const config = mergeWithDefaults(parsed);
    memoryCache = { config, at: Date.now() };
    setImageRoutesCache(config.image_routes);
    return config;
  } catch {
    const config = createDefaultConfig();
    memoryCache = { config, at: Date.now() };
    return config;
  }
}

export async function saveProviderRoutes(
  config: ProviderRoutesConfig,
  supabase?: SiteSettingsClient,
): Promise<{ source: 'db' | 'file' }> {
  const next: ProviderRoutesConfig = {
    ...config,
    version: 1,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        { key: PROVIDER_ROUTES_KEY, value: next, updated_at: next.updated_at },
        { onConflict: 'key' },
      );
      if (!error) {
        memoryCache = { config: next, at: Date.now() };
        setImageRoutesCache(next.image_routes);
        invalidateImageRouteCache();
        // Mirror to file
        await saveToFile(next).catch(() => undefined);
        return { source: 'db' };
      }
    } catch (e) {
      logger.warn('[provider-routes] db save failed', { err: String(e) });
    }
  }

  await saveToFile(next);
  memoryCache = { config: next, at: Date.now() };
  setImageRoutesCache(next.image_routes);
  invalidateImageRouteCache();
  return { source: 'file' };
}

async function saveToFile(config: ProviderRoutesConfig): Promise<void> {
  const dir = path.dirname(filePath());
  await mkdir(dir, { recursive: true });
  await writeFile(filePath(), JSON.stringify(config, null, 2), 'utf8');
}

function mergeWithDefaults(raw: Partial<ProviderRoutesConfig>): ProviderRoutesConfig {
  const defaults = createDefaultConfig();
  return {
    version: raw.version || 1,
    updated_at: raw.updated_at || new Date().toISOString(),
    image_routes: Array.isArray(raw.image_routes) && raw.image_routes.length
      ? raw.image_routes
      : defaults.image_routes,
    llm_routes: Array.isArray(raw.llm_routes) && raw.llm_routes.length
      ? raw.llm_routes
      : defaults.llm_routes,
    settings: { ...defaults.settings, ...(raw.settings || {}) },
  };
}

export function invalidateProviderRoutesCache(): void {
  memoryCache = null;
  invalidateImageRouteCache();
}
