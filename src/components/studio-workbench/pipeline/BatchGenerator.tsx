'use client';

import { useState, useMemo, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Loader2, Check, X, Users } from 'lucide-react';
import type { Any } from '../StudioWorkbench.types';

interface BatchItem {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
}

interface Props {
  girlfriends: Any[];
}

export function BatchGenerator({ girlfriends }: Props) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchItem[]>([]);

  const filtered = useMemo(() => {
    if (!search.trim()) return girlfriends;
    const q = search.trim().toLowerCase();
    return girlfriends.filter((g) =>
      String(g.name || '').toLowerCase().includes(q) ||
      String(g.id || '').includes(q),
    );
  }, [girlfriends, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((g) => String(g.id)));
    }
  };

  const runBatch = useCallback(async () => {
    if (selectedIds.length === 0) {
      toast.error('请选择至少一个伴侣');
      return;
    }
    setRunning(true);
    const items: BatchItem[] = selectedIds.map((id) => {
      const gf = girlfriends.find((g) => String(g.id) === id);
      return { id, name: String(gf?.name || id), status: 'pending' as const };
    });
    setProgress(items);

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      setProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'running' } : p));

      try {
        const res = await authedFetch('/api/admin/comfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate',
            girlfriend_id: items[i].id,
            prompt: `photorealistic portrait of a beautiful woman, studio lighting, clean background, 8k`,
            negative: 'bad anatomy, deformed, blurry, low quality',
            width: 768,
            height: 1024,
            steps: 28,
            num_images: 1,
            asset_role: 'avatar-closeup',
            // ⚠️ 禁用增强器以避免 FaceDetailer 缺失错误
            enhancers: {
              controlnet: false,
              adetailer: false,
              upscale: false,
            },
          }),
        });
        const data = await readResponseJson(res).catch(() => ({} as Any));
        if (!res.ok) throw new Error(data.error || '生成失败');

        // Handle async
        if (data.pending && data.job_id) {
          const jobId = String(data.job_id);
          for (let attempt = 0; attempt < 20; attempt++) {
            const statusRes = await authedFetch(`/api/runpod/status?job_id=${jobId}&admin_source=true&girlfriend_id=${items[i].id}&asset_role=avatar-closeup`);
            const statusData = await readResponseJson(statusRes).catch(() => ({} as Any));
            if (statusData.status === 'COMPLETED' || statusData.status === 'completed') break;
            if (statusData.status === 'FAILED' || statusData.status === 'failed') throw new Error(statusData.error || 'GPU 失败');
            await new Promise((r) => setTimeout(r, 5000));
          }
        }

        succeeded++;
        setProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'success' } : p));
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : '失败';
        setProgress((prev) => prev.map((p, idx) => idx === i ? { ...p, status: 'failed', error: msg } : p));
      }
    }

    setRunning(false);
    if (failed > 0) {
      toast.warning(`批量完成：成功 ${succeeded}，失败 ${failed}`);
    } else {
      toast.success(`批量完成：${succeeded} 个伴侣头像已生成`);
    }
  }, [selectedIds, girlfriends]);

  const successCount = progress.filter((p) => p.status === 'success').length;
  const failCount = progress.filter((p) => p.status === 'failed').length;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Users className="h-4 w-4" /> 批量生产
          </h3>
          <p className="text-[10px] text-slate-500">为多个伴侣批量生成头像资产</p>
        </div>
        <Button
          size="sm"
          onClick={() => void runBatch()}
          disabled={running || selectedIds.length === 0}
          className={cn(
            'h-7 text-xs font-medium',
            'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500',
            'disabled:opacity-50',
          )}
        >
          {running ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
          {running ? '运行中…' : `生成 ${selectedIds.length} 个`}
        </Button>
      </div>

      {/* Search + select all */}
      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索伴侣…"
            className="h-7 w-full rounded-lg border border-white/10 bg-[#0d0d15] pl-7 pr-2 text-xs text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
        <button
          onClick={selectAll}
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/[0.06]"
        >
          {selectedIds.length === filtered.length ? '取消全选' : '全选'}
        </button>
      </div>

      {/* Companion list */}
      <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto pr-1">
        {filtered.map((gf) => {
          const id = String(gf.id);
          const name = String(gf.name || '');
          const selected = selectedIds.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition',
                selected ? 'bg-violet-500/10 border border-violet-500/30' : 'border border-transparent hover:bg-white/[0.04]',
              )}
            >
              <div className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]',
                selected ? 'border-violet-500 bg-violet-500 text-white' : 'border-white/20',
              )}>
                {selected && <Check className="h-3 w-3" />}
              </div>
              <span className="flex-1 truncate text-[11px] text-white">{name}</span>
            </button>
          );
        })}
      </div>

      {/* Progress */}
      {progress.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>进度</span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px]">
              {successCount} 成功
            </Badge>
            {failCount > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[9px]">
                {failCount} 失败
              </Badge>
            )}
          </div>
          {progress.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-[10px]">
              {item.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-violet-400" />}
              {item.status === 'success' && <Check className="h-3 w-3 text-emerald-400" />}
              {item.status === 'failed' && <X className="h-3 w-3 text-red-400" />}
              {item.status === 'pending' && <div className="h-3 w-3 rounded-full border border-white/10" />}
              <span className={cn(
                'flex-1 truncate',
                item.status === 'success' ? 'text-slate-400' :
                item.status === 'failed' ? 'text-red-400' : 'text-white',
              )}>
                {item.name}
              </span>
              {item.error && <span className="truncate text-[9px] text-red-500 max-w-[120px]">{item.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
