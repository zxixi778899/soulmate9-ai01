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

const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'] as const;
const AUDIO_MIME = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/mp3',
] as const;
/** SVGA (Douyin gifts) is a zip-based binary; buckets often reject bare octet-stream unless listed */
const BINARY_MIME = [
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-svga',
  'application/svga',
] as const;

/** Full allowlist for portraits bucket (images + video + audio + SVGA gifts) */
export const STORAGE_ALLOWED_MIME = [
  ...IMAGE_MIME,
  ...VIDEO_MIME,
  ...AUDIO_MIME,
  ...BINARY_MIME,
] as const;

async function ensureBucket(bucket: string): Promise<void> {
  if (_bucketEnsured) return;
  try {
    const { data: list } = await adminClient().storage.listBuckets();
    const exists = (list || []).some((b) => b.name === bucket);
    const bucketOpts = {
      public: true,
      // Videos / SVGA gifts can be larger than stills
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: [...STORAGE_ALLOWED_MIME],
    };
    if (!exists) {
      const { error } = await adminClient().storage.createBucket(bucket, bucketOpts);
      if (error && !/already exists/i.test(error.message)) {
        logger.warn('[storage] createBucket failed (may already exist)', {
          bucket,
          err: error.message,
        });
      } else {
        logger.info('[storage] created public bucket', { bucket });
      }
    } else {
      // Best-effort: expand MIME allowlist so SVGA/audio uploads are not rejected
      try {
        const { error: updErr } = await adminClient().storage.updateBucket(bucket, bucketOpts);
        if (updErr) {
          logger.warn('[storage] updateBucket mime allowlist failed', {
            bucket,
            err: updErr.message,
          });
        }
      } catch {
        /* ignore — bucket may already be correct or plan-restricted */
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
 * Build a browser-usable public URL for a storage key (sync).
 * Safe to use on server; for client use with NEXT_PUBLIC_SUPABASE_URL.
 */
export function toPublicUrl(keyOrUrl: string | null | undefined): string {
  if (!keyOrUrl) return '';
  if (isDataUrl(keyOrUrl) || isHttpUrl(keyOrUrl)) return keyOrUrl;
  if (!isLikelyStorageKey(keyOrUrl)) return keyOrUrl;
  return publicObjectUrl(resolveBucketName(), keyOrUrl.replace(/^\/+/, ''));
}

/** True if buffer starts with PNG / JPEG / WEBP magic */
export function isValidImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 32) return false;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e;
  const jpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const riff =
    buffer.length > 12 &&
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP';
  return png || jpg || riff;
}

/**
 * Detect non-image text (prompts) wrongly passed as "image".
 * Real base64 image blobs are long and lack natural-language spaces.
 */
export function looksLikePromptText(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (t.startsWith('data:image/')) return false;
  if (/^https?:\/\//i.test(t)) return false;
  // Natural language prompts almost always contain spaces + common words
  if (/\s/.test(t) && t.length < 8000) {
    if (
      /\b(photo|portrait|woman|girl|masterpiece|photorealistic|wearing|looking|beautiful|sharp|8k)\b/i.test(
        t,
      )
    ) {
      return true;
    }
  }
  // Short non-base64 filenames without image extension may still be ok; reject prose
  if (t.length > 80 && /[a-zA-Z]{12,}/.test(t) && (t.match(/ /g) || []).length >= 3) {
    return true;
  }
  return false;
}

/**
 * Decode RunPod / Comfy image payload (raw base64, data-URL, or URL-safe base64) → Buffer.
 * Rejects prompt text and non-image binary so we never upload "text as png".
 */
export function decodeImagePayload(raw: string): Buffer {
  let s = String(raw || '').trim();
  if (!s) throw new Error('empty image payload');

  if (looksLikePromptText(s)) {
    throw new Error(
      'image payload looks like a text prompt, not base64 image data — worker output shape mismatch',
    );
  }

  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    if (comma < 0) throw new Error('invalid data URL image payload');
    const header = s.slice(0, comma).toLowerCase();
    if (!header.includes('image/')) {
      throw new Error(`data URL is not an image: ${header.slice(0, 40)}`);
    }
    s = s.slice(comma + 1);
  }

  // Strip whitespace / newlines often present in API dumps
  s = s.replace(/\s+/g, '');

  // Filename-only responses are not image bytes
  if (/^[\w./-]+\.(png|jpe?g|webp|gif)$/i.test(s) && s.length < 200) {
    throw new Error(
      `worker returned filename only (${s}) without image bytes — cannot preview`,
    );
  }

  // URL-safe base64 → standard
  if (s.includes('-') || s.includes('_')) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
  }

  // Base64 alphabet check (allow padding)
  if (!/^[A-Za-z0-9+/]+=*$/.test(s.slice(0, 200)) && s.length > 200) {
    // still try decode; some streams include odd prefixes
  }

  const buffer = Buffer.from(s, 'base64');
  if (buffer.length < 512) {
    throw new Error(`decoded image too small (${buffer.length} bytes) — likely not image data`);
  }

  if (!isValidImageBuffer(buffer)) {
    logger.error('[storage] image magic bytes invalid', {
      len: buffer.length,
      head: buffer.slice(0, 16).toString('hex'),
      asciiHead: buffer.slice(0, 40).toString('utf8').replace(/[^\x20-\x7E]/g, '.'),
    });
    throw new Error(
      `decoded payload is not a valid PNG/JPEG/WEBP (got magic ${buffer.slice(0, 4).toString('hex')})`,
    );
  }

  return buffer;
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
  // Never treat a FLUX caption as an image path (was breaking admin previews)
  if (looksLikePromptText(value)) return '';
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
 * Content-type candidates for tricky formats (SVGA / empty browser type).
 * SVGA is a zip container — application/zip is accepted by most image-first buckets
 * once allowlist includes zip, and players only need the .svga URL.
 */
function contentTypeCandidates(fileName: string, preferred: string): string[] {
  const lower = (fileName || '').toLowerCase();
  const isSvga =
    lower.endsWith('.svga') ||
    preferred === 'application/x-svga' ||
    preferred === 'application/svga';
  if (isSvga) {
    return [
      preferred,
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'application/x-svga',
    ].filter((v, i, a) => v && a.indexOf(v) === i);
  }
  if (
    preferred === 'application/octet-stream' ||
    !preferred ||
    preferred === 'application/x-www-form-urlencoded'
  ) {
    return ['application/zip', 'application/octet-stream', preferred].filter(
      (v, i, a) => v && a.indexOf(v) === i,
    );
  }
  return [preferred];
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

  if (!buffer || buffer.length < 32) {
    throw new Error(`uploadFile: empty or invalid buffer (${buffer?.length ?? 0} bytes)`);
  }

  const candidates = contentTypeCandidates(fileName, contentType);
  let lastError: { message?: string } | null = null;
  let usedType = contentType;

  for (const ct of candidates) {
    const { error } = await adminClient().storage.from(bucket).upload(key, buffer, {
      contentType: ct,
      upsert: true,
      cacheControl: 'public, max-age=31536000',
    });
    if (!error) {
      usedType = ct;
      lastError = null;
      break;
    }
    lastError = error;
    // Only retry mime-type rejections with the next candidate
    if (!/mime type|not supported|invalid.*type/i.test(error.message || '')) {
      break;
    }
    logger.warn('[storage] upload mime rejected, retrying', {
      bucket,
      key,
      contentType: ct,
      err: error.message,
    });
  }

  if (lastError) {
    logger.error('[storage] supabase upload failed', {
      bucket,
      key,
      err: lastError.message,
      tried: candidates,
    });
    throw new Error(
      `Supabase Storage upload failed (${bucket}/${key}): ${lastError.message}. ` +
        `Tried content-types: ${candidates.join(', ')}. ` +
        `If the bucket restricts MIME types, open Supabase Dashboard → Storage → "${bucket}" → ` +
        `Configuration and allow application/zip + application/octet-stream (SVGA gifts), ` +
        `or clear the allowed MIME list.`,
    );
  }

  logger.info('[storage] upload content-type', { key, contentType: usedType });

  // Prefer SDK public URL (works when bucket is public)
  let url = publicObjectUrl(bucket, key);
  try {
    const { data: pub } = adminClient().storage.from(bucket).getPublicUrl(key);
    if (pub?.publicUrl) url = pub.publicUrl;
  } catch {
    /* keep constructed */
  }

  // Optional: force signed URLs for private buckets
  if (process.env.SUPABASE_STORAGE_SIGNED === '1') {
    try {
      const { data: signed, error: signErr } = await adminClient()
        .storage.from(bucket)
        .createSignedUrl(key, SIGNED_TTL_SEC);
      if (!signErr && signed?.signedUrl) url = signed.signedUrl;
    } catch {
      /* keep public */
    }
  }

  logger.info('[storage] uploaded', {
    bucket,
    key,
    bytes: buffer.length,
    url: url.slice(0, 100),
  });
  return { key, url };
}

/**
 * Upload raw base64 / data-URL image → storage, return browser URL + key.
 */
export async function uploadImageBase64(
  raw: string,
  folder = 'uploads',
  contentType = 'image/png',
): Promise<{ key: string; url: string }> {
  // If worker already returned an HTTP URL, pass through (no re-upload)
  if (isHttpUrl(raw)) {
    return { key: extractKeyFromUrl(raw) || raw, url: raw };
  }
  const buffer = decodeImagePayload(raw);
  const ext =
    contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : contentType.includes('webp')
        ? 'webp'
        : 'png';
  return uploadFile(buffer, `gen_${Date.now()}.${ext}`, contentType, folder);
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

export const VIDEO_CONTENT_TYPES = VIDEO_MIME;

export function isAllowedVideoContentType(ct: string): boolean {
  const t = (ct || '').toLowerCase().trim();
  return (VIDEO_MIME as readonly string[]).includes(t) || t === 'video/x-m4v';
}

function videoExtFromContentType(ct: string, fileName?: string): string {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName && ['mp4', 'webm', 'mov', 'm4v'].includes(fromName)) return fromName;
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('quicktime') || ct.includes('mov')) return 'mov';
  return 'mp4';
}

/**
 * Create a short-lived signed upload URL so the browser can PUT the video
 * directly to Supabase Storage (bypasses Vercel 4.5MB body limit).
 */
export async function createVideoSignedUpload(opts: {
  fileName?: string;
  contentType: string;
  folder?: string;
}): Promise<{
  bucket: string;
  key: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
  contentType: string;
}> {
  const contentType = (opts.contentType || 'video/mp4').toLowerCase();
  if (!isAllowedVideoContentType(contentType)) {
    throw new Error(
      `Unsupported video type: ${contentType}. Allowed: ${VIDEO_MIME.join(', ')}`,
    );
  }

  const bucket = resolveBucketName();
  await ensureBucket(bucket);

  const ext = videoExtFromContentType(contentType, opts.fileName);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = (opts.folder || 'admin/videos').replace(/^\/+|\/+$/g, '');
  const safeBase = (opts.fileName || `clip.${ext}`)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const key = `${folder}/${ts}_${rand}_${safeBase.endsWith(`.${ext}`) ? safeBase : `${safeBase}.${ext}`}`;

  const { data, error } = await adminClient()
    .storage.from(bucket)
    .createSignedUploadUrl(key, { upsert: true });

  if (error || !data?.signedUrl) {
    throw new Error(
      `createSignedUploadUrl failed: ${error?.message || 'no signedUrl'}. ` +
        'Ensure service role key and Storage policies allow uploads.',
    );
  }

  const publicUrl =
    adminClient().storage.from(bucket).getPublicUrl(key).data.publicUrl ||
    publicObjectUrl(bucket, key);

  return {
    bucket,
    key: data.path || key,
    signedUrl: data.signedUrl,
    token: data.token,
    publicUrl,
    contentType,
  };
}

/** Server-side buffer upload for small videos / tooling (prefer signed client upload). */
export async function uploadVideoFile(
  buffer: Buffer,
  fileName: string,
  contentType = 'video/mp4',
  folder = 'admin/videos',
): Promise<{ key: string; url: string }> {
  if (!isAllowedVideoContentType(contentType)) {
    throw new Error(`Unsupported video type: ${contentType}`);
  }
  if (!buffer || buffer.length < 32) {
    throw new Error('empty video buffer');
  }
  // Soft cap for server-side path (signed upload is preferred for large files)
  if (buffer.length > 40 * 1024 * 1024) {
    throw new Error('Video too large for server upload path; use signed client upload');
  }
  return uploadFile(buffer, fileName, contentType, folder);
}

export const __test = {
  isDataUrl,
  isHttpUrl,
  isLikelyOssKey: isLikelyStorageKey,
  parseDataUrl,
  resolveBucketName,
};
