'use client';

/**
 * Home lobby
 * - Hero: 左侧竖排立绘缩略（切换角色）+ 中间 9:16 立绘主视觉 + 右侧基础数值
 * - Modules: 2 rows × 3 cols (fuller cards)
 * - Hot: 4 category rows × 5 (female / male / transgender / anime, contain no-crop)
 * - Site footer: Telegram / X / etc.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useDataSync } from '@/hooks/useDataSync';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, ShoppingBag, Wand2, Crown, ChevronLeft, ChevronRight,
  Heart, Flame, Lock, Zap, Users, Share2,
  Trophy, Coins, ChevronRight as ChevR, Send, ExternalLink, Megaphone,
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
  GameShell, GameChip, GamePrimaryButton, RarityBadge,
} from '@/components/game/GameShell';
import { LockedPortraitOverlay, lockedImageClass } from '@/components/game/LockedPortrait';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';
import { useAuth } from '@/components/AuthProvider';
import { HEAT_UNLOCK_HINTS, INTIMACY_LEVELS } from '@/lib/constants';
import { COMPANION_CATEGORIES, COMPANION_CATEGORY_LABELS, type CompanionCategory } from '@/lib/companion-category';
import { useSiteSettings, useSiteAds } from '@/hooks/useSiteSettings';
import { HomeAdBanners } from '@/components/ads/HomeAdBanners';


function isHomeVideoUrl(url?: string | null): boolean {
  const u = String(url || '').toLowerCase().split('?')[0];
  if (!u) return false;
  return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.mov') || u.endsWith('.m4v') || u.includes('/video/') || u.includes('/videos/');
}

const FOOTER_FALLBACK = {
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/oxmate_bot',
  x: process.env.NEXT_PUBLIC_X_URL || 'https://x.com/ozmate',
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || '',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@oxmate-ai.com',
};

/** Hot-12 卡片：移动端轮播与桌面网格共用 */
function HotCard({
  g,
  rank,
  className,
  onOpen,
  fit = 'cover',
}: {
  g: DemoGirl;
  rank: number;
  className?: string;
  onOpen: (g: DemoGirl) => void;
  fit?: 'cover' | 'contain';
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-hotcard
      onClick={() => onOpen(g)}
      className={cn(
        'relative overflow-hidden text-left active:scale-[0.98] transition-transform ring-1 ring-white/10 hover:ring-[#ff2e88]/45 hover:shadow-[0_0_24px_rgba(255,46,136,0.25)]',
        `game-rarity-${String(g.rarity || 'R').toLowerCase()}`,
        className,
      )}
    >
      <div className="relative aspect-[2/3]">
        <CardMedia
          src={g.portrait || g.avatar}
          alt={g.name}
          hoverPlay={false}
          forcePlay={false}
          showBadge={false}
          fit={fit}
          imgClassName={lockedImageClass(g.locked)}
        />
        {g.locked && <LockedPortraitOverlay price={g.unlock_price_tokens} className="!backdrop-blur-sm" />}
        <span className="absolute top-1.5 left-1.5 z-[2] text-[9px] font-black px-1.5 py-0.5 rounded bg-black/55 text-[#ffd700]">
          #{rank}
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-2 z-[2] text-center">
          <div className="text-xs sm:text-sm font-bold truncate [text-shadow:0_1px_10px_rgba(0,0,0,0.95)]">{g.name}</div>
          <div className="text-[9px] sm:text-[10px] text-white/60 truncate [text-shadow:0_1px_8px_rgba(0,0,0,0.95)]">
            {relationshipLabel(g.relationship, t)} · {g.rarity}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const friendStatus = useFriendStatus();
  const { settings: siteSettings } = useSiteSettings();
  const { ads: bannerAds } = useSiteAds('banner');
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
  const [focus, setFocus] = useState(0);
  const [detail, setDetail] = useState<DemoGirl | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [paused, setPaused] = useState(false);
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

  // 主视觉轮播：后台推荐(featured)优先，不足再用热门/公开补齐
  const filteredCatalog = useMemo(
    () => categoryFilter === 'all' ? catalog : catalog.filter((girl) => girl.category === categoryFilter),
    [catalog, categoryFilter],
  );
  const roster = useMemo(() => {
    const featuredFirst = filteredCatalog.filter((g) => g.is_featured || g.list_kind === 'featured');
    const rest = filteredCatalog.filter((g) => !(g.is_featured || g.list_kind === 'featured'));
    const ordered = [...featuredFirst, ...rest];
    return ordered.slice(0, 10);
  }, [filteredCatalog]);
  const featured = roster[focus] || filteredCatalog[0] || null;
  const rc = RARITY_COLORS[(featured?.rarity as keyof typeof RARITY_COLORS) || 'R'] || RARITY_COLORS.R;

  // 热门 4 行：女性/男性/跨性别/二次元各一行，每行 5 个，行内按 hot_score 排序
  const hotRows = useMemo(
    () =>
      COMPANION_CATEGORIES.map((cat) => ({
        cat,
        items: catalog
          .filter((g) => g.category === cat)
          .sort((a, b) => Number(b.hot_score ?? b.intimacy ?? 0) - Number(a.hot_score ?? a.intimacy ?? 0))
          .slice(0, 5),
      })),
    [catalog],
  );

  useEffect(() => {
    if (catalog.length < 2 || paused) return;
    // Prefer slower carousel + pause when tab hidden (saves CPU/GPU)
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setFocus((i) => (i + 1) % Math.min(catalog.length, 10));
    };
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [catalog.length, paused]);

  const prev = useCallback(() => {
    setPaused(true);
    setFocus((i) => (i - 1 + roster.length) % roster.length);
  }, [roster.length]);

  const next = useCallback(() => {
    setPaused(true);
    setFocus((i) => (i + 1) % roster.length);
  }, [roster.length]);

  // Mobile swipe on main visual: horizontal only, keep vertical scroll + tap-to-detail
  const touchStart = useRef<{ x: number; y: number; active: boolean } | null>(null);
  const swipeConsumed = useRef(false);
  const SWIPE_MIN = 48;

  const onPortraitTouchStart = useCallback((e: React.TouchEvent) => {
    if (roster.length < 2) return;
    const t0 = e.changedTouches[0];
    if (!t0) return;
    touchStart.current = { x: t0.clientX, y: t0.clientY, active: true };
    swipeConsumed.current = false;
  }, [roster.length]);

  const onPortraitTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start?.active || roster.length < 2) return;
    const t0 = e.changedTouches[0];
    if (!t0) return;
    const dx = t0.clientX - start.x;
    const dy = t0.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN) return;
    if (Math.abs(dx) <= Math.abs(dy) * 1.2) return; // vertical scroll wins
    swipeConsumed.current = true;
    if (dx < 0) next();
    else prev();
  }, [next, prev, roster.length]);

  const onPortraitClick = useCallback(() => {
    if (swipeConsumed.current) {
      swipeConsumed.current = false;
      return;
    }
    if (featured) setDetail(featured);
  }, [featured]);

  const enterBond = async (girl: DemoGirl = featured!) => {
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

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" aria-label="Companion categories">
          <button type="button" onClick={() => { setCategoryFilter('all'); setFocus(0); }} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-semibold', categoryFilter === 'all' ? 'border-[#ff2e88] bg-[#ff2e88]/20 text-white' : 'border-white/10 bg-white/5 text-white/55')}>{t('landing.filterAll')}</button>
          {COMPANION_CATEGORIES.map((category) => <button key={category} type="button" onClick={() => { setCategoryFilter(category); setFocus(0); }} className={cn('shrink-0 rounded-full border px-4 py-2 text-xs font-semibold', categoryFilter === category ? 'border-[#ff2e88] bg-[#ff2e88]/20 text-white' : 'border-white/10 bg-white/5 text-white/55 hover:text-white')}>{COMPANION_CATEGORY_LABELS[category][locale]}</button>)}
        </div>

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

        {/* ═══════════ HERO: tall portrait + right panel ═══════════ */}
        <section
          className="glass-strong rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 lg:p-4 overflow-visible"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            {/* LEFT — 竖排立绘缩略（切换角色） */}
            <div className="lg:col-span-1">
              <div className="glass-strong rounded-xl sm:rounded-2xl p-2.5 sm:p-3 h-full">
                <div className="hidden lg:flex items-center justify-between mb-2 px-0.5">
                  <span className="text-[10px] font-bold tracking-wider text-white/45 uppercase">{t('home.switchRole')}</span>
                  <span className="text-[10px] text-white/30 tabular-nums">{focus + 1}/{roster.length}</span>
                </div>
                <div className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-y-auto lg:overflow-x-hidden overscroll-contain py-1 px-0.5 scrollbar-hide">
                  {roster.map((g, i) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => { setPaused(true); setFocus(i); }}
                      className={cn(
                        'relative shrink-0 rounded-lg overflow-hidden transition-all touch-manipulation h-[68px] w-[46px] sm:h-[76px] sm:w-[52px]',
                        i === focus
                          ? 'ring-2 ring-[#ff2e88] shadow-[0_0_16px_rgba(255,46,136,0.45)] z-[1]'
                          : 'opacity-60 ring-1 ring-white/10 hover:opacity-100',
                      )}
                      aria-label={g.name}
                      aria-pressed={i === focus}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.portrait || g.avatar} alt="" className="h-full w-full object-cover object-center" draggable={false} loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* CENTER — 9:16 立绘主视觉 */}
            <div
              className="lg:col-span-8 relative touch-pan-y flex justify-center"
              onTouchStart={onPortraitTouchStart}
              onTouchEnd={onPortraitTouchEnd}
              onTouchCancel={() => { touchStart.current = null; }}
            >
              <button
                type="button"
                onClick={prev}
                className="absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 z-30 h-10 w-10 sm:h-11 sm:w-11 rounded-full glass-strong flex items-center justify-center shadow-lg touch-manipulation active:scale-95"
                aria-label={t('home.prev')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 z-30 h-10 w-10 sm:h-11 sm:w-11 rounded-full glass-strong flex items-center justify-center shadow-lg touch-manipulation active:scale-95"
                aria-label={t('home.next')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              {/* CSS-only fade (no layout thrash from AnimatePresence exit) */}
              <button
                type="button"
                key={featured.id}
                className={cn(
                  'relative overflow-hidden rounded-xl sm:rounded-2xl cursor-pointer touch-manipulation text-left',
                  // 9:16 立绘画框：向两侧扩大，高约 83vh，宽由 min(88vw, 47vh) 推导
                  'aspect-[9/16] w-[min(88vw,47vh)]',
                  `game-rarity-${String(featured.rarity || 'R').toLowerCase()}`,
                )}
                style={{
                  boxShadow: `0 0 0 1px ${rc.color}55, 0 16px 48px rgba(0,0,0,0.45)`,
                }}
                onClick={onPortraitClick}
                aria-label={`View ${featured.name} profile`}
              >
                <CardMedia
                  src={featured.portrait || featured.avatar}
                  videoSrc={
                    isHomeVideoUrl(featured.video)
                      ? featured.video
                      : isHomeVideoUrl(featured.avatar_video)
                        ? featured.avatar_video
                        : undefined
                  }
                  alt={featured.name}
                  forcePlay
                  hoverPlay={false}
                  showBadge
                  fit="contain"
                  previewSize="detail"
                  imgClassName={lockedImageClass(featured.locked)}
                />
                {featured.locked && (
                  <LockedPortraitOverlay price={featured.unlock_price_tokens} />
                )}

                {/* Single vignette — no mix-blend / particle / shimmer (GPU-heavy) */}

                <div className="absolute top-3 left-3 z-[3] flex flex-col gap-1.5">
                  <RarityBadge rarity={featured.rarity} />
                  <span className="glass px-2 py-0.5 rounded-md text-[9px] font-bold text-[#ffb3cd] w-fit">
                    MAIN VISUAL
                  </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 z-[3]">
                  <div className="glass-strong px-3 py-2 rounded-xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-lg sm:text-xl font-black truncate">{featured.name}</div>
                      <div className="text-[10px] text-white/50 truncate">
                        {relationshipLabel(featured.relationship, t)} · {featured.age}{t('home.yearsOld')} {t('home.tapProfile')}
                      </div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  </div>
                </div>
              </button>
            </div>

            {/* RIGHT — stats + actions */}
            <div className="lg:col-span-3 flex flex-col gap-3 min-h-0">
              <div className="flex-1 rounded-xl sm:rounded-2xl bg-black/25 border border-white/[0.07] p-4 sm:p-5 flex flex-col sm:justify-between">
                <div className="text-[10px] tracking-[0.25em] text-[#ff6ba6] font-bold">FEATURED</div>
                <h2 className="mt-1 text-2xl sm:text-3xl font-black seduce-glow leading-none">{featured.name}</h2>
                <p className="mt-2 text-sm text-white/55 line-clamp-2 sm:line-clamp-3 leading-relaxed">{girlTagline(featured, locale)}</p>

                <div className="mt-4 space-y-2.5 hidden sm:block">
                  <Meter label={t('home.meterDesire')} value={featured.desire ?? featured.intimacy} color="#ff2e88" />
                  <Meter label={t('home.meterDev')} value={featured.development ?? Math.floor(featured.intimacy * 0.85)} color="#a855f7" />
                  <Meter label={t('home.meterKink')} value={featured.kink ?? Math.floor(featured.intimacy * 0.7)} color="#f59e0b" />
                </div>

                <div className="mt-3 rounded-xl border border-[#ff2e88]/25 bg-gradient-to-r from-[#ff2e88]/15 via-black/20 to-[#a855f7]/10 px-3 py-2.5 hidden sm:block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-[#ff6ba6]">HEAT PATH</span>
                    <span className="text-[10px] text-white/50">
                      {INTIMACY_LEVELS.find((l) => l.level === Math.min(6, Math.max(1, Math.ceil(((featured.desire ?? featured.intimacy) || 0) / 20) || 1)))?.title || 'Spark'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/70 leading-snug">
                    {HEAT_UNLOCK_HINTS.find((h) => h.level === Math.min(6, Math.max(1, Math.ceil(((featured.desire ?? featured.intimacy) || 0) / 20) || 1)))?.hint
                      || 'Chat more to raise heat and unlock Desire.'}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoCell label={t('home.age')} value={`${featured.age}`} />
                  <InfoCell label={t('home.rarity')} value={featured.rarity} accent={rc.color} />
                  <InfoCell label={t('home.relation')} value={relationshipLabel(featured.relationship, t)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(Array.isArray(featured.tags) ? featured.tags : []).slice(0, 6).map((tag) => (
                    <span key={tag} className="glass px-2 py-0.5 rounded-full text-[10px] text-[#ffc0d8]">#{tag}</span>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <GamePrimaryButton className="flex-1 h-12 min-h-[48px] text-sm touch-manipulation" disabled={bonding} onClick={() => void enterBond()}>
                    {featured.locked ? <Lock className="h-4 w-4 shrink-0" /> : <Heart className="h-4 w-4 fill-current shrink-0" />}
                    <span className="truncate">
                      {bonding
                        ? t('home.entering')
                        : !user
                          ? t('home.startChattingFree')
                          : featured.locked
                            ? `${t('home.unlock')}${featured.unlock_price_tokens ? ` · ${featured.unlock_price_tokens}t` : ''}`
                            : t('home.enterPrivate')}
                    </span>
                  </GamePrimaryButton>
                  <button type="button" onClick={() => setDetail(featured)} className="glass h-12 min-h-[48px] px-3 sm:px-4 rounded-full text-sm font-semibold shrink-0 touch-manipulation active:scale-95">
                    {t('home.profile')}
                  </button>
                  <button type="button" onClick={() => setShareOpen(true)} className="glass h-12 w-12 min-h-[48px] rounded-full flex items-center justify-center shrink-0 touch-manipulation active:scale-95" aria-label={t('home.share')}>
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ═══════════ Hot：4 行，女性/男性/跨性别/二次元各一行 ═══════════ */}
        <section>
          <div className="flex flex-col items-center text-center mb-3">
            <div className="game-chip mb-1">
              <Flame className="h-3 w-3" /> HOT
            </div>
            <h3 className="text-xl sm:text-2xl font-black">{t('home.hotTitle')}</h3>
            <p className="text-[11px] text-white/40 mt-0.5">{t('home.hotSub')}</p>
          </div>

          <div className="space-y-4">
            {hotRows.filter((row) => row.items.length > 0).map(({ cat, items }) => (
              <div key={cat}>
                <div className="game-chip mb-2 w-fit">{COMPANION_CATEGORY_LABELS[cat][locale]}</div>
                {/* 一行 5 个，宽度自适应，contain 完整展示不裁剪 */}
                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {items.map((g, i) => (
                    <HotCard
                      key={g.id}
                      g={g}
                      rank={i + 1}
                      onOpen={(girl) => setDetail(girl)}
                      fit="contain"
                      className="rounded-xl"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 更多伴侣按钮置于下方 */}
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

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-white/45">{label}</span>
        <span className="font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="desire-bar">
        <i style={{ width: `${Math.min(100, value)}%`, background: `linear-gradient(90deg, ${color}, #ffb3cd)` }} />
      </div>
    </div>
  );
}

function InfoCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass rounded-lg px-2 py-2 text-center">
      <div className="text-[9px] text-white/40">{label}</div>
      <div className="text-sm font-bold truncate mt-0.5" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}
