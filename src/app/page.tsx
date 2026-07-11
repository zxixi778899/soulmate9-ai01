'use client';

/**
 * Home lobby
 * - Tall full-body portrait (main visual) + VFX
 * - Avatar strip under right info panel
 * - Modules: 2 rows × 3 cols (fuller cards)
 * - Hot 12: 3 rows × 4 cols
 * - Site footer: Telegram / X / etc.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageCircle, ShoppingBag, Wand2, Crown, ChevronLeft, ChevronRight,
  Heart, Flame, Lock, Zap, Star, Users, Share2,
  Trophy, Coins, ChevronRight as ChevR, Send, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { GIRLS, RARITY_COLORS, type DemoGirl, girlTagline, relationshipLabel } from '@/lib/demo-data';
import { fetchCompanionCatalog } from '@/lib/companions';
import { openCompanionChat } from '@/lib/ensure-companion';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { CardMedia } from '@/components/discover/CardMedia';
import { ShareCard } from '@/components/ShareCard';
import {
  GameShell, GameChip, GamePrimaryButton, RarityBadge,
} from '@/components/game/GameShell';
import { LockedPortraitOverlay, lockedImageClass } from '@/components/game/LockedPortrait';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n/context';

const FOOTER_LINKS = {
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || 'https://t.me/soulmateai_support',
  x: process.env.NEXT_PUBLIC_X_URL || 'https://x.com/soulmateai',
  discord: process.env.NEXT_PUBLIC_DISCORD_URL || '',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@soulmateai.shop',
};

export default function HomePage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
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
  const [focus, setFocus] = useState(0);
  const [detail, setDetail] = useState<DemoGirl | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [bonding, setBonding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCompanionCatalog(24).then((r) => {
      if (cancelled) return;
      if (r.girls.length) {
        setCatalog(r.girls);
        setCatalogSource(r.source);
      } else {
        // hard empty — keep UI from crashing
        setCatalog(GIRLS.slice(0, 8));
        setCatalogSource('demo');
      }
      setCatalogReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const roster = catalog.slice(0, 10);
  const featured = roster[focus] || catalog[0] || null;
  const rc = RARITY_COLORS[featured?.rarity || 'R'];

  const hotList = useMemo(
    () =>
      [...catalog]
        .sort((a, b) => (b.hot_score ?? b.intimacy) - (a.hot_score ?? a.intimacy))
        .slice(0, 12),
    [catalog],
  );

  useEffect(() => {
    if (catalog.length < 2 || paused) return;
    const t = setInterval(() => setFocus((i) => (i + 1) % Math.min(catalog.length, 10)), 5500);
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

  const enterBond = async (girl: DemoGirl = featured!) => {
    if (!girl) return;
    setBonding(true);
    try {
      if (girl.locked) {
        const res = await authedFetch('/api/girlfriends/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ girlfriend_id: girl.id }),
        });
        const data = await res.json().catch(() => ({}));
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
      const ok = await openCompanionChat(girl, router);
      if (!ok) {
        toast.error(t('home.chatFail'));
        router.push('/login');
      }
    } finally {
      setBonding(false);
    }
  };

  if (!catalogReady || !featured) {
    return (
      <GameShell className="pb-4 md:pb-8 min-h-[100dvh]" hex={false}>
        <div className="flex min-h-[60dvh] items-center justify-center text-sm text-white/50">
          Loading companions…
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell className="pb-4 md:pb-8 min-h-[100dvh]" hex={false}>
      {/* Ambient keyed to featured rarity — softer on mobile for perf */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 30% 35%, ${rc.glow}, transparent 70%)`,
            opacity: 0.45,
          }}
        />
        <div className="absolute top-1/4 left-[15%] h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-[#ff2e88]/12 blur-[80px] animate-pulse" />
        <div className="hidden sm:block absolute bottom-1/4 right-[10%] h-72 w-72 rounded-full bg-[#7c3aed]/20 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-3 sm:px-5 lg:px-8 pt-2 sm:pt-4 space-y-4 sm:space-y-6">
        {/* Top */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <GameChip>
                <Flame className="h-3 w-3" /> 18+
              </GameChip>
              <span className="text-[10px] sm:text-[11px] text-white/35 truncate">
                {t('home.onlineRoles', { count: catalog.length })}
                {catalogSource === 'api' ? ' · live' : ' · demo'}
              </span>
            </div>
            <h1 className="mt-1 text-lg sm:text-3xl font-black tracking-tight leading-tight">
              {t('home.chooseYour')}
              <span className="bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
                {' '}{t('home.obsession')}
              </span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="glass h-10 w-10 sm:w-auto sm:px-3 rounded-full text-xs flex items-center justify-center gap-1.5 text-[#ffb3cd] shrink-0 touch-manipulation active:scale-95"
            aria-label={t('home.share')}
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('home.share')}</span>
          </button>
        </div>

        {/* ═══════════ HERO: tall portrait + right panel ═══════════ */}
        <section
          className="glass-strong rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 lg:p-4"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-stretch">
            {/* LEFT — tall full-body stage */}
            <div className="lg:col-span-6 xl:col-span-5 relative">
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

              <AnimatePresence mode="wait">
                <motion.div
                  key={featured.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.01 }}
                  transition={{ duration: 0.35 }}
                  className={cn(
                    'relative w-full overflow-hidden rounded-xl sm:rounded-2xl cursor-pointer touch-manipulation',
                    /* Mobile: viewport-fit height (no 560px min). Desktop: tall stage. */
                    'aspect-[3/4] max-h-[min(58dvh,480px)] sm:aspect-[3/4.65] sm:max-h-[82vh] sm:min-h-[560px] lg:min-h-[640px]',
                    'sm:stage-breathe',
                    `game-rarity-${featured.rarity.toLowerCase()}`,
                  )}
                  style={{
                    boxShadow: `0 0 0 2px ${rc.color}66, 0 0 48px ${rc.glow}, 0 0 100px ${rc.glow}, 0 28px 80px rgba(0,0,0,0.55)`,
                  }}
                  onClick={() => setDetail(featured)}
                >
                  {/* Pulsing outer aura */}
                  <div
                    className="pointer-events-none absolute -inset-3 rounded-[1.5rem] blur-2xl opacity-60 animate-pulse"
                    style={{ background: `radial-gradient(circle, ${rc.color}55, transparent 70%)` }}
                  />

                  <CardMedia
                    src={featured.portrait || featured.avatar}
                    videoSrc={featured.video || featured.avatar_video}
                    alt={featured.name}
                    forcePlay
                    showBadge
                    imgClassName={cn(
                      'transition-[filter] duration-500',
                      lockedImageClass(featured.locked),
                    )}
                  />
                  {featured.locked && (
                    <LockedPortraitOverlay price={featured.unlock_price_tokens} />
                  )}

                  {/* Soft vignette — keep full body readable */}
                  <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                  <div
                    className="absolute inset-0 z-[1] mix-blend-soft-light opacity-45"
                    style={{
                      background: `linear-gradient(160deg, ${rc.color}40 0%, transparent 50%, #ff2e8830 100%)`,
                    }}
                  />

                  {/* Floating particles */}
                  <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                    {[...Array(10)].map((_, i) => (
                      <span
                        key={i}
                        className="absolute text-sm opacity-80"
                        style={{
                          left: `${8 + i * 9}%`,
                          bottom: `${6 + (i % 5) * 14}%`,
                          animation: `float-heart ${2.2 + (i % 4) * 0.55}s ease-out infinite`,
                          animationDelay: `${i * 0.28}s`,
                          filter: 'drop-shadow(0 0 6px rgba(255,100,160,0.8))',
                        }}
                      >
                        {i % 3 === 0 ? '✨' : i % 3 === 1 ? '💕' : '✦'}
                      </span>
                    ))}
                  </div>

                  {/* Light sweep */}
                  <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
                    <div className="absolute inset-y-0 -left-1/3 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent game-shimmer" />
                  </div>

                  <div className="absolute top-3 left-3 z-[3] flex flex-col gap-1.5">
                    <RarityBadge rarity={featured.rarity} />
                    <span className="glass px-2 py-0.5 rounded-md text-[9px] font-bold text-[#ffb3cd] w-fit">
                      MAIN VISUAL
                    </span>
                  </div>

                  {/* Minimal name — thin strip only */}
                  <div className="absolute bottom-3 left-3 right-3 z-[3]">
                    <div className="glass-strong px-3 py-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-lg sm:text-xl font-black truncate seduce-glow">{featured.name}</div>
                        <div className="text-[10px] text-white/50 truncate">
                          {relationshipLabel(featured.relationship, t)} · {featured.age}{t('home.yearsOld')} {t('home.tapProfile')}
                        </div>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0 shadow-[0_0_10px_#34d399]" />
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* RIGHT — stats + actions + avatar strip */}
            <div className="lg:col-span-6 xl:col-span-7 flex flex-col gap-3 min-h-0">
              <div className="flex-1 rounded-xl sm:rounded-2xl bg-black/25 border border-white/[0.07] p-4 sm:p-5 flex flex-col">
                <div className="text-[10px] tracking-[0.25em] text-[#ff6ba6] font-bold">FEATURED</div>
                <h2 className="mt-1 text-2xl sm:text-3xl font-black seduce-glow leading-none">{featured.name}</h2>
                <p className="mt-2 text-sm text-white/55 line-clamp-3 leading-relaxed">{girlTagline(featured, locale)}</p>

                <div className="mt-4 space-y-2.5">
                  <Meter label={t('home.meterDesire')} value={featured.desire ?? featured.intimacy} color="#ff2e88" />
                  <Meter label={t('home.meterDev')} value={featured.development ?? Math.floor(featured.intimacy * 0.85)} color="#a855f7" />
                  <Meter label={t('home.meterKink')} value={featured.kink ?? Math.floor(featured.intimacy * 0.7)} color="#f59e0b" />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <InfoCell label={t('home.age')} value={`${featured.age}`} />
                  <InfoCell label={t('home.rarity')} value={featured.rarity} accent={rc.color} />
                  <InfoCell label={t('home.relation')} value={relationshipLabel(featured.relationship, t)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {featured.tags.slice(0, 6).map((tag) => (
                    <span key={tag} className="glass px-2 py-0.5 rounded-full text-[10px] text-[#ffc0d8]">#{tag}</span>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <GamePrimaryButton className="flex-1 h-12 min-h-[48px] text-sm touch-manipulation" disabled={bonding} onClick={() => void enterBond()}>
                    {featured.locked ? <Lock className="h-4 w-4 shrink-0" /> : <Heart className="h-4 w-4 fill-current shrink-0" />}
                    <span className="truncate">
                      {bonding
                        ? t('home.entering')
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

              {/* Avatar select — under right panel */}
              <div className="glass-strong rounded-xl sm:rounded-2xl p-2.5 sm:p-3">
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-[10px] font-bold tracking-wider text-white/45 uppercase">{t('home.switchRole')}</span>
                  <span className="text-[10px] text-white/30">{focus + 1}/{roster.length}</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                  {roster.map((g, i) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => { setPaused(true); setFocus(i); }}
                      className={cn(
                        'relative shrink-0 rounded-xl overflow-hidden transition-all',
                        i === focus
                          ? 'h-16 w-14 sm:h-[72px] sm:w-16 ring-2 ring-[#ff2e88] shadow-[0_0_16px_rgba(255,46,136,0.45)]'
                          : 'h-14 w-12 sm:h-16 sm:w-14 opacity-55 ring-1 ring-white/10 hover:opacity-90',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.avatar || g.portrait} alt={g.name} className="h-full w-full object-cover" />
                      {i === focus && (
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#ff2e88] to-[#ffd700]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════ Modules: 2 rows × 3 cols ═══════════ */}
        <section>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="game-chip mb-1">HUB · 2 ROWS</div>
              <h3 className="text-lg font-bold">{t('home.modulesTitle')}</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.href}
                  type="button"
                  onClick={() => router.push(m.href)}
                  className="glass-strong rounded-2xl p-4 text-left group active:scale-[0.98] hover:border-[#ff2e88]/35 transition-all flex gap-3.5 items-start min-h-[108px]"
                >
                  <div className={cn('h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-lg', m.tone)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-bold tracking-[0.2em] text-white/35">{m.en}</div>
                    <div className="text-base font-bold group-hover:text-[#ff6ba6] transition-colors mt-0.5">{m.title}</div>
                    <div className="text-[12px] text-white/50 mt-1 leading-snug">{m.desc}</div>
                    <div className="mt-2 text-[10px] text-[#ffb3cd]/70 flex items-center gap-1">
                      <span className="inline-block h-1 w-1 rounded-full bg-[#ff6ba6]" /> {m.tip}
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
            onClick={() => router.push('/shop')}
            badge="RECHARGE"
            badgeClass="text-[#ffd700]"
            icon={<Coins className="h-5 w-5 text-black" />}
            iconBg="from-[#ffd700] to-[#f59e0b]"
            title={t('home.promoTopup')}
            desc={t('home.promoTopupDesc')}
            glow="from-amber-500/20"
          />
          <PromoCard
            onClick={() => router.push('/achievements')}
            badge="ACHIEVEMENT"
            badgeClass="text-[#ff6ba6]"
            icon={<Trophy className="h-5 w-5 text-white" />}
            iconBg="from-[#ff2e88] to-[#c026d3]"
            title={t('home.promoQuest')}
            desc={t('home.promoQuestDesc')}
            glow="from-[#ff2e88]/20"
          />
        </section>

        {/* ═══════════ Hot 12: 3 rows × 4 cols ═══════════ */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="game-chip mb-1">
                <Flame className="h-3 w-3" /> HOT · 3×4
              </div>
              <h3 className="text-lg font-bold">{t('home.hotTitle')}</h3>
              <p className="text-[11px] text-white/40 mt-0.5">{t('home.hotSub')}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/explore')}
              className="glass-btn !h-10 !px-4 text-xs flex items-center gap-1 shrink-0"
            >
              {t('home.moreGirls')} <ChevR className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Always 4 columns → 3 rows for 12 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {hotList.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onClick={() => void enterBond(g)}
                className={cn(
                  'relative rounded-xl sm:rounded-2xl overflow-hidden text-left active:scale-[0.98] transition-transform ring-1 ring-white/10 hover:ring-[#ff2e88]/45 hover:shadow-[0_0_24px_rgba(255,46,136,0.25)]',
                  `game-rarity-${g.rarity.toLowerCase()}`,
                )}
              >
                <div className="relative aspect-[3/4]">
                  <CardMedia
                    src={g.portrait || g.avatar}
                    videoSrc={g.video || g.avatar_video}
                    alt={g.name}
                    hoverPlay
                    showBadge={!!(g.video || g.avatar_video)}
                    imgClassName={lockedImageClass(g.locked)}
                  />
                  {g.locked && <LockedPortraitOverlay price={g.unlock_price_tokens} className="!backdrop-blur-md" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent z-[1]" />
                  <span className="absolute top-1.5 left-1.5 z-[2] text-[9px] font-black px-1.5 py-0.5 rounded bg-black/55 text-[#ffd700]">
                    #{i + 1}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 p-2 z-[2]">
                    <div className="text-xs sm:text-sm font-bold truncate">{g.name}</div>
                    <div className="text-[9px] sm:text-[10px] text-white/50 truncate">
                      {relationshipLabel(g.relationship, t)} · {g.rarity}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Daily */}
        <section className="glass-strong rounded-2xl p-3.5 sm:p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="h-4 w-4 text-[#ffd700]" />
            <span className="font-semibold text-sm">{t('home.moduleQuest')}</span>
            <span className="text-[10px] text-white/35 ml-auto">{t('home.moduleQuestTip')}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { l: t('auth.login'), d: true, r: '+5', href: '/' },
              { l: t('home.moduleChat'), d: false, r: '+10', href: '/chats' },
              { l: t('chat.sayHello'), d: false, r: '+15', href: '/chats' },
              { l: t('shop.gifts'), d: false, r: '+20', href: '/shop' },
            ].map((q) => (
              <button
                key={q.l}
                type="button"
                onClick={() => router.push(q.href)}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-left border text-[11px] transition-all active:scale-[0.98]',
                  q.d
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-[#ff2e88]/25 bg-[#ff2e88]/08 text-[#ffb3cd] hover:bg-[#ff2e88]/14',
                )}
              >
                <div className="font-medium flex items-center gap-1">
                  {q.d ? <Star className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {q.l}
                </div>
                <div className="opacity-70 mt-0.5">{q.r}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ═══════════ Footer ═══════════ */}
        <footer className="glass-strong rounded-2xl px-4 sm:px-6 py-6 sm:py-8 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="glass-btn !rounded-full h-8 w-8 flex items-center justify-center !p-0">
                  <Flame className="h-3.5 w-3.5" />
                </div>
                <span className="font-black bg-gradient-to-r from-[#ff6ba6] to-[#c026d3] bg-clip-text text-transparent">
                  SoulMate
                </span>
              </div>
              <p className="text-[12px] text-white/40 leading-relaxed max-w-xs">
                {t('landing.heroSubtitle')}
              </p>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-white/35 mb-2">SUPPORT</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={FOOTER_LINKS.telegram}
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
                    href={`mailto:${FOOTER_LINKS.email}`}
                    className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-[13px]"
                  >
                    {FOOTER_LINKS.email}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-white/35 mb-2">SOCIAL</div>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={FOOTER_LINKS.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#ffb3cd] hover:text-white transition-colors"
                  >
                    <span className="font-black text-base leading-none">𝕏</span>
                    X / Twitter
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                </li>
                {FOOTER_LINKS.discord ? (
                  <li>
                    <a
                      href={FOOTER_LINKS.discord}
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
                  <button type="button" onClick={() => router.push('/pricing')} className="hover:text-white">{t('nav.pricing')}</button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-white/30">
            <span>© {new Date().getFullYear()} SoulMate AI. All rights reserved. 18+</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Systems online
            </span>
          </div>
        </footer>
      </div>

      {detail && (
        <CompanionDetailModal
          girl={detail}
          open={!!detail}
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
