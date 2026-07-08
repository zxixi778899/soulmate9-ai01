'use client';
import { useTranslation } from '@/lib/i18n/context';

import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Heart, Crown, MessageCircle, Users, Activity, LogOut, Star,
  ShoppingBag, Shirt, Zap, Settings, Package, CreditCard, Gem,
  Sparkles, Loader2, Check, User as UserIcon, Trophy
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, XCircle, CheckCircle, Info, ExternalLink } from 'lucide-react';

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
  category?: string;
  equipped: boolean;
  expires_at?: string;
  girlfriend_id?: string;
}

type Tab = 'dashboard' | 'assets' | 'settings';

const TIER_META: Record<string, { label: string; color: string; icon: any }> = {
  free: { label: 'Free', color: 'text-[#8B8BA3]', icon: Heart },
  pro: { label: 'Pro', color: 'text-purple-400', icon: Crown },
  unlimited: { label: 'Unlimited', color: 'text-amber-400', icon: Star },
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
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      authedFetch('/api/membership').then(r => r.json()),
      authedFetch('/api/wardrobe').then(r => r.json()).catch(() => ({ items: [] })),
    ]).then(([memData, wardrobeData]) => {
      if (memData.usage) {
        setStats({
          girlfriendCount: memData.usage.total_girlfriends || 0,
          messagesToday: memData.usage.messages_sent_today || 0,
          avgIntimacy: memData.usage.highest_intimacy || 0,
        });
      }
      setMembershipTier(memData.tier || 'free');
      setCredits(memData.credits_remaining || 0);

      // Map wardrobe assets
      const items: AssetItem[] = [
        ...((wardrobeData.items || []) as any[]).map((w: any) => ({
          id: w.id,
          type: 'outfit' as const,
          name: w.outfit?.name || w.outfit_name || 'Outfit',
          icon: w.outfit?.emoji || w.outfit_emoji || '',
          tier: w.outfit?.tier || w.tier || 'free',
          equipped: w.is_equipped || false,
          girlfriend_id: w.girlfriend_id,
        })),
      ];
      setAssets(items);
    }).catch(() => {}).finally(() => setLoading(false));

    // Load notifications
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await authedFetch('/api/notifications');
      const data = await res.json();
      if (data.notifications) setNotifications(data.notifications);
    } catch {} finally {
      setNotifLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await authedFetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const res = await authedFetch('/api/membership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (res.ok) toast.success('Display name updated');
      else toast.error('Failed to update');
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  };

  const currentTier = TIER_META[membershipTier] || TIER_META.free;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: Activity },
    { key: 'assets', label: 'Assets', icon: Package },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-lg md:text-xl font-bold italic">Profile</h1>
            <p className="text-xs text-[#8B8BA3]">Manage your account, membership &amp; assets</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/[0.05] bg-white/[0.03]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-[#8B8BA3] hover:text-white'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* User info card - always shown */}
          <Card className="border-white/[0.06]">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/20">
                  <AvatarFallback className="bg-[#FF2D78]/10 text-[#FF2D78] text-lg">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold">{user?.email}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      membershipTier === 'pro' ? 'bg-purple-500/10 text-purple-400' :
                      membershipTier === 'unlimited' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-white/[0.04] text-[#8B8BA3]'
                    }`}>
                      <currentTier.icon className="h-3 w-3" />
                      {currentTier.label}
                    </span>
                    <span className="text-xs text-[#8B8BA3]">
                      {credits > 0 && `${credits} credits`}
                    </span>
                    <span className="text-xs text-[#8B8BA3]">
                      Joined {new Date(user?.created_at || '').toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tab content */}
          {activeTab === 'dashboard' && (
            <>
              {/* Stats */}
              <Card className="border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Dashboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="grid grid-cols-3 gap-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="h-20 rounded-lg bg-white/[0.04] animate-pulse" />
                      ))}
                    </div>
                  ) : stats ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-[#FF2D78]/5 border border-[#FF2D78]/10 text-center">
                        <Users className="h-4 w-4 mx-auto text-primary mb-1" />
                        <p className="text-lg font-bold">{stats.girlfriendCount}</p>
                        <p className="text-[10px] text-[#8B8BA3]">Girlfriends</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#FF2D78]/5 border border-[#FF2D78]/10 text-center">
                        <MessageCircle className="h-4 w-4 mx-auto text-primary mb-1" />
                        <p className="text-lg font-bold">{stats.messagesToday}</p>
                        <p className="text-[10px] text-[#8B8BA3]">Msgs Today</p>
                      </div>
                      <div className="p-3 rounded-lg bg-[#FF2D78]/5 border border-[#FF2D78]/10 text-center">
                        <Heart className="h-4 w-4 mx-auto text-primary mb-1" />
                        <p className="text-lg font-bold">{stats.avgIntimacy.toFixed(1)}</p>
                        <p className="text-[10px] text-[#8B8BA3]">Avg Intimacy</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8B8BA3] text-center py-4">Unable to load stats</p>
                  )}
                </CardContent>
              </Card>

              {/* Membership plans */}
              <Card className="border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" />
                    Membership
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`p-4 rounded-lg border text-center ${
                      membershipTier === 'free' ? 'border-[#FF2D78]/30 bg-[#FF2D78]/5' : 'border-white/[0.06] bg-white/[0.04]'
                    }`}>
                      <p className="text-xs text-[#8B8BA3]">Free</p>
                      <p className="text-lg font-bold">$0</p>
                      <p className="text-[10px] text-[#8B8BA3] mt-1">50 msgs/day</p>
                      <Button variant={membershipTier === 'free' ? 'outline' : 'ghost'} size="sm" className="w-full mt-3 h-8 text-xs" disabled={membershipTier === 'free'}>
                        {membershipTier === 'free' ? 'Current' : 'Downgrade'}
                      </Button>
                    </div>
                    <div className={`p-4 rounded-lg border text-center ${
                      membershipTier === 'pro' ? 'border-[#FF2D78]/30 bg-[#FF2D78]/5' : 'border-white/[0.06] bg-white/[0.04]'
                    }`}>
                      <p className="text-xs font-medium text-purple-400">Pro</p>
                      <p className="text-lg font-bold">$19.99</p>
                      <p className="text-[10px] text-[#8B8BA3] mt-1">Unlimited msgs</p>
                      <Button
                        size="sm"
                        className={`w-full mt-3 h-8 text-xs ${
                          membershipTier === 'pro' ? '' : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white'
                        }`}
                        variant={membershipTier === 'pro' ? 'outline' : 'default'}
                        disabled={membershipTier === 'pro'}
                        onClick={() => membershipTier !== 'pro' && router.push('/pricing')}
                      >
                        {membershipTier === 'pro' ? 'Current' : 'Upgrade'}
                      </Button>
                    </div>
                    <div className={`p-4 rounded-lg border text-center ${
                      membershipTier === 'unlimited' ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/[0.06] bg-white/[0.04]'
                    }`}>
                      <p className="text-xs text-amber-400">Unlimited</p>
                      <p className="text-lg font-bold">$39.99</p>
                      <p className="text-[10px] text-[#8B8BA3] mt-1">Everything</p>
                      <Button
                        size="sm"
                        className="w-full mt-3 h-8 text-xs"
                        variant={membershipTier === 'unlimited' ? 'outline' : 'ghost'}
                        disabled={membershipTier === 'unlimited'}
                        onClick={() => membershipTier !== 'unlimited' && router.push('/pricing')}
                      >
                        {membershipTier === 'unlimited' ? 'Current' : 'Upgrade'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Prize Progress - Awards Tracker */}
              <Card className="border-white/[0.06] bg-gradient-to-br from-amber-500/[0.03] to-amber-500/[0.01]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-400" />
                    Prize Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Prize tiers */}
                  <div className="space-y-2">
                    {[
                      { tier: 'Gold', reward: 'iPhone 16 Pro Max', target: '$5,000', icon: '📱', color: 'from-amber-400 to-yellow-500', bg: 'bg-amber-500/5 border-amber-500/20' },
                      { tier: 'Silver', reward: 'AirPods Pro 2', target: '$2,500', icon: '🎧', color: 'from-slate-300 to-slate-400', bg: 'bg-slate-400/5 border-slate-400/20' },
                      { tier: 'Bronze', reward: '$100 App Store Gift', target: '$500', icon: '🎁', color: 'from-amber-600 to-amber-700', bg: 'bg-amber-600/5 border-amber-600/20' },
                    ].map((prize) => {
                      const percent = Math.min(100, Math.round((0 / parseFloat(prize.target.replace('$','').replace(',',''))) * 100));
                      return (
                        <div key={prize.tier} className={`p-3 rounded-xl border ${prize.bg}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{prize.icon}</span>
                              <div>
                                <p className="text-xs font-semibold text-[#F0F0F5]">{prize.reward}</p>
                                <p className="text-[10px] text-[#8B8BA3]">{prize.tier} Tier · Spend {prize.target}</p>
                              </div>
                            </div>
                            <span className="text-[10px] text-[#8B8BA3]">0%</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${prize.color} rounded-full`} style={{ width: '2%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1.5 border-amber-500/20 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => router.push('/achievements')}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    View All Achievements
                  </Button>
                </CardContent>
              </Card>

              {/* Notifications */}
              <Card className="border-white/[0.06]">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Notifications
                    {notifications.filter(n => !n.is_read).length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF2D78] text-white">
                        {notifications.filter(n => !n.is_read).length} new
                      </span>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-[#8B8BA3]" onClick={loadNotifications}>
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {notifLoading ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-pulse" />)}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="text-center py-8">
                      <Bell className="h-6 w-6 mx-auto text-[#8B8BA3]/50 mb-2" />
                      <p className="text-xs text-[#8B8BA3]">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {notifications.map(n => (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            n.is_read ? 'bg-white/[0.03]' : 'bg-[#FF2D78]/5 border border-[#FF2D78]/10'
                          }`}
                          onClick={() => { markAsRead(n.id); if (n.link_url) window.open(n.link_url, '_blank'); }}
                        >
                          <div className="mt-0.5">
                            {n.type === 'payment' ? <CheckCircle className="h-4 w-4 text-green-400" /> :
                             n.type === 'warning' ? <XCircle className="h-4 w-4 text-destructive" /> :
                             <Info className="h-4 w-4 text-blue-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${n.is_read ? 'text-[#8B8BA3]' : 'text-white'}`}>
                              {n.title}
                            </p>
                            <p className="text-[11px] text-[#8B8BA3] mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[9px] text-[#8B8BA3]/50 mt-1">
                              {new Date(n.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {n.link_url && (
                            <ExternalLink className="h-3 w-3 text-[#8B8BA3]/50 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Assets Tab */}
          {activeTab === 'assets' && (
            <Card className="border-white/[0.06]">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  Asset Pack
                  <span className="text-[10px] text-[#8B8BA3] ml-auto">{assets.length} items</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="grid grid-cols-3 gap-3">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="h-24 rounded-lg bg-white/[0.04] animate-pulse" />
                    ))}
                  </div>
                ) : assets.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto mb-3">
                      <ShoppingBag className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-sm font-medium">No items yet</p>
                    <p className="text-xs text-[#8B8BA3] mt-1">Purchase outfits, boosters &amp; more from the Shop</p>
                    <Button size="sm" className="mt-4" onClick={() => router.push('/shop')}>
                      <ShoppingBag className="h-3.5 w-3.5 mr-1" /> Browse Shop
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Credits */}
                    <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <div className="flex items-center gap-2">
                        <Gem className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-medium">Credits</span>
                      </div>
                      <span className="text-sm font-bold text-amber-400">{credits.toLocaleString()}</span>
                    </div>

                    {/* Outfits */}
                    {assets.filter(a => a.type === 'outfit').length > 0 && (
                      <>
                        <h3 className="text-xs font-semibold text-[#8B8BA3] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Shirt className="h-3.5 w-3.5" /> Outfits
                        </h3>
                        <div className="grid grid-cols-3 gap-3 mb-6">
                          {assets.filter(a => a.type === 'outfit').map(item => (
                            <div key={item.id} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.04] text-center">
                              <span className="text-2xl">{item.icon}</span>
                              <p className="text-[10px] font-medium mt-1 truncate">{item.name}</p>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                item.tier === 'free' ? 'bg-white/[0.04] text-[#8B8BA3]' :
                                item.tier === 'premium' ? 'bg-purple-500/10 text-purple-400' :
                                'bg-amber-500/10 text-amber-400'
                              }`}>
                                {item.tier}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Active Items */}
                    {assets.filter(a => a.type !== 'outfit').length > 0 && (
                      <>
                        <h3 className="text-xs font-semibold text-[#8B8BA3] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Zap className="h-3.5 w-3.5" /> Active Boosters
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {assets.filter(a => a.type !== 'outfit').map(item => (
                            <div key={item.id} className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 text-center">
                              <span className="text-2xl">{item.icon}</span>
                              <p className="text-[10px] font-medium mt-1">{item.name}</p>
                              {item.expires_at && (
                                <p className="text-[9px] text-[#8B8BA3] mt-0.5">
                                  Expires: {new Date(item.expires_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <>
              <Card className="border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-primary" />
                    Profile Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-[#8B8BA3]">Display Name</label>
                    <div className="flex gap-2">
                      <Input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        placeholder="Enter your display name"
                        className="flex-1 h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-9"
                        onClick={handleSaveName}
                        disabled={saving || !displayName.trim()}
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-[#8B8BA3]">Email</label>
                    <Input value={user?.email || ''} disabled className="h-9 text-sm text-[#8B8BA3]" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-[#8B8BA3]">Member Since</label>
                    <Input value={new Date(user?.created_at || '').toLocaleDateString()} disabled className="h-9 text-sm text-[#8B8BA3]" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Billing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => router.push('/pricing')}>
                    <Crown className="h-4 w-4 text-amber-500" />
                    Manage Subscription
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-10 text-sm" onClick={() => router.push('/shop')}>
                    <ShoppingBag className="h-4 w-4 text-primary" />
                    Buy Credits
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-white/[0.06]">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <LogOut className="h-4 w-4 text-destructive" />
                    Account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" className="w-full justify-start gap-3 h-10 text-sm text-destructive hover:text-destructive" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}