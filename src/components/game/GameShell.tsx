'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Full-page game hub shell */
export function GameShell({
  children,
  className,
  hex = true,
}: {
  children: ReactNode;
  className?: string;
  hex?: boolean;
}) {
  return (
    <div className={cn('game-shell relative min-h-full text-white', className)}>
      {hex && (
        <div className="pointer-events-none absolute inset-0 game-hex-grid opacity-30" aria-hidden />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function GamePanel({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={cn('game-panel relative rounded-2xl', glow && 'game-panel-glow select-ring', className)}>
      <div className="game-scanline" aria-hidden />
      {children}
    </div>
  );
}

export function GameChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('game-chip', className)}>{children}</span>;
}

export function GamePrimaryButton({
  children,
  className,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  className?: string;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'glass-btn inline-flex items-center justify-center gap-2 px-6 h-12 text-sm disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GameSectionTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && <div className="game-chip mb-2">{eyebrow}</div>}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight seduce-glow">
          <span className="bg-gradient-to-r from-white via-[#FFB3CD] to-[#FF2D78] bg-clip-text text-transparent">
            {title}
          </span>
        </h2>
        {subtitle && <p className="text-xs text-white/45 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const map: Record<string, string> = {
    SSR: 'from-[#ffd700] to-[#f59e0b] text-black',
    SR: 'from-[#ff2e88] to-[#c026d3] text-white',
    R: 'from-[#00e5ff] to-[#3b82f6] text-black',
    N: 'from-zinc-400 to-zinc-500 text-black',
  };
  return (
    <span
      className={cn(
        'px-2.5 py-0.5 rounded-md text-[10px] font-black tracking-[0.2em] bg-gradient-to-r shadow-lg backdrop-blur-sm',
        map[rarity] || map.N,
      )}
    >
      {rarity}
    </span>
  );
}
