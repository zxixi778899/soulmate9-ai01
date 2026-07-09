'use client';

/**
 * OoXX GirlfriendCard — game-character selection style
 *
 * Features:
 *  - 3D tilt on mouse-move (useMotionValue + useTransform)
 *  - Rarity border glow (SSR / SR / R / N)
 *  - Holographic moving light edge
 *  - Hover: scanline + lift
 *  - Tap: SELECT → emits selection event
 */

import { motion, useMotionValue, useTransform } from 'motion/react';
import { useState } from 'react';
import { Heart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

const RARITY_STYLES: Record<Rarity, { border: string; glow: string; label: string; gradient: string }> = {
  N: {
    border: 'border-white/15',
    glow: 'shadow-[0_0_18px_rgba(255,255,255,0.05)]',
    label: 'N',
    gradient: 'from-zinc-400/30 to-zinc-500/10',
  },
  R: {
    border: 'border-[#00e5ff]/40',
    glow: 'shadow-[0_0_24px_rgba(0,229,255,0.4)]',
    label: 'R',
    gradient: 'from-[#00e5ff]/40 to-cyan-500/10',
  },
  SR: {
    border: 'border-[#ff2e88]/50',
    glow: 'shadow-[0_0_28px_rgba(255,46,136,0.5)]',
    label: 'SR',
    gradient: 'from-[#ff2e88]/50 to-fuchsia-500/10',
  },
  SSR: {
    border: 'border-[#ffd700]/60',
    glow: 'shadow-[0_0_36px_rgba(255,215,0,0.55)]',
    label: 'SSR',
    gradient: 'from-[#ffd700]/50 via-[#ff2e88]/30 to-[#00e5ff]/30',
  },
};

export interface Girl {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  tags: string[];
  rarity?: Rarity;
  intimacy?: number; // 0-100
  personality?: string;
  age?: number;
  online?: boolean;
}

interface GirlfriendCardProps {
  girl: Girl;
  onSelect?: (girl: Girl) => void;
  onClick?: (girl: Girl) => void;
  className?: string;
}

export function GirlfriendCard({ girl, onSelect, onClick, className }: GirlfriendCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [hovered, setHovered] = useState(false);

  const rotateX = useTransform(y, [-150, 150], [10, -10]);
  const rotateY = useTransform(x, [-150, 150], [-10, 10]);
  const lightX = useTransform(x, [-150, 150], [0, 100]);
  const lightY = useTransform(y, [-150, 150], [0, 100]);

  const rarity = girl.rarity || 'R';
  const rStyle = RARITY_STYLES[rarity];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setHovered(false);
  };

  return (
    <motion.div
      className={cn(
        'relative w-72 rounded-3xl overflow-hidden cursor-pointer group',
        'bg-[#111114] border-2',
        rStyle.border,
        'transition-shadow duration-300',
        rStyle.glow,
        className,
      )}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        transformPerspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      onClick={() => onClick?.(girl)}
    >
      {/* Holographic moving light edge */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255,46,136,0.18), transparent 50%)`,
        }}
      />

      {/* Portrait area */}
      <div className="relative h-80 overflow-hidden">
        {/* Rarity gradient background */}
        <div className={cn('absolute inset-0 bg-gradient-to-b opacity-60', rStyle.gradient)} />

        {girl.avatar ? (
          <img
            src={girl.avatar}
            alt={girl.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.08]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-7xl font-bold text-white/30">
            {girl.name.charAt(0)}
          </div>
        )}

        {/* Top gradient + scanline */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
        {hovered && (
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent"
            initial={{ y: 0 }}
            animate={{ y: [0, 320, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}

        {/* Top-left rarity badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div
            className={cn(
              'px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.2em] backdrop-blur-md',
              rarity === 'SSR' && 'bg-[#ffd700]/20 text-[#ffd700] border border-[#ffd700]/40',
              rarity === 'SR' && 'bg-[#ff2e88]/20 text-[#ff2e88] border border-[#ff2e88]/40',
              rarity === 'R' && 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/40',
              rarity === 'N' && 'bg-white/10 text-white/70 border border-white/20',
            )}
          >
            {rStyle.label}
          </div>
          {girl.online && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] text-emerald-300 font-semibold tracking-wider">ONLINE</span>
            </div>
          )}
        </div>

        {/* Top-right favorite */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-[#ff2e88] hover:border-[#ff2e88]/40 transition-all"
        >
          <Heart className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info section */}
      <div className="relative p-5 space-y-3 bg-[#111114]">
        {/* Name row */}
        <div className="flex items-baseline justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-white">{girl.name}</h3>
            {girl.age && (
              <span className="text-xs text-zinc-500 ml-1">· {girl.age}</span>
            )}
          </div>
          {girl.intimacy !== undefined && (
            <div className="flex items-center gap-1 text-[10px] text-[#ff2e88]">
              <Heart className="h-3 w-3 fill-current" />
              <span className="font-mono">{girl.intimacy}</span>
            </div>
          )}
        </div>

        {/* Tagline */}
        <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">{girl.tagline}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {girl.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              onClick={(e) => e.stopPropagation()}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] hover:border-white/[0.15] cursor-pointer transition-all"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Intimacy bar + SELECT */}
        <div className="pt-2 flex items-center gap-3">
          {girl.intimacy !== undefined && (
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${girl.intimacy}%`,
                    background: 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                    boxShadow: '0 0 8px rgba(255, 46, 136, 0.5)',
                  }}
                />
              </div>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(girl);
            }}
            className="px-5 py-2 rounded-2xl text-[11px] font-bold tracking-[0.2em] text-white transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #ff2e88, #c026d3)',
              boxShadow: '0 0 20px rgba(255, 46, 136, 0.4)',
            }}
          >
            SELECT
          </button>
        </div>
      </div>

      {/* Bottom-corner sparkles for SSR */}
      {rarity === 'SSR' && (
        <>
          <Sparkles className="absolute top-12 right-3 h-4 w-4 text-[#ffd700] opacity-70 animate-pulse" />
          <Sparkles className="absolute bottom-20 left-2 h-3 w-3 text-[#ffd700] opacity-50" />
        </>
      )}
    </motion.div>
  );
}

/**
 * 3D hoverable grid with stagger animation entrance
 */
export function GirlfriendCardGrid({
  girls,
  onSelectGirl,
  className,
}: {
  girls: Girl[];
  onSelectGirl?: (girl: Girl) => void;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5',
        className,
      )}
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.04, delayChildren: 0.05 },
        },
      }}
    >
      {girls.map((girl) => (
        <motion.div
          key={girl.id}
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
          }}
        >
          <GirlfriendCard girl={girl} onSelect={onSelectGirl} />
        </motion.div>
      ))}
    </motion.div>
  );
}