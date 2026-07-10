/**
 * Object storage — Supabase Storage (no Coze).
 *
 * Required env (already used for DB; legacy COZE_SUPABASE_* names still work):
 *   COZE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   COZE_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   SUPABASE_STORAGE_BUCKET  (default: portraits)
 *
 * Deprecated / ignored for uploads:
 *   COZE_BUCKET_NAME, COZE_BUCKET_ENDPOINT_URL  (old Coze S3 proxy)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const URL_CACHE: Map<string, { url: string; expiresAt: number }> = new Map();
const URL_TTL_SEC = 30 * 24 * 60 * 60; // 30 days (for signed URLs)
const SIGNED_TTL_SEC = 7 * 24 * 60 * 60; // 7 days signed if bucket private

let _admin: SupabaseClient | null = null;
let _bucketEnsured = false;

function env(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function getSupabaseUrl(): string {
  const url = env(
    'COZE_SUPABASE_URL',
    'NEXT_PUBLIC_COZE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_URL',
  );
  if (!url) {
    throw new Error(
      'Supabase URL not set. Configure COZE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL on Vercel.',
    );
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = env(
    'COZE_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  if (!key) {
    throw new Error(
      'Supabase service role key not set. Configure COZE_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for image uploads.',
    );
  }
  return key;
}

export function resolveBucketName(): string {
  return (
    env('SUPABASE_STORAGE_BUCKET', 'OSS_BUCKET', 'S3_BUCKET', 'COZE_BUCKET_NAME') ||
    'portraits'
  );
}

function adminClient(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

async function ensureBucket(bucket: string): Promise<void> {
  if (_bucketEnsured) return;
  try {
    const { data: list } = await adminClient().storage.listBuckets();
    const exists = (list || []).some((b) => b.name === bucket);
    if (!exists) {
      const { error } = await adminClient().storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 15 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      });
      if (error && !/already exists/i.test(error.message)) {
        logger.warn('[storage] createBucket failed (may already exist)', {
          bucket,
          err: error.message,
        });
      } else {
        logger.info('[storage] created public bucket', { bucket });
      }
    }
    _bucketEnsured = true;
  } catch (e) {
    logger.warn('[storage] ensureBucket error', {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

function isDataUrl(s: string | null | undefined): boolean {
  return !!s && s.startsWith('data:');
}

function isHttpUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//.test(s);
}

function isLikelyStorageKey(s: string | null | undefined): boolean {
  return !!s && !isDataUrl(s) && !isHttpUrl(s) && s.length > 0 && s.length < 1024;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const m = /^data:([^;,]+)(?:;base64)?,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error('invalid data url');
  const contentType = m[1] || 'application/octet-stream';
  const isB64 = /;base64,/.test(dataUrl);
  const payload = m[2];
  const buffer = isB64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf-8');
  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extMap[contentType.toLowerCase()] || 'bin';
  return { buffer, contentType, ext };
}

function publicObjectUrl(bucket: string, key: string): string {
  const base = getSupabaseUrl().replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${bucket}/${key.replace(/^\/+/, '')}`;
}

/**
 * Upload base64 data URL → storage key
 */
export async function uploadDataUrl(dataUrl: string, prefix = 'girlfriends'): Promise<string> {
  if (!isDataUrl(dataUrl)) throw new Error('not a data url');
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${prefix}/avatar_${ts}_${rand}.${ext}`;
  const { key } = await uploadFile(buffer, fileName, contentType, '');
  return key;
}

/**
 * Resolve image value to a browser-usable URL
 */
export async function resolveImageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return '';
  if (isDataUrl(value)) return value;
  if (isHttpUrl(value)) return value;
  if (!isLikelyStorageKey(value)) return value;

  const cached = URL_CACHE.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const bucket = resolveBucketName();
  // Prefer public URL (bucket is public in this project)
  const publicUrl = publicObjectUrl(bucket, value);

  try {
    // Quick HEAD-ish: try signed URL if public fails later — for now cache public
    URL_CACHE.set(value, {
      url: publicUrl,
      expiresAt: Date.now() + URL_TTL_SEC * 1000,
    });
    return publicUrl;
  } catch (err) {
    logger.error('[storage] resolveImageUrl failed', { key: value, err });
    try {
      const { data, error } = await adminClient()
        .storage.from(bucket)
        .createSignedUrl(value, SIGNED_TTL_SEC);
      if (error || !data?.signedUrl) return publicUrl;
      URL_CACHE.set(value, {
        url: data.signedUrl,
        expiresAt: Date.now() + (SIGNED_TTL_SEC - 600) * 1000,
      });
      return data.signedUrl;
    } catch {
      return publicUrl;
    }
  }
}

export async function ensureImageKey(
  value: string | null | undefined,
  prefix = 'girlfriends',
): Promise<string> {
  if (!value) return '';
  if (isDataUrl(value)) {
    try {
      return await uploadDataUrl(value, prefix);
    } catch (err) {
      logger.error('[storage] uploadDataUrl failed:', { data: err });
      return value;
    }
  }
  return value;
}

/**
 * Upload Buffer → { key, url }
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType = 'application/octet-stream',
  folder = 'uploads',
): Promise<{ key: string; url: string }> {
  const bucket = resolveBucketName();
  await ensureBucket(bucket);

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = fileName.replace(/[^a-zA-Z0-9._\-/]/g, '_');
  // If fileName already includes folder path and folder is empty, use as-is
  const key =
    folder && folder.length > 0
      ? `${folder.replace(/\/$/, '')}/${ts}_${rand}_${safeName.split('/').pop()}`
      : safeName.includes('/')
        ? safeName
        : `uploads/${ts}_${rand}_${safeName}`;

  const { error } = await adminClient().storage.from(bucket).upload(key, buffer, {
    contentType,
    upsert: true,
    cacheControl: 'public, max-age=31536000',
  });

  if (error) {
    logger.error('[storage] supabase upload failed', {
      bucket,
      key,
      err: error.message,
    });
    throw new Error(
      `Supabase Storage upload failed (${bucket}/${key}): ${error.message}. ` +
        `Ensure service role key is set and bucket "${bucket}" exists (public recommended).`,
    );
  }

  const url = publicObjectUrl(bucket, key);
  return { key, url };
}

export function extractKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDataUrl(value)) return null;
  if (isHttpUrl(value)) {
    try {
      const u = new URL(value);
      // /storage/v1/object/public/<bucket>/<key>
      const m = u.pathname.match(
        /\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/,
      );
      if (m?.[1]) return decodeURIComponent(m[1]);
      const path = u.pathname.replace(/^\/+/, '');
      const legacy = path.match(
        /(girlfriends\/[^?]+|uploads\/[^?]+|images\/[^?]+|generated\/[^?]+|batch-portraits\/[^?]+|comfy-outputs\/[^?]+|portraits\/[^?]+)/,
      );
      return legacy ? legacy[1] : path;
    } catch {
      return null;
    }
  }
  return value;
}

export async function deleteFile(key: string): Promise<void> {
  try {
    const bucket = resolveBucketName();
    const { error } = await adminClient().storage.from(bucket).remove([key]);
    if (error) logger.error('[storage] deleteFile failed:', { key, err: error.message });
  } catch (err) {
    logger.error('[storage] deleteFile failed:', { key, err });
  }
}

export async function resolveImageUrlBatch(
  values: (string | null | undefined)[],
): Promise<string[]> {
  return Promise.all(values.map((v) => resolveImageUrl(v)));
}

export const __test = {
  isDataUrl,
  isHttpUrl,
  isLikelyOssKey: isLikelyStorageKey,
  parseDataUrl,
  resolveBucketName,
};
