'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Flame, Gift, Heart, Loader2, MessageCircle, Sparkles, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { readResponseJson } from '@/lib/safe-json';
import { authedFetch } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type CheckinState = { streak: number; claimed_today: boolean; next_reward: number };
type MembershipState = { usage?: { messages_sent_today?: number; total_girlfriends?: number } };
type DailyGoal = { label: string; done: boolean; icon: typeof Gift };

const HIDDEN_ROUTE_PREFIXES = ['/admin', '/chat/', '/create', '/login', '/register', '/onboarding', '/payment'];

export default function RetentionLoop() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [checkin, setCheckin] = useState<CheckinState | null>(null);
  const [membership, setMembership] = useState<MembershipState | null>(null);

  const loadProgress = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    try {
      const [checkinResponse, membershipResponse] = await Promise.all([
        authedFetch('/api/checkin'),
        authedFetch('/api/membership'),
      ]);
      if (!checkinResponse.ok || !membershipResponse.ok) throw new Error('Unable to load daily progress');
      const [checkinData, membershipData] = await Promise.all([
        readResponseJson(checkinResponse) as Promise<CheckinState>,
        readResponseJson(membershipResponse) as Promise<MembershipState>,
      ]);
      setCheckin(checkinData);
      setMembership(membershipData);
    } catch {
      setCheckin(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadProgress(); }, [loadProgress]);
  useEffect(() => { setExpanded(false); }, [pathname]);

  const goals = useMemo<DailyGoal[]>(() => {
    const usage = membership?.usage;
    return [
      { label: t('home.moduleQuestTip') || 'Daily reward', done: Boolean(checkin?.claimed_today), icon: Gift },
      { label: t('chat.sayHello') || 'Say hello', done: (usage?.messages_sent_today ?? 0) > 0, icon: MessageCircle },
      { label: t('home.pool') || 'Meet a companion', done: (usage?.total_girlfriends ?? 0) > 0, icon: Heart },
    ];
  }, [checkin?.claimed_today, membership?.usage, t]);

  const completedGoals = goals.reduce((total, goal) => total + Number(goal.done), 0);
  const progress = Math.round((completedGoals / goals.length) * 100);
  const rewardReady = Boolean(checkin && !checkin.claimed_today);
  const hidden = !user || HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  const claimReward = async (): Promise<void> => {
    if (!checkin || checkin.claimed_today || claiming) return;
    setClaiming(true);
    try {
      const response = await authedFetch('/api/checkin', { method: 'POST' });
      const data = await readResponseJson(response) as { reward?: number; streak?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to claim reward');
      const reward = data.reward ?? checkin.next_reward;
      setCheckin((current) => current ? {
        ...current,
        claimed_today: true,
        streak: data.streak ?? Math.max(1, current.streak),
      } : current);
      toast.success(`+${reward} credits`);
      window.dispatchEvent(new Event('soulmate:credits-updated'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to claim reward');
    } finally {
      setClaiming(false);
    }
  };

  if (hidden || (!loading && !checkin && !membership)) return null;

  return (
    <aside className="fixed bottom-[max(5.25rem,env(safe-area-inset-bottom))] left-3 z-[55] md:bottom-5 md:left-5">
      {expanded ? (
        <div className="w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-fuchsia-400/25 bg-[#0d0915]/95 shadow-[0_24px_80px_rgba(0,0,0,.55),0_0_40px_rgba(236,72,153,.12)] backdrop-blur-2xl">
          <div className="relative overflow-hidden border-b border-white/10 px-4 pb-3 pt-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,.22),transparent_55%)]" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/20">
                <Flame className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-white">{t('home.moduleQuest') || 'Quests'}</h2>
                  <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-bold text-orange-300">{checkin?.streak ?? 0}🔥</span>
                </div>
                <p className="mt-0.5 text-xs text-white/45">{t('home.moduleQuestDesc') || 'Complete today’s loop'}</p>
              </div>
              <button type="button" onClick={() => setExpanded(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white" aria-label={t('general.cancel') || 'Close'}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
                <span className="text-white/55">{completedGoals}/{goals.length}</span><span className="text-fuchsia-300">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3">
            {loading ? (
              <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-fuchsia-300" /></div>
            ) : goals.map((goal) => {
              const Icon = goal.icon;
              return (
                <div key={goal.label} className={cn('flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition', goal.done ? 'border-emerald-400/15 bg-emerald-400/[0.06]' : 'border-white/[0.07] bg-white/[0.035]')}>
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', goal.done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-fuchsia-400/10 text-fuchsia-300')}>
                    {goal.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={cn('flex-1 text-sm', goal.done ? 'text-white/45 line-through' : 'text-white/80')}>{goal.label}</span>
                  {goal.done ? <Sparkles className="h-3.5 w-3.5 text-emerald-300/60" /> : null}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 border-t border-white/[0.07] p-3">
            {rewardReady ? (
              <button type="button" onClick={() => void claimReward()} disabled={claiming} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-sm font-black text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 active:scale-[.98] disabled:opacity-60">
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}+{checkin?.next_reward ?? 0}
              </button>
            ) : (
              <Link href={completedGoals < goals.length ? '/chats' : '/quest'} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-600 text-sm font-black text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 active:scale-[.98]">
                {completedGoals < goals.length ? (t('chat.sayHello') || 'Say hello') : (t('home.moduleQuest') || 'Quests')}<ChevronRight className="h-4 w-4" />
              </Link>
            )}
            <Link href="/achievements" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-300 transition hover:bg-amber-300/15" aria-label={t('home.moduleQuest') || 'Achievements'}>
              <Trophy className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setExpanded(true)} className={cn('group relative flex h-[3.25rem] items-center gap-2 rounded-full border bg-[#0d0915]/92 py-2 pl-2 pr-3 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-fuchsia-400/40', rewardReady ? 'border-fuchsia-400/35' : 'border-white/10')} aria-label={t('home.moduleQuest') || 'Open daily quests'} aria-expanded="false">
          {rewardReady ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[#0d0915] bg-rose-400" /> : null}
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-md shadow-fuchsia-500/25"><Flame className="h-4 w-4" /></span>
          <span className="text-sm font-black tabular-nums text-white">{checkin?.streak ?? 0}</span><span className="h-5 w-px bg-white/10" /><span className="text-xs font-bold tabular-nums text-fuchsia-200">{completedGoals}/{goals.length}</span>
        </button>
      )}
    </aside>
  );
}