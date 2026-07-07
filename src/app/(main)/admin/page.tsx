'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  Loader2, Users, Heart, Image, CheckSquare, TrendingUp, ArrowUpRight,
  ShoppingBag, DollarSign, Crown, Activity, UserCheck,
} from 'lucide-react';

type DashboardStats = {
  totalUsers: number;
  totalGirlfriends: number;
  publicGirlfriends: number;
  pendingReview: number;
  activeAds: number;
  dau: number;
  wau: number;
  mrr_cents: number;
  proMembers: number;
  unlimitedMembers: number;
  paidMembers: number;
  totalPaidCents: number;
  newUsers7d: number;
  images7d: number;
  cacheHitRate: number;
};

type RecentUser = {
  id: string;
  display_name: string | null;
  membership_tier: string;
  created_at: string;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch('/api/admin/dashboard')
      .then(r => r.json())
      .then(data => {
        if (data.stats) setStats(data.stats);
        if (data.recentUsers) setRecentUsers(data.recentUsers);
      })
      .catch((err) => logger.error('admin dashboard fetch failed', { err }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  const primaryCards = [
    { label: '总会员', value: stats?.totalUsers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: '付费会员', value: stats?.paidMembers ?? 0, icon: Crown, color: 'text-amber-500', bg: 'bg-amber-500/10',
      sub: `Pro: ${stats?.proMembers ?? 0} / Unlimited: ${stats?.unlimitedMembers ?? 0}` },
    { label: '付费总金额', value: `$${((stats?.totalPaidCents ?? 0) / 100).toFixed(2)}`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10',
      sub: `月营收: $${((stats?.mrr_cents ?? 0) / 100).toFixed(2)}` },
    { label: '女友总数', value: stats?.totalGirlfriends ?? 0, icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10',
      sub: `公开: ${stats?.publicGirlfriends ?? 0}` },
  ];

  const secondaryCards = [
    { label: '日活用户 (DAU)', value: stats?.dau ?? 0, icon: Activity, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { label: '周活用户 (WAU)', value: stats?.wau ?? 0, icon: UserCheck, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: '待审核', value: stats?.pendingReview ?? 0, icon: CheckSquare, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: '7日新增用户', value: stats?.newUsers7d ?? 0, icon: TrendingUp, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1E293B]">仪表盘</h1>
        <p className="text-sm text-[#64748B] mt-1">数据概览与快捷操作</p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {primaryCards.map((card) => (
          <Card key={card.label} className="border-[#E2E8F0] bg-white">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#64748B] mb-1">{card.label}</p>
                  <p className="text-3xl font-bold text-[#1E293B]">{card.value}</p>
                  {card.sub && <p className="text-[11px] text-[#94A3B8] mt-1">{card.sub}</p>}
                </div>
                <div className={`${card.bg} p-3 rounded-xl`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {secondaryCards.map((card) => (
          <Card key={card.label} className="border-[#E2E8F0] bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                <span className="text-[11px] text-[#64748B]">{card.label}</span>
              </div>
              <p className="text-xl font-bold text-[#1E293B]">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-[#E2E8F0] bg-white">
          <CardContent className="p-5">
            <h2 className="font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#2563EB]" />
              快捷操作
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '用户管理', href: '/admin/users', icon: Users },
                { label: '审核管理', href: '/admin/review', icon: CheckSquare },
                { label: '女友管理', href: '/admin/girlfriends', icon: Heart },
                { label: '图片管理', href: '/admin/images', icon: Image },
                { label: '商城管理', href: '/admin/shop', icon: ShoppingBag },
                { label: 'AI 模型', href: '/admin/models', icon: Activity },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => router.push(action.href)}
                  className="flex items-center gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#334155] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] transition-colors text-left"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]/10">
                    <action.icon className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <span>{action.label}</span>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[#94A3B8]" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] bg-white">
          <CardContent className="p-5">
            <h2 className="font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#2563EB]" />
              最近注册用户
            </h2>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-[#94A3B8] text-center py-8">暂无用户</p>
            ) : (
              <div className="space-y-3">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-[#334155]">{u.display_name || u.id.slice(0, 8)}</p>
                      <p className="text-xs text-[#94A3B8]">{new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <Badge
                      variant={u.membership_tier === 'unlimited' ? 'default' : u.membership_tier === 'pro' ? 'default' : 'outline'}
                      className={`text-[10px] ${
                        u.membership_tier === 'unlimited' ? 'bg-amber-500 hover:bg-amber-600' :
                        u.membership_tier === 'pro' ? 'bg-blue-500 hover:bg-blue-600' : ''
                      }`}
                    >
                      {u.membership_tier === 'pro' ? 'Pro' : u.membership_tier === 'unlimited' ? 'Unlimited' : '免费'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
