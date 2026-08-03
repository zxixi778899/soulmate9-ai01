'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Trophy, Sparkles, CheckCircle2, Coins, CalendarCheck, Loader2, Flame,
  MessageCircle, Camera, Users, Images, Crown, ChevronRight,
} from 'lucide-react';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { authedFetch } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/context';
import { getTranslation } from '@/lib/i18n/translations';
import { fireRewardEffect, syncRewards } from '@/lib/reward-events';

interface DailyQuest {
  code: string;
  progress: number;
  goal: number;
  reward: number;
  done: boolean;
  claimed: boolean;
}

interface DailyQuestsResponse {
  date?: string;
  quests?: DailyQuest[];
  newly_claimed?: Array<{ code: string; reward: number }>;
  achievements_unlocked?: Array<{ code: string; name: string; reward: number }>;
  all_complete?: boolean;
  bonus_claimed?: boolean;
}

interface CheckinState {
  streak: number;
  claimed_today: boolean;
  next_reward: number;
  rewards?: number[];
}

const QUEST_ICONS: Record<string, typeof MessageCircle> = {
  checkin: CalendarCheck,
  first_message: MessageCircle,
  first_photo: Camera,
  three_companions: Users,
  three_photos: Images,
};

const QUEST_DESC_KEYS: Record<string, { key: string; fallback: string }> = {
  checkin: { key: 'quest.daily.checkinDesc', fallback: 'Claim today’s check-in reward' },
  first_message: { key: 'quest.daily.firstMessageDesc', fallback: 'Send the first message of the day' },
  first_photo: { key: 'quest.daily.firstPhotoDesc', fallback: 'Receive your first AI photo today' },
  three_companions: { key: 'quest.daily.threeCompanionsDesc', fallback: 'Message 3 different companions today' },
  three_photos: { key: 'quest.daily.threePhotosDesc', fallback: 'Collect 3 AI photos today' },
};

export default function QuestPage() {
  const { t, locale } = useTranslation();
  // Resolve dynamic keys (achievement names, quest descriptions) against the
  // active locale without tripping the strict TranslationKey union type.
  const tr = (key: string, fallback: string): string => {
    const v = getTranslation(key, locale);
    return v && v !== key ? v : fallback;
  };
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [questsData, setQuestsData] = useState<DailyQuestsResponse | null>(null);
  const [authed, setAuthed] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ci, mem, dq] = await Promise.all([
      authedFetch('/api/checkin').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authedFetch('/api/membership').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authedFetch('/api/daily-quests').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!ci && !mem) setAuthed(false);
    if (ci) {
      setCheckin(ci);
      setAuthed(true);
    }
    if (mem) setBalance(Number(mem.credits_remaining) || 0);
    if (dq) {
      setQuestsData(dq);
      // Celebrate anything that completed while the user was away.
      void celebrate(dq);
    }
    setLoading(false);
  }, []);

  const celebrate = async (data: DailyQuestsResponse) => {
    let any = false;
    for (const q of data.newly_claimed || []) {
      if (q.code === 'checkin' && q.reward <= 0) continue; // check-in celebrates separately
      fireRewardEffect({
        kind: q.code === 'all_bonus' ? 'bonus' : 'quest',
        title: questName(q.code),
        subtitle: q.code === 'all_bonus'
          ? t('quest.daily.allBonusDesc')
          : t('quest.daily.completed'),
        reward: q.reward,
      });
      any = true;
    }
    for (const a of data.achievements_unlocked || []) {
      fireRewardEffect({
        kind: 'achievement',
        title: tr(`ach.${a.code}.name`, a.name),
        subtitle: t('quest.achievementUnlocked'),
        reward: a.reward,
      });
      any = true;
    }
    if (any) window.dispatchEvent(new Event('soulmate:credits-updated'));
  };

  const questName = (code: string): string => {
    switch (code) {
      case 'checkin': return t('quest.daily.checkin');
      case 'first_message': return t('quest.daily.firstMessage');
      case 'first_photo': return t('quest.daily.firstPhoto');
      case 'three_companions': return t('quest.daily.threeCompanions');
      case 'three_photos': return t('quest.daily.threePhotos');
      case 'all_bonus': return t('quest.daily.allBonus');
      default: return code;
    }
  };

  const questDesc = (code: string): string => {
    const def = QUEST_DESC_KEYS[code];
    return def ? tr(def.key, def.fallback) : '';
  };

  useEffect(() => {
    void load();
    // Keep progress fresh while the page is open (other tabs complete quests).
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Refresh balance when credits change elsewhere.
  useEffect(() => {
    const onCredits = () => {
      authedFetch('/api/membership')
        .then((r) => (r.ok ? r.json() : null))
        .then((mem) => mem && setBalance(Number(mem.credits_remaining) || 0))
        .catch(() => {});
    };
    window.addEventListener('soulmate:credits-updated', onCredits);
    return () => window.removeEventListener('soulmate:credits-updated', onCredits);
  }, []);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await authedFetch('/api/checkin', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { ok?: boolean }).ok) {
        const d = data as { reward: number; streak: number };
        fireRewardEffect({
          kind: 'checkin',
          title: `${t('quest.daily.checkin')} · Day ${d.streak}`,
          subtitle: t('quest.daily.completed'),
          reward: d.reward,
        });
        window.dispatchEvent(new Event('soulmate:credits-updated'));
        await load();
        // Sync quest claims (check-in quest) a moment later.
        setTimeout(() => { void syncRewards({ force: true }); }, 1200);
      } else {
        toast.error((data as { error?: string }).error || 'Already claimed today');
      }
    } catch {
      toast.error('Network error');
    }
    setClaiming(false);
  };

  const rewards = checkin?.rewards ?? [10, 15, 20, 30, 40, 50, 80];
  const streak = checkin?.streak ?? 0;
  const claimedToday = checkin?.claimed_today ?? false;
  const quests = questsData?.quests ?? [];
  const doneCount = quests.filter((q) => q.done).length;
  const allComplete = Boolean(questsData?.all_complete);

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ffd700]">
            <Trophy className="h-3 w-3" /> Quest · Achievements · Daily
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#ffd700] via-[#ff2e88] to-[#00e5ff] bg-clip-text text-transparent">Adventure Log</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">Check in daily and complete quests to earn credits</p>
        </div>
      </section>

      {/* Daily check-in — real streak + real token rewards */}
      <section className="relative z-10 mt-8 px-4 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5" /> Daily Check-In
            </div>
            {balance !== null && (
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                <Coins className="h-3.5 w-3.5" /> {balance} credits
              </div>
            )}
          </div>

          {!authed ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 text-center">
              <p className="text-sm text-zinc-400">Sign in to claim daily credit rewards</p>
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

      {/* Daily quests — five tasks, live progress, auto-claimed rewards */}
      <section className="relative z-10 mt-10 px-4 sm:px-8 pb-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> {t('quest.daily.title')}
            </div>
            <div className="text-[10px] text-zinc-600 tabular-nums">{doneCount}/{quests.length || 5}</div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#ff2e88]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {quests.map((q, i) => {
                const Icon = QUEST_ICONS[q.code] ?? Sparkles;
                const pct = Math.min(100, (q.progress / q.goal) * 100);
                return (
                  <motion.div
                    key={q.code}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn(
                      'rounded-2xl border p-4 backdrop-blur-xl transition-all',
                      q.done
                        ? 'border-emerald-500/30 bg-emerald-500/[0.05] shadow-[0_0_22px_rgba(16,185,129,0.12)]'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                        q.done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-white/80',
                      )}>
                        {q.done ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-sm">{questName(q.code)}</h3>
                          {q.reward > 0 && (
                            <span className={cn(
                              'flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border tabular-nums',
                              q.done
                                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                                : 'border-[#ffd700]/30 bg-[#ffd700]/10 text-[#ffd700]',
                            )}>
                              <Coins className="h-3 w-3" /> +{q.reward}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{questDesc(q.code)}</p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${pct}%`,
                                background: q.done
                                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                                  : 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                                boxShadow: q.done ? '0 0 8px rgba(16,185,129,0.5)' : '0 0 8px rgba(255, 46, 136, 0.4)',
                              }}
                            />
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                            {q.progress} / {q.goal}
                          </div>
                        </div>
                        <div className={cn('mt-1.5 text-[10px]', q.done ? 'text-emerald-400' : 'text-zinc-500')}>
                          {q.done ? t('quest.daily.claimed') : t('quest.daily.inProgress')}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}

              {/* All-quests bonus card */}
              <div className={cn(
                'rounded-2xl border p-4 backdrop-blur-xl xl:col-span-2 transition-all',
                allComplete
                  ? 'border-[#ffd700]/50 bg-[#ffd700]/[0.07] shadow-[0_0_30px_rgba(255,215,0,0.18)]'
                  : 'border-dashed border-white/15 bg-white/[0.02]',
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                    allComplete ? 'bg-[#ffd700]/20 text-[#ffd700]' : 'bg-white/[0.06] text-white/60',
                  )}>
                    <Crown className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{t('quest.daily.allBonus')}</h3>
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#ffd700]/30 bg-[#ffd700]/10 text-[#ffd700] tabular-nums">
                        <Coins className="h-3 w-3" /> +20
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{t('quest.daily.allBonusDesc')}</p>
                  </div>
                  <div className="text-right">
                    {allComplete ? (
                      <span className="text-[11px] font-semibold text-[#ffd700]">{t('quest.daily.claimed')}</span>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-400 tabular-nums">{doneCount}/5</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="mt-4 text-center text-[10px] text-zinc-600">{t('quest.daily.rewardAuto')}</p>

          <div className="mt-6 flex justify-center">
            <Link
              href="/achievements"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#ffd700]/25 bg-[#ffd700]/[0.06] px-5 py-2.5 text-xs font-semibold text-[#ffd700] transition hover:bg-[#ffd700]/[0.12]"
            >
              <Trophy className="h-4 w-4" /> {t('quest.viewAchievements')} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
