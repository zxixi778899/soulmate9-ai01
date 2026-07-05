/**
 * OSS /
 *
 * 
 * -  OSS key `girlfriends/avatar_xxxx.png` URL
 * -  `resolveImageUrl()`  URL 
 * -  base64 data URL `data:` 
 * -  URL`http(s)://` 
 */

import { S3Storage } from "coze-coding-dev-sdk";
import { logger } from '@/lib/logger';

let _client: S3Storage | null = null;

function client(): S3Storage {
  if (_client) return _client;
  _client = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: "",
    secretKey: "",
    bucketName: process.env.COZE_BUCKET_NAME,
    region: "cn-beijing",
  });
  return _client;
}

const URL_CACHE: Map<string, { url: string; expiresAt: number }> = new Map();
// /girlfriend/[slug]  30  URL ISR revalidate 
// chatgallery  R2DBC  TTL 
const URL_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function isDataUrl(s: string | null | undefined): boolean {
  return !!s && s.startsWith("data:");
}

function isHttpUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//.test(s);
}

function isLikelyOssKey(s: string | null | undefined): boolean {
  return !!s && !isDataUrl(s) && !isHttpUrl(s) && s.length > 0 && s.length < 1024;
}

/**
 *  base64 data URL  { buffer, contentType, ext }
 */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  // : data:image/png;base64,iVBORw0KGgo...
  const m = /^data:([^;,]+)(?:;base64)?,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("invalid data url");
  const contentType = m[1] || "application/octet-stream";
  const isB64 = /;base64,/.test(dataUrl);
  const payload = m[2];
  const buffer = isB64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf-8");
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extMap[contentType.toLowerCase()] || "bin";
  return { buffer, contentType, ext };
}

/**
 *  base64 data URL  OSS key
 *  key 
 */
export async function uploadDataUrl(dataUrl: string, prefix = "girlfriends"): Promise<string> {
  if (!isDataUrl(dataUrl)) throw new Error("not a data url");
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
 *  image  URL
 * - data:url       
 * - http(s)://...  
 * - OSS key         URL
 * -              
 */
export async function resolveImageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return "";
  if (isDataUrl(value)) return value;
  if (isHttpUrl(value)) return value;
  if (!isLikelyOssKey(value)) return value;

  // 
  const cached = URL_CACHE.get(value);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  try {
    const url = await client().generatePresignedUrl({
      key: value,
      expireTime: URL_TTL_SEC,
    });
    URL_CACHE.set(value, { url, expiresAt: Date.now() + (URL_TTL_SEC - 600) * 1000 });
    return url;
  } catch (err) {
    logger.error("[storage] generatePresignedUrl failed for key:", { key: value, err });
    return "";
  }
}

/**
 *  value  data:url  OSS  key
 *  key//
 *  key/url base64
 */
export async function ensureImageKey(value: string | null | undefined, prefix = "girlfriends"): Promise<string> {
  if (!value) return "";
  if (isDataUrl(value)) {
    try {
      return await uploadDataUrl(value, prefix);
    } catch (err) {
      logger.error("[storage] uploadDataUrl failed:", { data: err });
      return value; // 
    }
  }
  return value;
}

// ============================================================
// Legacy compat ( API )
// ============================================================

/**
 *  Buffer/ { key, url } 
 * upload/route.tsrunpod.ts 
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  contentType = "application/octet-stream",
  folder = "uploads",
): Promise<{ key: string; url: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fullKey = `${folder}/${ts}_${rand}_${safeName}`;
  const key = await client().uploadFile({
    fileContent: buffer,
    fileName: fullKey,
    contentType,
  });
  const url = await client().generatePresignedUrl({ key, expireTime: URL_TTL_SEC });
  return { key, url };
}

/**
 *  URL  OSS key URL  key
 */
export function extractKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDataUrl(value)) return null;
  if (isHttpUrl(value)) {
    try {
      const u = new URL(value);
      //  /<bucket-folder>/girlfriends/avatar_xxx.png
      //  key  /  bucket-folder 
      const path = u.pathname.replace(/^\/+/, "");
      //  folder  girlfriends/uploads/images/
      const m = path.match(/(girlfriends\/[^?]+|uploads\/[^?]+|images\/[^?]+|generated\/[^?]+)/);
      return m ? m[1] : path;
    } catch {
      return null;
    }
  }
  return value; //  key
}

/**
 *  OSS 
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    await client().deleteFile({ fileKey: key });
  } catch (err) {
    logger.error("[storage] deleteFile failed:", { key, err });
  }
}

/**
 * 
 */
export async function resolveImageUrlBatch(values: (string | null | undefined)[]): Promise<string[]> {
  return Promise.all(values.map((v) => resolveImageUrl(v)));
}

export const __test = { isDataUrl, isHttpUrl, isLikelyOssKey, parseDataUrl };
