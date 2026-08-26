'use client';

import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface CacheMetricsData {
  today: any[];
  health: {
    activeEntries: number;
    expiredEntries: number;
    totalEntries: number;
    avgHitRateToday: number;
    healthScore: number;
  };
  topPrompts: any[];
  cpuSaved: { estimatedSeconds: number; estimatedCostUSD: number };
  updatedAt: string;
}

export function CacheMetricsDashboard({ refreshInterval = 30000 }: { refreshInterval?: number }) {
  const [data, setData] = useState<CacheMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  async function fetchMetrics() {
    try {
      setLoading(true);
      const res = await fetch('/api/metrics/cache-stats');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.data || json);
    } catch (err) {
      console.error('[dashboard] fetch failed', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }

  if (loading || !data) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading metrics...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5" />
          Cache Performance Dashboard
        </h2>
        <span className="text-xs text-muted-foreground">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Entries</div>
          <div className="text-2xl font-bold">{data.health.activeEntries.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Health Score</div>
          <div className={`text-2xl font-bold ${data.health.healthScore >= 70 ? 'text-green-500' : data.health.healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
            {data.health.healthScore}/100
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">CPU Saved</div>
          <div className="text-2xl font-bold text-blue-500">
            {(data.cpuSaved.estimatedSeconds / 3600).toFixed(1)} hours
          </div>
        </Card>
      </div>
    </div>
  );
}
