import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  createDefaultComfyConfig,
  COMFY_CONFIG_KEY,
  type ComfyConsoleConfig,
} from './defaults';
import { logger } from '@/lib/logger';

export type { ComfyConsoleConfig };

function filePath() {
  return path.join(process.cwd(), 'data', 'comfy-console.json');
}

let cache: { cfg: ComfyConsoleConfig; at: number } | null = null;

function mergeDeep(base: ComfyConsoleConfig, patch: Partial<ComfyConsoleConfig>): ComfyConsoleConfig {
  return {
    ...base,
    ...patch,
    network_volume: { ...base.network_volume, ...(patch.network_volume || {}) },
    endpoints: patch.endpoints || base.endpoints,
    checkpoints: patch.checkpoints || base.checkpoints,
    loras: patch.loras || base.loras,
    workflows: patch.workflows || base.workflows,
  };
}

export async function loadComfyConfig(supabase?: { from: (t: string) => any }): Promise<ComfyConsoleConfig> {
  if (cache && Date.now() - cache.at < 10_000) return cache.cfg;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', COMFY_CONFIG_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const cfg = mergeDeep(createDefaultComfyConfig(), val);
        cache = { cfg, at: Date.now() };
        return cfg;
      }
    } catch (e) {
      logger.warn('[comfy-console] db load failed', { err: String(e) });
    }
  }

  try {
    const raw = await readFile(filePath(), 'utf8');
    const cfg = mergeDeep(createDefaultComfyConfig(), JSON.parse(raw));
    cache = { cfg, at: Date.now() };
    return cfg;
  } catch {
    const cfg = createDefaultComfyConfig();
    cache = { cfg, at: Date.now() };
    return cfg;
  }
}

export async function saveComfyConfig(
  cfg: ComfyConsoleConfig,
  supabase?: { from: (t: string) => any },
): Promise<{ source: 'db' | 'file' }> {
  const next = { ...cfg, updated_at: new Date().toISOString() };
  if (supabase) {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        { key: COMFY_CONFIG_KEY, value: next, updated_at: next.updated_at },
        { onConflict: 'key' },
      );
      if (!error) {
        cache = { cfg: next, at: Date.now() };
        await mkdir(path.dirname(filePath()), { recursive: true }).catch(() => undefined);
        await writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8').catch(() => undefined);
        return { source: 'db' };
      }
    } catch (e) {
      logger.warn('[comfy-console] db save failed', { err: String(e) });
    }
  }
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8');
  cache = { cfg: next, at: Date.now() };
  return { source: 'file' };
}

export function invalidateComfyCache() {
  cache = null;
}
