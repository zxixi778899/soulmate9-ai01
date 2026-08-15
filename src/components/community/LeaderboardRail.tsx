'use client';

/**
 * 首页排行榜（抖音风）：虚拟账号 + 真实创作者按互动值合并 Top15。
 * 真实用户数值超过虚拟数据即自动顶替上榜。
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Flame, Trophy, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readResponseJson } from '@/lib/safe-json';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';

interface RankEntry {
  kind: 'user' | 'virtual';
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  score: number;
  fans: number;
  works: number;
  rank: number;
  companionId: string | null;
  companionName: string | null;
  companionPortrait: string | null;
}

const RANK_BADGE: Record<number, string> = {
  1: 'from-[#ffd700] to-[#f59e0b] text-black',
  2: 'from-[#d7dbe4] to-[#9aa3b2] text-black',
  3: 'from-[#e8a06a] to-[#b06a3b] text-white',
};

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export function LeaderboardRail() {
  const router = useRouter();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<RankEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/community/leaderboard');
      const data = (await readResponseJson(res).catch(() => ({}))) as {
        entries?: RankEntry[];
      };
      if (Array.isArray(data.entries)) setEntries(data.entries);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || entries.length === 0) return null;

  const open = (e: RankEntry) => {
    // 卡片代表的是「创作者」本人（真实用户或虚拟账号），统一进创作者主页
    router.push(`/u/${e.id}`);
  };

  return (
    <section>
      <div className="flex flex-col items-center text-center mb-3">
        <div className="game-chip mb-1">
          <Trophy className="h-3 w-3" /> {t('community.rankingTop15')}
        </div>
        <h3 className="text-xl sm:text-2xl font-black">
          {t('community.topCreatorRanking')}
        </h3>
        <p className="text-[11px] text-white/40 mt-0.5">
          {t('community.rankingDesc')}
        </p>
      </div>

      {/* 移动端横滑 / 桌面 5 列网格 */}
      <div className="-mx-3 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3 overflow-x-auto sm:overflow-visible scrollbar-hide snap-x snap-mandatory touch-pan-x pb-1">
        {entries.map((e) => {
          const podium = RANK_BADGE[e.rank];
          return (
            <button
              key={`${e.kind}-${e.id}`}
              type="button"
              onClick={() => open(e)}
              className={cn(
                'snap-start shrink-0 w-[150px] sm:w-auto glass-strong rounded-xl sm:rounded-2xl p-2.5 text-left group active:scale-[0.98] hover:border-[#ff2e88]/35 transition-all',
              )}
            >
              <div className="relative mx-auto w-[88px] sm:w-[96px]">
                <div
                  className={cn(
                    'rounded-full p-[2.5px]',
                    e.rank <= 3
                      ? 'bg-gradient-to-br from-[#ffd700] via-[#ff2e88] to-[#c026d3]'
                      : 'bg-white/[0.12]',
                  )}
                >
                  {e.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.avatar}
                      alt={e.name}
                      loading="lazy"
                      className="h-[84px] w-[84px] sm:h-[92px] sm:w-[92px] rounded-full object-contain"
                    />
                  ) : (
                    <div className="h-[84px] w-[84px] sm:h-[92px] sm:w-[92px] rounded-full bg-gradient-to-br from-[#FF2D78]/40 to-[#8b5cf6]/40 flex items-center justify-center">
                      <span className="text-xl font-black text-white/70">
                        {e.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    'absolute -top-1 left-1/2 -translate-x-1/2 min-w-[22px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center bg-gradient-to-r shadow',
                    podium || 'from-white/15 to-white/10 text-white/80',
                  )}
                >
                  {e.rank}
                </span>
              </div>

              <div className="mt-2 text-center min-w-0">
                <div className="text-xs font-bold truncate flex items-center justify-center gap-1">
                  <span className="truncate">{e.name}</span>
                  {e.kind === 'user' ? (
                    <Sparkles className="h-3 w-3 shrink-0 text-[#ffd700]" aria-label="creator" />
                  ) : (
                    <BadgeCheck className="h-3 w-3 shrink-0 text-sky-400" aria-label="official" />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-[#ff6ba6] tabular-nums">
                  <Flame className="h-3 w-3" />
                  {formatCount(e.score)}
                </div>
                <div className="mt-0.5 text-[9px] text-white/40 truncate tabular-nums">
                  {t('community.fansPosts', { fans: formatCount(e.fans), works: String(e.works) })}
                </div>
              </div>

              {e.companionName && (
                <div className="mt-1.5 flex items-center justify-center gap-1 text-[9px] text-white/35 truncate">
                  <Users className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    {t('community.featPrefix')} {e.companionName}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
