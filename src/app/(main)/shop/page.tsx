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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Coins, Heart, Sparkles, Lock, Star, Shirt, Gift, Zap } from 'lucide-react';
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
};

type Girlfriend = { id: string; name: string };
type CreditsInfo = { credits_remaining: number; membership_tier: string };
type TokenPackage = {
  id: string;
  name: string;
  token_count: number;
  bonus_tokens?: number;
  price_cents: number;
};

const SKINS: ShopItem[] = [
  { id: 'classic-dress', name: '经典裙装', emoji: '👗', description: '日常约会默认皮肤', price_cents: 200, item_type: 'outfit', effect_value: { intimacy_boost: 5 }, tier: 'free', skin: 'from-rose-400 to-pink-600' },
  { id: 'beach-bikini', name: '夏日泳装', emoji: '👙', description: '限定海滩皮肤', price_cents: 800, item_type: 'outfit', effect_value: { intimacy_boost: 25 }, tier: 'premium', skin: 'from-cyan-400 to-blue-600' },
  { id: 'evening-gown', name: '晚宴礼服', emoji: '✨', description: '红毯传说级皮肤', price_cents: 1500, item_type: 'outfit', effect_value: { intimacy_boost: 50 }, tier: 'premium', skin: 'from-amber-300 to-rose-600' },
  { id: 'silk-lingerie', name: '丝绸私语', emoji: '💫', description: '亲密度传说皮肤', price_cents: 3000, item_type: 'outfit', effect_value: { intimacy_boost: 100 }, tier: 'premium', is_limited: true, skin: 'from-fuchsia-500 to-purple-800' },
  { id: 'nurse-costume', name: '白衣天使', emoji: '💉', description: '角色扮演皮肤', price_cents: 2000, item_type: 'outfit', effect_value: { intimacy_boost: 80 }, tier: 'premium', skin: 'from-white to-rose-400' },
  { id: 'maid-costume', name: '法式女仆', emoji: '🎀', description: '经典幻想皮肤', price_cents: 2500, item_type: 'outfit', effect_value: { intimacy_boost: 90 }, tier: 'premium', skin: 'from-zinc-200 to-zinc-800' },
];

const GIFTS: ShopItem[] = [
  { id: 'rose-bouquet', name: '红玫瑰', emoji: '🌹', description: '温暖她的心', price_cents: 150, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 15 }, tier: 'free' },
  { id: 'chocolate-box', name: '巧克力礼盒', emoji: '🍫', description: '甜蜜惊喜', price_cents: 300, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 30 }, tier: 'free' },
  { id: 'teddy-bear', name: '巨型玩偶', emoji: '🧸', description: '拥抱时刻', price_cents: 500, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 50 }, tier: 'free' },
  { id: 'perfume-bottle', name: '设计师香水', emoji: '🧴', description: '高级感礼物', price_cents: 800, item_type: 'intimacy_boost', effect_value: { intimacy_boost: 80 }, tier: 'premium' },
  { id: 'double-intimacy', name: '双倍亲密度', emoji: '⚡', description: '24 小时增益', price_cents: 600, item_type: 'cap_unlock', effect_value: { effect_type: 'double_intimacy', duration_hours: 24 }, tier: 'free' },
  { id: 'unlimited-msg', name: '无限消息卡', emoji: '💬', description: '48 小时无限聊', price_cents: 1000, item_type: 'cap_unlock', effect_value: { effect_type: 'unlimited_messages', duration_hours: 48 }, tier: 'premium' },
];

export default function ShopPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [selectedGF, setSelectedGF] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [tokenPackages, setTokenPackages] = useState<TokenPackage[]>([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [buyingTokens, setBuyingTokens] = useState<string | null>(null);
  const [tab, setTab] = useState<'skins' | 'gifts' | 'tokens'>('skins');

  useEffect(() => {
    authedFetch('/api/shop/credits').then((r) => r.json()).then(setCredits).catch(() => {});
    authedFetch('/api/girlfriends').then((r) => r.json()).then((d) => setGirlfriends(d.girlfriends || [])).catch(() => {});
    authedFetch('/api/v2/shop/tokens')
      .then((r) => r.json())
      .then((d) => {
        setTokenPackages(d.packages || []);
        setTokenBalance(Number(d.user_balance) || 0);
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      toast.success('代币购买成功！');
      window.history.replaceState({}, '', '/shop');
    }
  }, []);

  const buyTokenPack = async (packageId: string) => {
    setBuyingTokens(packageId);
    try {
      const res = await authedFetch('/api/v2/shop/tokens', {
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
      toast.error('网络错误');
    } finally {
      setBuyingTokens(null);
    }
  };

  const handleBuy = async () => {
    if (!buying || !selectedGF) return;
    setPurchasing(true);
    try {
      const res = await authedFetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: buying.id, girlfriendId: selectedGF }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${buying.emoji} ${buying.name} 已装备！`);
        setBuying(null);
        setSelectedGF('');
        const c = await authedFetch('/api/shop/credits').then((r) => r.json());
        setCredits(c);
      } else if (res.status === 402) {
        toast.error('代币不足', {
          action: { label: '充值', onClick: () => setTab('tokens') },
        });
      } else {
        toast.error(data.error || '购买失败');
      }
    } catch {
      toast.error('网络错误');
    }
    setPurchasing(false);
  };

  const balance = tokenBalance || credits?.credits_remaining || 0;

  return (
    <GameShell className="skin-shelf min-h-full pb-28 md:pb-12">
      <PageHeader
        eyebrow="ARMORY"
        title="皮肤橱窗"
        subtitle="王者级货架 · 顶栏可返回选角或跳转密语"
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
          { id: 'skins', label: '皮肤', icon: Shirt },
          { id: 'gifts', label: '道具', icon: Gift },
          { id: 'tokens', label: '点券', icon: Coins },
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
            <GameSectionTitle title="充值点券" subtitle="Stripe 安全支付 · 即时到账" eyebrow="TOP UP" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(tokenPackages.length
                ? tokenPackages
                : [
                    { id: 'tokens-100', name: '入门包', token_count: 100, bonus_tokens: 0, price_cents: 499 },
                    { id: 'tokens-500', name: '热门包', token_count: 500, bonus_tokens: 50, price_cents: 1999 },
                    { id: 'tokens-1000', name: '至尊包', token_count: 1000, bonus_tokens: 200, price_cents: 3499 },
                  ]
              ).map((pkg, i) => {
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
                        disabled={buyingTokens === pkg.id}
                        onClick={() => buyTokenPack(pkg.id)}
                      >
                        {buyingTokens === pkg.id ? '…' : '购买'}
                      </GamePrimaryButton>
                    </div>
                  </GamePanel>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'skins' && (
          <section>
            <GameSectionTitle
              eyebrow="SKINS"
              title="传说皮肤"
              subtitle="王者级货架 · 选中后装备给她"
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {SKINS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBuying(item)}
                  className="group relative rounded-2xl overflow-hidden border border-white/10 text-left active:scale-[0.98] transition-transform"
                >
                  <div className={cn('aspect-[4/5] bg-gradient-to-br relative', item.skin)}>
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center text-6xl drop-shadow-lg">
                      {item.emoji}
                    </div>
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
                          +{item.effect_value?.intimacy_boost} 亲密度
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === 'gifts' && (
          <section>
            <GameSectionTitle eyebrow="ITEMS" title="道具与增益" subtitle="送礼 · 双倍 · 限时卡" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {GIFTS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setBuying(item)}
                  className="game-panel p-4 text-left hover:border-[#ff2e88]/40 transition-all active:scale-[0.98]"
                >
                  <div className="text-4xl mb-2">{item.emoji}</div>
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
              {buying?.description} · 消耗 {buying?.price_cents} 代币
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs text-white/40">装备给</label>
            <Select value={selectedGF} onValueChange={setSelectedGF}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="选择女友" />
              </SelectTrigger>
              <SelectContent>
                {girlfriends.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!girlfriends.length && (
              <p className="text-xs text-amber-400">还没有女友，先去卡池或捏脸创建吧。</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBuying(null)}>取消</Button>
            <Button
              disabled={!selectedGF || purchasing}
              onClick={handleBuy}
              className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] text-black font-bold"
            >
              {purchasing ? '…' : '确认购买'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GameShell>
  );
}
