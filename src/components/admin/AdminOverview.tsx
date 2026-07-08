'use client';

import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Users, MessageCircle, Coins, ShoppingBag, TrendingUp, Activity } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalGirlfriends: number;
  totalMessages: number;
  totalRevenue: number;
  activeToday: number;
  newUsersToday: number;
}

export default function AdminOverview() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await authedFetch('/api/admin/dashboard');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {}
    setLoading(false);
  };

  const cards = [
    { label: 'Total Users', value: stats?.totalUsers ?? '-', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Girlfriends', value: stats?.totalGirlfriends ?? '-', icon: Heart, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { label: 'Messages', value: stats?.totalMessages ?? '-', icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Revenue', value: stats?.totalRevenue ? `$${stats.totalRevenue}` : '-', icon: Coins, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Active Today', value: stats?.activeToday ?? '-', icon: Activity, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'New Today', value: stats?.newUsersToday ?? '-', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dashboard Overview</h2>
          <p className="text-sm text-[#8B8BA3] mt-0.5">Real-time platform metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-white/[0.06]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? '...' : card.value}</p>
                  <p className="text-xs text-[#8B8BA3]">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/admin/girlfriends')}>
              Manage Girlfriends
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/admin/shop')}>
              Manage Shop Items
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/admin/models')}>
              Model Config
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Need this import
import { Heart } from 'lucide-react';