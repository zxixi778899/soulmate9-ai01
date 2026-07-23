'use client';

/**
 * Boutique / Showcase (橱窗)
 * Collections mirror the admin shop: outfit · prop · membership · credits (+ companion seats).
 * All catalog data comes from the admin-managed products table via /api/shop/v2/products.
 *
 * UI consistency: every collection renders the same 3/4 portrait ShelfCard in the same grid.
 */

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Coins, Heart, Crown, Star, Shirt, Gift, Zap, Users, Loader2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GameShell, GameSectionTitle,
} from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { notifyDataChange } from '@/hooks/useDataSync';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { cn } from '@/lib/utils';

type Collection = 'outfit' | 'prop' | 'membership' | 'credits';
type TabId = Collection | 'seats';

type Product = {
  id: string;
  name: string;
  description: string;
  collection: Collection;
  category: string;
  subcategory: string | null;
  price_credits: number;
  price_cents: number;
  preview_url: string;
  rarity: string;
  is_featured: boolean;
  is_new: boolean;
  sales_count: number;
  virtual_meta: Record<string, unknown>;
};

type CreditsInfo = { credits_remaining: number; membership_tier: string };
type TokenPackage = {
  id: string;
  name: string;
  token_count: number;
  bonus_tokens?: number;
  price_cents: number;
};

const COLLECTION_EMOJI: Record<Collection | 'seats', string> = {
  outfit: '👗', prop: '🎁', membership: '👑', credits: '💎', seats: '👥',
};

const RARITY_GRADIENT: Record<string, string> = {
  legendary: 'from-fuchsia-500 to-purple-800',
  epic: 'from-amber-300 to-rose-600',
  rare: 'from-cyan-400 to-blue-600',
  common: 'from-rose-400 to-pink-600',
};

const RARITY_CHIP: Record<string, string> = {
  legendary: 'bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-black',
  epic: 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white',
  rare: 'bg-gradient-to-r from-[#00e5ff] to-[#3b82f6] text-black',
  common: 'bg-white/15 text-white/80',
};

/** Membership tier → card gradient (reuses the rarity palette). */
const TIER_GRADIENT: Record<string, string> = {
  unlimited: RARITY_GRADIENT.legendary,
  pro: RARITY_GRADIENT.epic,
  basic: RARITY_GRADIENT.rare,
};

const CREDITS_GRADIENT = 'from-amber-400 to-orange-600';
const SEATS_GRADIENT = 'from-cyan-500 to-blue-700';

/** Unified shelf grid — identical across every collection. */
const GRID = 'grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4';

/** Crypto options offered at checkout (NOWPayments). */
const CRYPTO_PAY_OPTIONS = [
  { id: 'usdttrc20', label: 'USDT', network: 'TRC-20' },
  { id: 'btc', label: 'BTC', network: 'Bitcoin' },
  { id: 'eth', label: 'ETH', network: 'ERC-20' },
  { id: 'ltc', label: 'LTC', network: 'Litecoin' },
  { id: 'sol', label: 'SOL', network: 'Solana' },
  { id: 'trx', label: 'TRX', network: 'TRC-20' },
] as const;

/** Legacy ?tab= values → new collection tabs */
const TAB_ALIAS: Record<string, TabId> = {
  outfit: 'outfit', prop: 'prop', membership: 'membership', credits: 'credits', seats: 'seats',
  skins: 'outfit', gifts: 'prop', tokens: 'credits',
};

function intimacyBoost(p: Product): number {
  const raw = Number(p.virtual_meta?.intimacy_boost || 0);
  if (raw > 0) return Math.min(100, raw);
  return Math.min(100, Math.floor(Number(p.price_credits || 0) / 30));
}

function videoUrl(p: Product): string {
  return String(p.virtual_meta?.video_url || '');
}

function isCreationCard(p: Product): boolean {
  return p.subcategory === 'creation_card' || String(p.virtual_meta?.kind || '') === 'creation_card';
}

function cardAmount(p: Product): number {
  return Math.max(1, Number(p.virtual_meta?.card_amount || 1));
}

/* ── shared shelf-card primitives ─────────────────────────────────────── */

function ShelfCard({
  image, video, gradient, emoji, title, subtitle,
  topLeft, topRight, price, meta, onClick,
}: {
  image?: string;
  video?: string;
  gradient: string;
  emoji: string;
  title: string;
  subtitle?: string;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  price: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden border border-white/10 text-left active:scale-[0.98] transition-all duration-300 hover:border-white/25 hover:shadow-[0_0_28px_rgba(255,46,136,0.18)]"
    >
      <div className={cn('aspect-[3/4] bg-gradient-to-br relative', gradient)}>
        {image ? (
          <>
            <img
              src={image}
              alt={title}
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-all duration-500',
                video ? 'group-hover:opacity-0' : 'group-hover:scale-110',
              )}
              loading="lazy"
            />
            {video && (
              <video
                src={video}
                muted
                loop
                playsInline
                preload="none"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
              />
            )}
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center text-6xl drop-shadow-lg">
              {emoji}
            </div>
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent pointer-events-none" />

        {topLeft && <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">{topLeft}</div>}
        {topRight}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="font-bold text-sm truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-white/55 line-clamp-1">{subtitle}</div>}
          <div className="mt-2 flex items-center justify-between">
            {price}
            {meta}
          </div>
        </div>
      </div>
    </button>
  );
}

function FeaturedBadge({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-black tracking-wider bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-black px-2 py-0.5 rounded shadow">
      <Star className="h-2.5 w-2.5 fill-black" /> {label}
    </span>
  );
}

function NewBadge({ label }: { label: string }) {
  return (
    <span className="text-[9px] font-black tracking-wider bg-[#ff2e88] text-white px-2 py-0.5 rounded shadow">
      {label}
    </span>
  );
}

function CurrentBadge({ label }: { label: string }) {
  return (
    <span className="text-[9px] font-black tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded shadow">
      {label}
    </span>
  );
}

function CornerChip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('absolute top-2 right-2 text-[9px] font-black tracking-wider px-2 py-0.5 rounded shadow', className)}>
      {children}
    </span>
  );
}

function CreditPrice({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1 text-amber-300 text-xs font-bold">
      <Coins className="h-3.5 w-3.5" /> {value}
    </span>
  );
}

function UsdPrice({ cents }: { cents: number }) {
  return <span className="text-amber-300 text-xs font-bold">${(cents / 100).toFixed(2)}</span>;
}

function SkeletonGrid({ n }: { n: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white/[0.04] animate-pulse aspect-[3/4]" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Shirt; title: string; hint: string }) {
  return (
    <div className="text-center py-16 text-white/40">
      <Icon className="mx-auto mb-3 h-10 w-10 text-white/20" />
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1 text-white/30">{hint}</p>
    </div>
  );
}

export default function ShopPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [tab, setTab] = useState<TabId>('outfit');
  const [detail, setDetail] = useState<Product | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [payPkg, setPayPkg] = useState<TokenPackage | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payStep, setPayStep] = useState<'method' | 'crypto' | 'wallet'>('method');
  const [processingPay, setProcessingPay] = useState(false);
  const [payWallet, setPayWallet] = useState<{ address: string; amount: number; currency: string; network?: string } | null>(null);

  const [seatPackages, setSeatPackages] = useState<Array<{ id: string; name: string; seats: number; price_cents: number }>>([]);
  const [seatStatus, setSeatStatus] = useState<{ used: number; effectiveLimit: number; bonusSeats: number; remaining: number | null; canAdd: boolean } | null>(null);
  const [buyingSeats, setBuyingSeats] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    try {
      const d = await authedFetch('/api/shop/v2/products?limit=60').then((r) => r.json());
      setProducts((d.products || []) as Product[]);
      setCounts(d.counts || {});
    } catch { /* non-critical */ }
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const c = await authedFetch('/api/shop/credits').then((r) => r.json());
      setCredits(c);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    refreshBalance();
    authedFetch('/api/v2/shop/tokens')
      .then((r) => r.json())
      .then((d) => {
        setTokenPackages(d.packages || []);
        setTokenBalance(Number(d.user_balance) || 0);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const qTab = TAB_ALIAS[params.get('tab') || ''];
    if (qTab) setTab(qTab);

    authedFetch('/api/v2/shop/seats')
      .then((r) => r.json())
      .then((d) => {
        setSeatPackages(d.packages || []);
        setSeatStatus(d.seats || null);
      })
      .catch(() => {});

    refreshCatalog().finally(() => setLoadingProducts(false));

    if (params.get('checkout') === 'success') {
      if (params.get('seats')) {
        toast.success('Companion seats unlocked (permanent)');
      } else {
        toast.success(t('shop.purchaseSuccess'));
      }
      const nextTab = TAB_ALIAS[params.get('tab') || ''] || (params.get('seats') ? 'seats' : 'credits');
      window.history.replaceState({}, '', `/shop?tab=${nextTab}`);
      setTab(nextTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoRefresh(useCallback(() => {
    void refreshCatalog();
    void refreshBalance();
  }, [refreshCatalog, refreshBalance]));

  const byCollection = useCallback((c: Collection) => products.filter((p) => p.collection === c), [products]);

  /* ── purchase (credits) ─────────────────────────────────────────────── */
  const purchaseProduct = async (p: Product) => {
    setPurchasing(true);
    try {
      const res = await authedFetch('/api/shop/v2/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: p.id }),
      });
      const data = await res.json();
      if (res.ok) {
        if (p.collection === 'membership') {
          toast.success(t('shop.membershipActivated'));
          notifyDataChange('membership');
        } else {
          toast.success(`${COLLECTION_EMOJI[p.collection]} ${p.name} ${t('shop.addedToBag')}`);
        }
        setDetail(null);
        if (typeof data.new_credits_balance === 'number') {
          setCredits((c) => ({
            credits_remaining: data.new_credits_balance,
            membership_tier: data.membership_tier || c?.membership_tier || 'free',
          }));
        }
        notifyDataChange('shop');
        authedFetch('/api/v2/shop/tokens')
          .then((r) => r.json())
          .then((d) => setTokenBalance(Number(d.user_balance) || 0))
          .catch(() => {});
      } else if (res.status === 402) {
        toast.error(t('shop.insufficient'), {
          action: { label: t('shop.topup'), onClick: () => { setDetail(null); setTab('credits'); } },
        });
      } else {
        toast.error(data.error || t('shop.buyFailed'));
      }
    } catch {
      toast.error(t('shop.networkError'));
    }
    setPurchasing(false);
  };

  /* ── credit-pack checkout (fiat / crypto) ───────────────────────────── */
  const buyTokenPack = (packageId: string) => {
    const pkg = tokenPackages.find((p) => p.id === packageId) || null;
    setPayPkg(pkg || { id: packageId, name: 'Credit Pack', token_count: 0, price_cents: 0 });
    setPayStep('method');
    setPayWallet(null);
    setPayOpen(true);
  };

  const confirmTokenPay = async (provider: 'nowpayments' | 'nexapay', extra?: string) => {
    if (!payPkg) return;
    setProcessingPay(true);
    try {
      const payload: Record<string, string> = { package_id: payPkg.id, provider };
      if (provider === 'nowpayments') payload.currency = extra || 'usdttrc20';
      else payload.payment_method = extra || 'card_latam';

      const res = await authedFetch('/api/v2/shop/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Checkout failed');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.payAddress) {
        setPayWallet({
          address: data.payAddress,
          amount: data.payAmount,
          currency: data.payCurrency,
          network: data.network,
        });
        setPayStep('wallet');
        return;
      }
      toast.error('Checkout failed');
    } catch {
      toast.error(t('shop.networkError'));
    } finally {
      setProcessingPay(false);
    }
  };

  const buySeatPack = async (packageId: string) => {
    setBuyingSeats(packageId);
    try {
      const res = await authedFetch('/api/v2/shop/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.error || 'Checkout failed');
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error(t('shop.networkError'));
    } finally {
      setBuyingSeats(null);
    }
  };

  const balance = credits?.credits_remaining ?? tokenBalance ?? 0;
  const currentTier = credits?.membership_tier || 'free';

  const tabs: Array<{ id: TabId; label: string; icon: typeof Shirt; count?: number }> = [
    { id: 'outfit', label: t('shop.tabOutfit'), icon: Shirt, count: counts.outfit },
    { id: 'prop', label: t('shop.tabProp'), icon: Gift, count: counts.prop },
    { id: 'membership', label: t('shop.tabMembership'), icon: Crown, count: counts.membership },
    { id: 'credits', label: t('shop.tabCredits'), icon: Coins, count: tokenPackages.length || undefined },
    { id: 'seats', label: t('shop.tabSeats'), icon: Users },
  ];

  const outfits = byCollection('outfit');
  const props = byCollection('prop');
  const memberships = byCollection('membership');

  const tierKey = (p: Product): string => String(p.virtual_meta?.membership_tier || '').toLowerCase();

  const tierLabel = (p: Product): string => {
    const tier = tierKey(p);
    if (tier === 'basic') return t('shop.tierBasic');
    if (tier === 'pro') return t('shop.tierPro');
    if (tier === 'unlimited') return t('shop.tierUnlimited');
    return p.name;
  };

  const rarityLabel = (r: string): string => {
    if (r === 'legendary') return t('shop.rarityLegendary');
    if (r === 'epic') return t('shop.rarityEpic');
    if (r === 'rare') return t('shop.rarityRare');
    return t('shop.rarityCommon');
  };

  const membershipDuration = (p: Product): string => {
    const days = Number(p.virtual_meta?.duration_days || 0);
    return days > 0 ? `${days} ${t('shop.dayUnit')}` : t('shop.permanent');
  };

  /* Renders a product card (outfit / prop / membership) with the shared ShelfCard. */
  const renderProductCard = (item: Product) => {
    const isMembership = item.collection === 'membership';
    const tier = tierKey(item);
    const isCurrent = isMembership && tier === currentTier;
    const gradient = isMembership
      ? (TIER_GRADIENT[tier] || RARITY_GRADIENT.common)
      : (RARITY_GRADIENT[item.rarity] || RARITY_GRADIENT.common);
    const durationHours = Number(item.virtual_meta?.duration_hours || 0);

    return (
      <ShelfCard
        key={item.id}
        image={item.preview_url}
        video={videoUrl(item)}
        gradient={gradient}
        emoji={COLLECTION_EMOJI[item.collection]}
        title={isMembership ? tierLabel(item) : item.name}
        subtitle={item.description}
        onClick={() => setDetail(item)}
        topLeft={
          isCurrent ? (
            <CurrentBadge label={t('shop.currentTier')} />
          ) : (
            <>
              {item.is_featured && <FeaturedBadge label={t('shop.featured')} />}
              {item.is_new && <NewBadge label={t('shop.newBadge')} />}
            </>
          )
        }
        topRight={
          isMembership ? (
            <CornerChip className={RARITY_CHIP[tier === 'unlimited' ? 'legendary' : tier === 'pro' ? 'epic' : 'rare']}>
              <Crown className="inline h-2.5 w-2.5 -mt-px" /> {tierLabel(item)}
            </CornerChip>
          ) : (
            <CornerChip className={RARITY_CHIP[item.rarity] || RARITY_CHIP.common}>
              {rarityLabel(item.rarity)}
            </CornerChip>
          )
        }
        price={<CreditPrice value={item.price_credits} />}
        meta={
          isMembership ? (
            <span className="text-[10px] text-[#ffd700] flex items-center gap-0.5">
              <Zap className="h-3 w-3" /> {membershipDuration(item)}
            </span>
          ) : durationHours > 0 ? (
            <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
              <Zap className="h-3 w-3" /> {durationHours}h
            </span>
          ) : isCreationCard(item) ? (
            <span className="text-[10px] text-cyan-300 flex items-center gap-0.5">
              <Sparkles className="h-3 w-3" /> +{cardAmount(item)} {t('shop.creationCardUnit')}
            </span>
          ) : (
            <span className="text-[10px] text-[#ff6ba6] flex items-center gap-0.5">
              <Heart className="h-3 w-3" /> +{intimacyBoost(item)} {t('shop.intimacyUnit')}
            </span>
          )
        }
      />
    );
  };

  return (
    <GameShell className="min-h-[100dvh] pb-6 md:pb-12">
      <PageHeader
        eyebrow="BOUTIQUE"
        title={t('shop.armoryTitle')}
        subtitle={t('shop.armorySubtitle')}
        backHref="/"
        sticky={false}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('credits')}
              className="glass flex items-center gap-1.5 rounded-full px-3 h-10 transition hover:border-[#ffd700]/50"
              title={t('shop.tabCredits')}
            >
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-white tabular-nums text-sm">{balance}</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="glass-btn !h-10 !px-3 text-xs hidden sm:inline-flex"
            >
              VIP
            </button>
          </div>
        }
      />

      {/* ── collection tabs ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0d0613]/85 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white shadow-[0_0_18px_rgba(255,46,136,0.35)]'
                    : 'glass text-white/50 hover:text-white/80',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tb.label}
                {typeof tb.count === 'number' && tb.count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold tabular-nums px-1.5 py-px rounded-full',
                    active ? 'bg-white/25 text-white' : 'bg-white/10 text-white/50',
                  )}
                  >
                    {tb.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6">
        {/* ── outfits ─────────────────────────────────────────────────────── */}
        {tab === 'outfit' && (
          <section>
            <GameSectionTitle eyebrow="OUTFITS" title={t('shop.outfitTitle')} subtitle={t('shop.outfitSubtitle')} />
            {loadingProducts ? (
              <SkeletonGrid n={6} />
            ) : outfits.length === 0 ? (
              <EmptyState icon={Shirt} title={t('shop.emptyOutfits')} hint={t('shop.noProductsHint')} />
            ) : (
              <div className={GRID}>{outfits.map(renderProductCard)}</div>
            )}
          </section>
        )}

        {/* ── props ───────────────────────────────────────────────────────── */}
        {tab === 'prop' && (
          <section>
            <GameSectionTitle eyebrow="ITEMS" title={t('shop.propTitle')} subtitle={t('shop.propSubtitle')} />
            {loadingProducts ? (
              <SkeletonGrid n={6} />
            ) : props.length === 0 ? (
              <EmptyState icon={Gift} title={t('shop.emptyProps')} hint={t('shop.noProductsHint')} />
            ) : (
              <div className={GRID}>{props.map(renderProductCard)}</div>
            )}
          </section>
        )}

        {/* ── membership ──────────────────────────────────────────────────── */}
        {tab === 'membership' && (
          <section>
            <GameSectionTitle eyebrow="VIP" title={t('shop.membershipTitle')} subtitle={t('shop.membershipSubtitle')} />
            {loadingProducts ? (
              <SkeletonGrid n={3} />
            ) : memberships.length === 0 ? (
              <EmptyState icon={Crown} title={t('shop.emptyMembership')} hint={t('shop.noProductsHint')} />
            ) : (
              <div className={GRID}>{memberships.map(renderProductCard)}</div>
            )}
          </section>
        )}

        {/* ── credit packs ────────────────────────────────────────────────── */}
        {tab === 'credits' && (
          <section>
            <GameSectionTitle eyebrow="TOP UP" title={t('shop.creditsTitle')} subtitle={t('shop.creditsSubtitle')} />
            {tokenPackages.length === 0 ? (
              <EmptyState icon={Coins} title={t('shop.emptyCredits')} hint={t('shop.noProductsHint')} />
            ) : (
              <div className={GRID}>
                {tokenPackages.map((pkg, i) => {
                  const total = Number(pkg.token_count) + Number(pkg.bonus_tokens || 0);
                  return (
                    <ShelfCard
                      key={pkg.id}
                      gradient={CREDITS_GRADIENT}
                      emoji={COLLECTION_EMOJI.credits}
                      title={pkg.name}
                      subtitle={pkg.bonus_tokens ? `+${pkg.bonus_tokens} ${t('shop.bonus')}` : t('shop.tabCredits')}
                      onClick={() => buyTokenPack(pkg.id)}
                      topLeft={i === 1 ? <FeaturedBadge label="HOT" /> : undefined}
                      topRight={i === 2 ? <CornerChip className={RARITY_CHIP.legendary}>{t('shop.bestValue')}</CornerChip> : undefined}
                      price={<UsdPrice cents={pkg.price_cents} />}
                      meta={
                        <span className="flex items-center gap-1 text-[#ffd700] text-xs font-black">
                          <Coins className="h-3.5 w-3.5" /> {total}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── companion seats ─────────────────────────────────────────────── */}
        {tab === 'seats' && (
          <section>
            <GameSectionTitle eyebrow="FRIENDS" title={t('shop.tabSeats')} subtitle="Free 3 · Pro 15 · Unlimited ∞" />
            {seatStatus && (
              <div className="mb-4 glass rounded-2xl px-4 py-3 text-sm text-white/70">
                {seatStatus.used}
                {seatStatus.effectiveLimit < 0 ? ' / ∞' : ` / ${seatStatus.effectiveLimit}`}
                {seatStatus.bonusSeats > 0 ? ` · +${seatStatus.bonusSeats}` : ''}
                {seatStatus.remaining != null ? ` · ${seatStatus.remaining} free` : ''}
              </div>
            )}
            {seatPackages.length === 0 ? (
              <EmptyState icon={Users} title="No seat packages available yet" hint={t('shop.noProductsHint')} />
            ) : (
              <div className={GRID}>
                {seatPackages.map((pkg, i) => (
                  <ShelfCard
                    key={pkg.id}
                    gradient={SEATS_GRADIENT}
                    emoji={COLLECTION_EMOJI.seats}
                    title={pkg.name}
                    subtitle={t('shop.permanent')}
                    onClick={() => { if (buyingSeats !== pkg.id) void buySeatPack(pkg.id); }}
                    topLeft={i === 1 ? <FeaturedBadge label={t('shop.bestValue')} /> : undefined}
                    price={<UsdPrice cents={pkg.price_cents} />}
                    meta={
                      <span className="text-[10px] text-[#ffd700] font-black flex items-center gap-0.5">
                        <Users className="h-3 w-3" /> +{pkg.seats}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── product detail dialog ─────────────────────────────────────────── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="bg-[#120a18] border-white/10 text-white sm:max-w-md overflow-hidden p-0 gap-0">
          {detail && (
            <>
              {detail.preview_url ? (
                <div className="relative aspect-[4/3] bg-black/40 group">
                  <img
                    src={detail.preview_url}
                    alt={detail.name}
                    className="h-full w-full object-cover"
                  />
                  {videoUrl(detail) && (
                    <video
                      src={videoUrl(detail)}
                      muted
                      loop
                      playsInline
                      preload="none"
                      className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                      onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#120a18] via-transparent to-transparent pointer-events-none" />
                  <span className={cn('absolute top-3 right-3 text-[10px] font-black tracking-wider px-2.5 py-1 rounded shadow', RARITY_CHIP[detail.rarity] || RARITY_CHIP.common)}>
                    {rarityLabel(detail.rarity)}
                  </span>
                </div>
              ) : (
                <div className={cn('relative aspect-[4/3] bg-gradient-to-br flex items-center justify-center text-7xl', RARITY_GRADIENT[detail.rarity] || RARITY_GRADIENT.common)}>
                  {COLLECTION_EMOJI[detail.collection]}
                </div>
              )}

              <div className="p-5">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    {detail.is_featured && <Star className="h-4 w-4 text-[#ffd700] fill-[#ffd700]" />}
                    {detail.collection === 'membership' ? tierLabel(detail) : detail.name}
                  </DialogTitle>
                  <DialogDescription className="text-white/50 text-sm mt-1">
                    {detail.description}
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {detail.sales_count > 0 && (
                    <span className="text-[10px] text-white/50 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      {t('shop.soldCount', { n: detail.sales_count })}
                    </span>
                  )}
                  {detail.collection !== 'membership' && isCreationCard(detail) && (
                    <span className="text-[10px] text-cyan-300 bg-cyan-400/10 border border-cyan-400/25 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" /> +{cardAmount(detail)} {t('shop.creationCardUnit')}
                    </span>
                  )}
                  {detail.collection !== 'membership' && !isCreationCard(detail) && (
                    <span className="text-[10px] text-[#ff6ba6] bg-[#ff2e88]/10 border border-[#ff2e88]/25 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Heart className="h-2.5 w-2.5" /> +{intimacyBoost(detail)} {t('shop.intimacyUnit')}
                    </span>
                  )}
                  {detail.collection === 'membership' && (
                    <span className="text-[10px] text-[#ffd700] bg-[#ffd700]/10 border border-[#ffd700]/25 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Crown className="h-2.5 w-2.5" /> {tierLabel(detail)} · {membershipDuration(detail)}
                    </span>
                  )}
                  {Number(detail.virtual_meta?.duration_hours || 0) > 0 && (
                    <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" /> {String(detail.virtual_meta?.duration_hours)}h
                    </span>
                  )}
                </div>

                <DialogFooter className="mt-5 gap-3 sm:justify-between">
                  <span className="flex items-center gap-1.5 text-xl font-black text-amber-300">
                    <Coins className="h-5 w-5" /> {detail.price_credits}
                    <span className="text-[10px] font-medium text-white/40">{t('shop.tokensUnit')}</span>
                  </span>
                  <Button
                    disabled={purchasing || (detail.collection === 'membership' && tierKey(detail) === currentTier)}
                    onClick={() => void purchaseProduct(detail)}
                    className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black font-bold min-w-[120px]"
                  >
                    {purchasing
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : (detail.collection === 'membership'
                          ? (tierKey(detail) === currentTier ? t('shop.currentTier') : t('shop.activate'))
                          : t('shop.buyNow'))}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── credit-pack payment dialog ────────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
        <DialogContent className="bg-[#120a18] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[#ffd700]" />
              {payStep === 'wallet' ? 'Crypto Payment' : t('shop.topupTitle')}
            </DialogTitle>
            {payPkg && payStep !== 'wallet' && (
              <DialogDescription className="text-white/50">
                {payPkg.name} · {Number(payPkg.token_count) + Number(payPkg.bonus_tokens || 0)} {t('shop.tokensUnit')} · ${(payPkg.price_cents / 100).toFixed(2)}
              </DialogDescription>
            )}
          </DialogHeader>

          {payStep === 'method' && (
            <div className="space-y-3 py-2">
              <button
                type="button"
                disabled={processingPay}
                onClick={() => setPayStep('crypto')}
                className="w-full flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 hover:border-[#ffd700]/60 hover:bg-white/10 transition text-left"
              >
                <span>
                  <span className="block font-bold">₿ Crypto</span>
                  <span className="block text-xs text-white/45">USDT · BTC · ETH · SOL — via NOWPayments</span>
                </span>
                <span className="text-white/40">›</span>
              </button>
              <button
                type="button"
                disabled={processingPay}
                onClick={() => void confirmTokenPay('nexapay', 'card_latam')}
                className="w-full flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 hover:border-[#ff2e88]/60 hover:bg-white/10 transition text-left"
              >
                <span>
                  <span className="block font-bold">💳 Credit Card</span>
                  <span className="block text-xs text-white/45">LATAM cards · BRL — via NexaPay</span>
                </span>
                <span className="text-white/40">›</span>
              </button>
              {processingPay && (
                <div className="flex items-center justify-center gap-2 text-sm text-white/50 pt-1">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating checkout…
                </div>
              )}
            </div>
          )}

          {payStep === 'crypto' && (
            <div className="py-2">
              <p className="text-xs text-white/45 mb-3">Select a coin to pay ${(payPkg ? (payPkg.price_cents / 100).toFixed(2) : '0.00')}:</p>
              <div className="grid grid-cols-2 gap-2">
                {CRYPTO_PAY_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={processingPay}
                    onClick={() => void confirmTokenPay('nowpayments', c.id)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 hover:border-[#ffd700]/60 hover:bg-white/10 transition text-left"
                  >
                    <span className="block font-bold">{c.label}</span>
                    <span className="block text-[11px] text-white/40">{c.network}</span>
                  </button>
                ))}
              </div>
              {processingPay && (
                <div className="flex items-center justify-center gap-2 text-sm text-white/50 pt-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating checkout…
                </div>
              )}
              <button
                type="button"
                onClick={() => setPayStep('method')}
                className="mt-3 text-xs text-white/40 hover:text-white/70"
              >
                ← {t('shop.cancel')}
              </button>
            </div>
          )}

          {payStep === 'wallet' && payWallet && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-white/60">
                Send exactly <span className="font-bold text-[#ffd700]">{payWallet.amount} {payWallet.currency}</span>
                {payWallet.network ? ` on ${payWallet.network}` : ''} to the address below. Your credits are added automatically after confirmation.
              </p>
              <div className="rounded-xl border border-white/15 bg-black/40 p-3 break-all font-mono text-sm text-[#ffd700]">
                {payWallet.address}
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setPayOpen(false)}>{t('shop.cancel')}</Button>
                <Button
                  onClick={() => {
                    void navigator.clipboard?.writeText(payWallet.address);
                    toast.success('Address copied');
                  }}
                  className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black font-bold"
                >
                  Copy Address
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </GameShell>
  );
}
