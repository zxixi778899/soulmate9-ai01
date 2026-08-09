'use client';

/**
 * Independent category showcase page (独立展示页).
 * One page per browsing category — 女性 / 男性 / 跨性别 / 二次元 — each pulling
 * its own real backend catalog instead of client-side filtering the home feed.
 */

import { use, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DemoGirl } from '@/lib/demo-data';
import { CardMedia } from '@/components/discover/CardMedia';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import {
  GameShell, GamePrimaryButton, RarityBadge,
} from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { LockedPortraitOverlay, lockedImageClass } from '@/components/game/LockedPortrait';
import { ensureCompanionChatId } from '@/lib/ensure-companion';
import { useFriendStatus } from '@/lib/use-friend-status';
import { COMPANION_CATEGORIES, COMPANION_CATEGORY_LABELS, type CompanionCategory } from '@/lib/companion-category';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';
import { useAuth } from '@/components/AuthProvider';

const CATEGORY_EMOJI: Record<CompanionCategory, string> = {
  female: '👩',
  male: '👨',
  transgender: '🧑‍🎤',
  anime: '🌸',
};

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const friendStatus = useFriendStatus();
  const labelLocale = (locale === 'zh' ? 'zh' : 'en') as 'zh' | 'en';

  const category = useMemo<CompanionCategory | null>(
    () => ((COMPANION_CATEGORIES as readonly string[]).includes(slug) ? (slug as CompanionCategory) : null),
    [slug],
  );

  const [girls, setGirls] = useState<DemoGirl[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DemoGirl | null>(null);
  const [selecting, setSelecting] = useState(false);

  const loadData = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/girlfriends/category?category=${category}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGirls(Array.isArray(data.girlfriends) ? data.girlfriends : []);
      } else {
        setGirls([]);
      }
    } catch {
      setGirls([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, [loadData]);

  const handleSelect = async (girl: DemoGirl) => {
    // Guest → redirect to login before any API call (otherwise 401 "Unauthorized" toast)
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/category/${slug}`)}`);
      return;
    }
    setSelecting(true);
    try {
      // Already friends → skip unlock/add and go straight to chat.
      if (friendStatus.isFriend(girl)) {
        try {
          const chatId = await ensureCompanionChatId(girl);
          if (chatId) {
            setSelected(null);
            router.push(`/chats?friend=${encodeURIComponent(chatId)}`);
            return;
          }
        } catch {
          /* fall through to the normal add flow */
        }
      }
      if (girl.locked) {
        const res = await authedFetch('/api/girlfriends/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ girlfriend_id: girl.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error((data as { error?: string }).error || 'Unlock failed');
          setSelected(girl);
          return;
        }
        toast.success(t('explore.unlocked'));
        girl = { ...girl, locked: false, is_unlocked: true };
        setGirls((prev) => prev.map((g) => (g.id === girl.id ? { ...g, locked: false, is_unlocked: true } : g)));
      }
      const chatId = await ensureCompanionChatId(girl);
      if (!chatId) {
        if (!user) {
          router.push(`/login?next=${encodeURIComponent(`/category/${slug}`)}`);
        } else {
          toast.error(t('explore.addFailed'));
        }
        return;
      }
      toast.success(t('explore.addedToFriends', { name: girl.name }), {
        description: t('explore.goToMessages'),
        action: { label: t('common.goChat'), onClick: () => router.push(`/chats?friend=${encodeURIComponent(chatId)}`) },
      });
      void friendStatus.refresh();
      setSelected(null);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'SEAT_LIMIT') {
        toast.error(t('explore.seatLimitTitle'), {
          description: t('explore.seatLimitDesc'),
          action: { label: t('explore.buySeats'), onClick: () => router.push('/pricing') },
        });
      } else {
        toast.error(e.message || 'Failed to add friend');
      }
    } finally {
      setSelecting(false);
    }
  };

  if (!category) {
    return (
      <GameShell className="pb-6 md:pb-12 min-h-[100dvh]">
        <PageHeader title={t('common.notFound')} backHref="/" sticky={false} />
        <div className="py-24 text-center text-white/40 text-sm">{t('category.unknown')}</div>
      </GameShell>
    );
  }

  const title = `${COMPANION_CATEGORY_LABELS[category][labelLocale]}`;
  const subtitle = loading
    ? t('category.loading')
    : `${girls.length} ${t('category.companionsUnit')}`;

  return (
    <GameShell className="pb-6 md:pb-12 min-h-[100dvh]">
      <PageHeader
        eyebrow="COMPANIONS"
        title={`${CATEGORY_EMOJI[category]} ${title}`}
        subtitle={subtitle}
        backHref="/"
        sticky={false}
        actions={
          <GamePrimaryButton onClick={() => router.push('/create')} className="!h-10 !px-3 sm:!px-4 text-xs touch-manipulation">
            {t('explore.customCreate')}
          </GamePrimaryButton>
        }
      />

      {/* Category switcher — each tab is its own independent page */}
      <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {COMPANION_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => c !== category && router.push(`/category/${c}`)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-all touch-manipulation active:scale-95',
                c === category
                  ? 'border-[#ff2e88] bg-[#ff2e88]/20 text-white shadow-[0_0_16px_rgba(255,46,136,0.25)]'
                  : 'border-white/10 bg-white/5 text-white/55 hover:text-white',
              )}
            >
              {CATEGORY_EMOJI[c]} {COMPANION_CATEGORY_LABELS[c][labelLocale]}
            </button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      <section className="px-4 sm:px-6 py-6">
        <div className="mx-auto max-w-7xl">
          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-[#ff2e88]/50" />
            </div>
          ) : girls.length === 0 ? (
            <div className="py-24 text-center">
              <Sparkles className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">
                {t('explore.noInCategory')}
              </p>
              <button
                type="button"
                onClick={() => router.push('/create')}
                className="mt-4 text-xs text-[#ff2e88] hover:underline"
              >
                {t('explore.startCreating')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
              {girls.map((girl) => (
                <button
                  key={girl.id}
                  type="button"
                  onClick={() => setSelected(girl)}
                  className={cn(
                    'game-card-frame text-left group content-visibility-auto',
                    `game-rarity-${String(girl.rarity || 'N').toLowerCase()}`,
                    'transition-transform duration-200 active:scale-[0.98] hover:-translate-y-1',
                  )}
                >
                  <div className="relative aspect-[3/4]">
                    <CardMedia
                      src={girl.portrait || girl.avatar}
                      videoSrc={girl.video || girl.avatar_video}
                      alt={girl.name}
                      hoverPlay
                      forcePlay={false}
                      showBadge={!!(girl.video || girl.avatar_video)}
                      imgClassName={cn(
                        'transition-transform duration-300 group-hover:scale-[1.03]',
                        lockedImageClass(girl.locked),
                      )}
                    />
                    {girl.locked && <LockedPortraitOverlay price={girl.unlock_price_tokens} />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20 z-[1]" />
                    <div className="absolute top-2 left-2 z-[2]">
                      <RarityBadge rarity={girl.rarity} />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 z-[2]">
                      <div className="font-bold text-base sm:text-lg leading-tight">{girl.name}</div>
                      <div className="text-[10px] text-white/55 line-clamp-1 mt-0.5">{girl.tagline}</div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#ff2e88] to-[#ffd700]"
                            style={{ width: `${girl.intimacy}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-[#ffd700]">{girl.intimacy}</span>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleSelect(girl); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleSelect(girl); } }}
                        className="mt-2 w-full h-8 rounded-lg text-[10px] font-black tracking-[0.15em] bg-gradient-to-r from-[#ff2e88] to-[#c026d3] flex items-center justify-center active:scale-95"
                      >
                        {girl.locked ? 'UNLOCK' : friendStatus.isFriend(girl) ? t('common.goChat') : 'SELECT'}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <CompanionDetailModal
          busy={selecting}
          girl={selected}
          open={!!selected}
          isFriend={friendStatus.isFriend(selected)}
          onClose={() => setSelected(null)}
          onSelect={() => handleSelect(selected)}
        />
      )}
    </GameShell>
  );
}
