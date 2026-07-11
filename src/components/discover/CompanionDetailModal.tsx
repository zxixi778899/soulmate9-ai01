'use client';

/**
 * CompanionDetailModal — full-screen holographic detail view.
 *
 * Layout: left big 3D-tilt portrait, right info panel with personality bars + voice + big SELECT.
 */

import { useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { X, Heart, Sparkles, Volume2, MessageCircle, Share2, UserPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DemoGirl } from '@/lib/demo-data';
import { CardMedia } from '@/components/discover/CardMedia';

interface Props {
  girl: DemoGirl;
  open: boolean;
  onClose: () => void;
  onSelect?: (girl: DemoGirl) => void;
  busy?: boolean;
  primaryLabel?: string;
}

const PERSONALITY_DIMENSIONS = [
  { key: 'Sweet', value: 78 },
  { key: 'Bold', value: 65 },
  { key: 'Playful', value: 82 },
  { key: 'Intellect', value: 70 },
  { key: 'Mystery', value: 88 },
];

export function CompanionDetailModal({ girl, open, onClose, onSelect, busy = false, primaryLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateY = useTransform(x, [-200, 200], [-15, 15]);
  const rotateX = useTransform(y, [-200, 200], [12, -12]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
         style={{ background: 'rgba(5, 5, 7, 0.92)', backdropFilter: 'blur(12px)' }}
         onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#ff2e88]/20 bg-[#0a0a0d]/95 backdrop-blur-3xl shadow-[0_0_60px_rgba(255,46,136,0.2)]"
        style={{ boxShadow: '0 0 60px rgba(255, 46, 136, 0.15), 0 0 120px rgba(0, 229, 255, 0.1)' }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid md:grid-cols-[1.2fr_1fr] gap-0">
          {/* LEFT: 3D portrait */}
          <div className="relative aspect-[3/4] md:aspect-auto md:min-h-[600px] overflow-hidden">
            <motion.div
              className="absolute inset-0 flex items-center justify-center cursor-grab"
              ref={ref}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                x.set(e.clientX - rect.left - rect.width / 2);
                y.set(e.clientY - rect.top - rect.height / 2);
              }}
              onMouseLeave={() => {
                x.set(0);
                y.set(0);
              }}
              style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transformPerspective: 1200 }}
            >
              <div className="absolute inset-0" style={{ transform: 'translateZ(40px)' }}>
                <CardMedia
                  src={girl.portrait || girl.avatar}
                  videoSrc={girl.video || girl.avatar_video}
                  alt={girl.name}
                  forcePlay
                  showBadge
                />
              </div>

              {/* Floating sparkles */}
              <Sparkles className="absolute top-1/4 right-1/4 h-5 w-5 text-[#ff2e88] animate-pulse" style={{ transform: 'translateZ(80px)' }} />
              <Sparkles className="absolute bottom-1/3 left-1/4 h-4 w-4 text-[#00e5ff] animate-pulse delay-300" style={{ transform: 'translateZ(60px)' }} />
            </motion.div>

            {/* Holographic frame */}
            <div className="absolute inset-0 pointer-events-none"
                 style={{
                   background:
                     'linear-gradient(135deg, rgba(255, 46, 136, 0.15) 0%, transparent 30%, transparent 70%, rgba(0, 229, 255, 0.15) 100%)',
                 }} />

            {/* Bottom info */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#ff2e88] mb-1">
                    {girl.rarity || 'R'} · ID #{girl.id.slice(0, 6)}
                  </div>
                  <h2 className="text-5xl font-bold tracking-tight text-white drop-shadow-[0_0_24px_rgba(255,46,136,0.4)]">
                    {girl.name}
                  </h2>
                </div>
                {girl.age && (
                  <div className="text-right text-zinc-400">
                    <div className="text-3xl font-bold text-white">{girl.age}</div>
                    <div className="text-[10px] uppercase tracking-wider">years</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: info + actions */}
          <div className="p-6 sm:p-8 space-y-5 flex flex-col">
            <p className="text-sm text-zinc-300 leading-relaxed">{girl.tagline}</p>

            {/* Personality radar */}
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-2.5">Personality</div>
              <div className="space-y-2">
                {PERSONALITY_DIMENSIONS.map((dim) => (
                  <div key={dim.key} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-zinc-400">{dim.key}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                          boxShadow: '0 0 8px rgba(255, 46, 136, 0.4)',
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${dim.value}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                      />
                    </div>
                    <span className="w-8 text-right text-zinc-300 font-mono">{dim.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {girl.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-300">
                  {tag}
                </span>
              ))}
            </div>

            {/* Voice preview */}
            <button
              onClick={() => {/* TODO: play voice */}}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all w-full"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#ff2e88] to-[#00e5ff] flex items-center justify-center">
                <Volume2 className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-xs text-white">Voice Preview</div>
                <div className="text-[10px] text-zinc-500">Tap to hear her voice</div>
              </div>
              <div className="flex items-end gap-0.5 h-4">
                {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
                  <span key={i} className="w-0.5 bg-[#ff2e88] rounded-full" style={{ height: `${h * 25}%` }} />
                ))}
              </div>
            </button>

            {/* Action buttons */}
            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect?.(girl)}
                className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/80 hover:text-[#ff2e88] hover:border-[#ff2e88]/40 transition-all"
                title="Add friend"
                aria-label="Add friend"
              >
                <Heart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const url = typeof window !== 'undefined' ? window.location.origin + '/explore' : '';
                    if (navigator.share) {
                      await navigator.share({ title: girl.name, text: girl.tagline || girl.name, url });
                    } else if (navigator.clipboard) {
                      await navigator.clipboard.writeText(`${girl.name} — ${url}`);
                    }
                  } catch { /* user cancelled */ }
                }}
                className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/80 hover:text-white transition-all"
                title="Share"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSelect?.(girl)}
                className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/80 hover:text-white transition-all"
                title="Chat now"
                aria-label="Chat now"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect?.(girl)}
              className="w-full h-14 rounded-2xl text-sm font-bold tracking-[0.15em] text-white relative overflow-hidden group disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #ff2e88, #c026d3)',
                boxShadow: '0 0 32px rgba(255, 46, 136, 0.5)',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {primaryLabel || 'ADD FRIEND & CHAT'}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>

            <p className="text-[10px] text-zinc-500 text-center">
              18+ · NSFW unlocked · Encrypted
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}