'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy, MessageCircle, CalendarCheck, Crown, Coins } from 'lucide-react';
import { REWARD_EFFECT_EVENT, type RewardEffectDetail, type RewardEffectKind } from '@/lib/reward-events';

/**
 * RewardEffectOverlay — full-screen celebration for daily-quest completions,
 * check-ins, all-quests bonus and achievement unlocks. Listens for the
 * `soulmate:reward-effect` window event and plays a queued particle/glow
 * animation for each one. Mount once near the app root.
 */

const KIND_META: Record<
  RewardEffectKind,
  { icon: typeof Trophy; accent: string; glow: string }
> = {
  quest: { icon: MessageCircle, accent: '#00e5ff', glow: 'rgba(0,229,255,0.55)' },
  achievement: { icon: Trophy, accent: '#ffd700', glow: 'rgba(255,215,0,0.55)' },
  checkin: { icon: CalendarCheck, accent: '#34d399', glow: 'rgba(52,211,153,0.5)' },
  bonus: { icon: Crown, accent: '#ff2e88', glow: 'rgba(255,46,136,0.55)' },
};

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  color: string;
  drift: number;
}

function buildParticles(accent: string): Particle[] {
  const colors = [accent, '#ffd700', '#ff2e88', '#00e5ff', '#ffffff'];
  return Array.from({ length: 26 }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 30,
    y: 45 + (Math.random() - 0.5) * 20,
    size: 6 + Math.random() * 10,
    delay: Math.random() * 0.25,
    color: colors[i % colors.length],
    drift: (Math.random() - 0.5) * 260,
  }));
}

export function RewardEffectOverlay() {
  const [detail, setDetail] = useState<RewardEffectDetail | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReward = (event: Event) => {
      const d = (event as CustomEvent<RewardEffectDetail>).detail;
      if (!d || !d.title) return;
      const meta = KIND_META[d.kind] ?? KIND_META.quest;
      setParticles(buildParticles(meta.accent));
      setDetail(d);
      clearTimeout(timer);
      timer = setTimeout(() => setDetail(null), 2600);
    };
    window.addEventListener(REWARD_EFFECT_EVENT, onReward);
    return () => {
      window.removeEventListener(REWARD_EFFECT_EVENT, onReward);
      clearTimeout(timer);
    };
  }, []);

  const meta = detail ? KIND_META[detail.kind] ?? KIND_META.quest : KIND_META.quest;
  const Icon = meta.icon;
  const rewardKey = useMemo(
    () => (detail ? `${detail.title}-${detail.reward ?? 0}` : 'none'),
    [detail],
  );

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          key={rewardKey}
          className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* dim veil */}
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" />

          {/* expanding glow ring */}
          <motion.div
            className="absolute rounded-full"
            style={{ boxShadow: `0 0 140px 70px ${meta.glow}` }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* particle burst */}
          {particles.map((p) => (
            <motion.span
              key={`${rewardKey}-${p.id}`}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 12px 2px ${p.color}`,
              }}
              initial={{ opacity: 1, scale: 0.4, x: 0, y: 0 }}
              animate={{
                opacity: [1, 1, 0],
                scale: [0.4, 1, 0.6],
                x: p.drift,
                y: -140 - Math.random() * 160,
              }}
              transition={{ duration: 1.4, delay: p.delay, ease: 'easeOut' }}
            />
          ))}

          {/* center card */}
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <motion.div
              className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl"
              style={{ boxShadow: `0 0 60px 10px ${meta.glow}` }}
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
            >
              <Icon className="h-10 w-10" style={{ color: meta.accent }} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/70">
                {detail.subtitle || ''}
              </div>
              <h3 className="mt-1 max-w-[20rem] text-2xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                {detail.title}
              </h3>
            </motion.div>

            {typeof detail.reward === 'number' && detail.reward > 0 && (
              <motion.div
                className="flex items-center gap-1.5 rounded-full border border-[#ffd700]/40 bg-[#ffd700]/15 px-4 py-1.5"
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 18 }}
              >
                <Coins className="h-4 w-4 text-[#ffd700]" />
                <span className="text-base font-bold tabular-nums text-[#ffd700]">
                  +{detail.reward}
                </span>
                <span className="text-xs font-medium text-[#ffd700]/80">credits</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default RewardEffectOverlay;
