'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, MessageCircle, Coins, ShoppingBag, TrendingUp, Activity, Image as ImageIcon, Sparkles } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalGirlfriends: number;
  totalMessages: number;
  totalRevenue: number;
  activeToday: number;
  newUsersToday: number;
  imagesGenerated: number;
  totalRevenue30d: { date: string; amount: number }[];
}

const STAT_CARDS = [
  { key: 'totalUsers', label: '总用户', icon: Users, accent: 'from-blue-500/30 to-cyan-500/10', iconColor: 'text-blue-300' },
  { key: 'totalGirlfriends', label: 'AI 伴侣', icon: Sparkles, accent: 'from-pink-500/30 to-rose-500/10', iconColor: 'text-pink-300' },
  { key: 'totalMessages', label: '消息数', icon: MessageCircle, accent: 'from-violet-500/30 to-purple-500/10', iconColor: 'text-violet-300' },
  { key: 'imagesGenerated', label: '生图数', icon: ImageIcon, accent: 'from-amber-500/30 to-orange-500/10', iconColor: 'text-amber-300' },
  { key: 'activeToday', label: '今日活跃', icon: Activity, accent: 'from-emerald-500/30 to-green-500/10', iconColor: 'text-emerald-300' },
  { key: 'totalRevenue', label: '总收入', icon: Coins, accent: 'from-yellow-500/30 to-amber-500/10', iconColor: 'text-yellow-300', prefix: '$' },
];

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.ok) setStats(await res.json());
    } catch {}
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-white/50">实时平台数据 · 刚刚更新</p>
        </div>
        <div className="flex h-9 items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 backdrop-blur-xl">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="text-xs font-medium text-emerald-300">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className={`group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br ${card.accent} backdrop-blur-2xl p-5 transition-all hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(255,45,120,0.08)]`}
          >
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-white/[0.04] blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/50">{card.label}</p>
                <p className="mt-3 font-display text-3xl font-bold text-white tabular-nums">
                  {loading ? '—' : (
                    <>
                      {card.prefix}
                      {(() => {
                        const v = (stats as any)?.[card.key] ?? 0;
                        return typeof v === 'number' ? v.toLocaleString() : v;
                      })()}
                    </>
                  )}
                </p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] ${card.iconColor}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">最近 30 天营收</h2>
            <p className="text-xs text-white/40 mt-0.5">按日统计</p>
          </div>
          <span className="text-xs text-white/40">$ USD</span>
        </div>
        <RevenueChart data={stats?.totalRevenue30d || []} loading={loading} />
      </div>
    </div>
  );
}

function RevenueChart({ data, loading }: { data: { date: string; amount: number }[]; loading: boolean }) {
  if (loading) {
    return <div className="h-48 flex items-center justify-center text-sm text-white/40">Loading...</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center rounded-2xl border border-dashed border-white/[0.08] text-sm text-white/40">
        暂无营收数据
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <div className="flex items-end gap-1.5 h-48">
      {data.map((d, i) => {
        const h = (d.amount / max) * 100;
        return (
          <div
            key={d.date + i}
            className="group relative flex-1 min-w-[6px] rounded-t-lg bg-gradient-to-t from-[#FF2D78]/60 to-[#A855F7]/60 hover:from-[#FF2D78] hover:to-[#A855F7] transition-all cursor-pointer"
            style={{ height: `${h}%`, minHeight: '4px' }}
            title={`${d.date}: $${d.amount.toFixed(2)}`}
          />
        );
      })}
    </div>
  );
}