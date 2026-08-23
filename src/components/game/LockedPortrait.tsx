'use client';

import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';

/**
 * Blur + lock overlay for locked catalog girlfriends.
 * Profile text remains visible outside; only the image is obscured.
 */
export function LockedPortraitOverlay({
  className,
  price,
  label,
}: {
  className?: string;
  price?: number;
  label?: string;
}) {
  const { t } = useTranslation();
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
          {label ?? t('explore.lockedBadge')}
        </span>
        {typeof price === 'number' && price > 0 && (
          <span className="text-[11px] text-amber-200/90">{t('explore.unlockPrice', { price: String(price) })}</span>
        )}
      </div>
    </div>
  );
}

export function lockedImageClass(locked?: boolean) {
  return locked ? 'scale-105 blur-xl brightness-75 saturate-50' : '';
}
