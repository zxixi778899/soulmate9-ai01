import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { createDefaultAiModules, AI_MODULES_SETTINGS_KEY } from './defaults';
import type { AiModulesConfig } from './types';
import { logger } from '@/lib/logger';

function filePath() {
  return path.join(process.cwd(), 'data', 'ai-modules.json');
}

let memoryCache: { config: AiModulesConfig; at: number } | null = null;
const CACHE_MS = 15_000;
/** Read v1 safely while activating the production-safe v2 routes. */
function normalizeAiModules(raw: Partial<AiModulesConfig>): AiModulesConfig {
  const defaults = createDefaultAiModules();
  const merged = deepMerge(defaults as unknown as Record<string, unknown>, raw as unknown as Record<string, unknown>) as unknown as AiModulesConfig;
  const customEndpoints = Array.isArray(raw.endpoints) ? raw.endpoints : [];
  merged.endpoints = [
    ...customEndpoints,
    ...defaults.endpoints.filter((candidate) => !customEndpoints.some((item) => item.id === candidate.id)),
  ];
  if ((raw.version || 1) < 2) {
    merged.version = 2;
    merged.chat = { ...merged.chat, ...defaults.chat, global_system_suffix: merged.chat.global_system_suffix || defaults.chat.global_system_suffix };
    merged.image.scenes = Object.fromEntries(Object.entries(defaults.image.scenes).map(([scene, config]) => [scene, { ...config, ...(merged.image.scenes[scene as keyof typeof merged.image.scenes] || {}) }])) as typeof merged.image.scenes;
  }
  return merged;
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (base as any)[k] === 'object') {
      (out as any)[k] = deepMerge((base as any)[k], v as any);
    } else if (v !== undefined) {
      (out as any)[k] = v;
    }
  }
  return out;
}

export async function loadAiModulesFromFile(): Promise<AiModulesConfig> {
  try {
    const raw = await readFile(filePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AiModulesConfig>;
    return normalizeAiModules(parsed);
  } catch {
    return createDefaultAiModules();
  }
}

export async function saveAiModulesToFile(config: AiModulesConfig): Promise<void> {
  const dir = path.dirname(filePath());
  await mkdir(dir, { recursive: true });
  await writeFile(filePath(), JSON.stringify(config, null, 2), 'utf8');
  memoryCache = { config, at: Date.now() };
}

/**
 * Load config: memory → optional supabase site_settings → file → defaults
 */
export async function loadAiModules(supabase?: {
  from: (t: string) => any;
}): Promise<AiModulesConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', AI_MODULES_SETTINGS_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const merged = normalizeAiModules(value as Partial<AiModulesConfig>);
        memoryCache = { config: merged, at: Date.now() };
        return merged;
      }
    } catch (e) {
      logger.warn('[ai-modules] db load failed, using file', { err: String(e) });
    }
  }

  const fileCfg = await loadAiModulesFromFile();
  memoryCache = { config: fileCfg, at: Date.now() };
  return fileCfg;
}

export async function saveAiModules(
  config: AiModulesConfig,
  supabase?: { from: (t: string) => any },
): Promise<{ source: 'db' | 'file' }> {
  const next = {
    ...config,
    version: 2,
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        {
          key: AI_MODULES_SETTINGS_KEY,
          value: next,
          updated_at: next.updated_at,
        },
        { onConflict: 'key' },
      );
      if (!error) {
        memoryCache = { config: next, at: Date.now() };
        // mirror to file for resilience
        await saveAiModulesToFile(next).catch(() => undefined);
        return { source: 'db' };
      }
    } catch (e) {
      logger.warn('[ai-modules] db save failed, using file', { err: String(e) });
    }
  }

  await saveAiModulesToFile(next);
  return { source: 'file' };
}

export function invalidateAiModulesCache() {
  memoryCache = null;
}
