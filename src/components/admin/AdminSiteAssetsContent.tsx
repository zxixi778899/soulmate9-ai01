'use client';

/**
 * 图片资源库
 * 统一上传/浏览/删除站点通用图片（Hero、横幅、推广位等可复用素材）。
 * 各管理面板可从资源库直接选图，无需重复上传。
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Trash2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import type { AssetItem } from '@/lib/asset-library-store';

export default function AdminSiteAssetsContent() {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/asset-library');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems((data.items || []) as AssetItem[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        if (name.trim()) fd.append('name', name.trim());
        const res = await authedFetch('/api/admin/asset-library', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        setItems((data.items || []) as AssetItem[]);
        setName('');
        toast.success('已上传到资源库');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [name],
  );

  const handleRemove = useCallback(async (item: AssetItem) => {
    if (!window.confirm(`确定删除「${item.name || item.id}」？引用该图的板块会失去图片。`)) return;
    setRemovingId(item.id);
    try {
      const res = await authedFetch(`/api/admin/asset-library?id=${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      setItems((data.items || []) as AssetItem[]);
      toast.success('已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setRemovingId(null);
    }
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">图片资源库</h1>
        <p className="mt-1 text-sm text-slate-400">
          统一存放站点通用图片（Hero、横幅、推广位等）。上传后可在各管理面板直接选用，删除前请确认无板块引用。
        </p>
      </div>

      {/* Upload bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="图片名称（可选，默认用文件名）"
          disabled={uploading}
          className="border-slate-700 bg-slate-950 sm:max-w-xs"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleUpload(e)}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传图片
        </Button>
        <span className="text-xs text-slate-500">支持 JPG / PNG / WebP，单张 ≤ 10MB，最多保留 100 张</span>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 text-slate-600">
          <ImageOff className="h-8 w-8" />
          <span className="text-sm">资源库为空，上传第一张图片吧</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            const busy = removingId === item.id;
            return (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin asset preview */}
                  <img
                    src={item.url}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {busy ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-white">{item.name || item.id}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(item)}
                    disabled={busy}
                    title="删除"
                    aria-label="删除"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
