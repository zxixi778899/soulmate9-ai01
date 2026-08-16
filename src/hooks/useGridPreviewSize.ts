'use client';

import { useEffect, useState } from 'react';
import type { PreviewSize } from '@/lib/image-preview';

/**
 * 网格像素档随断点自适应（主页 / 卡池共用）：
 * 桌面列多卡宽小 → detail 档（832px）保视网膜清晰；移动端卡宽大 → card 档（512px）控流量。
 */
export function useGridPreviewSize(): PreviewSize {
  const [size, setSize] = useState<PreviewSize>('card');
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setSize(mq.matches ? 'detail' : 'card');
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return size;
}
