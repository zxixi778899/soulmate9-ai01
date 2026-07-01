/**
 * OSS 存储工具：女友头像/图片资产统一通过对象存储管理
 *
 * 关键约定：
 * - 数据库中持久化的是 OSS key（如 `girlfriends/avatar_xxxx.png`），永不存签名 URL
 * - 读取时统一通过 `resolveImageUrl()` 生成签名 URL 返回前端
 * - 兼容历史 base64 data URL：检测到 `data:` 前缀直接原样返回
 * - 兼容外部图片 URL：`http(s)://` 前缀也直接原样返回
 */

import { S3Storage } from "coze-coding-dev-sdk";

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
const URL_TTL_SEC = 86400; // 1 day

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
 * 解析 base64 data URL 为 { buffer, contentType, ext }
 */
function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  // 形如: data:image/png;base64,iVBORw0KGgo...
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
 * 上传 base64 data URL 到 OSS，返回 key
 * 调用方应将返回的 key 持久化到数据库
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
 * 将任意来源的 image 字段值解析为可访问 URL：
 * - data:url      → 原样返回（兼容历史数据）
 * - http(s)://... → 原样返回（兼容外链）
 * - OSS key       → 生成签名 URL
 * - 空            → 空字符串
 */
export async function resolveImageUrl(value: string | null | undefined): Promise<string> {
  if (!value) return "";
  if (isDataUrl(value)) return value;
  if (isHttpUrl(value)) return value;
  if (!isLikelyOssKey(value)) return value;

  // 命中缓存
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
    console.error("[storage] generatePresignedUrl failed for key:", value, err);
    return "";
  }
}

/**
 * 如果 value 是 data:url 则上传到 OSS 并返回 key；
 * 否则原样返回（已是 key/外链/空）。
 * 写入侧统一调此函数，确保库中永远只存 key/url，不存 base64。
 */
export async function ensureImageKey(value: string | null | undefined, prefix = "girlfriends"): Promise<string> {
  if (!value) return "";
  if (isDataUrl(value)) {
    try {
      return await uploadDataUrl(value, prefix);
    } catch (err) {
      console.error("[storage] uploadDataUrl failed:", err);
      return value; // 上传失败时退回原值，不阻塞业务
    }
  }
  return value;
}

// ============================================================
// Legacy compat (保留旧 API 与现存调用方兼容)
// ============================================================

/**
 * 直接上传 Buffer/二进制内容，返回 { key, url } 兼容旧调用
 * 旧调用如：upload/route.ts、runpod.ts 等
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
 * 从 URL 中提取 OSS key（兼容签名 URL 或裸 key）
 */
export function extractKeyFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDataUrl(value)) return null;
  if (isHttpUrl(value)) {
    try {
      const u = new URL(value);
      // 路径形如 /<bucket-folder>/girlfriends/avatar_xxx.png
      // 我们假设 key 是路径去掉前导 / 后的全部，但若包含 bucket-folder 需保留
      const path = u.pathname.replace(/^\/+/, "");
      // 取最后一段 folder 起算：寻找已知前缀 girlfriends/、uploads/、images/
      const m = path.match(/(girlfriends\/[^?]+|uploads\/[^?]+|images\/[^?]+|generated\/[^?]+)/);
      return m ? m[1] : path;
    } catch {
      return null;
    }
  }
  return value; // 已是 key
}

/**
 * 删除 OSS 对象
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    await client().deleteFile({ fileKey: key });
  } catch (err) {
    console.error("[storage] deleteFile failed:", key, err);
  }
}

/**
 * 批量解析（用于列表接口）
 */
export async function resolveImageUrlBatch(values: (string | null | undefined)[]): Promise<string[]> {
  return Promise.all(values.map((v) => resolveImageUrl(v)));
}

export const __test = { isDataUrl, isHttpUrl, isLikelyOssKey, parseDataUrl };
