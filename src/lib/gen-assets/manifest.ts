/**
 * Model asset manifest for the multi-model generation matrix
 * (gen_model_assets, migration 0041).
 *
 * Single readiness source for routing: before a request is submitted to an
 * endpoint we check the target checkpoint (and optional enhancement assets)
 * against this manifest. When the table is missing (migration not applied)
 * the manifest degrades to the legacy env inventory
 * (RUNPOD_SDXL_CHECKPOINTS / RUNPOD_*_LORAS) so behavior never regresses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export type ModelAssetType =
  | 'checkpoint'
  | 'lora'
  | 'controlnet'
  | 'upscaler'
  | 'embedding'
  | 'ipadapter'
  | 'detector';

export type ModelAssetFamily = 'flux' | 'sdxl' | 'illustrious' | 'pony' | 'any';

export interface ModelAsset {
  id: string;
  asset_type: ModelAssetType;
  model_family: ModelAssetFamily;
  name: string;
  endpoint_scope: string;
  civitai_source: string | null;
  tags: string[];
  installed: boolean;
  verified: boolean;
  nsfw: boolean;
  notes: string;
  sort_order: number;
  is_active: boolean;
}

const ASSET_TYPES: readonly ModelAssetType[] = [
  'checkpoint', 'lora', 'controlnet', 'upscaler', 'embedding', 'ipadapter', 'detector',
];
const ASSET_FAMILIES: readonly ModelAssetFamily[] = [
  'flux', 'sdxl', 'illustrious', 'pony', 'any',
];

/** Defensive row → ModelAsset mapping (missing columns degrade gracefully). */
export function assetFromRow(row: unknown): ModelAsset | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const assetType = r.asset_type as ModelAssetType;
  if (!ASSET_TYPES.includes(assetType) || !r.name) return null;
  const family = r.model_family as ModelAssetFamily;
  return {
    id: String(r.id || `asset-${assetType}-${r.name}`),
    asset_type: assetType,
    model_family: ASSET_FAMILIES.includes(family) ? family : 'any',
    name: String(r.name),
    endpoint_scope: String(r.endpoint_scope || 'any'),
    civitai_source: r.civitai_source != null ? String(r.civitai_source) : null,
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    installed: r.installed === true,
    verified: r.verified === true,
    nsfw: r.nsfw === true,
    notes: String(r.notes || ''),
    sort_order: Number(r.sort_order || 0),
    is_active: r.is_active !== false,
  };
}

/** True when an error means the gen_model_assets table does not exist yet. */
export function isMissingAssetTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const msg = String(e?.message || e || '').toLowerCase();
  return (
    e?.code === '42P01' ||
    (msg.includes('gen_model_assets') &&
      (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

function describeError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  return e?.message || e?.code || String(err || 'unknown');
}

// ─── Env fallback inventory (legacy gates) ──────────────────

function envCheckpointInventory(family: ModelAssetFamily): Set<string> | null {
  const envKey =
    family === 'flux' ? 'RUNPOD_FLUX_CHECKPOINTS' : 'RUNPOD_SDXL_CHECKPOINTS';
  const raw = process.env[envKey]?.trim();
  if (!raw) return null; // no declared inventory — flag-only mode
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function envFallbackAssets(family: ModelAssetFamily): ModelAsset[] {
  const rows: ModelAsset[] = [];
  const checkpoints = envCheckpointInventory(family);
  if (checkpoints) {
    for (const name of checkpoints) {
      rows.push({
        id: `env-checkpoint-${name}`,
        asset_type: 'checkpoint',
        model_family: family,
        name,
        endpoint_scope: 'any',
        civitai_source: null,
        tags: [],
        installed: true,
        verified: false,
        nsfw: false,
        notes: 'env inventory fallback',
        sort_order: 0,
        is_active: true,
      });
    }
  }
  return rows;
}

// ─── Queries ────────────────────────────────────────────────

interface AssetCacheEntry {
  at: number;
  rows: ModelAsset[];
  tableMissing: boolean;
}
let assetCache: AssetCacheEntry | null = null;
const ASSET_CACHE_TTL_MS = 30_000;

async function loadAssetRows(client: SupabaseClient): Promise<AssetCacheEntry> {
  if (assetCache && Date.now() - assetCache.at < ASSET_CACHE_TTL_MS) return assetCache;
  const { data, error } = await client
    .from('gen_model_assets')
    .select('*')
    .order('sort_order', { ascending: true })
    .limit(1000);
  let entry: AssetCacheEntry;
  if (error) {
    const tableMissing = isMissingAssetTableError(error);
    if (!tableMissing) {
      logger.warn('[gen-assets] manifest query failed', { err: describeError(error) });
    }
    entry = { at: Date.now(), rows: [], tableMissing };
  } else {
    entry = {
      at: Date.now(),
      rows: ((data as unknown[]) || [])
        .map(assetFromRow)
        .filter((row): row is ModelAsset => row !== null),
      tableMissing: false,
    };
  }
  assetCache = entry;
  return entry;
}

/** All active assets, optionally narrowed to one model family (or 'any'). */
export async function getModelAssets(
  client: SupabaseClient,
  family?: ModelAssetFamily,
): Promise<ModelAsset[]> {
  const { rows, tableMissing } = await loadAssetRows(client);
  let assets = rows.filter((row) => row.is_active);
  if (assets.length === 0 && tableMissing) {
    assets = envFallbackAssets(family || 'sdxl');
  }
  if (!family) return assets;
  return assets.filter((row) => row.model_family === family || row.model_family === 'any');
}

export interface CheckpointReadiness {
  ready: boolean;
  reason: 'ok' | 'missing' | 'unverified' | 'no-inventory';
}

/**
 * Pre-submit gate: is the checkpoint available on the target endpoint?
 * - Manifest row present + installed → ready.
 * - Table missing → legacy env inventory decides (flag-only mode passes).
 * Never throws: readiness problems degrade to routing fallbacks upstream.
 */
export async function assertCheckpointReady(
  client: SupabaseClient,
  family: ModelAssetFamily,
  checkpoint: string,
): Promise<CheckpointReadiness> {
  const name = checkpoint.trim().toLowerCase();
  const { rows, tableMissing } = await loadAssetRows(client);
  if (tableMissing) {
    const inventory = envCheckpointInventory(family);
    if (!inventory) return { ready: true, reason: 'no-inventory' };
    return inventory.has(name)
      ? { ready: true, reason: 'ok' }
      : { ready: false, reason: 'missing' };
  }
  const match = rows.find(
    (row) =>
      row.asset_type === 'checkpoint' &&
      row.name.trim().toLowerCase() === name &&
      (row.model_family === family || row.model_family === 'any'),
  );
  if (!match) {
    // Unknown checkpoints pass in flag-only inventories so new uploads work
    // before the manifest row is created; explicit uninstalled rows block.
    return { ready: true, reason: 'no-inventory' };
  }
  if (!match.is_active || !match.installed) return { ready: false, reason: 'missing' };
  return { ready: true, reason: match.verified ? 'ok' : 'unverified' };
}

/** Invalidate the in-process cache after admin writes. */
export function invalidateAssetCache(): void {
  assetCache = null;
}

// ─── Seeding ────────────────────────────────────────────────

type SeedAsset = Pick<
  ModelAsset,
  'asset_type' | 'model_family' | 'name' | 'endpoint_scope' | 'nsfw'
> &
  Partial<Pick<ModelAsset, 'tags' | 'civitai_source' | 'notes' | 'sort_order'>>;

/**
 * Canonical matrix manifest. Upserted idempotently by admin action; ops then
 * flips `installed` per asset once the worker volume actually carries it.
 */
export const MODEL_ASSET_MANIFEST: SeedAsset[] = [
  // ── Checkpoints (verified production bundle, download-sdxl-matrix-bundle.sh) ──
  { asset_type: 'checkpoint', model_family: 'pony', name: 'ponyRealism_V22.safetensors', endpoint_scope: 'runpod-sdxl-pro', nsfw: false, tags: ['female', 'male', 'transgender', 'realistic', 'sfw', 'nsfw'], notes: 'Realistic flagship (female/male/trans via LoRA sliders)' },
  { asset_type: 'checkpoint', model_family: 'illustrious', name: 'waiMatureIllustrious_v20.safetensors', endpoint_scope: 'runpod-sdxl-pro', nsfw: false, tags: ['anime', 'sfw', 'nsfw'], notes: 'Anime flagship (danbooru tags)' },
  { asset_type: 'checkpoint', model_family: 'flux', name: 'flux1-dev-fp8.safetensors', endpoint_scope: 'runpod-flux', nsfw: false, tags: ['premium', 'realistic'], notes: 'FLUX premium layer' },

  // ── ControlNet / detectors / upscalers ──────────────────
  { asset_type: 'controlnet', model_family: 'sdxl', name: 'xinsir-openpose-sdxl.safetensors', endpoint_scope: 'runpod-sdxl-pro', nsfw: false, tags: ['control', 'pose'] },
  { asset_type: 'controlnet', model_family: 'sdxl', name: 'xinsir-depth-sdxl.safetensors', endpoint_scope: 'runpod-sdxl-pro', nsfw: false, tags: ['control', 'depth'] },
  { asset_type: 'controlnet', model_family: 'flux', name: 'flux-depth-controlnet.safetensors', endpoint_scope: 'runpod-flux', nsfw: false, tags: ['control', 'depth'] },
  { asset_type: 'detector', model_family: 'any', name: 'face_yolov8m.pt', endpoint_scope: 'any', nsfw: false, tags: ['face'] },
  { asset_type: 'upscaler', model_family: 'any', name: '4x-UltraSharp.pth', endpoint_scope: 'any', nsfw: false, tags: ['upscale'] },
  { asset_type: 'ipadapter', model_family: 'sdxl', name: 'ip-adapter-faceid-plusv2_sdxl.bin', endpoint_scope: 'runpod-sdxl-pro', nsfw: false, tags: ['identity'] },
  { asset_type: 'ipadapter', model_family: 'flux', name: 'flux-ip-adapter.safetensors', endpoint_scope: 'runpod-flux', nsfw: false, tags: ['identity'] },
];

/** Upsert the canonical manifest (onConflict asset_type,name). */
export async function seedModelAssets(
  client: SupabaseClient,
): Promise<{ upserted: number; error: string | null }> {
  const rows = MODEL_ASSET_MANIFEST.map((asset, index) => ({
    asset_type: asset.asset_type,
    model_family: asset.model_family,
    name: asset.name,
    endpoint_scope: asset.endpoint_scope,
    civitai_source: asset.civitai_source || null,
    tags: asset.tags || [],
    nsfw: asset.nsfw,
    notes: asset.notes || '',
    sort_order: asset.sort_order ?? index,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await client
    .from('gen_model_assets')
    .upsert(rows, { onConflict: 'asset_type,name' });
  if (error) {
    if (!isMissingAssetTableError(error)) {
      logger.warn('[gen-assets] seed upsert failed', { err: describeError(error) });
    }
    return { upserted: 0, error: describeError(error) };
  }
  invalidateAssetCache();
  return { upserted: rows.length, error: null };
}
