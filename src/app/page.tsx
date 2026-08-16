'use client';

/**
 * Home lobby (golove-style rework)
 * - Banner carousel (admin_ads, position=banner)
 * - Live avatars rail: circular portraits → tap opens detail modal
 * - Two-layer filters: sort dropdown + category chips
 * - High-density card grid (22px radius, bottom gradient text layer)
 * - Leaderboard / Modules / Promo / Footer kept below
 */

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useDataSync } from '@/hooks/useDataSync';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, ShoppingBag, Wand2, Crown,
  Flame, Zap, Users, Share2,
  Trophy, Coins, ChevronRight as ChevR, Send, ExternalLink, Megaphone,
  Percent, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { RARITY_COLORS, type DemoGirl, girlTagline, relationshipLabel } from '@/lib/demo-data';
import { fetchCompanionCatalog } from '@/lib/companions';
import { ensureCompanionChatId } from '@/lib/ensure-companion';
import { useFriendStatus } from '@/lib/use-friend-status';
import { readResponseJson } from '@/lib/safe-json';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { CardMedia } from '@/components/discover/CardMedia';
import { ShareCard } from '@/components/ShareCard';
import { LeaderboardRail } from '@/components/community/LeaderboardRail';
import {
  GameShell, GameChip, RarityBadge,
} from '@/components/game/GameShell';
import { LockedPortraitOverlay, lockedImageClass } from '@/components/game/LockedPortrait';
import type { PreviewSize } from '@/lib/image-preview';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';
import { useAuth } from '@/components/AuthProvider';
import { COMPANION_CATEGORIES, COMPANION_CATEGORY_LABELS, type CompanionCategory } from '@/lib/companion-category';
import { useSiteSettings, useSiteAds } from '@/hooks/useSiteSettings';
import { useGridPreviewSize } from '@/hooks/useGridPreviewSize';
import { HomeAdBanners } from '@/components/ads/HomeAdBanners';


const FOOTER_FALLBACK = {
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/oxmate_bot',
  x: process.env.NEXT_PUBLIC_X_URL || 'https://x.com/ozmate',
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || '',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@oxmate-ai.com',
};

/** 高密度网格卡片（golove 式：22px 圆角 + 底部黑渐变文字层） */
function GridCard({
  g,
  onOpen,
  className,
  previewSize = 'card',
}: {
  g: DemoGirl;
  onOpen: (g: DemoGirl) => void;
  className?: string;
  previewSize?: PreviewSize;
}) {
  const { t } = useTranslation();
  const video = g.video || g.avatar_video;
  return (
    <button
      type="button"
      onClick={() => onOpen(g)}
      className={cn(
        'group relative overflow-hidden rounded-[22px] text-left ring-1 ring-white/10 transition-all active:scale-[0.98] hover:ring-[#ff2e88]/45 hover:shadow-[0_0_28px_rgba(255,46,136,0.22)]',
        className,
      )}
    >
      <div className="relative aspect-[3/4]">
        <CardMedia
          src={g.portrait || g.avatar}
          videoSrc={video}
          alt={g.name}
          hoverPlay
          forcePlay={false}
          showBadge={false}
          fit="cover"
          previewSize={previewSize}
          imgClassName={cn(
            // 无视频的伴侣：hover 时图片呼吸式运镜轮转；有视频则 hoverPlay 接管
            !video && 'group-hover:[animation:card-kenburns_5s_ease-in-out_infinite]',
            lockedImageClass(g.locked),
          )}
        />
        {g.locked && <LockedPortraitOverlay price={g.unlock_price_tokens} className="!backdrop-blur-sm" />}
        {/* 竞品式底部文字层：黑/90 → 透明渐变 */}
        <div className="absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2.5 pb-2.5 pt-9">
          <div className="flex items-center justify-between gap-1.5">
            <div className="text-sm font-bold truncate [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">{g.name}</div>
            <RarityBadge rarity={g.rarity} />
          </div>
          <div className="text-[10px] text-white/60 truncate [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
            {relationshipLabel(g.relationship, t)} · {g.age}
          </div>
        </div>
      </div>
    </button>
  );
}

/** 网格内推广卡（与 GridCard 同规格：22px 圆角 + 3:4，点击跳充值页） */
function GridPromoCard({
  variant,
  onClick,
}: {
  variant: 'recharge' | 'firstTopup';
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const recharge = variant === 'recharge';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[22px] text-left ring-1 transition-all active:scale-[0.98]',
        recharge
          ? 'ring-[#ffd700]/40 bg-gradient-to-br from-[#3a2a05] via-[#1c1406] to-[#0d0a04] hover:ring-[#ffd700]/70 hover:shadow-[0_0_28px_rgba(255,215,0,0.25)]'
          : 'ring-[#ff2e88]/40 bg-gradient-to-br from-[#3b0a26] via-[#1f0a1c] to-[#0d0512] hover:ring-[#ff2e88]/70 hover:shadow-[0_0_28px_rgba(255,46,136,0.25)]',
      )}
    >
      <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-1.5 px-2 text-center">
        <div
          className={cn(
            'absolute -top-8 -right-8 h-28 w-28 rounded-full blur-2xl transition-opacity duration-500 group-hover:opacity-90 opacity-60',
            recharge ? 'bg-[#ffd700]/30' : 'bg-[#ff2e88]/30',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[9px] font-black tracking-[0.2em]',
            recharge ? 'bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-black' : 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white',
          )}
        >
          {t('home.gridPromoAd')}
        </span>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg',
            recharge ? 'from-[#ffd700] to-[#f59e0b]' : 'from-[#ff2e88] to-[#c026d3]',
          )}
        >
          {recharge ? <Percent className="h-5 w-5 text-black" /> : <Gift className="h-5 w-5 text-white" />}
        </div>
        <div className="text-base font-black leading-tight [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          {recharge ? t('home.gridPromoRechargeTitle') : t('home.gridPromoFirstTopupTitle')}
        </div>
        <div className="text-[10px] text-white/55 leading-snug">
          {recharge ? t('home.gridPromoRechargeDesc') : t('home.gridPromoFirstTopupDesc')}
        </div>
        <span className="mt-0.5 text-[10px] font-bold text-white/85 flex items-center gap-0.5 group-hover:text-white">
          {t('home.gridPromoCta')} <ChevR className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  // 推广卡随机插位（挂载时固定一次，避免重渲染跳动）
  const [promoSlots] = useState<number[]>(() => {
    const a = 2 + Math.floor(Math.random() * 6);
    const b = a + 4 + Math.floor(Math.random() * 6);
    return [a, b];
  });
  const { user } = useAuth();
  const friendStatus = useFriendStatus();
  const { settings: siteSettings } = useSiteSettings();
  const { ads: bannerAds } = useSiteAds('banner');
  const gridPreviewSize = useGridPreviewSize();
  // 公告 i18n：后台默认英文文案命中时展示当前语言翻译，自定义文案原样渲染
  const announceText = siteSettings?.announcement_text?.includes('beta test kicks off')
    ? t('home.betaAnnouncement')
    : (siteSettings?.announcement_text || '');
  const modules = useMemo(
    () => [
      {
        href: '/explore',
        title: t('home.modulePool'),
        en: 'CARD POOL',
        desc: t('home.modulePoolDesc'),
        tip: t('home.modulePoolTip'),
        icon: Crown,
        tone: 'from-[#ff2e88] to-[#c026d3]',
      },
      {
        href: '/chats',
        title: t('home.moduleChat'),
        en: 'MESSAGES',
        desc: t('home.moduleChatDesc'),
        tip: t('home.moduleChatTip'),
        icon: MessageCircle,
        tone: 'from-[#25D366] to-[#128C7E]',
      },
      {
        href: '/create',
        title: t('home.moduleCreate'),
        en: 'CREATE',
        desc: t('home.moduleCreateDesc'),
        tip: t('home.moduleCreateTip'),
        icon: Wand2,
        tone: 'from-[#a855f7] to-[#ff2e88]',
      },
      {
        href: '/shop',
        title: t('home.moduleShop'),
        en: 'ARMORY',
        desc: t('home.moduleShopDesc'),
        tip: t('home.moduleShopTip'),
        icon: ShoppingBag,
        tone: 'from-[#ffd700] to-[#f59e0b]',
      },
      {
        href: '/quest',
        title: t('home.moduleQuest'),
        en: 'QUEST',
        desc: t('home.moduleQuestDesc'),
        tip: t('home.moduleQuestTip'),
        icon: Zap,
        tone: 'from-[#fbbf24] to-[#ff6ba6]',
      },
      {
        href: '/profile',
        title: t('home.moduleProfile'),
        en: 'PROFILE',
        desc: t('home.moduleProfileDesc'),
        tip: t('home.moduleProfileTip'),
        icon: Users,
        tone: 'from-[#60a5fa] to-[#a855f7]',
      },
    ],
    [t],
  );
  const [catalog, setCatalog] = useState<DemoGirl[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogSource, setCatalogSource] = useState<'api' | 'demo'>('api');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CompanionCategory>('all');
  const [sortMode, setSortMode] = useState<'hot' | 'new' | 'featured'>('hot');
  const [detail, setDetail] = useState<DemoGirl | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [bonding, setBonding] = useState(false);
  const [addedCompanion, setAddedCompanion] = useState<{ id: string; name: string; portrait?: string } | null>(null);

  const loadData = useCallback(async () => {
    const r = await fetchCompanionCatalog(24);
    if (r.girls.length) {
      setCatalog(r.girls);
      setCatalogSource(r.source);
    } else {
      setCatalog([]);
      setCatalogSource(r.source);
    }
    setCatalogReady(true);
  }, []);

  useAutoRefresh(loadData);
  useDataSync(loadData, ['girlfriends']);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  const filteredCatalog = useMemo(
    () => categoryFilter === 'all' ? catalog : catalog.filter((girl) => girl.category === categoryFilter),
    [catalog, categoryFilter],
  );
  const featured = filteredCatalog[0] || null;
  const rc = RARITY_COLORS[(featured?.rarity as keyof typeof RARITY_COLORS) || 'R'] || RARITY_COLORS.R;

  // golove 式：featured 优先排序（Live 横排与 Featured 排序共用）
  const featuredFirst = useMemo(() => {
    const head = filteredCatalog.filter((g) => g.is_featured || g.list_kind === 'featured');
    const rest = filteredCatalog.filter((g) => !(g.is_featured || g.list_kind === 'featured'));
    return [...head, ...rest];
  }, [filteredCatalog]);

  // 高密度网格：按排序模式排序
  const gridGirls = useMemo(() => {
    if (sortMode === 'featured') return featuredFirst;
    if (sortMode === 'new') return [...filteredCatalog].reverse();
    return [...filteredCatalog].sort((a, b) => Number(b.hot_score ?? b.intimacy ?? 0) - Number(a.hot_score ?? a.intimacy ?? 0));
  }, [featuredFirst, filteredCatalog, sortMode]);

  // Live 头像横排：featured 优先取前 12
  const liveGirls = useMemo(() => featuredFirst.slice(0, 12), [featuredFirst]);

  const enterBond = async (girl: DemoGirl) => {
    if (!girl) return;
    // Guest → redirect to login before any API call (otherwise 401 "Unauthorized" toast)
    if (!user) {
      router.push(`/login?next=${encodeURIComponent('/')}`);
      return;
    }
    setBonding(true);
    try {
      // Already friends → skip unlock/add and go straight to chat.
      if (friendStatus.isFriend(girl)) {
        try {
          const chatId = await ensureCompanionChatId(girl);
          if (chatId) {
            setDetail(null);
            router.push(`/companion/${encodeURIComponent(chatId)}`);
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
        const data = await readResponseJson(res).catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
          toast.error((data as { error?: string }).error || t('home.unlockFail'));
          setDetail(girl);
          return;
        }
        toast.success(
          (data as { already?: boolean; tokens_spent?: number }).already
            ? t('home.unlocked')
            : `${t('home.unlockOk')}${(data as { tokens_spent?: number }).tokens_spent ? ` · -${(data as { tokens_spent?: number }).tokens_spent}t` : ''}`,
        );
        girl = { ...girl, locked: false, is_unlocked: true };
      }
      const chatId = await ensureCompanionChatId(girl);
      if (!chatId) {
        if (!user) {
          router.push(`/login?next=${encodeURIComponent('/')}`);
        } else {
          toast.error(t('home.chatFail'));
        }
        return;
      }
      void friendStatus.refresh();
      setAddedCompanion({ id: chatId, name: girl.name, portrait: girl.portrait || girl.avatar || '' });
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'SEAT_LIMIT') {
        toast.error(t('explore.seatLimitTitle'), {
          description: t('explore.seatLimitDesc'),
          action: { label: t('explore.buySeats'), onClick: () => router.push('/pricing') },
        });
      } else {
        toast.error(e.message || t('home.chatFail'));
      }
    } finally {
      setBonding(false);
    }
  };

  if (!catalogReady || !featured) {
    return (
      <GameShell className="pb-4 md:pb-8 min-h-[100dvh]" hex={false}>
        <div className="flex min-h-[60dvh] items-center justify-center text-sm text-white/50">
          <span>{catalogReady ? t('explore.noInCategory') : 'Loading companions...'}</span>
          {catalogReady ? <button type="button" className="glass-btn px-4 py-2" onClick={() => setCategoryFilter('all')}>{t('common.viewAll')}</button> : null}
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell className="pb-4 md:pb-8 min-h-[100dvh]" hex={false}>
      {/* Ambient — single static gradient (no multi-layer animated blur on mobile) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 30% 35%, ${rc.glow}, transparent 70%)`,
            opacity: 0.35,
          }}
        />
        <div className="hidden md:block absolute top-1/4 left-[15%] h-48 w-48 rounded-full bg-[#ff2e88]/10 blur-[64px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-none px-3 sm:px-5 lg:px-8 pt-2 sm:pt-4 space-y-4 sm:space-y-6">
        {/* Ad banner — 广告栏（后台 admin_ads 管理，position=banner；i18n 文案覆盖层见 HomeAdBanners） */}
        <HomeAdBanners ads={bannerAds} />

        {/* Announcement bar — 公告栏（后台 site_settings 管理）· i18n + 走马灯 + 发光，置于广告图下方 */}
        {siteSettings?.announcement_enabled && announceText ? (
          <div className="relative overflow-hidden rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-300/15 via-[#FF2D78]/10 to-amber-300/15 px-3.5 py-2.5 shadow-[0_0_28px_rgba(252,211,77,0.28),inset_0_0_20px_rgba(255,46,136,0.10)]">
            <div className="flex items-center gap-2.5">
              <Megaphone className="h-4 w-4 shrink-0 text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.9)]" />
              <div className="relative flex-1 overflow-hidden">
                <div className="h5-marquee items-center gap-12">
                  <span className="text-[12px] font-semibold text-amber-100 [text-shadow:0_0_10px_rgba(252,211,77,0.85),0_0_22px_rgba(255,46,136,0.55)]">{announceText}</span>
                  <span aria-hidden className="text-[12px] font-semibold text-amber-100 [text-shadow:0_0_10px_rgba(252,211,77,0.85),0_0_22px_rgba(255,46,136,0.55)]">{announceText}</span>
                </div>
              </div>
              {siteSettings.announcement_link ? (
                <a
                  href={siteSettings.announcement_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/20 active:scale-95 transition-all"
                >
                  {t('common.viewAll')}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Top */}
        <div className="relative flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <GameChip>
              <Flame className="h-3 w-3" /> 18+
            </GameChip>
            <span className="text-[10px] sm:text-[11px] text-white/35 truncate">
              {t('home.onlineRoles', { count: catalog.length })}
              {catalogSource === 'api' ? ' · live' : ' · demo'}
            </span>
          </div>
          {user ? (
            <h1 className="text-xl sm:text-4xl font-black tracking-tight leading-tight">
              {t('home.chooseYour')}
              <span className="bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
                {' '}{t('home.obsession')}
              </span>
            </h1>
          ) : (
            <h1 className="text-xl sm:text-3xl font-black tracking-tight leading-tight">
              {t('home.heroTaglineLead')}
              <span className="bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
                {' — '}{t('home.heroTaglineRest')}
              </span>
            </h1>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="glass h-10 w-10 sm:w-auto sm:px-3 rounded-full text-xs flex items-center justify-center gap-1.5 text-[#ffb3cd] shrink-0 touch-manipulation active:scale-95 absolute right-0 top-0"
            aria-label={t('home.share')}
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('home.share')}</span>
          </button>
        </div>

        {/* ═══════════ Live avatars rail（golove 式圆形头像横排） ═══════════ */}
        <section aria-label="Live companions">
          <div className="mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff2e88] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff2e88]" />
            </span>
            <span className="text-xs font-bold tracking-wide text-white/70">{t('home.liveNow')}</span>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-hide">
            {liveGirls.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setDetail(g)}
                className="group flex w-16 shrink-0 flex-col items-center gap-1.5 touch-manipulation"
                aria-label={g.name}
              >
                <span className="relative block h-16 w-16 rounded-full p-[2px] bg-gradient-to-br from-[#ff2e88] to-[#c026d3] shadow-[0_0_14px_rgba(255,46,136,0.35)] transition-transform group-active:scale-95">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.avatar || g.portrait} alt="" className="h-full w-full rounded-full object-cover ring-2 ring-[#0a0712]" loading="lazy" decoding="async" draggable={false} />
                  <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0712]" />
                </span>
                <span className="w-full truncate text-center text-[11px] text-white/75">{g.name}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Guest conversion strip */}
        {!user && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#ff2e88]/30 bg-gradient-to-r from-[#FF2D78]/[0.16] via-transparent to-[#C026D3]/[0.16] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t('home.guestTitle')}</p>
              <p className="text-[11px] text-white/50 truncate">{t('home.guestCta')}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="shrink-0 h-9 px-4 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-xs font-bold shadow-[0_2px_14px_rgba(255,45,120,0.4)] hover:opacity-90 active:scale-95 transition-all"
            >
              {t('home.guestJoin')}
            </button>
          </div>
        )}

        {/* ═══════════ 两层筛选：排序下拉 + 分类 chips（golove 式） ═══════════ */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Companion categories">
            <button type="button" onClick={() => setCategoryFilter('all')} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-semibold', categoryFilter === 'all' ? 'border-[#ff2e88] bg-[#ff2e88]/20 text-white' : 'border-white/10 bg-white/5 text-white/55')}>{t('landing.filterAll')}</button>
            {COMPANION_CATEGORIES.map((category) => <button key={category} type="button" onClick={() => setCategoryFilter(category)} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-semibold', categoryFilter === category ? 'border-[#ff2e88] bg-[#ff2e88]/20 text-white' : 'border-white/10 bg-white/5 text-white/55 hover:text-white')}>{COMPANION_CATEGORY_LABELS[category][locale]}</button>)}
          </div>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'hot' | 'new' | 'featured')}
            className="shrink-0 h-[38px] rounded-full border border-white/10 bg-[#141019] px-3 text-xs font-semibold text-white/75 outline-none focus:border-[#ff2e88]/50"
            aria-label={t('home.sortBy')}
          >
            <option value="hot">{t('home.sortHot')}</option>
            <option value="new">{t('home.sortNew')}</option>
            <option value="featured">{t('home.sortFeatured')}</option>
          </select>
        </div>

        {/* ═══════════ 高密度卡片网格（golove 式：22px 圆角 + 底部渐变文字层） ═══════════ */}
        <section>
          <div className="flex flex-col items-center text-center mb-3">
            <div className="game-chip mb-1">
              <Flame className="h-3 w-3" /> HOT
            </div>
            <h3 className="text-xl sm:text-2xl font-black">{t('home.hotTitle')}</h3>
            <p className="text-[11px] text-white/40 mt-0.5">{t('home.hotSub')}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
            {gridGirls.map((g, i) => (
              <Fragment key={g.id}>
                {i === promoSlots[0] && <GridPromoCard variant="recharge" onClick={() => router.push('/wallet')} />}
                {i === promoSlots[1] && <GridPromoCard variant="firstTopup" onClick={() => router.push('/wallet')} />}
                <GridCard g={g} onOpen={(girl) => setDetail(girl)} previewSize={gridPreviewSize} />
              </Fragment>
            ))}
          </div>
          {/* 更多伴侣按钮 */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => router.push('/explore')}
              className="glass-btn !h-10 !px-5 text-xs flex items-center gap-1"
            >
              {t('home.moreGirls')} <ChevR className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* ═══════════ Ranking：人气创作者 Top15（虚拟+真实合并） ═══════════ */}
        <LeaderboardRail />

        {/* ═══════════ Modules: 2 rows × 3 cols ═══════════ */}
        <section>
          <div className="flex flex-col items-center text-center mb-3">
            <div className="game-chip mb-1">HUB · 2 ROWS</div>
            <h3 className="text-xl sm:text-2xl font-black">{t('home.modulesTitle')}</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.href}
                  type="button"
                  onClick={() => router.push(m.href)}
                  className="glass-strong rounded-2xl p-3 sm:p-4 text-left group active:scale-[0.98] hover:border-[#ff2e88]/35 transition-all flex gap-2.5 sm:gap-3.5 items-start min-h-[88px] sm:min-h-[108px]"
                >
                  <div className={cn('h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-lg', m.tone)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold tracking-[0.2em] text-white/35">{m.en}</div>
                    <div className="text-sm sm:text-base font-bold group-hover:text-[#ff6ba6] transition-colors mt-0.5">{m.title}</div>
                    <div className="hidden sm:block text-[12px] text-white/50 mt-1 leading-snug">{m.desc}</div>
                    <div className="mt-1.5 sm:mt-2 text-[10px] text-[#ffb3cd]/70 flex items-center gap-1">
                      <span className="inline-block h-1 w-1 rounded-full bg-[#ff6ba6]" /> <span className="truncate">{m.tip}</span>
                      <ChevR className="h-3 w-3 ml-auto opacity-50 group-hover:opacity-100" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Promo */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PromoCard
            onClick={() => router.push('/wallet')}
            badge="RECHARGE"
            badgeClass="text-[#ffd700]"
            icon={<Coins className="h-5 w-5 text-black" />}
            iconBg="from-[#ffd700] to-[#f59e0b]"
            title={locale === 'en' ? (siteSettings?.recharge_banner_title || t('home.promoTopup')) : t('home.promoTopup')}
            desc={locale === 'en' ? (siteSettings?.recharge_banner_desc || t('home.promoTopupDesc')) : t('home.promoTopupDesc')}
            glow="from-amber-500/20"
          />
          <PromoCard
            onClick={() => router.push('/quest?tab=achievements')}
            badge="ACHIEVEMENT"
            badgeClass="text-[#ff6ba6]"
            icon={<Trophy className="h-5 w-5 text-white" />}
            iconBg="from-[#ff2e88] to-[#c026d3]"
            title={locale === 'en' ? (siteSettings?.achievement_banner_title || t('home.promoQuest')) : t('home.promoQuest')}
            desc={locale === 'en' ? (siteSettings?.achievement_banner_desc || t('home.promoQuestDesc')) : t('home.promoQuestDesc')}
            glow="from-[#ff2e88]/20"
          />
        </section>


        {/* (Ad banner moved to the top of the homepage) */}

        {/* ═══════════ Footer ═══════════ */}
        <footer className="glass-strong rounded-2xl px-4 sm:px-6 py-6 sm:py-8 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="glass-btn !rounded-full h-8 w-8 flex items-center justify-center !p-0">
                  <Flame className="h-3.5 w-3.5" />
                </div>
                <span className="font-black bg-gradient-to-r from-[#ff6ba6] to-[#c026d3] bg-clip-text text-transparent">
                  Oxmate
                </span>
              </div>
              <p className="text-[12px] text-white/40 leading-relaxed max-w-xs">
                {siteSettings?.footer_tagline || t('landing.heroSubtitle')}
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-white/35 mb-2">SUPPORT</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={(siteSettings?.telegram_url || FOOTER_FALLBACK.telegram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#ffb3cd] hover:text-white transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    Telegram
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${(siteSettings?.support_email || FOOTER_FALLBACK.email)}`}
                    className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-[13px]"
                  >
                    {(siteSettings?.support_email || FOOTER_FALLBACK.email)}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-white/35 mb-2">SOCIAL</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={(siteSettings?.x_url || FOOTER_FALLBACK.x)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#ffb3cd] hover:text-white transition-colors"
                  >
                    <span className="font-black text-base leading-none">𝕏</span>
                    X / Twitter
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </li>
                {(siteSettings?.discord_url || FOOTER_FALLBACK.discord) ? (
                  <li>
                    <a
                      href={(siteSettings?.discord_url || FOOTER_FALLBACK.discord)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
                    >
                      Discord
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </a>
                  </li>
                ) : null}
                <li className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-white/35">
                  <button type="button" onClick={() => router.push('/terms')} className="hover:text-white">{t('footer.terms')}</button>
                  <button type="button" onClick={() => router.push('/privacy')} className="hover:text-white">{t('footer.privacy')}</button>
                  <button type="button" onClick={() => router.push('/refund-policy')} className="hover:text-white">{t('footer.refundPolicy')}</button>
                  <button type="button" onClick={() => router.push('/pricing')} className="hover:text-white">{t('nav.pricing')}</button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-white/30">
            <span>© {new Date().getFullYear()} Oxmate AI. All rights reserved. 18+</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('common.systemsOnline')}
            </span>
          </div>
        </footer>
      </div>

      {detail && (
        <CompanionDetailModal
          busy={bonding}
          girl={detail}
          open={!!detail}
          isFriend={friendStatus.isFriend(detail)}
          onClose={() => setDetail(null)}
          onSelect={() => {
            setDetail(null);
            void enterBond(detail);
          }}
        />
      )}

      <ShareCard
        open={shareOpen}
        onOpenChange={setShareOpen}
        girlfriend={{
          name: featured.name,
          age: featured.age,
          tags: featured.tags,
          short_description: `${relationshipLabel(featured.relationship, t)} · ${girlTagline(featured, locale)}`,
          personality: featured.personality,
          portrait_url: featured.portrait,
        }}
      />

      {/* Add-friend success popup */}
      {addedCompanion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setAddedCompanion(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setAddedCompanion(null); }}
          role="dialog"
          aria-modal="true"
          aria-label="Added companion confirmation"
        >
          <div className="w-80 rounded-2xl bg-gray-900 border border-purple-500/30 p-6 mx-4 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {addedCompanion.portrait && (
              <div className="w-16 h-16 mx-auto mb-3 rounded-full p-[2.5px] bg-gradient-to-br from-[#ffd700] via-[#ff2e88] to-[#c026d3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={addedCompanion.portrait} alt="" className="h-full w-full rounded-full object-contain" />
              </div>
            )}
            <h3 className="text-lg font-bold text-white mb-1">{t('explore.addedToFriends', { name: addedCompanion.name })}</h3>
            <p className="text-sm text-gray-400 mb-5">{addedCompanion.name} is now in your companion list</p>
            <div className="space-y-2">
              <button
                onClick={() => { router.push(`/companion/${addedCompanion.id}?tab=chat`); setAddedCompanion(null); }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white text-sm font-bold hover:opacity-90 transition"
              >
                💬 {t('explore.goToMessages')}
              </button>
              <button
                onClick={() => { router.push(`/companion/${addedCompanion.id}`); setAddedCompanion(null); }}
                className="w-full h-11 rounded-xl border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition"
              >
                {t('explore.viewProfile')}
              </button>
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function PromoCard({
  onClick,
  badge,
  badgeClass,
  icon,
  iconBg,
  title,
  desc,
  glow,
}: {
  onClick: () => void;
  badge: string;
  badgeClass: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
  glow: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative glass-strong rounded-2xl p-3.5 text-left overflow-hidden group active:scale-[0.99]"
    >
      <div className={cn('absolute inset-0 bg-gradient-to-r to-transparent opacity-90', glow)} />
      <div className="relative flex items-center gap-3">
        <div className={cn('h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0', iconBg)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn('text-[9px] font-bold tracking-wider', badgeClass)}>{badge}</div>
          <div className="font-bold text-sm truncate">{title}</div>
          <div className="text-[10px] text-white/40 truncate">{desc}</div>
        </div>
        <ChevR className="h-4 w-4 text-white/35 group-hover:text-white shrink-0" />
      </div>
    </button>
  );
}
