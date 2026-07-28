'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Loader2, Plus, RefreshCw } from 'lucide-react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AdminSystemDefinition } from '@/lib/admin/systems';

type ControlSystem = AdminSystemDefinition & {
  status: 'ready' | 'degraded';
  metric: { total: number; secondary?: number; secondaryLabel?: string };
};

type ResponseBody = {
  systems?: ControlSystem[];
  summary?: { totalSystems: number; readySystems: number; attentionSystems: number };
  generatedAt?: string;
  error?: string;
};

export default function AdminControlCenterPage(): React.JSX.Element {
  const [data, setData] = useState<ResponseBody>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch('/api/admin/control-center');
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.systems) throw new Error(body.error || '无法读取系统状态');
      setData(body);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : '请求失败';
      logger.error('admin control center load failed', { error: message });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400">Control Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">后台系统总控</h1>
          <p className="mt-2 text-sm text-slate-400">查看网站与功能状态，统一进入管理和创建流程。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </header>

      {error ? (
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-rose-200">
            <CircleAlert className="h-5 w-5" /> {error}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Summary label="系统总数" value={data.summary?.totalSystems ?? 0} />
        <Summary label="运行正常" value={data.summary?.readySystems ?? 0} healthy />
        <Summary label="需要检查" value={data.summary?.attentionSystems ?? 0} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data.systems ?? []).map((system) => (
          <Card key={system.id} className="border-white/[0.08] bg-[#1a1a28]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{system.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{system.description}</p>
                </div>
                <Badge variant="outline" className={system.status === 'ready'
                  ? 'border-emerald-500/25 text-emerald-300'
                  : 'border-amber-500/25 text-amber-300'}>
                  {system.status === 'ready' ? '正常' : '检查'}
                </Badge>
              </div>
              <div className="my-5 flex items-end justify-between rounded-xl bg-black/15 p-3">
                <p className="text-2xl font-semibold text-white">{system.metric.total.toLocaleString()}</p>
                <p className="text-xs text-slate-500">
                  {system.metric.secondaryLabel}
                  {system.metric.secondary !== undefined ? ` ${system.metric.secondary}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={system.manageHref}>管理 <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                </Button>
                {system.createHref ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={system.createHref}><Plus className="mr-1.5 h-4 w-4" />新建</Link>
                  </Button>
                ) : null}
                {system.relatedHrefs.map((item) => (
                  <Button key={item.href} asChild size="sm" variant="ghost">
                    <Link href={item.href}>{item.label}</Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

function Summary({ label, value, healthy = false }: { label: string; value: number; healthy?: boolean }): React.JSX.Element {
  return (
    <Card className="border-white/[0.08] bg-[#16161f]">
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></div>
        {healthy ? <CircleCheck className="h-5 w-5 text-emerald-300" /> : <CircleAlert className="h-5 w-5 text-purple-300" />}
      </CardContent>
    </Card>
  );
}
