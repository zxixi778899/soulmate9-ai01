/**
 * Civitai REST helpers (server-only).
 * Docs: https://github.com/civitai/civitai/wiki/REST-API-Reference
 * Auth: Authorization: Bearer <CIVITAI_API_TOKEN>
 */
import { logger } from '@/lib/logger';

const CIVITAI_API = 'https://civitai.com/api/v1';

export type CivitaiModelType = 'LORA' | 'Checkpoint' | 'TextualInversion' | 'Hypernetwork' | 'AestheticGradient' | 'Controlnet' | 'Poses';

export type CivitaiSearchParams = {
  query?: string;
  types?: CivitaiModelType[];
  /** e.g. ["Flux.1 D"] */
  baseModels?: string[];
  nsfw?: boolean;
  sort?: 'Highest Rated' | 'Most Downloaded' | 'Newest' | 'Most Liked' | 'Most Discussed' | 'Most Collected' | 'Most Buzz';
  period?: 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
  limit?: number;
  page?: number;
  cursor?: string;
};

export type CivitaiModelVersionFile = {
  id?: number;
  name?: string;
  sizeKB?: number;
  type?: string;
  primary?: boolean;
  downloadUrl?: string;
  hashes?: Record<string, string>;
};

export type CivitaiModelVersion = {
  id: number;
  name?: string;
  baseModel?: string;
  trainedWords?: string[];
  description?: string;
  downloadUrl?: string;
  files?: CivitaiModelVersionFile[];
  images?: Array<{ url?: string; nsfw?: string | boolean; width?: number; height?: number }>;
};

export type CivitaiModel = {
  id: number;
  name: string;
  description?: string;
  type?: string;
  nsfw?: boolean;
  tags?: string[];
  modelVersions?: CivitaiModelVersion[];
  creator?: { username?: string };
  stats?: { downloadCount?: number; rating?: number; thumbsUpCount?: number };
};

export type NormalizedCivitaiItem = {
  model_id: number;
  version_id: number;
  name: string;
  version_name: string;
  type: string;
  base_model: string;
  nsfw: boolean;
  tags: string[];
  trigger_words: string[];
  filename: string;
  download_url: string;
  page_url: string;
  preview_url: string | null;
  size_kb: number | null;
  creator: string | null;
  stats: { downloads?: number; rating?: number; thumbs?: number };
};

function getToken(): string {
  return (
    process.env.CIVITAI_API_TOKEN ||
    process.env.CIVITAI_API_KEY ||
    process.env.CIVITAI_TOKEN ||
    ''
  ).trim();
}

export function isCivitaiConfigured(): boolean {
  return !!getToken();
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function pickPrimaryFile(version?: CivitaiModelVersion): CivitaiModelVersionFile | null {
  if (!version?.files?.length) return null;
  const safes = version.files.filter((f) => /\.safetensors$/i.test(f.name || ''));
  const pool = safes.length ? safes : version.files;
  return pool.find((f) => f.primary) || pool[0] || null;
}

export function downloadUrlForVersion(versionId: number): string {
  return `https://civitai.com/api/download/models/${versionId}`;
}

export function normalizeModel(model: CivitaiModel, preferredVersionId?: number): NormalizedCivitaiItem | null {
  const versions = model.modelVersions || [];
  if (!versions.length) return null;
  const version =
    (preferredVersionId
      ? versions.find((v) => v.id === preferredVersionId)
      : null) ||
    versions.find((v) => /flux/i.test(v.baseModel || '')) ||
    versions[0];
  if (!version) return null;
  const file = pickPrimaryFile(version);
  const filename =
    (file?.name && file.name.trim()) ||
    `${slugify(model.name)}_${version.id}.safetensors`;
  const preview =
    version.images?.find((i) => i.url)?.url ||
    model.modelVersions?.[0]?.images?.[0]?.url ||
    null;

  return {
    model_id: model.id,
    version_id: version.id,
    name: model.name,
    version_name: version.name || String(version.id),
    type: model.type || 'LORA',
    base_model: version.baseModel || '',
    nsfw: !!model.nsfw,
    tags: (model.tags || []).slice(0, 12),
    trigger_words: (version.trainedWords || []).slice(0, 12),
    filename,
    download_url: file?.downloadUrl || downloadUrlForVersion(version.id),
    page_url: `https://civitai.com/models/${model.id}?modelVersionId=${version.id}`,
    preview_url: preview,
    size_kb: file?.sizeKB ?? null,
    creator: model.creator?.username || null,
    stats: {
      downloads: model.stats?.downloadCount,
      rating: model.stats?.rating,
      thumbs: model.stats?.thumbsUpCount,
    },
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'model';
}

export async function searchCivitaiModels(
  params: CivitaiSearchParams,
): Promise<{ items: NormalizedCivitaiItem[]; raw_count: number; metadata?: unknown }> {
  const qs = new URLSearchParams();
  if (params.query) qs.set('query', params.query);
  if (params.types?.length) params.types.forEach((t) => qs.append('types', t));
  if (params.baseModels?.length) params.baseModels.forEach((b) => qs.append('baseModels', b));
  if (params.nsfw != null) qs.set('nsfw', String(params.nsfw));
  if (params.sort) qs.set('sort', params.sort);
  if (params.period) qs.set('period', params.period);
  qs.set('limit', String(Math.min(Math.max(params.limit || 20, 1), 100)));
  if (params.page) qs.set('page', String(params.page));
  if (params.cursor) qs.set('cursor', params.cursor);

  const url = `${CIVITAI_API}/models?${qs.toString()}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('[civitai] search failed', { status: res.status, text: text.slice(0, 200) });
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'Civitai auth failed. Check CIVITAI_API_TOKEN.'
        : `Civitai search error ${res.status}: ${text.slice(0, 120)}`,
    );
  }

  const data = (await res.json()) as { items?: CivitaiModel[]; metadata?: unknown };
  const items = (data.items || [])
    .map((m) => normalizeModel(m))
    .filter((x): x is NormalizedCivitaiItem => !!x);

  return { items, raw_count: data.items?.length || 0, metadata: data.metadata };
}

export async function getCivitaiModel(modelId: number): Promise<CivitaiModel> {
  const res = await fetch(`${CIVITAI_API}/models/${modelId}`, {
    headers: authHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Civitai model ${modelId} failed: ${res.status} ${text.slice(0, 100)}`);
  }
  return (await res.json()) as CivitaiModel;
}

/** One line for download-loras.sh --from-file */
export function toDownloadManifestLine(item: {
  filename: string;
  download_url?: string;
  version_id?: number;
}): string {
  const url =
    item.download_url ||
    (item.version_id ? downloadUrlForVersion(item.version_id) : '');
  return `${item.filename}|${url}`;
}
