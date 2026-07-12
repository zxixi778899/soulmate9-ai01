import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  createDefaultComfyConfig,
  COMFY_CONFIG_KEY,
  type ComfyConsoleConfig,
} from './defaults';
import { logger } from '@/lib/logger';
import { loadModelLibrary } from '@/lib/model-library';

export type { ComfyConsoleConfig };

function filePath() {
  return path.join(process.cwd(), 'data', 'comfy-console.json');
}

let cache: { cfg: ComfyConsoleConfig; at: number } | null = null;

function mergeDeep(base: ComfyConsoleConfig, patch: Partial<ComfyConsoleConfig>): ComfyConsoleConfig {
  // LoRA list always comes from catalog + model-library (base.loras already merged).
  // Keep user endpoint / workflow edits.
  return {
    ...base,
    ...patch,
    network_volume: { ...base.network_volume, ...(patch.network_volume || {}) },
    endpoints: patch.endpoints || base.endpoints,
    checkpoints: patch.checkpoints || base.checkpoints,
    loras: base.loras,
    lora_stacking_tips: base.lora_stacking_tips,
    lora_recipes: base.lora_recipes,
    lora_catalog_version: base.lora_catalog_version,
    workflows: patch.workflows || base.workflows,
  };
}

export async function loadComfyConfig(supabase?: { from: (t: string) => any }): Promise<ComfyConsoleConfig> {
  if (cache && Date.now() - cache.at < 10_000) return cache.cfg;

  const library = await loadModelLibrary(supabase).catch(() => ({ items: [] as never[] }));
  const libraryItems = (library as { items?: unknown[] }).items as import('@/lib/model-library').LibraryItem[] | undefined;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', COMFY_CONFIG_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const cfg = mergeDeep(createDefaultComfyConfig(libraryItems), val);
        cache = { cfg, at: Date.now() };
        return cfg;
      }
    } catch (e) {
      logger.warn('[comfy-console] db load failed', { err: String(e) });
    }
  }

  try {
    const raw = await readFile(filePath(), 'utf8');
    const cfg = mergeDeep(createDefaultComfyConfig(libraryItems), JSON.parse(raw));
    cache = { cfg, at: Date.now() };
    return cfg;
  } catch {
    const cfg = createDefaultComfyConfig(libraryItems);
    cache = { cfg, at: Date.now() };
    return cfg;
  }
}

export async function saveComfyConfig(
  cfg: ComfyConsoleConfig,
  supabase?: { from: (t: string) => any },
): Promise<{ source: 'db' | 'file' }> {
  // Keep LoRA list in sync with catalog + model-library on save.
  const library = await loadModelLibrary(supabase).catch(() => ({ items: [] as never[] }));
  const libraryItems = (library as { items?: unknown[] }).items as import('@/lib/model-library').LibraryItem[] | undefined;
  const fresh = createDefaultComfyConfig(libraryItems);
  const next: ComfyConsoleConfig = {
    ...cfg,
    updated_at: new Date().toISOString(),
    loras: fresh.loras,
    lora_stacking_tips: fresh.lora_stacking_tips,
    lora_recipes: fresh.lora_recipes,
    lora_catalog_version: fresh.lora_catalog_version,
  };
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
