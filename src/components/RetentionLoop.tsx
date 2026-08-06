'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Flame, Gift, Loader2, Share2, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { readResponseJson } from '@/lib/safe-json';
import { authedFetch } from '@/lib/supabase';
import { DAILY_QUEST_ALL_BONUS } from '@/lib/daily-quests';
import { fireRewardEffect, rewardTr, syncRewards } from '@/lib/reward-events';

type CheckinState = { streak: number; claimed_today: boolean; next_reward: number };
type QuestRow = { code: string; goal: number; progress: number; reward: number; done: boolean; claimed: boolean };
type DailyQuestsState = { quests?: QuestRow[]; all_complete?: boolean; bonus_claimed?: boolean };
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
  const [dailyQuests, setDailyQuests] = useState<DailyQuestsState | null>(null);

  const loadProgress = useCallback(async (): Promise<void> => {
    if (!user) return;
    setLoading(true);
    try {
      const [checkinResponse, questsResponse] = await Promise.all([
        authedFetch('/api/checkin'),
        authedFetch('/api/daily-quests').catch(() => null),
      ]);
      if (!checkinResponse.ok) throw new Error('Unable to load daily progress');
      const [checkinData, questsData] = await Promise.all([
        readResponseJson(checkinResponse) as Promise<CheckinState>,
        questsResponse && questsResponse.ok
          ? (readResponseJson(questsResponse) as Promise<DailyQuestsState>).catch(() => null)
          : Promise.resolve(null),
      ]);
      setCheckin(checkinData);
      setDailyQuests(questsData);
    } catch {
      setCheckin(null);
      setDailyQuests(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadProgress(); }, [loadProgress]);
  useEffect(() => { setExpanded(false); }, [pathname]);
  // GlobalTopNav 右上角的「签到」按钮通过该事件打开面板
  useEffect(() => {
    const open = () => setExpanded(true);
    window.addEventListener('soulmate:open-checkin', open);
    return () => window.removeEventListener('soulmate:open-checkin', open);
  }, []);

  // 每日任务并入「每日分享」：面板只展示一个每日分享目标（+20 全勤奖励）
  const goals = useMemo<DailyGoal[]>(
    () => [
      {
        label: t('quest.daily.share') || '每日分享',
        done: Boolean(dailyQuests?.all_complete),
        icon: Share2,
      },
    ],
    [dailyQuests?.all_complete, t],
  );

  // Celebrate freshly completed quests/achievements whenever the user moves
  // around the app; syncRewards is debounced + de-duplicated server-side.
  useEffect(() => {
    if (!user) return;
    void syncRewards();
    const timer = window.setInterval(() => void syncRewards(), 60_000);
    return () => window.clearInterval(timer);
  }, [user, pathname]);

  const completedGoals = goals.reduce((total, goal) => total + Number(goal.done), 0);
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
      const streak = data.streak ?? Math.max(1, checkin.streak);
      setCheckin((current) => current ? { ...current, claimed_today: true, streak } : current);
      setDailyQuests((current) => current && current.quests
        ? { ...current, quests: current.quests.map((q) => q.code === 'checkin' ? { ...q, progress: 1, done: true, claimed: true } : q) }
        : current);
      toast.success(`+${reward} credits`);
      window.dispatchEvent(new Event('soulmate:credits-updated'));
      fireRewardEffect({
        kind: 'checkin',
        title: rewardTr('quest.daily.checkin', '每日签到'),
        subtitle: `${streak}🔥 ${rewardTr('quest.daily.claimed', 'Check-in complete')}`,
        reward,
      });
      window.setTimeout(() => void syncRewards({ force: true }), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to claim reward');
    } finally {
      setClaiming(false);
    }
  };

  if (hidden || (!loading && !checkin)) return null;

  return (
    <aside className="fixed right-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[55] sm:top-[calc(env(safe-area-inset-top)+4rem)]">
      {expanded && (
        <div className="w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-fuchsia-400/25 bg-[#0d0915]/95 shadow-[0_24px_80px_rgba(0,0,0,.55),0_0_40px_rgba(236,72,153,.12)] backdrop-blur-2xl">
          <div className="relative overflow-hidden border-b border-white/10 px-4 pb-3 pt-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,.22),transparent_55%)]" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/20">
                <Flame className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-white">{t('quest.daily.checkin') || '每日签到'}</h2>
                  <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-bold text-orange-300">{checkin?.streak ?? 0}🔥</span>
                </div>
                <p className="mt-0.5 text-xs text-white/45">{t('home.moduleQuestDesc') || 'Complete today’s loop'}</p>
              </div>
              <button type="button" onClick={() => setExpanded(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white" aria-label={t('general.cancel') || 'Close'}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mt-4 flex items-center justify-between rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] px-3 py-2">
              <span className="text-[11px] font-semibold text-white/70">{t('quest.daily.share') || '每日分享'}</span>
              <span className="text-xs font-black text-amber-300">+{DAILY_QUEST_ALL_BONUS}</span>
            </div>
          </div>

          <div className="space-y-2 p-3">
            {loading ? (
              <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-fuchsia-300" /></div>
            ) : (
              <Link
                href="/quest"
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 transition hover:border-fuchsia-400/30 hover:bg-white/[0.05]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-400/10 text-fuchsia-300">
                  <Share2 className="h-4 w-4" />
                </div>
                <span className="flex-1 text-sm text-white/80">{t('quest.daily.share') || '每日分享'}</span>
                <span className="text-xs font-black text-amber-300">+{DAILY_QUEST_ALL_BONUS}</span>
              </Link>
            )}
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
      )}
    </aside>
  );
}