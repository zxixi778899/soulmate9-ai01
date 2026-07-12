/**
 * Persistent model library (Civitai picks + local catalog).
 * Stored in data/model-library.json and optionally site_settings.
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';
import type { NormalizedCivitaiItem } from '@/lib/civitai';
import { getCatalogLoras } from '@/lib/comfy-console/lora-catalog';

export const MODEL_LIBRARY_KEY = 'model_library';

export type LibraryItem = {
  id: string;
  kind: 'lora' | 'checkpoint' | 'other';
  label: string;
  filename: string;
  category: string;
  default_strength: number;
  nsfw: boolean;
  trigger_words: string[];
  usage?: string;
  source: 'catalog' | 'civitai' | 'manual';
  page_url?: string;
  download_url?: string;
  model_id?: number;
  version_id?: number;
  base_model?: string;
  preview_url?: string | null;
  status: 'wishlist' | 'queued' | 'downloaded' | 'failed';
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type ModelLibrary = {
  version: number;
  updated_at: string;
  items: LibraryItem[];
};

function filePath() {
  return path.join(process.cwd(), 'data', 'model-library.json');
}

function emptyLibrary(): ModelLibrary {
  return { version: 1, updated_at: new Date().toISOString(), items: [] };
}

function fromCatalog(): LibraryItem[] {
  const now = new Date().toISOString();
  return getCatalogLoras().map((l) => ({
    id: `catalog:${l.id}`,
    kind: 'lora' as const,
    label: l.label,
    filename: l.filename,
    category: l.category,
    default_strength: l.default_strength,
    nsfw: !!l.nsfw,
    trigger_words: l.trigger_words || [],
    usage: l.usage,
    source: 'catalog' as const,
    page_url: l.page_url,
    download_url: undefined,
    base_model: 'FLUX.1',
    preview_url: null,
    status: 'wishlist' as const,
    notes: l.search_keywords,
    created_at: now,
    updated_at: now,
  }));
}

export async function loadModelLibrary(supabase?: {
  from: (t: string) => any;
}): Promise<ModelLibrary> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MODEL_LIBRARY_KEY)
        .maybeSingle();
      if (!error && data?.value) {
        const val = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return normalizeLibrary(val);
      }
    } catch (e) {
      logger.warn('[model-library] db load failed', { err: String(e) });
    }
  }
  try {
    const raw = await readFile(filePath(), 'utf8');
    return normalizeLibrary(JSON.parse(raw));
  } catch {
    const lib = emptyLibrary();
    lib.items = fromCatalog();
    return lib;
  }
}

function normalizeLibrary(raw: Partial<ModelLibrary> | null): ModelLibrary {
  const base = emptyLibrary();
  const items = Array.isArray(raw?.items) ? (raw!.items as LibraryItem[]) : [];
  // Seed catalog entries if library empty
  if (!items.length) {
    base.items = fromCatalog();
    return base;
  }
  // Ensure catalog seeds exist (non-destructive)
  const have = new Set(items.map((i) => i.id));
  for (const c of fromCatalog()) {
    if (!have.has(c.id)) items.push(c);
  }
  return {
    version: Number(raw?.version) || 1,
    updated_at: raw?.updated_at || new Date().toISOString(),
    items,
  };
}

export async function saveModelLibrary(
  lib: ModelLibrary,
  supabase?: { from: (t: string) => any },
): Promise<{ source: 'db' | 'file' }> {
  const next: ModelLibrary = {
    ...lib,
    updated_at: new Date().toISOString(),
  };
  if (supabase) {
    try {
      const { error } = await supabase.from('site_settings').upsert(
        { key: MODEL_LIBRARY_KEY, value: next, updated_at: next.updated_at },
        { onConflict: 'key' },
      );
      if (!error) {
        await mkdir(path.dirname(filePath()), { recursive: true }).catch(() => undefined);
        await writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8').catch(() => undefined);
        return { source: 'db' };
      }
    } catch (e) {
      logger.warn('[model-library] db save failed', { err: String(e) });
    }
  }
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8');
  return { source: 'file' };
}

export function libraryItemFromCivitai(
  item: NormalizedCivitaiItem,
  opts?: { category?: string; strength?: number; status?: LibraryItem['status'] },
): LibraryItem {
  const now = new Date().toISOString();
  const kind: LibraryItem['kind'] =
    /checkpoint/i.test(item.type) ? 'checkpoint' : /lora/i.test(item.type) ? 'lora' : 'other';
  return {
    id: `civitai:${item.model_id}:${item.version_id}`,
    kind,
    label: item.name,
    filename: item.filename,
    category: opts?.category || guessCategory(item),
    default_strength: opts?.strength ?? (kind === 'lora' ? 0.7 : 1),
    nsfw: item.nsfw,
    trigger_words: item.trigger_words,
    usage: `Imported from Civitai · ${item.base_model || 'unknown base'}`,
    source: 'civitai',
    page_url: item.page_url,
    download_url: item.download_url,
    model_id: item.model_id,
    version_id: item.version_id,
    base_model: item.base_model,
    preview_url: item.preview_url,
    status: opts?.status || 'queued',
    notes: item.tags.slice(0, 8).join(', '),
    created_at: now,
    updated_at: now,
  };
}

function guessCategory(item: NormalizedCivitaiItem): string {
  const bag = `${item.name} ${item.tags.join(' ')} ${item.trigger_words.join(' ')}`.toLowerCase();
  if (/body|curvy|slim|athletic|hourglass/.test(bag)) return 'body';
  if (/pose|cowgirl|missionary|nsfw|sex|oral|ahegao/.test(bag)) return 'action';
  if (/outfit|dress|lingerie|suit|clothes/.test(bag)) return 'outfit';
  if (/prop|weapon|item|object/.test(bag)) return 'prop';
  if (/skin|detail|eye|face/.test(bag)) return 'detail';
  if (/style|realistic|anime/.test(bag)) return 'style';
  if (/checkpoint|flux/.test(bag) && /checkpoint/i.test(item.type)) return 'checkpoint';
  return 'style';
}

export function buildLoraUrlsTxt(items: LibraryItem[]): string {
  const lines = [
    '# Soulmate model library export — filename|url',
    '# Run on downloader pod:',
    '#   export CIVITAI_API_TOKEN=...',
    '#   ./download-loras.sh --from-file lora-urls.txt',
    '',
  ];
  for (const it of items) {
    if (!it.filename) continue;
    if (!it.download_url && !it.version_id) continue;
    const url =
      it.download_url ||
      (it.version_id ? `https://civitai.com/api/download/models/${it.version_id}` : '');
    if (!url) continue;
    lines.push(`${it.filename}|${url}`);
  }
  return lines.join('\n') + '\n';
}

/** Map library loras into Comfy LoraAsset-like objects */
export function libraryToComfyLoras(items: LibraryItem[]) {
  return items
    .filter((i) => i.kind === 'lora')
    .map((i) => ({
      id: i.id,
      label: i.label,
      filename: i.filename,
      default_strength: i.default_strength,
      tags: [i.category, ...(i.nsfw ? ['nsfw'] : []), i.source],
      category: i.category,
      nsfw: i.nsfw,
      usage: i.usage,
      trigger_words: i.trigger_words,
      page_url: i.page_url,
      search_keywords: i.notes,
      workflows: ['wf-girlfriend'],
    }));
}
