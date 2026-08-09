'use client';

/**
 * 创作者公开主页（抖音风个人主页）
 * 展示：昵称/头像/简介/会员、作品数/互动值/粉丝数、关注按钮、已上架作品网格。
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Crown,
  Flame,
  Heart,
  Loader2,
  Lock,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

interface CreatorWork {
  id: string;
  slug: string;
  name: string;
  age: number | null;
  short_description: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  rarity: string | null;
  hot_score: number;
  interaction_count: number;
  tags: string[] | null;
}

interface CreatorData {
  creator: {
    id: string;
    kind?: 'user' | 'virtual';
    name: string;
    avatar: string | null;
    bio: string | null;
    tier: string;
  };
  stats: { fans: number; following: number; works: number; interaction: number };
  is_following: boolean;
  works: CreatorWork[];
}

const TIER_CHIP: Record<string, string> = {
  free: 'text-white/50 ring-white/15',
  pro: 'text-purple-300 ring-purple-400/30',
  unlimited: 'text-amber-300 ring-amber-400/30',
};

export default function CreatorProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId || '';
  const router = useRouter();
  const { user } = useAuth();
  const { t, locale } = useTranslation();

  const [data, setData] = useState<CreatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/community/creator?user_id=${encodeURIComponent(userId)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json as CreatorData);
      } else if (res.status === 404) {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isVirtual = data?.creator.kind === 'virtual';

  const toggleFollow = async () => {
    if (!data) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/u/${userId}`)}`);
      return;
    }
    setFollowBusy(true);
    try {
      const following = data.is_following;
      const queryKey = isVirtual ? 'virtual_id' : 'user_id';
      const bodyKey = queryKey;
      const res = following
        ? await authedFetch(
            `/api/community/follow?${queryKey}=${encodeURIComponent(userId)}`,
            { method: 'DELETE' },
          )
        : await authedFetch('/api/community/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [bodyKey]: userId }),
          });
      const json = (await res.json().catch(() => ({}))) as {
        followers?: number;
        is_following?: boolean;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || 'Follow failed');
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              is_following: Boolean(json.is_following),
              stats: {
                ...prev.stats,
                fans: typeof json.followers === 'number' ? json.followers : prev.stats.fans,
              },
            }
          : prev,
      );
    } catch {
      toast.error('Network error');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-transparent">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/70" />
      </div>
    );
  }

  if (!data || notFound) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-transparent px-6 text-center">
        <Lock className="h-8 w-8 text-[#8B8BA3]/50" />
        <p className="text-sm text-[#8B8BA3]">
          {t('creator.userNotFound')}
        </p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full bg-white/[0.06] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.1]"
        >
          {t('general.back')}
        </button>
      </div>
    );
  }

  const { creator, stats } = data;
  const isSelf = !isVirtual && user?.id === userId;

  return (
    <div className="min-h-[100dvh] w-full bg-transparent text-white">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[1760px] px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-10 xl:px-14">
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="glass flex h-10 w-10 items-center justify-center rounded-full text-[#ffb3cd] hover:text-white active:scale-95 transition-all"
            aria-label={t('general.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-white/90 truncate">
            {t('creator.creatorProfile')}
          </span>
        </div>

        {/* Hero */}
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] p-[3px]">
              {creator.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={creator.avatar}
                  alt={creator.name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#1a1024]">
                  <span className="text-3xl font-black text-[#FF2D78]/60">
                    {creator.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            {isVirtual ? (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#0a0a0f] px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1 text-sky-300 ring-sky-400/30 whitespace-nowrap">
                <BadgeCheck className="h-2.5 w-2.5" />
                {t('creator.verified')}
              </span>
            ) : (
              <span
                className={cn(
                  'absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#0a0a0f] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1',
                  TIER_CHIP[creator.tier] || TIER_CHIP.free,
                )}
              >
                <Crown className="h-2.5 w-2.5" />
                {creator.tier}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{creator.name}</h1>
            <p className="mt-0.5 text-xs text-white/45">
              {isVirtual
                ? t('creator.officialCreator')
                : `${t('creator.creator')} · @${creator.id.slice(0, 8)}`}
            </p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/70">
              {creator.bio || t('creator.noBio')}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-5 border-y border-white/[0.06] py-3 text-center">
          <div className="flex-1">
            <p className="text-base font-bold tabular-nums">{stats.works}</p>
            <p className="text-[11px] text-white/40">{t('creator.works')}</p>
          </div>
          <div className="flex-1">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              <Flame className="h-3.5 w-3.5 text-[#FF6BA6]" />
              {stats.interaction}
            </p>
            <p className="text-[11px] text-white/40">{t('creator.interactions')}</p>
          </div>
          <div className="flex-1">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              <Heart className="h-3.5 w-3.5 text-[#FF6BA6]" />
              {stats.fans}
            </p>
            <p className="text-[11px] text-white/40">{t('creator.fans')}</p>
          </div>
          {!isVirtual && (
            <div className="flex-1">
              <p className="text-base font-bold tabular-nums">{stats.following}</p>
              <p className="text-[11px] text-white/40">{locale === 'zh' ? '关注' : 'Following'}</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-4 flex gap-2.5">
          {isSelf ? (
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] py-3 text-sm font-semibold text-white hover:opacity-90 transition-all"
            >
              {t('creator.openMyAccount')}
            </button>
          ) : (
            <button
              type="button"
              disabled={followBusy}
              onClick={() => void toggleFollow()}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold transition-all',
                data.is_following
                  ? 'glass text-white/85 hover:text-white'
                  : 'bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-white hover:opacity-90',
              )}
            >
              {followBusy ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : data.is_following ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-400" />
                  {t('creator.alreadyFollowing')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {t('creator.followThem')}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Works */}
        <div className="mt-6 flex items-center gap-1 border-b border-white/[0.08]">
          <div className="relative px-4 py-2.5 text-sm font-medium text-white">
            {t('creator.works')}
            <span className="ml-1 text-[11px] text-[#8B8BA3]/70">{data.works.length}</span>
            <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3]" />
          </div>
        </div>

        {data.works.length === 0 ? (
          <div className="py-12 text-center text-sm text-white/35">
            {t('creator.noPublishedWorks')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {data.works.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => router.push(`/chats?friend=${encodeURIComponent(w.id)}`)}
                className="group relative overflow-hidden rounded-xl ring-1 ring-white/10 hover:ring-[#ff2e88]/45 transition-all active:scale-[0.98] text-left"
              >
                <div className="relative aspect-[3/4]">
                  {w.portrait_url || w.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(w.portrait_url || w.avatar_url) as string}
                      alt={w.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF2D78]/30 to-[#8b5cf6]/30">
                      <span className="text-2xl font-black text-white/60">
                        {w.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  {w.rarity && (
                    <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-black text-[#ffd700]">
                      {String(w.rarity).toUpperCase()}
                    </span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <div className="text-xs font-bold truncate">{w.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[9px] text-white/50 tabular-nums">
                      <span className="flex items-center gap-0.5">
                        <Flame className="h-2.5 w-2.5 text-[#FF6BA6]" />
                        {w.interaction_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-2.5 w-2.5" />
                        {w.hot_score}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
