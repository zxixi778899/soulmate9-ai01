/**
 * Preview image compression — on-demand resize/quality via Supabase Storage
 * imgproxy render endpoint. Zero extra infra: the same storage host serves
 * `/storage/v1/render/image/public/...?width=&height=&resize=&quality=`
 * variants, which the Supabase edge caches.
 *
 * Rules:
 * - Only Supabase storage object URLs are rewritten; every other host
 *   (R2 CDN, external URLs, data:) passes through untouched.
 * - ALWAYS pass width + height + resize. The render endpoint does NOT keep
 *   aspect ratio on a width-only request (it returns a width×original-height
 *   center strip), which made square avatar crops show a thin slice of the
 *   portrait. cover = crop to box, contain = fit whole image (lightbox).
 * - Presets are sized ~1.5–2× the typical CSS size so retina stays crisp.
 * - Lightbox / download paths must keep using the original URL.
 */

export type PreviewSize = 'thumb' | 'card' | 'detail' | 'lightbox';
export type PreviewResize = 'cover' | 'contain' | 'fill';

interface PreviewPreset {
  width: number;
  height: number;
  quality: number;
  resize: PreviewResize;
}

/** width ≈ 1.5–2× 常见 CSS 展示宽度，保证高分屏清晰；height 与 width 成比例以防服务端裁条 */
const PRESETS: Record<PreviewSize, PreviewPreset> = {
  thumb: { width: 320, height: 427, quality: 60, resize: 'cover' },
  card: { width: 512, height: 683, quality: 72, resize: 'cover' },
  detail: { width: 832, height: 1248, quality: 78, resize: 'cover' },
  lightbox: { width: 1600, height: 1600, quality: 82, resize: 'contain' },
};

const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_PREFIX = '/storage/v1/render/image/public/';

export interface PreviewUrlOptions {
  /** 覆盖预设宽度（CSS 像素 × 期望倍率） */
  width?: number;
  /** 覆盖预设高度（缺省按预设宽高比随 width 等比推导） */
  height?: number;
  /** 覆盖预设质量（20–100） */
  quality?: number;
  /** 覆盖裁切模式：cover 裁满 / contain 完整 / fill 拉伸 */
  resize?: PreviewResize;
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
  const height = Math.max(16, Math.min(3840, Math.round(options?.height ?? (width * preset.height) / preset.width)));
  const quality = Math.max(20, Math.min(100, Math.round(options?.quality ?? preset.quality)));
  const resize = options?.resize ?? preset.resize;
  const head = raw.slice(0, idx);
  const tail = raw.slice(idx + OBJECT_MARKER.length);
  return `${head}${RENDER_PREFIX}${tail}?width=${width}&height=${height}&resize=${resize}&quality=${quality}`;
}

/** 小尺寸头像专用：3:4 cover 缩略 + 前端 object-top 完成顶部方裁 */
export function toAvatarPreviewUrl(url: string | null | undefined, px = 96): string {
  return toPreviewUrl(url, 'thumb', { width: px, height: Math.round((px * 4) / 3), quality: 70, resize: 'cover' });
}
