/**
 * Preview image compression — on-demand resize/quality via Supabase Storage
 * imgproxy render endpoint. Zero extra infra: the same storage host serves
 * `/storage/v1/render/image/public/...?width=&quality=` variants, which the
 * Supabase edge caches.
 *
 * Rules:
 * - Only Supabase storage object URLs are rewritten; every other host
 *   (R2 CDN, external URLs, data:) passes through untouched.
 * - Presets are sized ~1.5–2× the typical CSS size so retina stays crisp.
 * - Lightbox / download paths must keep using the original URL.
 */

export type PreviewSize = 'thumb' | 'card' | 'detail' | 'lightbox';

interface PreviewPreset {
  width: number;
  quality: number;
}

/** width ≈ 1.5–2× 常见 CSS 展示宽度，保证高分屏清晰 */
const PRESETS: Record<PreviewSize, PreviewPreset> = {
  thumb: { width: 320, quality: 60 },
  card: { width: 512, quality: 72 },
  detail: { width: 832, quality: 78 },
  lightbox: { width: 1600, quality: 82 },
};

const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';

export interface PreviewUrlOptions {
  /** 覆盖预设宽度（CSS 像素 × 期望倍率） */
  width?: number;
  /** 覆盖预设质量（20–100） */
  quality?: number;
}

/**
 * Rewrite a Supabase storage public URL into an imgproxy render URL.
 * Non-storage URLs (CDN / R2 / data: / empty) are returned unchanged.
 */
export function toPreviewUrl(
  url: string | null | undefined,
  size: PreviewSize = 'card',
  options?: PreviewUrlOptions,
): string {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  const idx = raw.indexOf(OBJECT_MARKER);
  if (idx === -1) return raw;
  // 已携带查询参数的对象 URL 不做二次改写，避免破坏签名/已有变换
  if (raw.includes('?')) return raw;

  const preset = PRESETS[size] || PRESETS.card;
  const width = Math.max(16, Math.min(3840, Math.round(options?.width ?? preset.width)));
  const quality = Math.max(20, Math.min(100, Math.round(options?.quality ?? preset.quality)));
  const head = raw.slice(0, idx);
  const tail = raw.slice(idx + OBJECT_MARKER.length);
  return `${head}${RENDER_PREFIX}${tail}?width=${width}&quality=${quality}`;
}

/** 小尺寸头像/图标专用：方形裁切 + 小宽度 */
export function toAvatarPreviewUrl(url: string | null | undefined, px = 96): string {
  return toPreviewUrl(url, 'thumb', { width: px, quality: 70 });
}
