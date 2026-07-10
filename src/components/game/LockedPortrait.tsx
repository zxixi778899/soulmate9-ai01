'use client';

import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Blur + lock overlay for locked catalog girlfriends.
 * Profile text remains visible outside; only the image is obscured.
 */
export function LockedPortraitOverlay({
  className,
  price,
  label = '锁定',
}: {
  className?: string;
  price?: number;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center',
        className,
      )}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-xl" />
      <div className="relative z-[1] flex flex-col items-center gap-2 px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/50 shadow-[0_0_24px_rgba(255,46,136,0.45)]">
          <Lock className="h-6 w-6 text-white" />
        </div>
        <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold tracking-wide text-white">
          {label}
        </span>
        {typeof price === 'number' && price > 0 && (
          <span className="text-[11px] text-amber-200/90">{price} 代币解锁</span>
        )}
      </div>
    </div>
  );
}

export function lockedImageClass(locked?: boolean) {
  return locked ? 'scale-105 blur-xl brightness-75 saturate-50' : '';
}
