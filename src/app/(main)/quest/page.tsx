'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Trophy, Sparkles, CheckCircle2, Coins, CalendarCheck, Loader2, Flame,
  MessageCircle, Camera, Users, Images, Crown, ChevronRight,
  Medal, Star, Lock, Gift, ShoppingBag, Heart, Target,
} from 'lucide-react';
import { getTonightScenario } from '@/lib/daily-quests';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/context';
import { getTranslation } from '@/lib/i18n/translations';
import { fireRewardEffect, syncRewards } from '@/lib/reward-events';
import { logger } from '@/lib/logger';

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

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  reward_tokens: number;
  reward_title?: string;
  condition_type: string;
  condition_value: number;
  rarity?: string;
  is_hidden?: boolean;
  user_progress?: { progress_value: number; unlocked: boolean; reward_claimed: boolean };
}

type TabKey = 'daily' | 'achievements';
type Category = 'all' | 'interaction' | 'consumption' | 'collection' | 'intimacy' | 'membership';

const QUEST_ICONS: Record<string, typeof MessageCircle> = {
  checkin: CalendarCheck,
  first_message: MessageCircle,
  first_photo: Camera,
  three_companions: Users,
  three_photos: Images,
  tonight_story: Flame,
};

const QUEST_DESC_KEYS: Record<string, { key: string; fallback: string }> = {
  checkin: { key: 'quest.daily.checkinDesc', fallback: 'Claim today’s check-in reward' },
  first_message: { key: 'quest.daily.firstMessageDesc', fallback: 'Send the first message of the day' },
  first_photo: { key: 'quest.daily.firstPhotoDesc', fallback: 'Receive your first AI photo today' },
  three_companions: { key: 'quest.daily.threeCompanionsDesc', fallback: 'Message 3 different companions today' },
  three_photos: { key: 'quest.daily.threePhotosDesc', fallback: 'Collect 3 AI photos today' },
  tonight_story: { key: 'quest.daily.tonightStoryDesc', fallback: 'Play 3 scenes of tonight\'s story in scene mode' },
};

const RARITY_CONFIG: Record<string, { color: string; bg: string; ring: string; icon: typeof Trophy }> = {
  common: { color: 'text-slate-200', bg: 'bg-slate-500/20', ring: 'ring-slate-400/30', icon: Medal },
  rare: { color: 'text-sky-300', bg: 'bg-sky-500/20', ring: 'ring-sky-400/40', icon: Star },
  epic: { color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/20', ring: 'ring-fuchsia-400/40', icon: Trophy },
  legendary: { color: 'text-amber-300', bg: 'bg-amber-500/25', ring: 'ring-amber-400/50', icon: Sparkles },
};

const CATEGORY_ICONS: Record<string, typeof MessageCircle> = {
  interaction: MessageCircle,
  consumption: Gift,
  collection: ShoppingBag,
  intimacy: Heart,
  membership: Crown,
};

const CATEGORIES: Category[] = ['all', 'interaction', 'consumption', 'collection', 'intimacy', 'membership'];

/** Codes whose family is not derivable from a trailing number. */
const FAMILY_ALIAS: Record<string, string> = {
  intimacy_lv3: 'intimacy_lv',
  intimacy_lv4: 'intimacy_lv',
  intimacy_lv5: 'intimacy_lv',
  intimacy_lv6: 'intimacy_lv',
};

/**
 * Monetization-gated achievements: hint chip nudges users toward the
 * upgrade / top-up action needed to clear them.
 */
const UPGRADE_HINTS: Record<string, { key: string; href: string }> = {
  partners_5: { key: 'quest.ach.hintPro', href: '/pricing' },
  partners_10: { key: 'quest.ach.hintPro', href: '/pricing' },
  collector_5: { key: 'quest.ach.hintPro', href: '/pricing' },
  collector_10: { key: 'quest.ach.hintPro', href: '/pricing' },
  collector_20: { key: 'quest.ach.hintPro', href: '/pricing' },
  trio_lv5: { key: 'quest.ach.hintPro', href: '/pricing' },
  harem_lv5: { key: 'quest.ach.hintPro', href: '/pricing' },
  soulmate_3: { key: 'quest.ach.hintPro', href: '/pricing' },
  video_1: { key: 'quest.ach.hintUnlimited', href: '/pricing' },
  video_5: { key: 'quest.ach.hintUnlimited', href: '/pricing' },
  video_20: { key: 'quest.ach.hintUnlimited', href: '/pricing' },
  video_50: { key: 'quest.ach.hintUnlimited', href: '/pricing' },
  image_1000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  spent_10000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  spent_50000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  first_top_up: { key: 'quest.ach.hintTopup', href: '/wallet' },
  top_up_100: { key: 'quest.ach.hintTopup', href: '/wallet' },
  top_up_500: { key: 'quest.ach.hintTopup', href: '/wallet' },
  top_up_1000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  top_up_5000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  top_up_20000: { key: 'quest.ach.hintTopup', href: '/wallet' },
  created_10: { key: 'quest.ach.hintCards', href: '/wallet' },
  created_30: { key: 'quest.ach.hintCards', href: '/wallet' },
  created_50: { key: 'quest.ach.hintCards', href: '/wallet' },
  ssr_10: { key: 'quest.ach.hintCards', href: '/wallet' },
};

function achievementFamily(code: string): string {
  if (FAMILY_ALIAS[code]) return FAMILY_ALIAS[code];
  return code.replace(/_\d+$/, '');
}

export default function QuestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <QuestPageInner />
    </Suspense>
  );
}

function QuestPageInner() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Resolve dynamic keys (achievement names, quest descriptions) against the
  // active locale without tripping the strict TranslationKey union type.
  const tr = (key: string, fallback: string): string => {
    const v = getTranslation(key, locale);
    return v && v !== key ? v : fallback;
  };

  const [tab, setTab] = useState<TabKey>(
    searchParams.get('tab') === 'achievements' ? 'achievements' : 'daily',
  );
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [questsData, setQuestsData] = useState<DailyQuestsResponse | null>(null);
  const [authed, setAuthed] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isFree, setIsFree] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep tab in sync when the URL changes (e.g. links with ?tab=achievements).
  useEffect(() => {
    setTab(searchParams.get('tab') === 'achievements' ? 'achievements' : 'daily');
  }, [searchParams]);

  const switchTab = (next: TabKey) => {
    setTab(next);
    router.replace(next === 'achievements' ? '/quest?tab=achievements' : '/quest', { scroll: false });
  };

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
    if (mem) {
      setBalance(Number(mem.credits_remaining) || 0);
      setIsFree(Boolean(mem.is_free));
    }
    if (dq) {
      setQuestsData(dq);
      // Celebrate anything that completed while the user was away.
      void celebrate(dq);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .then((mem) => {
          if (mem) {
            setBalance(Number(mem.credits_remaining) || 0);
            setIsFree(Boolean(mem.is_free));
          }
        })
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
  const tonightScenario = getTonightScenario();
  const zhUi = String(locale || '').toLowerCase().startsWith('zh');
  const allComplete = Boolean(questsData?.all_complete);

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-none text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ffd700]">
            <Trophy className="h-3 w-3" /> Quest · Achievements · Daily
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#ffd700] via-[#ff2e88] to-[#00e5ff] bg-clip-text text-transparent">Adventure Log</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">
            {tab === 'achievements' ? t('quest.ach.subtitle') : t('quest.daily.subtitle')}
          </p>
        </div>
      </section>

      {/* Tabs: Daily Adventure | Hall of Achievements */}
      <section className="relative z-10 mt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-none">
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-1.5">
            <button
              type="button"
              onClick={() => switchTab('daily')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                tab === 'daily'
                  ? 'bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black shadow-[0_0_18px_rgba(255,46,136,0.35)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.05]',
              )}
            >
              <CalendarCheck className="h-4 w-4" /> {t('quest.tab.daily')}
            </button>
            <button
              type="button"
              onClick={() => switchTab('achievements')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all',
                tab === 'achievements'
                  ? 'bg-gradient-to-r from-[#ff2e88] to-[#a855f7] text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.05]',
              )}
            >
              <Trophy className="h-4 w-4" /> {t('quest.tab.achievements')}
            </button>
          </div>
        </div>
      </section>

      {tab === 'achievements' ? (
        <AchievementsPanel isFree={isFree} tr={tr} />
      ) : (
        <>
          {/* Daily check-in — real streak + real token rewards */}
          <section className="relative z-10 mt-8 px-4 sm:px-8">
            <div className="mx-auto max-w-none">
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
            <div className="mx-auto max-w-none">
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
                            {q.code === 'tonight_story' && (
                              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#ff2e88]/25 bg-[#ff2e88]/10 px-2 py-0.5 text-[10px] font-semibold text-[#ff9ec4]">
                                <Flame className="h-3 w-3" />
                                {zhUi ? `今晚：${tonightScenario.labelZh}` : `Tonight: ${tonightScenario.labelEn}`}
                                <span className="text-white/45 font-normal">· {tonightScenario.opening}</span>
                              </div>
                            )}
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
                <button
                  type="button"
                  onClick={() => switchTab('achievements')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#ffd700]/25 bg-[#ffd700]/[0.06] px-5 py-2.5 text-xs font-semibold text-[#ffd700] transition hover:bg-[#ffd700]/[0.12]"
                >
                  <Trophy className="h-4 w-4" /> {t('quest.viewAchievements')} <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ═══════════════════ Achievements panel (merged from /achievements) ═══════════════════ */

function AchievementsPanel({
  isFree,
  tr,
}: {
  isFree: boolean | null;
  tr: (key: string, fallback: string) => string;
}) {
  const { t } = useTranslation();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [loading, setLoading] = useState(true);

  const loadAchievements = useCallback(async () => {
    try {
      const res = await authedFetch('/api/v2/user/achievements');
      const data = await readResponseJson<{
        achievements?: Achievement[];
        total_unlocked?: number;
        source?: string;
        achievements_unlocked?: Array<{ code: string; name: string; reward: number }>;
      }>(res).catch(() => ({
        achievements: [] as Achievement[],
        total_unlocked: 0,
        source: '',
        achievements_unlocked: [] as Array<{ code: string; name: string; reward: number }>,
      }));
      setAchievements(data.achievements || []);

      // Celebrate any achievements that just unlocked (endpoint re-evaluates
      // and pops pending notifications, so this fires exactly once each).
      const unlocked = data.achievements_unlocked || [];
      for (const a of unlocked) {
        fireRewardEffect({
          kind: 'achievement',
          title: tr(`ach.${a.code}.name`, a.name),
          subtitle: tr('quest.achievementUnlocked', 'Achievement unlocked'),
          reward: a.reward,
        });
      }
      if (unlocked.length > 0) {
        window.dispatchEvent(new Event('soulmate:credits-updated'));
      }
    } catch (err) {
      logger.error('Failed to load achievements:', { data: err });
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  // Refresh after unlock celebrations elsewhere (chat, check-in, purchases).
  useEffect(() => {
    const onCredits = () => { void loadAchievements(); };
    window.addEventListener('soulmate:credits-updated', onCredits);
    return () => window.removeEventListener('soulmate:credits-updated', onCredits);
  }, [loadAchievements]);

  // Tiered hints: for each achievement family, highlight the first locked
  // entry as the user's "next goal".
  const nextGoalIds = useMemo(() => {
    const families = new Map<string, Achievement[]>();
    for (const a of achievements) {
      const fam = achievementFamily(a.code);
      const arr = families.get(fam) || [];
      arr.push(a);
      families.set(fam, arr);
    }
    const ids = new Set<string>();
    for (const arr of families.values()) {
      arr.sort((x, y) => (Number(x.condition_value) || 0) - (Number(y.condition_value) || 0));
      const next = arr.find((a) => !a.user_progress?.unlocked);
      if (next) ids.add(next.id);
    }
    return ids;
  }, [achievements]);

  const unlockedList = achievements.filter((a) => a.user_progress?.unlocked);
  const earnedTotal = unlockedList.reduce((s, a) => s + (Number(a.reward_tokens) || 0), 0);

  const filtered = category === 'all'
    ? achievements
    : achievements.filter((a) => a.category === category);

  return (
    <section className="relative z-10 mt-6 px-4 sm:px-8 pb-10">
      <div className="mx-auto max-w-none space-y-4">
        {/* Progress header */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#ff2e88]/15 via-black/40 to-[#a855f7]/10 backdrop-blur-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">
              {t('quest.ach.progress')}: {unlockedList.length} / {Math.max(achievements.length, 1)} {t('quest.ach.unlocked')}
            </div>
            <div className="mt-2 h-1.5 w-48 max-w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff2e88] to-[#ffd700]"
                style={{ width: `${Math.min(100, achievements.length ? (unlockedList.length / achievements.length) * 100 : 0)}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-center">
            <Sparkles className="h-4 w-4 text-amber-300 mx-auto" />
            <div className="text-sm font-bold text-amber-200 tabular-nums">+{earnedTotal}</div>
            <div className="text-[10px] text-white/55">{t('quest.ach.earnedTotal')}</div>
          </div>
        </div>

        {/* Membership gate nudge — free tier */}
        {isFree === true && (
          <div className="rounded-2xl border border-[#ffd700]/30 bg-gradient-to-r from-[#ffd700]/[0.10] via-[#ff2e88]/[0.08] to-[#a855f7]/[0.10] backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#ffd700]/20 flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5 text-[#ffd700]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#ffd700]">{t('quest.ach.gatedTitle')}</div>
              <p className="text-[11px] text-white/60 mt-0.5">{t('quest.ach.gatedDesc')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/pricing"
                className="h-9 px-4 rounded-xl bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black text-xs font-bold flex items-center hover:opacity-90 transition"
              >
                {t('quest.ach.upgrade')}
              </Link>
              <Link
                href="/wallet"
                className="h-9 px-4 rounded-xl border border-white/15 bg-white/[0.06] text-white/85 text-xs font-bold flex items-center hover:bg-white/[0.12] transition"
              >
                {t('quest.ach.topup')}
              </Link>
            </div>
          </div>
        )}

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const Icon = cat === 'all' ? Target : (CATEGORY_ICONS[cat] || MessageCircle);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors',
                  category === cat
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tr(`quest.ach.cat.${cat}`, cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1))}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[#ff2e88]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/55">
            {t('quest.ach.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((ach, i) => {
              const progress = ach.user_progress || { unlocked: false, progress_value: 0, reward_claimed: false };
              const rarity = RARITY_CONFIG[ach.rarity || 'common'] || RARITY_CONFIG.common;
              const Icon = progress.unlocked ? rarity.icon : Lock;
              const CatIcon = CATEGORY_ICONS[ach.category] || MessageCircle;
              const denom = Math.max(1, Number(ach.condition_value) || 1);
              const progressValue = Number(progress.progress_value) || 0;
              const progressPercent = Math.min(100, Math.round((progressValue / denom) * 100));
              const isNextGoal = !progress.unlocked && nextGoalIds.has(ach.id);
              const hint = !progress.unlocked ? UPGRADE_HINTS[ach.code] : undefined;

              return (
                <motion.div
                  key={ach.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  className={cn(
                    'rounded-2xl border overflow-hidden backdrop-blur-xl transition-all',
                    progress.unlocked
                      ? 'border-white/10 bg-white/[0.08] ring-1 ring-white/10'
                      : isNextGoal
                      ? 'border-[#ffd700]/45 bg-[#ffd700]/[0.05] shadow-[0_0_22px_rgba(255,215,0,0.15)]'
                      : 'border-white/[0.08] bg-black/35',
                  )}
                >
                  <div className="p-4">
                    <div className="flex gap-3">
                      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center ring-1 shrink-0', rarity.bg, rarity.ring)}>
                        <Icon className={cn('h-5 w-5', progress.unlocked ? rarity.color : 'text-white/35')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                          <CatIcon className="h-3 w-3" />
                          <span>{tr(`quest.ach.cat.${ach.category}`, ach.category || 'general')}</span>
                          {ach.rarity && ach.rarity !== 'common' ? (
                            <span className={cn('px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wide', rarity.bg, rarity.color)}>
                              {ach.rarity}
                            </span>
                          ) : null}
                          {isNextGoal && (
                            <span className="ml-auto flex items-center gap-1 px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wide bg-[#ffd700]/15 text-[#ffd700] border border-[#ffd700]/30">
                              <Target className="h-2.5 w-2.5" /> {t('quest.ach.nextGoal')}
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-white mt-0.5 leading-tight">
                          {tr(`ach.${ach.code}.name`, ach.name)}
                        </h3>
                        <p className="text-sm text-white/70 mt-1 leading-snug">
                          {tr(`ach.${ach.code}.desc`, ach.description)}
                        </p>

                        {!progress.unlocked && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex justify-between text-[11px] text-white/55 tabular-nums">
                              <span>{Math.min(progressValue, denom)}/{ach.condition_value}</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#ff2e88] to-[#a855f7]"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-200 tabular-nums">
                            <Coins className="h-3 w-3" /> +{ach.reward_tokens || 0}
                          </span>
                          {progress.unlocked ? (
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t('quest.ach.unlocked')}
                            </span>
                          ) : hint ? (
                            <Link
                              href={hint.href}
                              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#ff2e88]/35 bg-[#ff2e88]/10 text-[#ff9dc6] hover:bg-[#ff2e88]/20 transition"
                            >
                              {tr(hint.key, 'Upgrade')} <ChevronRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-[11px] text-white/45">{t('quest.ach.inProgress')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
