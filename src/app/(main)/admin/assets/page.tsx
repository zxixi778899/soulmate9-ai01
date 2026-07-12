'use client';

/**
 * 公共资产库：生成结果保留区 + 上传 + 选用到女友
 * 复用 Comfy assets API，并引导去女友资源库绑定
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, FolderOpen, RefreshCw, Trash2, Upload, ExternalLink, Heart, Sparkles, CheckSquare, Square,
} from 'lucide-react';
import { toast } from 'sonner';

type Asset = {
  id: string;
  url?: string;
  preview_url?: string;
  name?: string;
  created_at?: string;
  girlfriend_id?: string | null;
  kind?: string;
};

export default function AdminAssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=assets&limit=200');
      const data = await readResponseJson<{ assets?: Asset[]; items?: Asset[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '加载失败');
      const list = (data.assets || data.items || []) as Asset[];
      setItems(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((a) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(s) ||
      (a.id || '').toLowerCase().includes(s) ||
      (a.girlfriend_id || '').toLowerCase().includes(s)
    );
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const removeSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个资产？不可恢复。`)) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await authedFetch('/api/admin/comfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete_asset', id }),
        });
      }
      toast.success('已删除');
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('action', 'upload_asset');
        fd.append('file', file);
        const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
        if (!res.ok) {
          const data = await readResponseJson<{ error?: string }>(res).catch(() => ({}));
          throw new Error((data as { error?: string }).error || '上传失败');
        }
      }
      toast.success(`已上传 ${files.length} 个文件`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] p-4 md:p-6" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">创作中心</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[#1E293B]">
            <FolderOpen className="h-6 w-6 text-violet-600" />
            公共资产库
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#64748B]">
            保存创作工作台的全部生成结果，可手动上传/删除。选用到站内女友请打开「女友与媒体」绑定头像/肖像。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/studio">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Sparkles className="h-4 w-4" /> 去生成
            </Button>
          </Link>
          <Link href="/admin/girlfriends">
            <Button size="sm" className="gap-1.5 bg-[#2563EB]">
              <Heart className="h-4 w-4" /> 绑定女友
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索文件名 / ID / 女友 ID"
          className="max-w-xs"
        />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#334155] hover:bg-gray-50">
          <Upload className="h-4 w-4" />
          上传
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              onUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!selected.size || busy}
          onClick={removeSelected}
          className="gap-1 text-rose-600"
        >
          <Trash2 className="h-4 w-4" /> 删除选中 ({selected.size})
        </Button>
        <span className="text-xs text-[#94A3B8]">共 {filtered.length} 项</span>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#64748B]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载资产…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-[#94A3B8]">
          暂无资产。去{' '}
          <Link href="/admin/studio" className="text-violet-600 underline">
            创作工作台
          </Link>{' '}
          生成，或在此上传。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((a) => {
            const url = a.preview_url || a.url || '';
            const on = selected.has(a.id);
            return (
              <div
                key={a.id}
                className={`group relative overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                  on ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  className="absolute left-2 top-2 z-10 rounded bg-white/90 p-1 shadow"
                  aria-label="选中"
                >
                  {on ? (
                    <CheckSquare className="h-4 w-4 text-violet-600" />
                  ) : (
                    <Square className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                <div className="aspect-[3/4] bg-gray-100">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.name || a.id} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">无预览</div>
                  )}
                </div>
                <div className="space-y-1 p-2">
                  <div className="truncate text-[11px] font-medium text-[#334155]">{a.name || a.id}</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] text-[#94A3B8]">{a.kind || 'image'}</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="text-violet-600">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
