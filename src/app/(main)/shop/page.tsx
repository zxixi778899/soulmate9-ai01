'use client';

/**
 * Armory / Skin Shop — Honor-of-Kings style skins & items
 */

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Coins, Heart, Sparkles, Lock, Star, Shirt, Gift, Zap, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  GameShell, GameSectionTitle, GamePrimaryButton, GamePanel,
} from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { cn } from '@/lib/utils';

type ShopItem = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price_cents: number;
  item_type: string;
  effect_value?: Record<string, string | number>;
  tier: string;
  is_limited?: boolean;
  skin?: string;
  preview_url?: string;
  video_url?: string;
};

type CreditsInfo = { credits_remaining: number; membership_tier: string };
type TokenPackage = {
  id: string;
  name: string;
  token_count: number;
  bonus_tokens?: number;
  price_cents: number;
};

function gradientFromRarity(rarity?: string): string {
  switch (rarity) {
    case 'legendary': return 'from-fuchsia-500 to-purple-800';
    case 'epic': return 'from-amber-300 to-rose-600';
    case 'rare': return 'from-cyan-400 to-blue-600';
    default: return 'from-rose-400 to-pink-600';
  }
}

/** Crypto options offered at checkout (NOWPayments). */
const CRYPTO_PAY_OPTIONS = [
  { id: 'usdttrc20', label: 'USDT', network: 'TRC-20' },
  { id: 'btc', label: 'BTC', network: 'Bitcoin' },
  { id: 'eth', label: 'ETH', network: 'ERC-20' },
  { id: 'ltc', label: 'LTC', network: 'Litecoin' },
  { id: 'sol', label: 'SOL', network: 'Solana' },
  { id: 'trx', label: 'TRX', network: 'TRC-20' },
] as const;

export default function ShopPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [payPkg, setPayPkg] = useState<TokenPackage | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payStep, setPayStep] = useState<'method' | 'crypto' | 'wallet'>('method');
  const [processingPay, setProcessingPay] = useState(false);
  const [payWallet, setPayWallet] = useState<{ address: string; amount: number; currency: string; network?: string } | null>(null);
  const [tab, setTab] = useState<'skins' | 'gifts' | 'tokens' | 'seats'>('skins');
  const [seatPackages, setSeatPackages] = useState<Array<{ id: string; name: string; seats: number; price_cents: number }>>([]);
  const [seatStatus, setSeatStatus] = useState<{ used: number; effectiveLimit: number; bonusSeats: number; remaining: number | null; canAdd: boolean } | null>(null);
  const [buyingSeats, setBuyingSeats] = useState<string | null>(null);
  const [skins, setSkins] = useState<ShopItem[]>([]);
  const [gifts, setGifts] = useState<ShopItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    authedFetch('/api/shop/credits').then((r) => r.json()).then(setCredits).catch(() => {});
    authedFetch('/api/v2/shop/tokens')
      .then((r) => r.json())
      .then((d) => {
        setTokenPackages(d.packages || []);
        setTokenBalance(Number(d.user_balance) || 0);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const qTab = params.get('tab');
    if (qTab === 'seats' || qTab === 'tokens' || qTab === 'gifts' || qTab === 'skins') {
      setTab(qTab);
    }
    authedFetch('/api/v2/shop/seats')
      .then((r) => r.json())
      .then((d) => {
        setSeatPackages(d.packages || []);
        setSeatStatus(d.seats || null);
      })
      .catch(() => {});

    // Fetch ALL products from DB and split into skins (outfit) and gifts (everything else)
    authedFetch('/api/shop/v2/products?limit=60')
      .then((r) => r.json())
      .then((d) => {
        const allProducts: Record<string, unknown>[] = d.products || [];
        const emojiMap: Record<string, string> = {
          outfit: '👗', effect: '✨', consumable: '🎁', voice_pack: '🎙️', background: '🖼️',
        };

        const outfitProducts = allProducts
          .filter((p) => p.category === 'outfit')
          .map((p) => {
            const meta = (p.virtual_meta || {}) as Record<string, unknown>;
            return {
              id: p.id as string,
              name: p.name as string,
              emoji: '👗',
              description: (p.description as string) || '',
              price_cents: Number(p.price_credits || p.price_cents || 0),
              item_type: 'outfit',
              effect_value: { intimacy_boost: Math.min(100, Math.floor(Number(p.price_credits || 0) / 30)) },
              tier: p.rarity === 'legendary' || p.rarity === 'epic' ? 'premium' : 'free',
              is_limited: (p.is_featured as boolean) || false,
              skin: gradientFromRarity(p.rarity as string),
              preview_url: (p.preview_url as string) || '',
              video_url: (meta.video_url as string) || '',
            };
          });

        const giftProducts = allProducts
          .filter((p) => p.category !== 'outfit')
          .filter((p) => {
            const meta = (p.virtual_meta || {}) as Record<string, unknown>;
            return meta.kind !== 'credits' && p.subcategory !== 'credits';
          })
          .map((p) => ({
            id: p.id as string,
            name: p.name as string,
            emoji: emojiMap[(p.category as string)] || '🎁',
            description: (p.description as string) || '',
            price_cents: Number(p.price_credits || p.price_cents || 0),
            item_type: 'intimacy_boost',
            effect_value: { intimacy_boost: Math.min(100, Math.floor(Number(p.price_credits || 0) / 30)) },
            tier: p.rarity === 'legendary' || p.rarity === 'epic' ? 'premium' : 'free',
          }));

        setSkins(outfitProducts);
        setGifts(giftProducts);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));

    if (params.get('checkout') === 'success') {
      if (params.get('seats')) {
        toast.success('Companion seats unlocked (permanent)');
      } else {
        toast.success('Purchase successful');
      }
      window.history.replaceState({}, '', '/shop' + (params.get('seats') ? '?tab=seats' : ''));
      if (params.get('seats')) setTab('seats');
    }
  }, []);


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
        // Hosted invoice unavailable → direct deposit address flow
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
      toast.error('Network error');
    } finally {
      setBuyingSeats(null);
    }
  };

const handleBuy = async () => {
    if (!buying) return;
    setPurchasing(true);
    try {
      const res = await authedFetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: buying.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${buying.emoji} ${buying.name} ${t('shop.addedToBag')}`);
        setBuying(null);
        const c = await authedFetch('/api/shop/credits').then((r) => r.json());
        setCredits(c);
      } else if (res.status === 402) {
        toast.error(t('shop.insufficient'), {
          action: { label: t('shop.topup'), onClick: () => setTab('tokens') },
        });
      } else {
        toast.error(data.error || t('shop.buyFailed'));
      }
    } catch {
      toast.error(t('shop.networkError'));
    }
    setPurchasing(false);
  };

  const balance = tokenBalance || credits?.credits_remaining || 0;

  return (
    <GameShell className="skin-shelf min-h-[100dvh] pb-6 md:pb-12">
      <PageHeader
        eyebrow="ARMORY"
        title={t('shop.armoryTitle')}
        subtitle={t('shop.armorySubtitle')}
        backHref="/"
        sticky={false}
        actions={
          <div className="flex items-center gap-2">
            <div className="glass flex items-center gap-1.5 rounded-full px-3 h-10">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-white tabular-nums text-sm">{balance}</span>
            </div>
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 flex gap-2">
        {([
          { id: 'skins', label: 'Skins', icon: Shirt },
          { id: 'gifts', label: 'Gifts', icon: Gift },
          { id: 'tokens', label: 'Tokens', icon: Coins },
          { id: 'seats', label: 'Seats', icon: Users },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-all',
                tab === t.id
                  ? 'glass-btn !h-9 !px-4'
                  : 'glass text-white/50',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-6">
        {tab === 'tokens' && (
          <section>
            <GameSectionTitle title={t('shop.topupTitle')} subtitle={t('shop.topupSubtitle')} eyebrow="TOP UP" />
            {tokenPackages.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Coins className="mx-auto mb-3 h-10 w-10 text-white/20" />
                <p>暂无代币套餐</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {tokenPackages.map((pkg, i) => {
                const total = Number(pkg.token_count) + Number(pkg.bonus_tokens || 0);
                return (
                  <GamePanel key={pkg.id} glow={i === 1} className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg">{pkg.name}</span>
                      {i === 1 && (
                        <span className="text-[10px] font-black bg-[#ff2e88] px-2 py-0.5 rounded">HOT</span>
                      )}
                    </div>
                    <div className="mt-3 text-3xl font-black text-[#ffd700]">{total}</div>
                    <div className="text-xs text-white/40">tokens {pkg.bonus_tokens ? `· +${pkg.bonus_tokens} 赠送` : ''}</div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xl font-bold">${(pkg.price_cents / 100).toFixed(2)}</span>
                      <GamePrimaryButton
                        className="h-10 px-5"
                        onClick={() => buyTokenPack(pkg.id)}
                      >
                        {t('shop.buy')}
                      </GamePrimaryButton>
                    </div>
                  </GamePanel>
                );
              })}
            </div>
            )}
          </section>
        )}

        
        {tab === 'seats' && (
          <section>
            <GameSectionTitle
              title="Companion Seats"
              subtitle="Permanent slots · Free 3 · Pro 15 · Unlimited ∞ · Tax at checkout"
              eyebrow="FRIENDS"
            />
            {seatStatus && (
              <div className="mb-4 glass rounded-2xl px-4 py-3 text-sm text-white/70">
                Using {seatStatus.used}
                {seatStatus.effectiveLimit < 0
                  ? ' / ∞'
                  : ` / ${seatStatus.effectiveLimit}`}
                {seatStatus.bonusSeats > 0 ? ` · +${seatStatus.bonusSeats} purchased` : ''}
                {seatStatus.remaining != null ? ` · ${seatStatus.remaining} free` : ''}
              </div>
            )}
            {seatPackages.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Users className="mx-auto mb-3 h-10 w-10 text-white/20" />
                <p>No seat packages available yet</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {seatPackages.map((pkg, i) => (
                <GamePanel key={pkg.id} glow={i === 1} className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lg">{pkg.name}</span>
                    {i === 1 && (
                      <span className="text-[10px] font-black bg-[#ff2e88] px-2 py-0.5 rounded">BEST</span>
                    )}
                  </div>
                  <div className="mt-3 text-3xl font-black text-[#ffd700]">+{pkg.seats}</div>
                  <div className="text-xs text-white/40">permanent friend slots</div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xl font-bold">${(pkg.price_cents / 100).toFixed(2)}</span>
                    <GamePrimaryButton
                      className="h-10 px-5"
                      disabled={buyingSeats === pkg.id}
                      onClick={() => buySeatPack(pkg.id)}
                    >
                      {buyingSeats === pkg.id ? '…' : 'Buy'}
                    </GamePrimaryButton>
                  </div>
                </GamePanel>
              ))}
            </div>
            )}
          </section>
        )}

{tab === 'skins' && (
          <section>
            <GameSectionTitle
              eyebrow="SKINS"
              title={t('shop.skinsTitle')}
              subtitle={t('shop.skinsSubtitle')}
            />
            {loadingProducts ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" /></div>
            ) : skins.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Shirt className="mx-auto mb-3 h-10 w-10 text-white/20" />
                <p>{t('shop.noSkins')}</p>
                <p className="text-xs mt-1">{t('shop.noProductsHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {skins.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setBuying(item)}
                    className="group relative rounded-2xl overflow-hidden border border-white/10 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className={cn('aspect-[4/5] bg-gradient-to-br relative', item.skin)}>
                      {item.preview_url ? (
                        <>
                          <img
                            src={item.preview_url}
                            alt={item.name}
                            className={cn(
                              'absolute inset-0 h-full w-full object-cover transition-all duration-500',
                              item.video_url ? 'group-hover:opacity-0' : 'group-hover:scale-110',
                            )}
                            loading="lazy"
                          />
                          {item.video_url && (
                            <video
                              src={item.video_url}
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
                            {item.emoji}
                          </div>
                        </>
                      )}
                      {item.preview_url && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                      )}
                      {item.is_limited && (
                        <span className="absolute top-2 left-2 text-[9px] font-black tracking-wider bg-black/60 text-[#ffd700] px-2 py-0.5 rounded">
                          LIMITED
                        </span>
                      )}
                      {item.tier === 'premium' && (
                        <Lock className="absolute top-2 right-2 h-4 w-4 text-white/70" />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                        <div className="font-bold text-sm">{item.name}</div>
                        <div className="text-[11px] text-white/55 line-clamp-1">{item.description}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-amber-300 text-xs font-bold">
                            <Coins className="h-3.5 w-3.5" />
                            {item.price_cents}
                          </span>
                          <span className="text-[10px] text-[#ff6ba6]">
                            +{item.effect_value?.intimacy_boost} {t('shop.intimacyUnit')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'gifts' && (
          <section>
            <GameSectionTitle eyebrow="ITEMS" title={t('shop.giftsTitle')} subtitle={t('shop.giftsSubtitle')} />
            {loadingProducts ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" /></div>
            ) : gifts.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <Gift className="mx-auto mb-3 h-10 w-10 text-white/20" />
                <p>{t('shop.noGifts')}</p>
                <p className="text-xs mt-1">{t('shop.noProductsHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gifts.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setBuying(item)}
                    className="game-panel p-4 text-left hover:border-[#ff2e88]/40 transition-all active:scale-[0.98]"
                  >
                    {item.preview_url ? (
                      <div className="aspect-square rounded-lg overflow-hidden mb-2">
                        <img
                          src={item.preview_url}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="text-4xl mb-2">{item.emoji}</div>
                    )}
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-[11px] text-white/40 mt-0.5 line-clamp-2">{item.description}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-amber-300 text-xs font-bold flex items-center gap-1">
                        <Coins className="h-3.5 w-3.5" /> {item.price_cents}
                      </span>
                      {item.item_type === 'intimacy_boost' ? (
                        <span className="text-[10px] text-[#ff6ba6] flex items-center gap-0.5">
                          <Heart className="h-3 w-3" /> +{item.effect_value?.intimacy_boost}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                          <Zap className="h-3 w-3" /> {item.effect_value?.duration_hours}h
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog open={!!buying} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent className="bg-[#120a18] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{buying?.emoji}</span>
              {buying?.name}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              {buying?.description} · {t('shop.costs')} {buying?.price_cents} {t('shop.tokensUnit')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBuying(null)}>{t('shop.cancel')}</Button>
            <Button
              disabled={purchasing}
              onClick={handleBuy}
              className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black font-bold"
            >
              {purchasing ? '…' : t('shop.confirmBuy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit-pack payment method dialog */}
      <Dialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
        <DialogContent className="bg-[#120a18] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[#ffd700]" />
              {payStep === 'wallet' ? 'Crypto Payment' : t('shop.topupTitle')}
            </DialogTitle>
            {payPkg && payStep !== 'wallet' && (
              <DialogDescription className="text-white/50">
                {payPkg.name} · {Number(payPkg.token_count) + Number(payPkg.bonus_tokens || 0)} tokens · ${(payPkg.price_cents / 100).toFixed(2)}
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
