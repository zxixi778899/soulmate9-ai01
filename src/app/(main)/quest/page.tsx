'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Trophy, Sparkles, Star, MessageCircle, Heart, Zap, Crown,
  CheckCircle2, Coins, CalendarCheck, Loader2, Flame,
} from 'lucide-react';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { authedFetch } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Quest {
  id: string;
  title: string;
  desc: string;
  progress: number;
  goal: number;
  reward: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
}

interface CheckinState {
  streak: number;
  claimed_today: boolean;
  next_reward: number;
  rewards: number[];
}

const RARITY_STYLES = {
  common:    { border: 'border-white/15',     glow: 'shadow-[0_0_18px_rgba(255,255,255,0.05)]', badge: 'bg-white/10 text-white/60 border-white/15' },
  rare:      { border: 'border-[#00e5ff]/40', glow: 'shadow-[0_0_22px_rgba(0,229,255,0.4)]',    badge: 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40' },
  epic:      { border: 'border-[#ff2e88]/45', glow: 'shadow-[0_0_28px_rgba(255,46,136,0.5)]',  badge: 'bg-[#ff2e88]/20 text-[#ff2e88] border-[#ff2e88]/40' },
  legendary: { border: 'border-[#ffd700]/50', glow: 'shadow-[0_0_36px_rgba(255,215,0,0.55)]',   badge: 'bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/40' },
};

export default function QuestPage() {
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [authed, setAuthed] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [usage, setUsage] = useState({ messages: 0, girlfriends: 0, intimacy: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ci, mem] = await Promise.all([
      authedFetch('/api/checkin').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authedFetch('/api/membership').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!ci && !mem) setAuthed(false);
    if (ci) {
      setCheckin(ci);
      setAuthed(true);
    }
    if (mem) {
      setBalance(Number(mem.credits_remaining) || 0);
      setUsage({
        messages: Number(mem.usage?.messages_sent_today) || 0,
        girlfriends: Number(mem.usage?.total_girlfriends) || 0,
        intimacy: Number(mem.usage?.highest_intimacy) || 0,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await authedFetch('/api/checkin', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { ok?: boolean }).ok) {
        const d = data as { reward: number; streak: number };
        toast.success(`+${d.reward} tokens claimed · Day ${d.streak} streak`);
        await load();
      } else {
        toast.error((data as { error?: string }).error || 'Already claimed today');
      }
    } catch {
      toast.error('Network error');
    }
    setClaiming(false);
  };

  // All progress below is derived from REAL account activity
  const QUESTS: Quest[] = [
    { id: 'q1', title: 'First Words',        desc: 'Send your first chat message today',            progress: Math.min(usage.messages, 1),   goal: 1, reward: '+5 tokens',   rarity: 'common',    icon: MessageCircle, done: usage.messages >= 1 },
    { id: 'q2', title: 'Heart to Heart',     desc: 'Send 50 messages in one day',                   progress: Math.min(usage.messages, 50),  goal: 50, reward: '+20 tokens',  rarity: 'common',    icon: Heart,        done: usage.messages >= 50 },
    { id: 'q3', title: 'Growing Closer',     desc: 'Reach intimacy level 3 with any companion',     progress: Math.min(usage.intimacy, 3),   goal: 3, reward: '+15 tokens',  rarity: 'rare',      icon: Star,         done: usage.intimacy >= 3 },
    { id: 'q4', title: 'Soulmate Bond',      desc: 'Reach intimacy level 5 with any companion',     progress: Math.min(usage.intimacy, 5),   goal: 5, reward: '+75 tokens',  rarity: 'epic',      icon: Sparkles,     done: usage.intimacy >= 5 },
    { id: 'q5', title: 'Companion Collector', desc: 'Have 5 companions at once',                    progress: Math.min(usage.girlfriends, 5), goal: 5, reward: '+50 tokens', rarity: 'epic',      icon: Zap,          done: usage.girlfriends >= 5 },
    { id: 'q6', title: 'Legendary Lover',    desc: 'Reach intimacy level 6 with any companion',     progress: Math.min(usage.intimacy, 6),   goal: 6, reward: '+500 tokens', rarity: 'legendary', icon: Crown,        done: usage.intimacy >= 6 },
  ];

  const rewards = checkin?.rewards ?? [10, 15, 20, 30, 40, 50, 80];
  const streak = checkin?.streak ?? 0;
  const claimedToday = checkin?.claimed_today ?? false;

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ffd700]">
            <Trophy className="h-3 w-3" /> Quest · Achievements · Daily
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#ffd700] via-[#ff2e88] to-[#00e5ff] bg-clip-text text-transparent">Adventure Log</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">Check in daily and complete quests to earn tokens</p>
        </div>
      </section>

      {/* Daily check-in — real streak + real token rewards */}
      <section className="relative z-10 mt-8 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" /> Daily Check-In
            </div>
            {balance !== null && (
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                <Coins className="h-3.5 w-3.5" /> {balance} tokens
              </div>
            )}
          </div>

          {!authed ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 text-center">
              <p className="text-sm text-zinc-400">Sign in to claim daily token rewards</p>
              <Link
                href="/login?next=/quest"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-[#ffd700] to-[#ff2e88] px-6 text-sm font-bold text-black"
              >
                Sign In
              </Link>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff2e88]" />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-4 sm:p-5">
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {rewards.map((r, i) => {
                  const claimed = i < streak;
                  const isToday = i === streak && !claimedToday;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-xl border p-2 sm:p-3 text-center transition-all',
                        claimed
                          ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                          : isToday
                          ? 'border-[#ffd700]/60 bg-[#ffd700]/[0.08] shadow-[0_0_16px_rgba(255,215,0,0.25)]'
                          : 'border-white/[0.08] bg-white/[0.03]',
                      )}
                    >
                      <div className="text-[9px] text-zinc-500">Day {i + 1}</div>
                      {claimed ? (
                        <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 mx-auto my-1" />
                      ) : (
                        <Coins className={cn('h-4 w-4 sm:h-5 sm:w-5 mx-auto my-1', isToday ? 'text-[#ffd700]' : 'text-zinc-600')} />
                      )}
                      <div className={cn('text-[10px] font-bold tabular-nums', claimed ? 'text-emerald-400' : isToday ? 'text-[#ffd700]' : 'text-zinc-500')}>
                        +{r}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Flame className="h-4 w-4 text-orange-400" />
                  {streak > 0 ? `${streak}-day streak` : 'Start your streak today'}
                  {streak >= 7 && <span className="text-[#ffd700]">· max rewards!</span>}
                </div>
                <button
                  onClick={() => void claim()}
                  disabled={claimedToday || claiming}
                  className={cn(
                    'h-10 px-6 rounded-xl text-sm font-bold transition-all',
                    claimedToday
                      ? 'bg-white/[0.06] text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black hover:opacity-90 active:scale-95',
                  )}
                >
                  {claiming ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : claimedToday ? (
                    'Come back tomorrow'
                  ) : (
                    `Claim +${checkin?.next_reward ?? rewards[Math.min(streak, rewards.length - 1)]}`
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main quests — progress synced from real activity */}
      <section className="relative z-10 mt-10 px-4 sm:px-8 pb-20">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Main Quests</div>
            <div className="text-[10px] text-zinc-600">Progress syncs with your real activity</div>
          </div>
          <div className="space-y-3">
            {QUESTS.map((q, i) => {
              const rs = RARITY_STYLES[q.rarity];
              const Icon = q.icon;
              const pct = Math.min(100, (q.progress / q.goal) * 100);
              return (
                <motion.div key={q.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn('rounded-2xl border p-4 backdrop-blur-xl transition-all',
                    q.done ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                           : cn('border bg-white/[0.03] hover:border-white/20', rs.border, !q.done && rs.glow))}>
                  <div className="flex items-start gap-3">
                    <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                      q.done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-white/80')}>
                      {q.done ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm">{q.title}</h3>
                        <span className={cn('text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider', rs.badge)}>
                          {q.rarity}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{q.desc}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: q.done
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                              boxShadow: '0 0 8px rgba(255, 46, 136, 0.4)',
                            }} />
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                          {q.progress} / {q.goal}
                        </div>
                      </div>
                      <div className="mt-1.5 text-[10px] text-[#ff2e88]">Reward: {q.reward}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <p className="mt-4 text-center text-[10px] text-zinc-600">
            Quest rewards are granted automatically when quest claiming launches. Daily check-in tokens are credited instantly.
          </p>
        </div>
      </section>
    </div>
  );
}
