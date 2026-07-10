/**
 * OSS / object storage helpers (Coze S3 proxy or S3-compatible).
 *
 * Env (any of these for bucket name):
 *   COZE_BUCKET_NAME | OSS_BUCKET | SUPABASE_STORAGE_BUCKET
 * Endpoint:
 *   COZE_BUCKET_ENDPOINT_URL | OSS_ENDPOINT
 */

import { S3Storage } from 'coze-coding-dev-sdk';
import { logger } from '@/lib/logger';

let _client: S3Storage | null = null;

/** Resolve bucket with sensible project default used in docs. */
export function resolveBucketName(): string {
  return (
    process.env.COZE_BUCKET_NAME ||
    process.env.OSS_BUCKET ||
    process.env.SUPABASE_STORAGE_BUCKET ||
    process.env.S3_BUCKET ||
    'soulmate9-media'
  );
}

function resolveEndpoint(): string | undefined {
  return (
    process.env.COZE_BUCKET_ENDPOINT_URL ||
    process.env.OSS_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    undefined
  );
}

function client(): S3Storage {
  if (_client) return _client;

  const bucketName = resolveBucketName();
  const endpointUrl = resolveEndpoint();

  // Ensure process.env is set so SDK internal getBucket() also sees it
  // (SDK: e || process.env.COZE_BUCKET_NAME || this.bucketName)
  if (!process.env.COZE_BUCKET_NAME) {
    process.env.COZE_BUCKET_NAME = bucketName;
  }

  if (!endpointUrl) {
    logger.warn(
      '[storage] COZE_BUCKET_ENDPOINT_URL / OSS_ENDPOINT not set — uploads may fail',
    );
  }

  _client = new S3Storage({
    endpointUrl,
    accessKey:
      process.env.OSS_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY_ID ||
      process.env.COZE_BUCKET_ACCESS_KEY ||
      '',
    secretKey:
      process.env.OSS_ACCESS_KEY_SECRET ||
      process.env.S3_SECRET_ACCESS_KEY ||
      process.env.COZE_BUCKET_SECRET_KEY ||
      '',
    bucketName,
    region:
      process.env.COZE_BUCKET_REGION ||
      process.env.OSS_REGION ||
      process.env.S3_REGION ||
      'cn-beijing',
  });

  logger.info('[storage] S3 client ready', {
    bucket: bucketName,
    endpoint: endpointUrl ? `${endpointUrl.slice(0, 40)}…` : '(default)',
  });

  return _client;
}

const URL_CACHE: Map<string, { url: string; expiresAt: number }> = new Map();
// Presigned URL cache TTL (seconds)
const URL_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function isDataUrl(s: string | null | undefined): boolean {
  return !!s && s.startsWith('data:');
}

function isHttpUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//.test(s);
}

function isLikelyOssKey(s: string | null | undefined): boolean {
  return !!s && !isDataUrl(s) && !isHttpUrl(s) && s.length > 0 && s.length < 1024;
}

/**
 * Parse base64 data URL → { buffer, contentType, ext }
 */
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

/**
 * Upload base64 data URL → OSS key
 */
export async function uploadDataUrl(dataUrl: string, prefix = 'girlfriends'): Promise<string> {
  if (!isDataUrl(dataUrl)) throw new Error('not a data url');
  const { buffer, contentType, ext } = parseDataUrl(dataUrl);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${prefix}/avatar_${ts}_${rand}.${ext}`;
  const key = await client().uploadFile({
    fileContent: buffer,
    fileName,
    contentType,
  });
  return key;
}

/**
 * Resolve image to a displayable URL
 * - data:url       → as-is
 * - http(s)://...  → as-is
 * - OSS key        → presigned URL
 */
export async function resolveImageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return '';
  if (isDataUrl(value)) return value;
  if (isHttpUrl(value)) return value;
  if (!isLikelyOssKey(value)) return value;

  const cached = URL_CACHE.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    const url = await client().generatePresignedUrl({
      key: value,
      expireTime: URL_TTL_SEC,
    });
    URL_CACHE.set(value, {
      url,
      expiresAt: Date.now() + (URL_TTL_SEC - 600) * 1000,
    });
    return url;
  } catch (err) {
    logger.error('[storage] generatePresignedUrl failed for key:', { key: value, err });
    return '';
  }
}

/**
 * Ensure value is an OSS key (upload data URLs)
 */
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

// ============================================================
// Legacy compat
// ============================================================

/**
 * Upload Buffer → { key, url }
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType = 'application/octet-stream',
  folder = 'uploads',
): Promise<{ key: string; url: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullKey = `${folder}/${ts}_${rand}_${safeName}`;

  try {
    const key = await client().uploadFile({
      fileContent: buffer,
      fileName: fullKey,
      contentType,
    });
    const url = await client().generatePresignedUrl({
      key,
      expireTime: URL_TTL_SEC,
    });
    return { key, url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[storage] uploadFile failed', {
      folder,
      fileName: safeName,
      bucket: resolveBucketName(),
      err: msg,
    });
    // Re-throw with actionable message for batch UI
    if (/bucket not configured/i.test(msg) || /COZE_BUCKET_NAME/i.test(msg)) {
      throw new Error(
        `Bucket not configured: set COZE_BUCKET_NAME (e.g. soulmate9-media) on Vercel Production and redeploy. ` +
          `Also need COZE_BUCKET_ENDPOINT_URL. Current resolve: ${resolveBucketName()}`,
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

/**
 * Extract OSS key from URL or return key as-is
 */
export function extractKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDataUrl(value)) return null;
  if (isHttpUrl(value)) {
    try {
      const u = new URL(value);
      const path = u.pathname.replace(/^\/+/, '');
      const m = path.match(
        /(girlfriends\/[^?]+|uploads\/[^?]+|images\/[^?]+|generated\/[^?]+|batch-portraits\/[^?]+|comfy-outputs\/[^?]+)/,
      );
      return m ? m[1] : path;
    } catch {
      return null;
    }
  }
  return value;
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await client().deleteFile({ fileKey: key });
  } catch (err) {
    logger.error('[storage] deleteFile failed:', { key, err });
  }
}

export async function resolveImageUrlBatch(
  values: (string | null | undefined)[],
): Promise<string[]> {
  return Promise.all(values.map((v) => resolveImageUrl(v)));
}

export const __test = { isDataUrl, isHttpUrl, isLikelyOssKey, parseDataUrl, resolveBucketName };
