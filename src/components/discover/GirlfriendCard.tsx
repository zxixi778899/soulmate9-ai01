'use client';

/**
 * OoXX GirlfriendCard — game-character selection style
 * 3D tilt + rarity glow + holographic moving light
 */

import { motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useState } from 'react';
import { Heart, Sparkles, Flame, Wind, Droplet, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type DemoGirl, ELEMENT_COLORS } from '@/lib/demo-data';
import { CardMedia } from '@/components/discover/CardMedia';

const ELEMENT_ICON = {
  fire: Flame, water: Droplet, wind: Wind, light: Sun, dark: Moon,
};

const RARITY_STYLES: Record<string, { border: string; glow: string; badge: string }> = {
  SSR: { border: 'border-[#ffd700]/50', glow: 'shadow-[0_0_36px_rgba(255,215,0,0.45)]', badge: 'bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/40' },
  SR:  { border: 'border-[#ff2e88]/45', glow: 'shadow-[0_0_28px_rgba(255,46,136,0.5)]', badge: 'bg-[#ff2e88]/20 text-[#ff2e88] border-[#ff2e88]/40' },
  R:   { border: 'border-[#00e5ff]/40', glow: 'shadow-[0_0_24px_rgba(0,229,255,0.4)]', badge: 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40' },
  N:   { border: 'border-white/15',    glow: 'shadow-[0_0_18px_rgba(255,255,255,0.06)]', badge: 'bg-white/10 text-white/70 border-white/20' },
};

interface Props {
  girl: DemoGirl;
  size?: 'normal' | 'large';
  onSelect?: (g: DemoGirl) => void;
  onClick?: (g: DemoGirl) => void;
  className?: string;
}

export function GirlfriendCard({ girl, size = 'normal', onSelect, onClick, className }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [hovered, setHovered] = useState(false);
  // 3D tilt is desktop-only — fine pointer + hover. Touch devices skip
  // expensive motion transforms for smoother explore-grid scrolling.
  const [enableTilt, setEnableTilt] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setEnableTilt(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  const rotateX = useTransform(y, [-150, 150], [10, -10]);
  const rotateY = useTransform(x, [-150, 150], [-10, 10]);
  const lightX = useTransform(x, [-150, 150], [0, 100]);
  const lightY = useTransform(y, [-150, 150], [0, 100]);
  const rStyle = RARITY_STYLES[girl.rarity];
  const ElemIcon = ELEMENT_ICON[girl.element];
  const elemColor = ELEMENT_COLORS[girl.element];
  const wClass = size === 'large' ? 'w-80' : 'w-72';

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enableTilt) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left - r.width / 2);
    y.set(e.clientY - r.top - r.height / 2);
  };
  const onMouseLeave = () => { x.set(0); y.set(0); setHovered(false); };

  return (
    <motion.div
      className={cn(
        'relative rounded-3xl overflow-hidden cursor-pointer group',
        'bg-[#0e0e12] border-2',
        rStyle.border,
        'transition-shadow duration-300',
        rStyle.glow,
        wClass,
        className,
      )}
      style={
        enableTilt
          ? { rotateX, rotateY, transformStyle: 'preserve-3d', transformPerspective: 1000 }
          : undefined
      }
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onMouseLeave}
      whileHover={enableTilt ? { scale: 1.02 } : undefined}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      onClick={() => onClick?.(girl)}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
        style={{ background: `radial-gradient(circle at ${lightX}% ${lightY}%, rgba(255, 46, 136, 0.18), transparent 50%)` }}
      />

      <div className="relative aspect-[3/4] overflow-hidden">
        <div className={cn('absolute inset-0 bg-gradient-to-b opacity-50 z-[1] pointer-events-none',
          girl.rarity === 'SSR' && 'from-[#ffd700]/40 via-[#ff2e88]/15 to-[#00e5ff]/10',
          girl.rarity === 'SR' && 'from-[#ff2e88]/45 to-fuchsia-500/10',
          girl.rarity === 'R' && 'from-[#00e5ff]/40 to-cyan-500/10',
          girl.rarity === 'N' && 'from-zinc-400/30 to-zinc-500/5',
        )} />
        <CardMedia
          src={girl.portrait || girl.avatar}
          videoSrc={girl.video || girl.avatar_video}
          alt={girl.name}
          hoverPlay
          forcePlay={false}
          showBadge={!!(girl.video || girl.avatar_video)}
          imgClassName="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/30 via-transparent to-black/75 pointer-events-none" />

        {hovered && (
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent z-10"
            initial={{ y: 0 }}
            animate={{ y: [0, 480, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}

        <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
          <div className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.2em] backdrop-blur-md border', rStyle.badge)}>
            {girl.rarity}
          </div>
          <div className="h-7 w-7 rounded-full backdrop-blur-md border border-white/15 flex items-center justify-center" style={{ background: `${elemColor}30` }} title={girl.element}>
            <ElemIcon className="h-3.5 w-3.5" style={{ color: elemColor }} />
          </div>
        </div>

        <div className="absolute bottom-3 left-3 right-3 opacity-90">
          <p className="text-[10px] italic text-zinc-300 line-clamp-2">&quot;{girl.rarity_quote}&quot;</p>
        </div>
      </div>

      <div className="relative p-4 bg-[#0e0e12]">
        <div className="flex items-baseline justify-between">
          <h3 className="text-2xl font-bold tracking-tight text-white">
            {girl.name}
            <span className="text-[10px] text-zinc-500 font-normal ml-1.5">· {girl.age}</span>
          </h3>
          <div className="flex items-center gap-1 text-[10px] text-[#ff2e88]">
            <Heart className="h-3 w-3 fill-current" />
            <span className="font-mono">{girl.intimacy}</span>
          </div>
        </div>

        <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed mt-0.5">{girl.tagline}</p>

        <div className="flex flex-wrap gap-1 mt-2.5">
          {(Array.isArray(girl.tags) ? girl.tags : []).slice(0, 3).map((tag) => (
            <span key={tag} onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-300">
              {tag}
            </span>
          ))}
        </div>

        <div className="pt-2.5 flex items-center gap-3">
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${girl.intimacy}%`,
                background: 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                boxShadow: '0 0 8px rgba(255, 46, 136, 0.5)',
              }} />
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSelect?.(girl); }}
            className="px-4 py-1.5 rounded-2xl text-[10px] font-bold tracking-[0.2em] text-white transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #ff2e88, #c026d3)', boxShadow: '0 0 20px rgba(255, 46, 136, 0.4)' }}
          >
            SELECT
          </button>
        </div>
      </div>

      {girl.rarity === 'SSR' && (
        <>
          <Sparkles className="absolute top-12 right-3 h-4 w-4 text-[#ffd700] opacity-70 animate-pulse pointer-events-none" />
          <Sparkles className="absolute bottom-24 left-2 h-3 w-3 text-[#ffd700] opacity-50 pointer-events-none" />
        </>
      )}
    </motion.div>
  );
}

export function GirlfriendCardGrid({
  girls, onSelectGirl, onClickGirl, className, size,
}: {
  girls: DemoGirl[];
  onSelectGirl?: (g: DemoGirl) => void;
  onClickGirl?: (g: DemoGirl) => void;
  className?: string;
  size?: 'normal' | 'large';
}) {
  return (
    <motion.div
      className={cn('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5', className)}
      initial="hidden" animate="show"
      variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}
    >
      {girls.map((girl) => (
        <motion.div key={girl.id}
          variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
        >
          <GirlfriendCard girl={girl} size={size} onSelect={onSelectGirl} onClick={onClickGirl} />
        </motion.div>
      ))}
    </motion.div>
  );
}