'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckSquare,
  Coins,
  Crown,
  DollarSign,
  Heart,
  Image,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';

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
  revenue7dCents: number;
  newUsers7d: number;
  images7d: number;
  failedPayments7d: number;
  tokenLiability: number;
  aiCost7dCents: number;
  llmSuccessRate7d: number;
  cacheHitRate: number;
};

type RecentUser = {
  id: string;
  display_name: string | null;
  membership_tier: string;
  created_at: string;
};

type DashboardResponse = {
  stats?: DashboardStats;
  recentUsers?: RecentUser[];
  generatedAt?: string;
  error?: string;
};

const money = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const integer = (value: number): string => new Intl.NumberFormat('en-US').format(value);

export default function AdminDashboard(): React.JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch('/api/admin/dashboard');
      const payload = (await response.json()) as DashboardResponse;
      if (!response.ok || !payload.stats) {
        throw new Error(payload.error || 'Dashboard metrics are unavailable.');
      }
      setStats(payload.stats);
      setRecentUsers(payload.recentUsers || []);
      setGeneratedAt(payload.generatedAt || null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Dashboard request failed.';
      logger.error('admin dashboard fetch failed', { error: message });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-lg border-rose-500/30 bg-rose-500/5">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertTriangle className="mx-auto h-9 w-9 text-rose-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">仪表盘不可用</h1>
              <p className="mt-1 text-sm text-slate-400">{error}</p>
            </div>
            <Button onClick={() => void loadDashboard()} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" /> 重试
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryCards = [
    {
      label: '月经常性收入',
      value: money(stats?.mrr_cents || 0),
      detail: `近7日 ${money(stats?.revenue7dCents || 0)}`,
      icon: DollarSign,
      tone: 'text-emerald-300 bg-emerald-400/10',
    },
    {
      label: '付费会员',
      value: integer(stats?.paidMembers || 0),
      detail: `${stats?.proMembers || 0} Pro · ${stats?.unlimitedMembers || 0} Unlimited`,
      icon: Crown,
      tone: 'text-amber-300 bg-amber-400/10',
    },
    {
      label: '日活跃用户',
      value: integer(stats?.dau || 0),
      detail: `周活跃 ${integer(stats?.wau || 0)}`,
      icon: Activity,
      tone: 'text-cyan-300 bg-cyan-400/10',
    },
    {
      label: '总用户数',
      value: integer(stats?.totalUsers || 0),
      detail: `近7日 +${integer(stats?.newUsers7d || 0)}`,
      icon: Users,
      tone: 'text-purple-300 bg-purple-400/10',
    },
  ];

  const operatingCards = [
    { label: '累计收入', value: money(stats?.totalPaidCents || 0), icon: TrendingUp },
    { label: '7日生成图片', value: integer(stats?.images7d || 0), icon: Image },
    { label: '待审核', value: integer(stats?.pendingReview || 0), icon: CheckSquare },
    { label: '7日支付失败', value: integer(stats?.failedPayments7d || 0), icon: AlertTriangle },
    { label: 'Token 负债', value: integer(stats?.tokenLiability || 0), icon: Coins },
    { label: '7日AI成本', value: money(stats?.aiCost7dCents || 0), icon: Sparkles },
    { label: '7日LLM成功率', value: `${((stats?.llmSuccessRate7d || 0) * 100).toFixed(1)}%`, icon: Activity },
    { label: '生成缓存复用率', value: `${((stats?.cacheHitRate || 0) * 100).toFixed(1)}%`, icon: RefreshCw },
  ];

  const quickActions = [
    { label: '审核队列', href: '/admin/review', icon: CheckSquare },
    { label: '用户管理', href: '/admin/users', icon: Users },
    { label: '女友与媒体', href: '/admin/girlfriends', icon: Heart },
    { label: '创作工作台', href: '/admin/studio', icon: Sparkles },
    { label: '商城管理', href: '/admin/shop', icon: Crown },
    { label: 'Token 经济', href: '/admin/tokens', icon: Coins },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-400">运营总览</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">运营仪表盘</h1>
          <p className="mt-1 text-sm text-slate-400">
            收入、用户活跃、内容供给与支付健康度一览
          </p>
        </div>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="hidden text-xs text-slate-500 md:inline">
              更新于 {new Date(generatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button onClick={() => void loadDashboard()} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryCards.map((card) => (
          <Card key={card.label} className="border-white/[0.08] bg-[#1a1a28] shadow-xl shadow-black/10">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-400">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{card.value}</p>
                  <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${card.tone}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {operatingCards.map((card) => (
          <Card key={card.label} className="border-white/[0.08] bg-[#16161f]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-slate-400">
                <card.icon className="h-4 w-4 text-purple-400" />
                <span className="text-[11px] font-medium">{card.label}</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/[0.08] bg-[#1a1a28]">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white">快捷操作</h2>
                <p className="mt-0.5 text-xs text-slate-500">高频管理入口</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#16161f] p-3 text-sm text-slate-200 transition hover:border-purple-400/30 hover:bg-purple-400/5"
                >
                  <span className="rounded-lg bg-purple-400/10 p-2 text-purple-400">
                    <action.icon className="h-4 w-4" />
                  </span>
                  {action.label}
                  <ArrowUpRight className="ml-auto h-4 w-4 text-slate-600 transition group-hover:text-purple-400" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.08] bg-[#1a1a28]">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-purple-400" />
              <div>
                <h2 className="font-semibold text-white">最近注册</h2>
                <p className="text-xs text-slate-500">最新5个注册用户</p>
              </div>
            </div>
            {recentUsers.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">暂无用户</p>
            ) : (
              <div className="divide-y divide-white/5">
                {recentUsers.map((recentUser) => (
                  <div key={recentUser.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {recentUser.display_name || recentUser.id.slice(0, 8)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(recentUser.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        recentUser.membership_tier === 'free'
                          ? 'border-white/10 text-slate-400'
                          : 'border-purple-400/30 bg-purple-400/10 text-purple-300'
                      }
                    >
                      {recentUser.membership_tier === 'free' ? 'Free' : recentUser.membership_tier}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
