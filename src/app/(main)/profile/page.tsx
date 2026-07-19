'use client';

/**
 * Player profile / settings — game account hub
 */

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Heart, Crown, MessageCircle, LogOut, Star, ShoppingBag, Shirt,
  Settings, Package, CreditCard, Sparkles, Loader2, Check, Trophy,
  Bell, ExternalLink, Users, Activity, Gift,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { notifyDataChange } from '@/hooks/useDataSync';
import {
  GameShell, GamePanel, GamePrimaryButton, GameSectionTitle,
} from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface UserStats {
  girlfriendCount: number;
  messagesToday: number;
  avgIntimacy: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

interface AssetItem {
  id: string;
  type: string;
  name: string;
  icon: string;
  tier: string;
  equipped: boolean;
}

interface BackpackItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    description: string;
    category: string;
    preview_url: string;
    price_credits: number;
    rarity: string;
  };
}

interface GirlfriendOption {
  id: string;
  name: string;
  portrait_url: string;
}

type Tab = 'dashboard' | 'assets' | 'settings';

const TIER_META: Record<string, { label: string; color: string }> = {
  free: { label: 'Free', color: 'text-white/50' },
  pro: { label: 'Pro', color: 'text-purple-400' },
  unlimited: { label: 'Unlimited', color: 'text-amber-400' },
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [membershipTier, setMembershipTier] = useState('free');
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [backpackItems, setBackpackItems] = useState<BackpackItem[]>([]);
  const [girlfriends, setGirlfriends] = useState<GirlfriendOption[]>([]);
  const [giftingItem, setGiftingItem] = useState<string | null>(null);
  const [giftTarget, setGiftTarget] = useState('');

  const fetchProfile = useCallback(async () => {
    const [memData, wardrobeData, notifData, backpackData, girlfriendsData] = await Promise.all([
      authedFetch('/api/membership').then((r) => r.json()),
      authedFetch('/api/wardrobe').then((r) => r.json()).catch(() => ({ items: [] })),
      authedFetch('/api/notifications').then((r) => r.json()).catch(() => ({ notifications: [] })),
      authedFetch('/api/backpack').then((r) => r.json()).catch(() => ({ items: [] })),
      authedFetch('/api/girlfriends').then((r) => r.json()).catch(() => ({ girlfriends: [] })),
    ]);
    if (memData.usage) {
      setStats({
        girlfriendCount: memData.usage.total_girlfriends || 0,
        messagesToday: memData.usage.messages_sent_today || 0,
        avgIntimacy: memData.usage.highest_intimacy || 0,
      });
    }
    setMembershipTier(memData.tier || 'free');
    setCredits(memData.credits_remaining || 0);
    setAssets(
      ((wardrobeData.items || []) as Array<Record<string, unknown>>).map((w) => ({
        id: String(w.id),
        type: 'outfit',
        name: String((w.outfit as { name?: string })?.name || w.outfit_name || 'Outfit'),
        icon: String((w.outfit as { emoji?: string })?.emoji || '👗'),
        tier: String((w.outfit as { tier?: string })?.tier || 'free'),
        equipped: Boolean(w.is_equipped),
      })),
    );
    setNotifications(notifData.notifications || []);
    setBackpackItems((backpackData.items || []) as BackpackItem[]);
    setGirlfriends((girlfriendsData.girlfriends || []) as GirlfriendOption[]);
    setLoading(false);
  }, []);

  useAutoRefresh(fetchProfile);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/membership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) {
        toast.success('已保存');
        notifyDataChange('membership');
      } else toast.error('保存失败');
    } catch {
      toast.error('网络错误');
    }
    setSaving(false);
  };

  const handleGift = async (productId: string): Promise<void> => {
    if (!giftTarget) return;
    try {
      const res = await authedFetch('/api/backpack/gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, girlfriend_id: giftTarget }),
      });
      if (!res.ok) throw new Error('Gift failed');
      toast.success('赠送成功！');
      setGiftingItem(null);
      setGiftTarget('');
      notifyDataChange('girlfriends');
      notifyDataChange('wardrobe');
      // Refresh backpack
      authedFetch('/api/backpack')
        .then((r) => r.json())
        .then((d) => setBackpackItems((d.items || []) as BackpackItem[]))
        .catch(() => {});
    } catch {
      toast.error('赠送失败');
    }
  };

  const tier = TIER_META[membershipTier] || TIER_META.free;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  return (
    <GameShell className="pb-28 md:pb-12 min-h-full">
      <PageHeader
        eyebrow="PLAYER"
        title="我的账号"
        subtitle="背包 · 设置 · 顶栏随时跳转其他模块"
        backHref="/"
        sticky={false}
        actions={
          <GamePrimaryButton className="!h-10 !px-4 text-xs" onClick={() => router.push('/pricing')}>
            <Crown className="h-3.5 w-3.5" /> 升级
          </GamePrimaryButton>
        }
      />

      {/* Player card banner */}
      <section className="relative px-4 sm:px-6 pt-4 overflow-hidden">
        <div className="relative mx-auto max-w-3xl">
          <GamePanel glow className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[#ff2e88]/40 blur-md game-pulse-ring" />
                <Avatar className="relative h-20 w-20 ring-2 ring-[#ff2e88]/50">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] text-xl font-bold">
                    {(displayName || user?.email || '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black truncate">
                  {displayName || user?.email?.split('@')[0] || 'Traveler'}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-sm font-semibold flex items-center gap-1', tier.color)}>
                    <Crown className="h-3.5 w-3.5" /> {tier.label}
                  </span>
                  <span className="text-xs text-amber-300 flex items-center gap-1">
                    · {credits} 代币
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { icon: Users, label: '女友', value: stats?.girlfriendCount ?? 0 },
                { icon: MessageCircle, label: '今日密语', value: stats?.messagesToday ?? 0 },
                { icon: Heart, label: '最高亲密', value: stats?.avgIntimacy ?? 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 text-center">
                  <s.icon className="h-4 w-4 mx-auto text-[#ff6ba6] mb-1" />
                  <div className="text-lg font-bold tabular-nums">{s.value}</div>
                  <div className="text-[10px] text-white/40">{s.label}</div>
                </div>
              ))}
            </div>
          </GamePanel>
        </div>
      </section>

      {/* Tabs */}
      <div className="mx-auto max-w-3xl px-4 sm:px-8 mt-5">
        <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          {([
            { id: 'dashboard', label: '主页', icon: Activity },
            { id: 'assets', label: '背包', icon: Package },
            { id: 'settings', label: '设置', icon: Settings },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#FF2D78]/90 to-[#8b5cf6]/90 text-white'
                  : 'text-white/45 hover:text-white',
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 sm:px-8 py-6 space-y-4">
        {activeTab === 'dashboard' && (
          <>
            <GameSectionTitle title="快捷入口" eyebrow="HUB" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { href: '/chats', icon: MessageCircle, label: '密语' },
                { href: '/explore', icon: Sparkles, label: '卡池' },
                { href: '/shop', icon: ShoppingBag, label: '商城' },
                { href: '/quest', icon: Trophy, label: '任务' },
                { href: '/wardrobe', icon: Shirt, label: '衣柜' },
                { href: '/achievements', icon: Star, label: '成就' },
                { href: '/purchases', icon: CreditCard, label: '订单' },
                { href: '/pricing', icon: Crown, label: '会员' },
                { href: '/admin', icon: Settings, label: '管理后台' },
              ].map((l) => (
                <button
                  key={l.href}
                  onClick={() => router.push(l.href)}
                  className="game-panel p-4 flex flex-col items-center gap-2 hover:border-[#FF2D78]/40 transition-all active:scale-95"
                >
                  <l.icon className="h-5 w-5 text-[#ff6ba6]" />
                  <span className="text-xs font-medium">{l.label}</span>
                </button>
              ))}
            </div>

            {notifications.length > 0 && (
              <>
                <GameSectionTitle title="通知" eyebrow="MAIL" />
                <div className="space-y-2">
                  {notifications.slice(0, 5).map((n) => (
                    <GamePanel key={n.id} className="p-3 flex gap-3 items-start">
                      <Bell className="h-4 w-4 text-[#ff6ba6] shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        <div className="text-xs text-white/40 line-clamp-2">{n.message}</div>
                      </div>
                      {n.link_url && (
                        <button onClick={() => router.push(n.link_url!)}>
                          <ExternalLink className="h-4 w-4 text-white/30" />
                        </button>
                      )}
                    </GamePanel>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'assets' && (
          <>
            {/* Wardrobe / skins section */}
            <GameSectionTitle title="我的皮肤与道具" subtitle={`${assets.length} 件`} eyebrow="INVENTORY" />
            {assets.length === 0 ? (
              <GamePanel className="p-10 text-center text-white/40 text-sm">
                暂无皮肤 · 去商城挑选吧
                <div className="mt-4">
                  <GamePrimaryButton className="h-10 px-5" onClick={() => router.push('/shop')}>
                    打开商城
                  </GamePrimaryButton>
                </div>
              </GamePanel>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {assets.map((a) => (
                  <GamePanel key={a.id} className="p-3">
                    <div className="text-2xl mb-1">{a.icon}</div>
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-white/40 mt-0.5 flex items-center gap-1">
                      {a.tier}
                      {a.equipped && (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check className="h-3 w-3" /> 已装备
                        </span>
                      )}
                    </div>
                  </GamePanel>
                ))}
              </div>
            )}

            {/* Backpack items section */}
            <div className="mt-6">
              <GameSectionTitle title="背包道具" subtitle={`${backpackItems.length} 种`} eyebrow="BACKPACK" />
              {backpackItems.length === 0 ? (
                <GamePanel className="p-10 text-center text-white/40 text-sm">
                  背包是空的，去商城逛逛吧
                  <div className="mt-4">
                    <GamePrimaryButton className="h-10 px-5" onClick={() => router.push('/shop')}>
                      打开商城
                    </GamePrimaryButton>
                  </div>
                </GamePanel>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {backpackItems.map((item) => (
                    <GamePanel key={item.id} className="p-3 relative group">
                      {/* Quantity badge */}
                      <div className="absolute top-2 right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#FF2D78] text-[10px] font-bold text-white px-1.5">
                        x{item.quantity}
                      </div>
                      {/* Rarity indicator */}
                      <div className={cn(
                        'absolute top-2 left-2 h-1.5 w-8 rounded-full',
                        item.product.rarity === 'legendary' && 'bg-amber-400',
                        item.product.rarity === 'epic' && 'bg-purple-500',
                        item.product.rarity === 'rare' && 'bg-blue-500',
                        item.product.rarity === 'common' && 'bg-white/20',
                      )} />
                      {/* Item preview */}
                      <div className="mt-3 mb-2">
                        {item.product.preview_url ? (
                          <img
                            src={item.product.preview_url}
                            alt={item.product.name}
                            className="w-full h-20 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-20 rounded-lg bg-white/[0.04] flex items-center justify-center">
                            <Package className="h-8 w-8 text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">{item.product.name}</div>
                      <div className="text-[10px] text-white/40 mt-0.5 line-clamp-2 min-h-[28px]">
                        {item.product.description}
                      </div>
                      {/* Gift button */}
                      <button
                        onClick={() => {
                          setGiftingItem(item.product.id);
                          setGiftTarget('');
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-[#FF2D78]/20 hover:border-[#FF2D78]/40 transition-all"
                      >
                        <Gift className="h-3 w-3" /> 赠送
                      </button>
                    </GamePanel>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <GameSectionTitle title="账号设置" eyebrow="SETTINGS" />
            <GamePanel className="p-5 space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">显示名称</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">邮箱</label>
                <Input value={user?.email || ''} disabled className="bg-white/5 border-white/10 opacity-60" />
              </div>
              <GamePrimaryButton className="w-full h-11" disabled={saving} onClick={saveProfile}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                保存
              </GamePrimaryButton>
            </GamePanel>

            <GamePanel className="p-4">
              <button
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium"
              >
                <LogOut className="h-4 w-4" /> 退出登录
              </button>
            </GamePanel>
          </>
        )}
      </div>

      {/* Gift dialog — select target girlfriend */}
      <Sheet open={!!giftingItem} onOpenChange={(open) => { if (!open) { setGiftingItem(null); setGiftTarget(''); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl bg-[#12121a] border-white/[0.08] max-h-[70vh]">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-base text-white flex items-center gap-2">
              <Gift className="h-4 w-4 text-[#ff6ba6]" />
              选择赠送对象
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1.5">
            {girlfriends.length === 0 ? (
              <div className="py-8 text-center text-white/40 text-sm">
                还没有女友，快去创建一位吧
              </div>
            ) : (
              girlfriends.map((gf) => (
                <button
                  key={gf.id}
                  onClick={() => setGiftTarget(gf.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl transition-all',
                    giftTarget === gf.id
                      ? 'bg-[#FF2D78]/20 border border-[#FF2D78]/50'
                      : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08]',
                  )}
                >
                  <div className="relative shrink-0">
                    {gf.portrait_url ? (
                      <img
                        src={gf.portrait_url}
                        alt={gf.name}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] flex items-center justify-center text-sm font-bold text-white">
                        {gf.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium truncate">{gf.name}</span>
                  {giftTarget === gf.id && (
                    <Check className="h-4 w-4 text-[#ff6ba6] ml-auto shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="p-5 pt-3">
            <GamePrimaryButton
              className="w-full h-11 disabled:opacity-40"
              disabled={!giftTarget}
              onClick={() => { if (giftingItem) void handleGift(giftingItem); }}
            >
              <Gift className="h-4 w-4" /> 确认赠送
            </GamePrimaryButton>
          </div>
        </SheetContent>
      </Sheet>
    </GameShell>
  );
}
