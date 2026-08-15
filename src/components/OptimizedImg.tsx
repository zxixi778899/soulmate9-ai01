'use client';

/**
 * OptimizedImg — drop-in <img> replacement with on-demand compression.
 *
 * - Rewrites Supabase storage URLs to the imgproxy render endpoint
 *   (resize + quality preset), everything else passes through.
 * - If the transformed variant fails (imgproxy unavailable / plan limit),
 *   it silently falls back to the original URL — previews never break.
 * - Lazy loading + async decode + fade-in skeleton for perceived speed.
 */

import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { toPreviewUrl, type PreviewSize } from '@/lib/image-preview';

export interface OptimizedImgProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src: string;
  /** 压缩档位：thumb 320 / card 512 / detail 832 / lightbox 1600 */
  size?: PreviewSize;
  /** 覆盖预设宽度 */
  previewWidth?: number;
  /** 覆盖预设质量 */
  previewQuality?: number;
  /** 关闭压缩（灯箱/下载等需要原图的场景） */
  original?: boolean;
}

export function OptimizedImg({
  src,
  size = 'card',
  previewWidth,
  previewQuality,
  original = false,
  className,
  alt = '',
  loading = 'lazy',
  decoding = 'async',
  ...rest
}: OptimizedImgProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const compressed = original || failed
    ? src
    : toPreviewUrl(src, size, { width: previewWidth, quality: previewQuality });

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 本组件就是动态存储 URL 的压缩封装层，不走 next/image
    <img
      src={compressed || undefined}
      alt={alt}
      className={cn(
        'transition-opacity duration-300',
        loaded || original ? 'opacity-100' : 'opacity-0',
        className,
      )}
      loading={loading}
      decoding={decoding}
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => {
        // 压缩变体不可用 → 回退原图，只回退一次
        if (!failed) setFailed(true);
      }}
      {...rest}
    />
  );
}
