'use client';

/**
 * 我的账户（重构版）— 与伴侣主页同源的抖音风个人主页
 * ─ 个人数据：粉丝数 / 关注数 / 发布数量 / 互动值
 * ─ 个人资产：会员等级 / 积分 / 伴侣 / 道具 / 成就
 * ─ 个人设置：头像 / 名字 / 简介 / 性别 / 语言
 * ─ 我的作品：创建的伴侣及发布审核状态
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, Calendar, Camera, Check, ChevronRight, Coins,
  Crown, Flame, Gift, Globe, Heart, Loader2, LogOut, Package, RefreshCw,
  Sparkles, Trash2, Trophy, User, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch, createBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import { LOCALES, type Locale } from '@/lib/i18n/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

type Tab = 'assets' | 'works' | 'settings';

interface CommunityStats {
  fans: number;
  following: number;
  published: number;
  total: number;
  interaction: number;
}

interface MembershipData {
  tier: string;
  credits_remaining: number;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  subscription_end: string | null;
  subscription_status: string | null;
  billing_interval: string | null;
}

interface FriendCompanion {
  id: string;
  name: string;
  portrait_url?: string | null;
  avatar_url?: string | null;
  friend_source?: string;
}

interface MyWork {
  id: string;
  name: string;
  portrait_url?: string | null;
  avatar_url?: string | null;
  review_status?: string;
  is_public?: boolean;
  interaction_count?: number;
  rejection_reason?: string | null;
}

interface BackpackItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    description: string;
    preview_url: string;
    rarity: string;
  };
}

const TIER_META: Record<string, { label: string; chip: string }> = {
  free: { label: 'Free', chip: 'text-white/60 ring-white/20' },
  pro: { label: 'Pro', chip: 'text-purple-300 ring-purple-400/40' },
  unlimited: { label: 'Unlimited', chip: 'text-amber-300 ring-amber-400/40' },
};

const GENDER_OPTIONS = [
  { value: 'male', labelEn: 'Male', labelZh: '男' },
  { value: 'female', labelEn: 'Female', labelZh: '女' },
  { value: 'other', labelEn: 'Other', labelZh: '其他' },
] as const;

const STATUS_META: Record<string, { zh: string; en: string; cls: string }> = {
  approved: { zh: '已上架', en: 'Published', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25' },
  pending: { zh: '审核中', en: 'In review', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/25' },
  draft: { zh: '草稿', en: 'Draft', cls: 'bg-white/[0.06] text-white/50 ring-white/[0.1]' },
  rejected: { zh: '已驳回', en: 'Rejected', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/25' },
};

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { t, locale, setLocale } = useTranslation();

  const [tab, setTab] = useState<Tab>('assets');
  const [loading, setLoading] = useState(true);
  const [mem, setMem] = useState<MembershipData | null>(null);
  const [stats, setStats] = useState<CommunityStats>({ fans: 0, following: 0, published: 0, total: 0, interaction: 0 });
  const [friends, setFriends] = useState<FriendCompanion[]>([]);
  const [works, setWorks] = useState<MyWork[]>([]);
  const [backpack, setBackpack] = useState<BackpackItem[]>([]);
  const [cardBalance, setCardBalance] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [giftingItem, setGiftingItem] = useState<string | null>(null);
  const [giftTarget, setGiftTarget] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [memRes, communityRes, friendsRes, worksRes, backpackRes, cardsRes, achRes] =
        await Promise.all([
          authedFetch('/api/membership').then((r) => r.json()).catch(() => ({})),
          authedFetch('/api/community/me').then((r) => r.json()).catch(() => ({})),
          authedFetch('/api/friends').then((r) => r.json()).catch(() => ({ friends: [] })),
          authedFetch('/api/girlfriends').then((r) => r.json()).catch(() => ({ girlfriends: [] })),
          authedFetch('/api/backpack').then((r) => r.json()).catch(() => ({ items: [] })),
          authedFetch('/api/creator/cards').then((r) => r.json()).catch(() => ({})),
          authedFetch('/api/v2/user/achievements').then((r) => r.json()).catch(() => ({})),
        ]);

      const m = memRes as Partial<MembershipData>;
      setMem({
        tier: m.tier || 'free',
        credits_remaining: m.credits_remaining || 0,
        display_name: m.display_name || null,
        avatar_url: m.avatar_url || null,
        bio: m.bio || null,
        subscription_end: m.subscription_end || null,
        subscription_status: m.subscription_status || null,
        billing_interval: m.billing_interval || null,
      });
      setDisplayName(m.display_name || user?.user_metadata?.display_name || '');
      setBio(m.bio || '');
      setAvatarUrl(m.avatar_url || user?.user_metadata?.avatar_url || '');
      setGender(String(user?.user_metadata?.gender || ''));

      const c = communityRes as Partial<CommunityStats>;
      setStats({
        fans: c.fans || 0,
        following: c.following || 0,
        published: c.published || 0,
        total: c.total || 0,
        interaction: c.interaction || 0,
      });

      setFriends(((friendsRes.friends || []) as FriendCompanion[]));
      setWorks(((worksRes.girlfriends || []) as MyWork[]));
      setBackpack(((backpackRes.items || []) as BackpackItem[]));
      setCardBalance(typeof cardsRes.cards === 'number' ? cardsRes.cards : null);
      setUnlocked(typeof achRes.total_unlocked === 'number' ? achRes.total_unlocked : null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?next=/profile');
      return;
    }
    void load();
  }, [authLoading, user, router, load]);

  const refreshBackpack = () => {
    authedFetch('/api/backpack')
      .then((r) => r.json())
      .then((d) => setBackpack((d.items || []) as BackpackItem[]))
      .catch(() => {});
  };

  const saveProfile = async () => {
    setSaving(true);
    let anyOk = false;
    try {
      const res = await authedFetch('/api/membership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, bio, avatar_url: avatarUrl }),
      });
      if (res.ok) anyOk = true;
    } catch { /* continue */ }
    try {
      const sb = createBrowserClient();
      if (sb) {
        const { error } = await sb.auth.updateUser({
          data: { display_name: displayName, gender, avatar_url: avatarUrl },
        });
        if (!error) anyOk = true;
      }
    } catch { /* continue */ }
    if (anyOk) {
      toast.success(t('profile.saved'));
      setMem((prev) => (prev ? { ...prev, display_name: displayName, bio, avatar_url: avatarUrl } : prev));
    } else {
      toast.error(t('profile.saveFailed'));
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('common.imageTooLarge5mb'));
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
      const url = data.url || data.key;
      setAvatarUrl(url);
      try {
        await authedFetch('/api/membership', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_url: url }),
        });
        toast.success(t('profile.avatarUpdated'));
      } catch {
        toast.success(t('profile.avatarUploadedSave'));
      }
    } catch {
      toast.error(t('common.uploadFailed'));
    }
    setUploadingAvatar(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      refreshBackpack();
    } catch {
      toast.error(t('profile.giftFailed'));
    }
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
        toast.success(t('profile.deletionRequested'));
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

  if (authLoading || !user) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-transparent">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/70" />
      </div>
    );
  }

  if (loading || !mem) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-transparent">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]/70" />
      </div>
    );
  }

  const tierMeta = TIER_META[mem.tier] || TIER_META.free;
  const shownName = displayName || user.email?.split('@')[0] || 'Traveler';
  const isPaid = mem.tier !== 'free';
  const isExpired = mem.subscription_end ? new Date(mem.subscription_end) < new Date() : false;

  const formatExpiry = (iso: string | null): string => {
    if (!iso) return '--';
    return new Date(iso).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-transparent text-white [scrollbar-gutter:stable]">
      <div className="mx-auto min-h-full w-full max-w-[1600px] px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:px-10 xl:px-14">
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
          <span className="flex-1 text-sm font-semibold text-white/90 truncate">{t('profile.title')}</span>
          <button
            type="button"
            onClick={() => router.push('/pricing')}
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3.5 py-2 text-xs font-bold text-white active:scale-95 transition-all"
          >
            <Crown className="h-3.5 w-3.5" /> {t('profile.upgrade')}
          </button>
        </div>

        {/* Hero */}
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="block h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-[#ffd700] via-[#ff2e88] to-[#c026d3] p-[2.5px] active:scale-95 transition-transform"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={shownName} className="h-full w-full rounded-full object-cover object-top" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-[#1a1024] text-3xl font-black text-[#FF2D78]/70">
                  {shownName.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1024] ring-1 ring-[#FF2D78]/40">
              {uploadingAvatar ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ff6ba6]" />
              ) : (
                <Camera className="h-3.5 w-3.5 text-[#ff6ba6]" />
              )}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarUpload(e)}
            />
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{shownName}</h1>
              <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1', tierMeta.chip)}>
                <Crown className="h-2.5 w-2.5" /> {tierMeta.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/45 truncate">
              {user.email} · {formatCount(mem.credits_remaining)} {t('profile.creditsUnit')}
            </p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/70">
              {bio || (t('profile.bioPlaceholder'))}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTab('settings')}
                className="rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition-all"
              >
                {t('profile.editProfile')}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/u/${user.id}`)}
                className="glass rounded-full px-4 py-1.5 text-xs font-medium text-white/85 hover:text-white active:scale-95 transition-all"
              >
                {t('profile.myPage')}
              </button>
            </div>
          </div>
        </div>

        {/* Community stats */}
        <div className="mt-4 flex items-center gap-5 border-y border-white/[0.06] py-3 text-center">
          <div className="flex-1">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              <Heart className="h-3.5 w-3.5 text-[#FF6BA6]" />
              {formatCount(stats.fans)}
            </p>
            <p className="text-[11px] text-white/40">{t('profile.fans')}</p>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold tabular-nums">{formatCount(stats.following)}</p>
            <p className="text-[11px] text-white/40">{t('profile.following')}</p>
          </div>
          <div className="flex-1">
            <p className="text-base font-bold tabular-nums">{stats.published}</p>
            <p className="text-[11px] text-white/40">{t('profile.published')}</p>
          </div>
          <div className="flex-1">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              <Flame className="h-3.5 w-3.5 text-[#FF6BA6]" />
              {formatCount(stats.interaction)}
            </p>
            <p className="text-[11px] text-white/40">{t('profile.interactions')}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-2 flex items-center gap-1 border-b border-white/[0.08]">
          {([
            { key: 'assets', label: t('profile.assets') },
            { key: 'works', label: t('profile.works') },
            { key: 'settings', label: t('profile.settings') },
          ] as Array<{ key: Tab; label: string }>).map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors',
                tab === tb.key ? 'text-white' : 'text-[#8B8BA3] hover:text-white/80',
              )}
            >
              {tb.label}
              {tab === tb.key && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3]" />
              )}
            </button>
          ))}
        </div>

        {/* ═══════════ 资产 ═══════════ */}
        {tab === 'assets' && (
          <div className="space-y-5 pt-4">
            {/* 会员等级 + 积分 */}
            <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                {t('profile.vipMembership')}
              </h3>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#ffd700]/25 to-[#ff2e88]/25 border border-[#ffd700]/30 flex items-center justify-center shrink-0">
                  <Crown className={cn('h-5 w-5', isPaid ? 'text-amber-300' : 'text-white/50')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('font-bold', isPaid ? 'text-amber-300' : 'text-white/70')}>{tierMeta.label}</span>
                    {isPaid && mem.subscription_status === 'active' && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        {t('profile.active')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/40">
                    {isPaid
                      ? `${t('profile.expires')} ${formatExpiry(mem.subscription_end)} · ${
                          mem.billing_interval === 'year'
                            ? t('profile.yearly')
                            : t('profile.monthly')
                        }`
                      : t('profile.upgradeDesc')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="shrink-0 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition-all"
                >
                  {isPaid ? t('profile.manage') : t('profile.upgrade')}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex items-center gap-2.5">
                  <Coins className="h-5 w-5 text-amber-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-amber-300 tabular-nums leading-none">{mem.credits_remaining}</div>
                    <div className="mt-1 text-[10px] text-white/40">{t('profile.availableCredits')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/wallet')}
                    className="shrink-0 rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-black hover:bg-amber-400 active:scale-95 transition-all"
                  >
                    {t('profile.topUp')}
                  </button>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3 flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 text-cyan-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-cyan-200 tabular-nums leading-none">
                      {cardBalance ?? '--'}
                    </div>
                    <div className="mt-1 text-[10px] text-white/40">{t('profile.creationCards')}</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => router.push('/quest?tab=achievements')}
                className="mt-2.5 w-full h-10 rounded-xl border border-[#ffd700]/30 bg-[#ffd700]/[0.08] text-[#ffd700] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#ffd700]/[0.15] transition-all active:scale-[0.98]"
              >
                <Trophy className="h-4 w-4" />
                {t('profile.hallOfAchievements')}
                {unlocked !== null && (
                  <span className="rounded-full bg-[#ffd700]/20 px-1.5 py-0.5 text-[10px] tabular-nums">{unlocked}</span>
                )}
              </button>
            </section>

            {/* 伴侣 */}
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                  {t('profile.myCompanions')} · {friends.length}
                </h3>
                <button
                  type="button"
                  onClick={() => router.push('/explore')}
                  className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white transition-colors"
                >
                  <UserPlus className="h-3 w-3" />
                  {t('common.goExplore')}
                </button>
              </div>
              {friends.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-8 text-center">
                  <Users className="h-8 w-8 mx-auto text-white/15 mb-2" />
                  <p className="text-xs text-white/40 mb-3">
                    {t('profile.noCompanions')}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/explore')}
                    className="rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 py-2 text-xs font-semibold text-white active:scale-95 transition-all"
                  >
                    {t('common.goExplore')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  {friends.map((gf) => (
                    <button
                      key={gf.id}
                      type="button"
                      onClick={() => router.push(`/chats?friend=${encodeURIComponent(gf.id)}`)}
                      className="group relative overflow-hidden rounded-xl ring-1 ring-white/10 hover:ring-[#ff2e88]/45 transition-all active:scale-[0.98] text-left"
                    >
                      <div className="relative aspect-[2/3]">
                        {gf.portrait_url || gf.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(gf.portrait_url || gf.avatar_url) as string}
                            alt={gf.name}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FF2D78]/30 to-[#8b5cf6]/30">
                            <span className="text-xl font-black text-white/60">{gf.name.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-1.5">
                          <div className="text-[11px] font-bold truncate">{gf.name}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* 道具 */}
            <section>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                {t('profile.backpack')} · {backpack.length}
              </h3>
              {backpack.length === 0 ? (
                <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-8 text-center">
                  <Package className="h-8 w-8 mx-auto text-white/15 mb-2" />
                  <p className="text-xs text-white/40 mb-3">
                    {t('profile.backpackEmpty')}
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/shop')}
                    className="rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-4 py-2 text-xs font-semibold text-white active:scale-95 transition-all"
                  >
                    {t('common.goShop')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {backpack.map((item) => (
                    <div key={item.id} className="relative rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
                      <div className="absolute top-2 right-2 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-[#FF2D78] px-1.5 text-[10px] font-bold text-white">
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
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.product.preview_url} alt={item.product.name} className="w-full h-20 object-cover rounded-lg" />
                        ) : (
                          <div className="w-full h-20 rounded-lg bg-white/[0.04] flex items-center justify-center">
                            <Package className="h-7 w-7 text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">{item.product.name}</div>
                      <div className="mt-0.5 text-[10px] text-white/40 line-clamp-2 min-h-[28px]">{item.product.description}</div>
                      <button
                        type="button"
                        onClick={() => { setGiftingItem(item.product.id); setGiftTarget(''); }}
                        className="mt-2 w-full flex items-center justify-center gap-1 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-white/60 hover:text-white hover:bg-[#FF2D78]/20 hover:border-[#FF2D78]/40 transition-all"
                      >
                        <Gift className="h-3 w-3" /> {t('profile.gift')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ═══════════ 作品 ═══════════ */}
        {tab === 'works' && (
          <div className="pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] text-white/40">
                {t('profile.publishedStats', { published: String(stats.published), total: String(works.length) })}
              </p>
              <button
                type="button"
                onClick={() => router.push('/create')}
                className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-3.5 py-1.5 text-xs font-semibold text-white active:scale-95 transition-all"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('profile.createCompanion')}
              </button>
            </div>

            {works.length === 0 ? (
              <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-10 text-center">
                <Sparkles className="h-9 w-9 mx-auto text-white/15 mb-3" />
                <p className="text-sm text-white/40 mb-4">
                  {t('profile.noWorks')}
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/create')}
                  className="rounded-full bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-5 py-2 text-xs font-semibold text-white active:scale-95 transition-all"
                >
                  {t('profile.startCreating')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {works.map((w) => {
                  const status = STATUS_META[w.review_status || 'draft'] || STATUS_META.draft;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => router.push(`/chats?friend=${encodeURIComponent(w.id)}`)}
                      className="group relative overflow-hidden rounded-xl ring-1 ring-white/10 hover:ring-[#ff2e88]/45 transition-all active:scale-[0.98] text-left"
                    >
                      <div className="relative aspect-[2/3]">
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
                            <span className="text-2xl font-black text-white/60">{w.name.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                        <span className={cn('absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold ring-1', status.cls)}>
                          {t(`status.${w.review_status || 'draft'}` as TranslationKey)}
                        </span>
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <div className="text-xs font-bold truncate">{w.name}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-white/50 tabular-nums">
                            <Flame className="h-2.5 w-2.5 text-[#FF6BA6]" />
                            {t('profile.interactionPrefix')}{Number(w.interaction_count || 0)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ 设置 ═══════════ */}
        {tab === 'settings' && (
          <div className="space-y-5 pt-4">
            <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                {t('profile.personalProfile')}
              </h3>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs text-white/40">
                  <User className="h-3 w-3" /> {t('profile.displayName')}
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('profile.displayName')}
                  className="bg-white/5 border-white/10"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-white/40">
                  {t('profile.bio')}
                </label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  maxLength={120}
                  placeholder={t('profile.bioHint')}
                  className="bg-white/5 border-white/10 resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-white/40">
                  {t('profile.gender')}
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => setGender(g.value)}
                      className={cn(
                        'flex-1 h-10 rounded-xl text-sm font-medium border transition-all',
                        gender === g.value
                          ? 'bg-[#FF2D78]/20 border-[#FF2D78]/50 text-[#ff6ba6]'
                          : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white hover:border-white/20',
                      )}
                    >
                      {t(`gender.${g.value}` as TranslationKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-white/40">{t('profile.email')}</label>
                <Input value={user.email || ''} disabled className="bg-white/5 border-white/10 opacity-60" />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs text-white/40">
                  <Globe className="h-3 w-3" /> {t('profile.language')}
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
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rotate-90 text-white/30 pointer-events-none" />
                </div>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void saveProfile()}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t('profile.save')}
              </button>
            </section>

            {/* 会员信息（只读摘要） */}
            <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#FF6BA6]">
                {t('profile.subscription')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1">
                    <Calendar className="h-3 w-3" />
                    {t('profile.expires')}
                  </div>
                  <div className={cn('text-sm font-semibold', isExpired ? 'text-red-400' : 'text-white/90')}>
                    {formatExpiry(mem.subscription_end)}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-1">
                    <RefreshCw className="h-3 w-3" />
                    {t('profile.billing')}
                  </div>
                  <div className="text-sm font-semibold text-white/90">
                    {mem.billing_interval === 'year'
                      ? t('profile.yearly')
                      : mem.billing_interval === 'month'
                        ? t('profile.monthly')
                        : '--'}
                  </div>
                </div>
              </div>
            </section>

            {/* Danger zone */}
            <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-red-500/20 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-400" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-red-300">{t('profile.deleteTitle')}</div>
                  <div className="mt-0.5 text-xs text-white/40">{t('profile.deleteDesc')}</div>
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
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={!deleteConfirm || deleting}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('profile.deleteCta')}
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-white/[0.08] text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.04]"
              >
                <LogOut className="h-4 w-4" /> {t('profile.signOut')}
              </button>
            </section>
          </div>
        )}
      </div>

      {/* Gift dialog */}
      <Sheet open={!!giftingItem} onOpenChange={(open) => { if (!open) { setGiftingItem(null); setGiftTarget(''); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl bg-[#12121a] border-white/[0.08] max-h-[70vh]">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="flex items-center gap-2 text-base text-white">
              <Gift className="h-4 w-4 text-[#ff6ba6]" />
              {t('profile.giftChoose')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1.5">
            {friends.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/40">{t('profile.giftNone')}</div>
            ) : (
              friends.map((gf) => (
                <button
                  key={gf.id}
                  type="button"
                  onClick={() => setGiftTarget(gf.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl transition-all',
                    giftTarget === gf.id
                      ? 'bg-[#FF2D78]/20 border border-[#FF2D78]/50'
                      : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08]',
                  )}
                >
                  {gf.portrait_url || gf.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(gf.portrait_url || gf.avatar_url) as string}
                      alt={gf.name}
                      className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-white/10"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] flex items-center justify-center text-sm font-bold text-white">
                      {gf.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium truncate">{gf.name}</span>
                  {giftTarget === gf.id && <Check className="ml-auto h-4 w-4 shrink-0 text-[#ff6ba6]" />}
                </button>
              ))
            )}
          </div>

          <div className="p-5 pt-3">
            <button
              type="button"
              disabled={!giftTarget}
              onClick={() => { if (giftingItem) void handleGift(giftingItem); }}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 transition-all"
            >
              <Gift className="h-4 w-4" /> {t('profile.giftConfirm')}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
