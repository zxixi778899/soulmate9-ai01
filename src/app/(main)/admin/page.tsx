'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { authedFetch } from '@/lib/supabase';
import { Loader2, Users, Heart, Image, CheckSquare, CreditCard, TrendingUp, ArrowUpRight, ShoppingBag } from 'lucide-react';

type DashboardStats = {
  totalUsers: number;
  totalGirlfriends: number;
  publicGirlfriends: number;
  pendingReview: number;
  activeAds: number;
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
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  const statCards = [
    { label: '总用户数', value: stats?.totalUsers ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: '女友总数', value: stats?.totalGirlfriends ?? 0, icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: '待审核', value: stats?.pendingReview ?? 0, icon: CheckSquare, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: '活跃广告', value: stats?.activeAds ?? 0, icon: Image, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">控制台</h1>
        <p className="text-sm text-[#8B8BA3] mt-1">管理员概览 & 系统状态</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Card key={card.label} className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#8B8BA3] mb-1">{card.label}</p>
                  <p className="text-3xl font-bold">{card.value}</p>
                </div>
                <div className={`${card.bg} p-3 rounded-xl`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions + Recent Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
          <CardContent className="p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#FF2D78]" />
              快捷操作
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '用户管理', href: '/admin/users', icon: Users },
                { label: '内容审核', href: '/admin/review', icon: CheckSquare },
                { label: '广告管理', href: '/admin/ads', icon: Image },
                { label: '女友管理', href: '/admin/girlfriends', icon: Heart },
                { label: '商城管理', href: '/admin/shop', icon: ShoppingBag },
                { label: '页面管理', href: '/admin/pages', icon: LayoutTemplate },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => router.push(action.href)}
                  className="flex items-center gap-3 rounded-lg border border-border/20 bg-muted/10 p-3 text-sm hover:bg-muted/20 transition-colors text-left"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF2D78]/10">
                    <action.icon className="h-4 w-4 text-[#FF2D78]" />
                  </div>
                  <span>{action.label}</span>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[#8B8BA3]" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
          <CardContent className="p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#FF2D78]" />
              最近注册
            </h2>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-[#8B8BA3] text-center py-8">暂无用户</p>
            ) : (
              <div className="space-y-3">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium">{u.display_name || '匿名用户'}</p>
                      <p className="text-xs text-[#8B8BA3]">{new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <Badge variant={u.membership_tier === 'unlimited' ? 'default' : 'outline'} className="text-[10px]">
                      {u.membership_tier}
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

function LayoutTemplate(props: React.SVGProps<SVGSVGElement>) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>; }