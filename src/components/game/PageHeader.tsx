'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/**
 * Unified sub-page header: back + title + optional actions.
 * Works with the global top nav for full-site jumping.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref = '/',
  onBack,
  actions,
  className,
  sticky = true,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Default home; set false to use history.back() */
  backHref?: string | false;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backHref === false) {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/');
      }
      return;
    }
    router.push(backHref);
  };

  return (
    <header
      className={cn(
        sticky && 'sticky top-0 z-30',
        'border-b border-[#ff2e88]/12 bg-[#08040e]/70 backdrop-blur-2xl',
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="glass h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95 transition-all"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#ff6ba6]/80 mb-0.5">
              {eyebrow}
            </div>
          )}
          <h1 className="text-lg sm:text-xl font-black truncate seduce-glow">{title}</h1>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-white/40 truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
