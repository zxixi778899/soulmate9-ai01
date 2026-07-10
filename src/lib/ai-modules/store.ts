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
    return deepMerge(createDefaultAiModules() as any, parsed as any) as AiModulesConfig;
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
        const merged = deepMerge(createDefaultAiModules() as any, value as any) as AiModulesConfig;
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
    version: config.version || 1,
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
