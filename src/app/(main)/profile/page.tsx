'use client';

/**
 * Player profile / settings — game account hub
 * Enhanced: VIP panel with expiry + credits, card-style friends, full settings
 */

import { useTranslation } from '@/lib/i18n/context';
import { LOCALES, type Locale } from '@/lib/i18n/types';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { authedFetch, createBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Heart, Crown, MessageCircle, LogOut, Star, ShoppingBag, Shirt,
  Settings, Package, CreditCard, Sparkles, Loader2, Check, Trophy,
  Bell, ExternalLink, Users, Activity, Gift, AlertTriangle, Trash2,
  Coins, Calendar, RefreshCw, Camera, Globe, User, ChevronRight,
  Play, Film,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  avatar_url?: string;
}

interface CreationCardProduct {
  id: string;
  name: string;
  price_credits: number;
  preview_url: string;
  rarity: string;
  virtual_meta: Record<string, unknown>;
}

interface RecentVideo {
  id: string;
  girlfriend_id: string;
  url: string;
  created_at: string;
}

interface SubscriptionInfo {
  subscriptionEnd: string | null;
  subscriptionStatus: string | null;
  billingInterval: string | null;
}

type Tab = 'dashboard' | 'assets' | 'settings';

const TIER_META: Record<string, { label: string; color: string; gradient: string }> = {
  free: { label: 'Free', color: 'text-white/50', gradient: 'from-white/10 to-white/5' },
  basic: { label: 'Basic', color: 'text-sky-400', gradient: 'from-sky-500/20 to-sky-900/10' },
  pro: { label: 'Pro', color: 'text-purple-400', gradient: 'from-purple-500/20 to-purple-900/10' },
  unlimited: { label: 'Unlimited', color: 'text-amber-400', gradient: 'from-amber-500/20 to-amber-900/10' },
};

const RARITY_CHIP_STYLE: Record<string, string> = {
  legendary: 'bg-gradient-to-r from-[#ffd700] to-[#f59e0b] text-black',
  epic: 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white',
  rare: 'bg-gradient-to-r from-[#00e5ff] to-[#3b82f6] text-black',
  common: 'bg-white/15 text-white/80',
};

const GENDER_OPTIONS = [
  { value: 'male', labelEn: 'Male', labelZh: '男' },
  { value: 'female', labelEn: 'Female', labelZh: '女' },
  { value: 'other', labelEn: 'Other', labelZh: '其他' },
] as const;

export default function ProfilePage() {
  const { t, locale, setLocale } = useTranslation();
  const { settings: siteSettings } = useSiteSettings();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [membershipTier, setMembershipTier] = useState('free');
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '');
  const [gender, setGender] = useState(user?.user_metadata?.gender || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [backpackItems, setBackpackItems] = useState<BackpackItem[]>([]);
  const [girlfriends, setGirlfriends] = useState<GirlfriendOption[]>([]);
  const [cardProducts, setCardProducts] = useState<CreationCardProduct[]>([]);
  const [cardBalance, setCardBalance] = useState<number | null>(null);
  const [buyingProduct, setBuyingProduct] = useState<string | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [giftingItem, setGiftingItem] = useState<string | null>(null);
  const [giftTarget, setGiftTarget] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subInfo, setSubInfo] = useState<SubscriptionInfo>({ subscriptionEnd: null, subscriptionStatus: null, billingInterval: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = useCallback(async () => {
    const [memData, wardrobeData, notifData, backpackData, girlfriendsData, shopData, cardsData, mediaData] = await Promise.all([
      authedFetch('/api/membership').then((r) => r.json()),
      authedFetch('/api/wardrobe').then((r) => r.json()).catch(() => ({ items: [] })),
      authedFetch('/api/notifications').then((r) => r.json()).catch(() => ({ notifications: [] })),
      authedFetch('/api/backpack').then((r) => r.json()).catch(() => ({ items: [] })),
      authedFetch('/api/girlfriends').then((r) => r.json()).catch(() => ({ girlfriends: [] })),
      authedFetch('/api/shop/v2/products?limit=60').then((r) => r.json()).catch(() => ({ products: [] })),
      authedFetch('/api/creator/cards').then((r) => r.json()).catch(() => ({})),
      authedFetch('/api/media/recent?type=video&limit=12').then((r) => r.json()).catch(() => ({ media: [] })),
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
    setSubInfo({
      subscriptionEnd: memData.subscription_end || null,
      subscriptionStatus: memData.subscription_status || null,
      billingInterval: memData.billing_interval || null,
    });
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
    setCardProducts(
      (((shopData.products || []) as Array<Record<string, unknown>>).filter(
        (p) =>
          p.subcategory === 'creation_card' ||
          String((p.virtual_meta as Record<string, unknown> | null)?.kind || '') === 'creation_card',
      ) as unknown as CreationCardProduct[]).sort(
        (a, b) => Number(a.virtual_meta?.card_amount || 1) - Number(b.virtual_meta?.card_amount || 1),
      ),
    );
    setCardBalance(typeof cardsData.cards === 'number' ? (cardsData.cards as number) : null);
    setRecentVideos((mediaData.media || []) as RecentVideo[]);
    setLoading(false);
  }, []);

  useAutoRefresh(fetchProfile);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true);
    let anyOk = false;
    try {
      // Save display_name to profiles table
      const res = await authedFetch('/api/membership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) anyOk = true;
    } catch { /* continue */ }
    try {
      // Save gender + avatar to user_metadata via Supabase Auth
      const sb = createBrowserClient();
      if (sb) {
        const { error } = await sb.auth.updateUser({ data: { display_name: displayName, gender, avatar_url: avatarUrl } });
        if (!error) anyOk = true;
      }
    } catch { /* continue */ }
    if (anyOk) {
      toast.success(t('profile.saved'));
      notifyDataChange('membership');
    } else {
      toast.error(t('profile.saveFailed'));
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(locale === 'zh' ? '图片不能超过5MB' : 'Image must be under 5MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'avatars');
      const res = await authedFetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAvatarUrl(data.url || data.key);
      toast.success(locale === 'zh' ? '头像已上传，记得点保存' : 'Avatar uploaded — remember to save');
    } catch {
      toast.error(locale === 'zh' ? '上传失败' : 'Upload failed');
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAccount = async (): Promise<void> => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await authedFetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' }),
      });
      if (res.ok) {
        toast.success('Account deletion requested');
        await signOut();
        window.location.href = '/';
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Deletion failed');
      }
    } catch {
      toast.error(t('profile.networkError'));
    }
    setDeleting(false);
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
      toast.success(t('profile.giftSuccess'));
      setGiftingItem(null);
      setGiftTarget('');
      notifyDataChange('girlfriends');
      notifyDataChange('wardrobe');
      authedFetch('/api/backpack')
        .then((r) => r.json())
        .then((d) => setBackpackItems((d.items || []) as BackpackItem[]))
        .catch(() => {});
    } catch {
      toast.error(t('profile.giftFailed'));
    }
  };

  const buyCreationCard = async (p: CreationCardProduct): Promise<void> => {
    if (buyingProduct) return;
    setBuyingProduct(p.id);
    try {
      const res = await authedFetch('/api/shop/v2/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: p.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(locale === 'zh' ? '购买成功，创建卡已到账' : 'Purchase successful — cards added');
        if (typeof data.new_credits_balance === 'number') setCredits(data.new_credits_balance);
        authedFetch('/api/creator/cards')
          .then((r) => r.json())
          .then((s) => { if (typeof s.cards === 'number') setCardBalance(s.cards); })
          .catch(() => {});
        notifyDataChange('membership');
      } else if (res.status === 402) {
        toast.error(locale === 'zh' ? '积分不足，请先充值' : 'Insufficient credits', {
          action: { label: locale === 'zh' ? '去充值' : 'Top up', onClick: () => router.push('/wallet') },
        });
      } else {
        toast.error((data as { error?: string }).error || (locale === 'zh' ? '购买失败' : 'Purchase failed'));
      }
    } catch {
      toast.error(t('profile.networkError'));
    }
    setBuyingProduct(null);
  };

  const tier = TIER_META[membershipTier] || TIER_META.free;

  const formatExpiry = (iso: string | null): string => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const isExpired = subInfo.subscriptionEnd
    ? new Date(subInfo.subscriptionEnd) < new Date()
    : false;

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
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        backHref="/"
        sticky={false}
        actions={
          <GamePrimaryButton className="!h-10 !px-4 text-xs" onClick={() => router.push('/pricing')}>
            <Crown className="h-3.5 w-3.5" /> {t('profile.upgrade')}
          </GamePrimaryButton>
        }
      />

      {/* Player card banner */}
      <section className="relative px-4 sm:px-6 pt-4 overflow-hidden">
        <div className="relative mx-auto max-w-6xl">
          <GamePanel glow className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[#ff2e88]/40 blur-md game-pulse-ring" />
                <Avatar className="relative h-20 w-20 ring-2 ring-[#ff2e88]/50">
                  <AvatarImage src={avatarUrl || user?.user_metadata?.avatar_url} />
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
                    · {credits} {t('profile.creditsUnit')}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { icon: Users, label: t('profile.statGirlfriends'), value: stats?.girlfriendCount ?? 0 },
                { icon: MessageCircle, label: t('profile.statMessages'), value: stats?.messagesToday ?? 0 },
                { icon: Heart, label: t('profile.statIntimacy'), value: stats?.avgIntimacy ?? 0 },
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
      <div className="mx-auto px-4 sm:px-8 mt-5 max-w-3xl xl:max-w-6xl">
        <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
          {([
            { id: 'dashboard', label: t('profile.tabHome'), icon: Activity },
            { id: 'assets', label: t('profile.tabBag'), icon: Package },
            { id: 'settings', label: t('profile.tabSettings'), icon: Settings },
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

      <div className="mx-auto px-4 sm:px-8 py-6 space-y-4 max-w-3xl xl:max-w-6xl">
        {/* ═══════════ DASHBOARD TAB ═══════════ */}
        {activeTab === 'dashboard' && (
          <>
            {/* Creation cards + video showcase — widescreen side-by-side */}
            <div className="grid gap-4 xl:grid-cols-2">
              {/* ── Creation card shop ── */}
              <GamePanel className="p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="game-chip shrink-0">CARDS</div>
                    <h3 className="text-base font-bold truncate">
                      {locale === 'zh' ? '伴侣创建卡' : 'Creation Cards'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cardBalance !== null && (
                      <span className="text-[11px] text-cyan-300 flex items-center gap-1 bg-cyan-400/10 border border-cyan-400/25 rounded-full px-2.5 py-1">
                        <Sparkles className="h-3 w-3" />
                        {locale === 'zh' ? '持有 ' + cardBalance + ' 张' : cardBalance + ' owned'}
                      </span>
                    )}
                    <button
                      onClick={() => router.push('/create')}
                      className="text-[11px] text-white/45 hover:text-white transition-colors"
                    >
                      {locale === 'zh' ? '去创建 ›' : 'Create ›'}
                    </button>
                  </div>
                </div>
                {cardProducts.length === 0 ? (
                  <div className="py-10 text-center text-white/35 text-xs">
                    {locale === 'zh' ? '暂无可购买的创建卡' : 'No creation cards available right now'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {cardProducts.map((p) => {
                      const amount = Math.max(1, Number(p.virtual_meta?.card_amount || 1));
                      const promoVideo = String(p.virtual_meta?.video_url || '');
                      const busy = buyingProduct === p.id;
                      return (
                        <div
                          key={p.id}
                          className="group relative rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover:border-[#FF2D78]/50 hover:shadow-[0_0_18px_rgba(255,45,120,0.15)] transition-all"
                        >
                          <div className="relative aspect-[3/4]">
                            {p.preview_url ? (
                              <img
                                src={p.preview_url}
                                alt={p.name}
                                loading="lazy"
                                className={cn(
                                  'absolute inset-0 w-full h-full object-cover transition-all duration-500',
                                  promoVideo ? 'group-hover:opacity-0' : 'group-hover:scale-105',
                                )}
                              />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/25 to-purple-600/25 flex items-center justify-center">
                                <Sparkles className="h-6 w-6 text-white/40" />
                              </div>
                            )}
                            {promoVideo && (
                              <video
                                src={promoVideo}
                                muted
                                loop
                                playsInline
                                preload="none"
                                className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                                onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 pointer-events-none" />
                            <span className={cn('absolute top-1.5 right-1.5 text-[8px] font-black tracking-wide px-1.5 py-0.5 rounded', RARITY_CHIP_STYLE[p.rarity] || RARITY_CHIP_STYLE.common)}>
                              {p.rarity.toUpperCase()}
                            </span>
                            <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
                              <div className="text-[11px] font-bold truncate">{p.name}</div>
                              <div className="text-[10px] text-cyan-300 flex items-center gap-0.5">
                                <Sparkles className="h-2.5 w-2.5" />
                                {locale === 'zh' ? '创建卡' : 'Cards'} x{amount}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => void buyCreationCard(p)}
                            disabled={busy}
                            className="w-full flex items-center justify-center gap-1 h-8 text-[11px] font-bold text-white bg-gradient-to-r from-[#FF2D78]/85 to-[#8b5cf6]/85 hover:from-[#FF2D78] hover:to-[#8b5cf6] disabled:opacity-50 transition-all"
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Coins className="h-3 w-3" />}
                            {p.price_credits}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GamePanel>

              {/* ── Video showcase ── */}
              <GamePanel className="p-5">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="game-chip shrink-0">SHOWCASE</div>
                    <h3 className="text-base font-bold truncate">
                      {locale === 'zh' ? '视频展示' : 'Video Showcase'}
                    </h3>
                  </div>
                  <button
                    onClick={() => router.push('/studio')}
                    className="shrink-0 text-[11px] text-white/45 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <Film className="h-3 w-3" />
                    {locale === 'zh' ? '去创作 ›' : 'Create ›'}
                  </button>
                </div>
                {recentVideos.length === 0 ? (
                  <div className="py-8 text-center">
                    <Film className="h-9 w-9 mx-auto text-white/15 mb-3" />
                    <div className="text-xs text-white/35 mb-4">
                      {locale === 'zh' ? '还没有视频，为你的伴侣生成第一支短片吧' : 'No videos yet — bring your companion to life'}
                    </div>
                    <GamePrimaryButton className="!h-9 !px-4 text-xs" onClick={() => router.push('/studio')}>
                      <Sparkles className="h-3.5 w-3.5" /> {locale === 'zh' ? '生成视频' : 'Generate'}
                    </GamePrimaryButton>
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                    {recentVideos.map((v) => (
                      <div
                        key={v.id}
                        onClick={() => router.push('/chat/' + v.girlfriend_id)}
                        className="group relative w-[112px] shrink-0 aspect-[3/4] rounded-xl overflow-hidden border border-white/[0.08] hover:border-[#FF2D78]/50 cursor-pointer transition-all"
                      >
                        <video
                          src={v.url}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover"
                          onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                          onMouseLeave={(e) => { e.currentTarget.pause(); }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black/55 flex items-center justify-center pointer-events-none">
                          <Play className="h-2.5 w-2.5 fill-white text-white" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 pointer-events-none">
                          <div className="text-[10px] font-semibold truncate">
                            {girlfriends.find((g) => g.id === v.girlfriend_id)?.name || (locale === 'zh' ? '伴侣' : 'Companion')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GamePanel>
            </div>

            {/* My Companions — card-style, click to chat */}
            <GameSectionTitle title={locale === 'zh' ? '我的伴侣' : 'My Companions'} eyebrow="PARTNERS" />
            {girlfriends.length === 0 ? (
              <GamePanel className="p-8 text-center">
                <Users className="h-10 w-10 mx-auto text-white/15 mb-3" />
                <div className="text-sm text-white/40 mb-4">
                  {locale === 'zh' ? '还没有伴侣，去卡池探索吧' : 'No companions yet — explore the card pool'}
                </div>
                <GamePrimaryButton className="h-10 px-5" onClick={() => router.push('/explore')}>
                  <Sparkles className="h-4 w-4" /> {locale === 'zh' ? '去探索' : 'Explore'}
                </GamePrimaryButton>
              </GamePanel>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                {girlfriends.map((gf) => (
                  <button
                    key={gf.id}
                    onClick={() => router.push(`/chat/${gf.id}`)}
                    className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-[#FF2D78]/50 hover:shadow-[0_0_20px_rgba(255,45,120,0.15)] transition-all active:scale-[0.97] text-left"
                  >
                    <div className="relative aspect-[3/4]">
                      {(gf.portrait_url || gf.avatar_url) ? (
                        <img
                          src={gf.portrait_url || gf.avatar_url}
                          alt={gf.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#FF2D78]/30 to-[#8b5cf6]/30 flex items-center justify-center">
                          <span className="text-3xl font-black text-white/60">
                            {gf.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      {/* Chat button overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF2D78]/90 text-white text-xs font-medium shadow-lg">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {locale === 'zh' ? '聊天' : 'Chat'}
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <div className="text-sm font-bold truncate text-white">{gf.name}</div>
                      </div>
                    </div>
                  </button>
                ))}
                {/* Add new companion card */}
                <button
                  onClick={() => router.push('/explore')}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:border-[#FF2D78]/40 hover:bg-[#FF2D78]/5 transition-all min-h-[160px]"
                >
                  <div className="h-10 w-10 rounded-full bg-white/[0.06] flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white/30" />
                  </div>
                  <span className="text-xs text-white/30">{locale === 'zh' ? '探索更多' : 'Explore'}</span>
                </button>
              </div>
            )}

            {/* Quick access shortcuts */}
            <GameSectionTitle title={t('profile.shortcuts')} eyebrow="HUB" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { href: '/chats', icon: MessageCircle, label: t('profile.qChats') },
                { href: '/explore', icon: Sparkles, label: t('profile.qPool') },
                ...(siteSettings?.shop_enabled ? [{ href: '/shop', icon: ShoppingBag, label: t('profile.qShop') }] : []),
                { href: '/quest', icon: Trophy, label: t('profile.qQuest') },
                { href: '/wardrobe', icon: Shirt, label: t('profile.qWardrobe') },
                { href: '/achievements', icon: Star, label: t('profile.qAchieve') },
                { href: '/purchases', icon: CreditCard, label: t('profile.qOrders') },
                { href: '/pricing', icon: Crown, label: t('profile.qVip') },
                { href: '/admin', icon: Settings, label: t('profile.qAdmin') },
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
                <GameSectionTitle title={t('profile.notifications')} eyebrow="MAIL" />
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

        {/* ═══════════ ASSETS TAB ═══════════ */}
        {activeTab === 'assets' && (
          <>
            <GameSectionTitle title={t('profile.skinsTitle')} subtitle={`${assets.length} ${t('profile.items')}`} eyebrow="INVENTORY" />
            {assets.length === 0 ? (
              <GamePanel className="p-10 text-center text-white/40 text-sm">
                {t('profile.noSkins')}
                <div className="mt-4">
                  <GamePrimaryButton className="h-10 px-5" onClick={() => router.push('/wallet')}>
                    {t('profile.openShop')}
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
                          <Check className="h-3 w-3" /> {locale === 'zh' ? '已装备' : 'Equipped'}
                        </span>
                      )}
                    </div>
                  </GamePanel>
                ))}
              </div>
            )}

            <div className="mt-6">
              <GameSectionTitle title={t('profile.bagTitle')} subtitle={`${backpackItems.length} ${t('profile.items')}`} eyebrow="BACKPACK" />
              {backpackItems.length === 0 ? (
                <GamePanel className="p-10 text-center text-white/40 text-sm">
                  {t('profile.emptyBag')}
                  <div className="mt-4">
                    <GamePrimaryButton className="h-10 px-5" onClick={() => router.push('/wallet')}>
                      {t('profile.openShop')}
                    </GamePrimaryButton>
                  </div>
                </GamePanel>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {backpackItems.map((item) => (
                    <GamePanel key={item.id} className="p-3 relative group">
                      <div className="absolute top-2 right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#FF2D78] text-[10px] font-bold text-white px-1.5">
                        x{item.quantity}
                      </div>
                      <div className={cn(
                        'absolute top-2 left-2 h-1.5 w-8 rounded-full',
                        item.product.rarity === 'legendary' && 'bg-amber-400',
                        item.product.rarity === 'epic' && 'bg-purple-500',
                        item.product.rarity === 'rare' && 'bg-blue-500',
                        item.product.rarity === 'common' && 'bg-white/20',
                      )} />
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
                      <button
                        onClick={() => {
                          setGiftingItem(item.product.id);
                          setGiftTarget('');
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-[#FF2D78]/20 hover:border-[#FF2D78]/40 transition-all"
                      >
                        <Gift className="h-3 w-3" /> {t('profile.gift')}
                      </button>
                    </GamePanel>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════ SETTINGS TAB ═══════════ */}
        {activeTab === 'settings' && (
          <>
            {/* ── VIP Membership Panel ── */}
            <GameSectionTitle title={locale === 'zh' ? 'VIP 会员' : 'VIP Membership'} eyebrow="MEMBERSHIP" />
            <GamePanel className={cn('p-5 bg-gradient-to-br border', tier.gradient, membershipTier !== 'free' ? 'border-amber-500/20' : 'border-white/[0.08]')}>
              {/* Tier header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#ffd700]/25 to-[#ff2e88]/25 border border-[#ffd700]/30 flex items-center justify-center shrink-0">
                  <Crown className={cn('h-6 w-6', tier.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn('font-bold text-base flex items-center gap-2', tier.color)}>
                    {tier.label}
                    {membershipTier !== 'free' && subInfo.subscriptionStatus === 'active' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                        {locale === 'zh' ? '生效中' : 'Active'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {membershipTier === 'free'
                      ? (locale === 'zh' ? '升级解锁 NSFW、AI 照片与无限聊天' : 'Upgrade to unlock NSFW, AI photos & unlimited chat')
                      : (locale === 'zh' ? '随时管理或取消你的订阅' : 'Manage or cancel your subscription anytime')}
                  </div>
                </div>
              </div>

              {/* Expiry + billing info */}
              {membershipTier !== 'free' && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1">
                      <Calendar className="h-3 w-3" />
                      {locale === 'zh' ? '到期时间' : 'Expires'}
                    </div>
                    <div className={cn('text-sm font-semibold', isExpired ? 'text-red-400' : 'text-white/90')}>
                      {formatExpiry(subInfo.subscriptionEnd)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] p-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1">
                      <RefreshCw className="h-3 w-3" />
                      {locale === 'zh' ? '计费周期' : 'Billing'}
                    </div>
                    <div className="text-sm font-semibold text-white/90">
                      {subInfo.billingInterval === 'year'
                        ? (locale === 'zh' ? '年付' : 'Yearly')
                        : subInfo.billingInterval === 'month'
                          ? (locale === 'zh' ? '月付' : 'Monthly')
                          : '--'}
                    </div>
                  </div>
                </div>
              )}

              {/* Credits display */}
              <div className="rounded-xl bg-white/[0.05] border border-white/[0.06] p-3.5 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-amber-400" />
                    <div>
                      <div className="text-lg font-bold text-amber-300 tabular-nums">{credits}</div>
                      <div className="text-[10px] text-white/40">{locale === 'zh' ? '可用积分' : 'Available credits'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/wallet')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white text-xs font-semibold hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    {locale === 'zh' ? '购买积分' : 'Buy Credits'}
                  </button>
                </div>
              </div>

              {/* Renew / Upgrade button */}
              <GamePrimaryButton className="w-full h-11" onClick={() => router.push('/pricing')}>
                <Crown className="h-4 w-4" />
                {membershipTier === 'free'
                  ? (locale === 'zh' ? '升级会员' : 'Upgrade Now')
                  : isExpired
                    ? (locale === 'zh' ? '续费会员' : 'Renew Subscription')
                    : (locale === 'zh' ? '管理订阅' : 'Manage Subscription')}
              </GamePrimaryButton>
            </GamePanel>

            {/* ── Account Settings ── */}
            <GameSectionTitle title={t('profile.settingsTitle')} eyebrow="PROFILE" />
            <GamePanel className="p-5 space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <Avatar className="h-16 w-16 ring-2 ring-[#ff2e88]/30">
                    <AvatarImage src={avatarUrl || user?.user_metadata?.avatar_url} />
                    <AvatarFallback className="bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] text-lg font-bold">
                      {(displayName || user?.email || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleAvatarUpload(e)}
                  />
                </div>
                <div className="text-xs text-white/40">
                  {locale === 'zh' ? '点击头像更换' : 'Click avatar to change'}
                  <br />
                  <span className="text-white/25">JPG / PNG, max 5MB</span>
                </div>
              </div>

              {/* Display name */}
              <div>
                <label className="text-xs text-white/40 mb-1.5 flex items-center gap-1.5">
                  <User className="h-3 w-3" /> {t('profile.displayName')}
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={locale === 'zh' ? '输入显示名称' : 'Enter display name'}
                  className="bg-white/5 border-white/10"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">
                  {locale === 'zh' ? '性别' : 'Gender'}
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGender(g.value)}
                      className={cn(
                        'flex-1 h-10 rounded-xl text-sm font-medium border transition-all',
                        gender === g.value
                          ? 'bg-[#FF2D78]/20 border-[#FF2D78]/50 text-[#ff6ba6]'
                          : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:border-white/20',
                      )}
                    >
                      {locale === 'zh' ? g.labelZh : g.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">{t('profile.email')}</label>
                <Input value={user?.email || ''} disabled className="bg-white/5 border-white/10 opacity-60" />
              </div>

              {/* Language */}
              <div>
                <label className="text-xs text-white/40 mb-1.5 flex items-center gap-1.5">
                  <Globe className="h-3 w-3" /> {locale === 'zh' ? '语言' : 'Language'}
                </label>
                <div className="relative">
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as Locale)}
                    className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-[#FF2D78]/50"
                  >
                    {LOCALES.map((l) => (
                      <option key={l.code} value={l.code} className="bg-[#1a1a2e] text-white">
                        {l.nativeLabel}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 rotate-90 pointer-events-none" />
                </div>
              </div>

              <GamePrimaryButton className="w-full h-11" disabled={saving} onClick={() => void saveProfile()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t('profile.save')}
              </GamePrimaryButton>
            </GamePanel>

            {/* ── Danger Zone ── */}
            <GameSectionTitle title={t('profile.dangerTitle')} eyebrow="DANGER" />
            <GamePanel className="p-5 border-red-500/20 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-red-300">{t('profile.deleteTitle')}</div>
                  <div className="text-xs text-white/40 mt-0.5">
                    {t('profile.deleteDesc')}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                  className="rounded border-red-500/40 bg-white/[0.06] accent-red-500"
                />
                <span className="text-xs text-white/50">{t('profile.deleteConfirm')}</span>
              </label>
              <button
                onClick={() => void handleDeleteAccount()}
                disabled={!deleteConfirm || deleting}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('profile.deleteCta')}
              </button>
            </GamePanel>

            <GamePanel className="p-4">
              <button
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium"
              >
                <LogOut className="h-4 w-4" /> {t('profile.signOut')}
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
              {t('profile.giftChoose')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1.5">
            {girlfriends.length === 0 ? (
              <div className="py-8 text-center text-white/40 text-sm">
                {t('profile.giftNone')}
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
              <Gift className="h-4 w-4" /> {t('profile.giftConfirm')}
            </GamePrimaryButton>
          </div>
        </SheetContent>
      </Sheet>
    </GameShell>
  );
}
