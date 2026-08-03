'use client';

/**
 * CreateSuccessModal — gacha-style reveal after a companion is created.
 *
 * Phase 1 "score": overall score counts up, rarity tier bursts in with a
 *         shockwave, the three core stats animate to their rolled values.
 * Phase 2 "portrait": the generated portrait is showcased with a rotating
 *         rarity aura + floating particles; "去聊天 / 再创建一个" actions below.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, Sparkles, ChevronRight } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/demo-data';
import { rarityBandLabel } from '@/lib/rarity';
import { useTranslation } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

export interface CreatedCompanionReveal {
  id: string;
  name: string;
  portraitUrl: string;
  rarity: Rarity;
  score: number;
  desire: number;
  development: number;
  kink: number;
}

interface Props {
  companion: CreatedCompanionReveal | null;
  onGoChat: () => void;
  onCreateAnother: () => void;
}

/** Ease-out count-up hook. */
function useCountUp(target: number, duration = 1500, run = true): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    setValue(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, run]);
  return value;
}

function StatBar({
  label, value, color, delay,
}: { label: string; value: number; color: string; delay: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 shrink-0 text-right text-[11px] text-white/60">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}66, ${color})`, boxShadow: `0 0 8px ${color}80` }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, delay, ease: 'easeOut' }}
        />
      </div>
      <motion.span
        className="w-8 shrink-0 font-mono text-[11px] font-bold text-white/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.6 }}
      >
        {value}
      </motion.span>
    </div>
  );
}

export function CreateSuccessModal({ companion, onGoChat, onCreateAnother }: Props) {
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';
  const [phase, setPhase] = useState<'score' | 'portrait'>('score');
  const [revealed, setRevealed] = useState(false);

  const score = companion?.score ?? 0;
  const shown = useCountUp(score, 1500, Boolean(companion) && phase === 'score');

  // Reset when a new companion is revealed
  useEffect(() => {
    if (companion) {
      setPhase('score');
      setRevealed(false);
    }
  }, [companion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Score count-up finishes → burst the rarity badge, then auto-advance
  useEffect(() => {
    if (!companion || phase !== 'score') return;
    const revealTimer = setTimeout(() => setRevealed(true), 1650);
    const advanceTimer = setTimeout(() => setPhase('portrait'), 4000);
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(advanceTimer);
    };
  }, [companion, phase]);

  const theme = RARITY_COLORS[companion?.rarity || 'R'];

  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        key: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.8 + Math.random() * 2.6,
        size: 3 + Math.random() * 5,
        drift: (Math.random() - 0.5) * 60,
      })),
    // new particle field per companion
    [companion?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <AnimatePresence>
      {companion && (
        <motion.div
          key="reveal-overlay"
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[#06030c]/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => phase === 'score' && revealed && setPhase('portrait')}
        >
          {/* Ambient rarity glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 70% 55% at 50% 42%, ${theme.glow.replace(/[\d.]+\)$/, '0.16)')} 0%, transparent 70%)`,
            }}
          />

          {/* Floating particles (phase 2 showcase) */}
          {phase === 'portrait' && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {particles.map((p) => (
                <motion.span
                  key={p.key}
                  className="absolute rounded-full"
                  style={{
                    left: `${p.left}%`,
                    bottom: '-12px',
                    width: p.size,
                    height: p.size,
                    background: theme.color,
                    boxShadow: `0 0 ${p.size * 2.5}px ${theme.glow}`,
                  }}
                  initial={{ y: 0, opacity: 0 }}
                  animate={{ y: -560, x: p.drift, opacity: [0, 0.9, 0] }}
                  transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
                />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── Phase 1: score + rarity reveal ─────────────────────────── */}
            {phase === 'score' && (
              <motion.div
                key="phase-score"
                className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                transition={{ duration: 0.3 }}
              >
                <motion.p
                  className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Sparkles className="h-3 w-3" style={{ color: theme.color }} />
                  {t('success.congrats') || (zh ? '创建成功' : 'Creation Successful')}
                  <Sparkles className="h-3 w-3" style={{ color: theme.color }} />
                </motion.p>
                <p className="mb-6 text-[11px] text-white/35">
                  {t('success.scoreHint') || (zh ? '命运正在结算…' : 'Destiny is rolling…')}
                </p>

                {/* Score orb */}
                <div className="relative mb-5 flex h-44 w-44 items-center justify-center">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2"
                    style={{ borderColor: `${theme.color}55`, boxShadow: `0 0 42px ${theme.glow}, inset 0 0 30px ${theme.glow}` }}
                    animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="absolute inset-3 rounded-full border border-white/10" />
                  <div className="text-center">
                    <div className="font-mono text-6xl font-black tabular-nums" style={{ color: theme.color, textShadow: `0 0 24px ${theme.glow}` }}>
                      {shown}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/40">
                      {t('success.score') || (zh ? '综合评分' : 'Overall Score')}
                    </div>
                  </div>
                  {/* Shockwave on reveal */}
                  {revealed && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2"
                      style={{ borderColor: theme.color }}
                      initial={{ scale: 1, opacity: 0.9 }}
                      animate={{ scale: 2.1, opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                  )}
                </div>

                {/* Rarity burst */}
                <div className="mb-7 h-16">
                  {revealed && (
                    <motion.div
                      className="flex items-center justify-center gap-3"
                      initial={{ scale: 0.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    >
                      <span
                        className="px-4 py-1.5 text-3xl font-black italic tracking-wider"
                        style={{
                          color: theme.color,
                          textShadow: `0 0 18px ${theme.glow}, 0 0 46px ${theme.glow}`,
                          WebkitTextStroke: `1px ${theme.color}66`,
                        }}
                      >
                        {companion.rarity}
                      </span>
                      <span className="text-sm font-semibold text-white/70">
                        {rarityBandLabel(companion.rarity, zh)}
                      </span>
                    </motion.div>
                  )}
                </div>

                {/* Stat bars */}
                <div className={cn('w-full space-y-2.5 transition-opacity duration-500', revealed ? 'opacity-100' : 'opacity-0')}>
                  <StatBar label={t('success.statDesire') || (zh ? '欲望值' : 'Desire')} value={companion.desire} color="#ff2e88" delay={0} />
                  <StatBar label={t('success.statDevelopment') || (zh ? '开发值' : 'Develop')} value={companion.development} color="#8b5cf6" delay={0.15} />
                  <StatBar label={t('success.statKink') || (zh ? '变态值' : 'Kink')} value={companion.kink} color="#00e5ff" delay={0.3} />
                </div>

                {revealed && (
                  <motion.button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPhase('portrait'); }}
                    className="mt-7 flex items-center gap-1 text-xs text-white/45 hover:text-white/80"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {t('success.continue') || (zh ? '查看立绘' : 'View Portrait')} <ChevronRight className="h-3.5 w-3.5" />
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* ── Phase 2: portrait showcase + actions ──────────────────── */}
            {phase === 'portrait' && (
              <motion.div
                key="phase-portrait"
                className="relative z-10 flex w-full max-w-md flex-col items-center px-6"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                {/* Portrait with rotating aura */}
                <div className="relative mb-5">
                  <motion.div
                    className="absolute -inset-5 rounded-full opacity-70 blur-2xl"
                    style={{ background: `conic-gradient(from 0deg, transparent 0%, ${theme.color}66 25%, transparent 50%, ${theme.color}44 75%, transparent 100%)` }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    className="relative w-[240px] overflow-hidden rounded-2xl border sm:w-[270px]"
                    style={{ borderColor: `${theme.color}66`, boxShadow: `0 0 36px ${theme.glow}, 0 24px 60px rgba(0,0,0,0.6)` }}
                    initial={{ scale: 0.8, opacity: 0, rotate: -3 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={companion.portraitUrl} alt={companion.name} className="aspect-[3/4] w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-base font-bold text-white">{companion.name}</div>
                        <div className="text-[10px] text-white/60">
                          {t('success.score') || (zh ? '综合评分' : 'Score')} {companion.score}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-md px-2 py-0.5 text-sm font-black italic"
                        style={{ color: theme.color, background: 'rgba(0,0,0,0.45)', border: `1px solid ${theme.color}55`, textShadow: `0 0 12px ${theme.glow}` }}
                      >
                        {companion.rarity}
                      </span>
                    </div>
                  </motion.div>
                </div>

                <p className="mb-6 text-center text-xs leading-5 text-white/55">
                  {zh
                    ? `${companion.name} 已降临，稀有度 ${companion.rarity} · ${rarityBandLabel(companion.rarity, true)}`
                    : `${companion.name} has arrived — ${companion.rarity} · ${rarityBandLabel(companion.rarity, false)}`}
                </p>

                {/* Actions */}
                <div className="flex w-full max-w-xs items-center gap-3">
                  <motion.button
                    type="button"
                    onClick={onGoChat}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-sm font-bold text-white shadow-[0_0_24px_rgba(255,45,120,0.45)] active:scale-95 transition-transform"
                    whileHover={{ scale: 1.03 }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {t('success.goChat') || (zh ? '去聊天' : 'Chat Now')}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={onCreateAnother}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.05] text-sm font-semibold text-white/80 hover:bg-white/[0.09] active:scale-95 transition-all"
                    whileHover={{ scale: 1.03 }}
                  >
                    <Sparkles className="h-4 w-4" />
                    {t('success.createAnother') || (zh ? '再创建一个' : 'Create Another')}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
