'use client';

/**
 * 捏脸创建 · 预览图配置
 * 3 性别（女性/男性/跨性别）× 3 画风（写实/二次元/3D动画）= 9 个预览位。
 * 创建页第 0 步按当前画风展示 3 张性别预览图，全部在此配置。
 */

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Save, ImageOff } from 'lucide-react';
import { toast } from 'sonner';

const GENDERS = [
  { value: 'Female', zh: '女性' },
  { value: 'Male', zh: '男性' },
  { value: 'Transgender', zh: '跨性别' },
] as const;

const STYLES = [
  { value: 'realistic', zh: '写实' },
  { value: 'anime', zh: '二次元' },
  { value: '3d', zh: '3D动画' },
] as const;

interface Preview {
  gender: string;
  visual_style: string;
  thumbnail_url: string;
  is_active: boolean;
  sort_order: number;
}

const cellKey = (gender: string, style: string) => `${gender}|${style}`;

export default function CreatorPreviewsAdminContent() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [uploadingCell, setUploadingCell] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/creator-previews');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setPreviews(data.previews || []);
      const nextDrafts: Record<string, string> = {};
      for (const p of data.previews || []) {
        nextDrafts[cellKey(p.gender, p.visual_style)] = p.thumbnail_url || '';
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

  const getPreview = (gender: string, style: string) =>
    previews.find((p) => p.gender === gender && p.visual_style === style);

  const patchSlot = useCallback(
    async (gender: string, style: string, patch: { thumbnail_url?: string; is_active?: boolean }) => {
      const key = cellKey(gender, style);
      setSavingCell(key);
      try {
        const res = await authedFetch('/api/admin/creator-previews', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gender, visual_style: style, ...patch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '保存失败');
        toast.success('已保存');
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSavingCell(null);
      }
    },
    [load],
  );

  const handleUpload = useCallback(
    async (gender: string, style: string, file: File | null) => {
      if (!file) return;
      const key = cellKey(gender, style);
      setUploadingCell(key);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'admin/creator-previews');
        const upRes = await authedFetch('/api/upload', { method: 'POST', body: fd });
        const upData = await upRes.json();
        if (!upRes.ok || !upData.url) throw new Error(upData.error || '上传失败');
        await patchSlot(gender, style, { thumbnail_url: upData.url });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '上传失败');
      } finally {
        setUploadingCell(null);
      }
    },
    [patchSlot],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">捏脸预览配置</h1>
        <p className="mt-1 text-sm text-slate-400">
          创建页第 0 步按所选画风展示 3 张性别预览图。共 3 性别 × 3 画风 = 9 个预览位，上传图片或填写 URL 后保存。
        </p>
      </div>

      {STYLES.map((style) => (
        <div key={style.value}>
          <h2 className="mb-3 text-base font-semibold text-white/90">
            画风：{style.zh} <span className="ml-1 text-xs font-normal text-slate-400">({style.value})</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {GENDERS.map((gender) => {
              const key = cellKey(gender.value, style.value);
              const preview = getPreview(gender.value, style.value);
              const draft = drafts[key] ?? '';
              const busy = savingCell === key;
              const uploading = uploadingCell === key;
              return (
                <Card key={key} className="border-slate-800 bg-slate-900/60">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{gender.zh}</span>
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        启用
                        <Switch
                          checked={preview?.is_active ?? true}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            void patchSlot(gender.value, style.value, { is_active: checked })
                          }
                        />
                      </label>
                    </div>

                    {/* Preview image */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                      {preview?.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.thumbnail_url}
                          alt={`${style.zh}-${gender.zh}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600">
                          <ImageOff className="h-8 w-8" />
                          <span className="text-xs">未设置</span>
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    {/* Upload */}
                    <label className="block">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          void handleUpload(gender.value, style.value, e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-200 transition hover:bg-slate-700">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        上传图片
                      </span>
                    </label>

                    {/* URL input + save */}
                    <div className="flex gap-2">
                      <Input
                        value={draft}
                        placeholder="图片 URL"
                        className="h-9 flex-1 border-slate-700 bg-slate-950 text-xs"
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || uploading}
                        className="h-9 shrink-0"
                        onClick={() => void patchSlot(gender.value, style.value, { thumbnail_url: draft.trim() })}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

