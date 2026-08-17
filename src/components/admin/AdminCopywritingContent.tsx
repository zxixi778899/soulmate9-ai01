'use client';

/**
 * 文案管理
 * 集中管理首页关键文案（Hero 标题/副标题、各板块标题等）。
 * 保存后立即生效（无需部署）；清空即恢复内置多语言默认文案。
 */

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, RotateCcw, Type } from 'lucide-react';
import { toast } from 'sonner';
import { invalidateSettingsCache } from '@/hooks/useSiteSettings';
import type { CopyKey, SiteCopy } from '@/lib/copy-store';

interface CopyMeta {
  label: string;
  i18nKey: string;
}

export default function AdminCopywritingContent() {
  const [keys, setKeys] = useState<CopyKey[]>([]);
  const [meta, setMeta] = useState<Record<string, CopyMeta>>({});
  const [saved, setSaved] = useState<SiteCopy>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/copy');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      const copy = (data.copy || {}) as SiteCopy;
      setKeys((data.keys || []) as CopyKey[]);
      setMeta((data.meta || {}) as Record<string, CopyMeta>);
      setSaved(copy);
      const nextDrafts: Record<string, string> = {};
      for (const key of (data.keys || []) as CopyKey[]) {
        nextDrafts[key] = copy[key] || '';
      }
      setDrafts(nextDrafts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveOne = useCallback(
    async (key: CopyKey) => {
      setSavingKey(key);
      try {
        const value = (drafts[key] || '').trim();
        const res = await authedFetch('/api/admin/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '保存失败');
        setSaved((data.copy || {}) as SiteCopy);
        invalidateSettingsCache();
        toast.success(value ? '已保存，前台即时生效' : '已恢复默认文案');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSavingKey(null);
      }
    },
    [drafts],
  );

  const restoreDefault = useCallback(
    async (key: CopyKey) => {
      setSavingKey(key);
      try {
        const res = await authedFetch(`/api/admin/copy?key=${key}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '恢复失败');
        setSaved((data.copy || {}) as SiteCopy);
        setDrafts((prev) => ({ ...prev, [key]: '' }));
        invalidateSettingsCache();
        toast.success('已恢复默认文案');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '恢复失败');
      } finally {
        setSavingKey(null);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">文案管理</h1>
        <p className="mt-1 text-sm text-slate-400">
          修改首页关键文案，保存后立即生效（无需重新部署）。留空保存即恢复内置多语言默认文案。
        </p>
      </div>

      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="divide-y divide-slate-800 p-0">
          {keys.map((key) => {
            const m = meta[key];
            const draft = drafts[key] ?? '';
            const current = saved[key] || '';
            const dirty = draft.trim() !== current;
            const busy = savingKey === key;
            return (
              <div key={key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="w-full shrink-0 sm:w-56">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <Type className="h-3.5 w-3.5 text-slate-500" />
                    {m?.label || key}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {key} · 默认键 {m?.i18nKey || '-'}
                  </div>
                  {current ? (
                    <span className="mt-1 inline-block rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                      已自定义
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={draft}
                    placeholder="留空 = 使用多语言默认文案"
                    disabled={busy}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dirty) void saveOne(key);
                    }}
                    className="border-slate-700 bg-slate-950"
                  />
                  <Button
                    size="sm"
                    disabled={!dirty || busy}
                    onClick={() => void saveOne(key)}
                    className="shrink-0"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    保存
                  </Button>
                  {current ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void restoreDefault(key)}
                      className="shrink-0 border-slate-700 text-slate-300"
                    >
                      <RotateCcw className="h-4 w-4" />
                      恢复默认
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
