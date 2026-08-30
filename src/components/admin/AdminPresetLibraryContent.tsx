'use client';

/**
 * 预设库管理（预览管理系统）
 * - 左侧文件夹：新建/重命名/删除；kind=scene/pose/closeup 为后期场景、姿势、特写预设预留
 * - 右侧预设网格：立绘预览、稀有度、使用统计、上架开关、编辑/删除
 * - 单张立绘生成（支持 GPU 排队后 job_id 续跑回写）+ 一键补齐缺失立绘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, Plus, Trash2, Pencil, ImageIcon, Folder as FolderIcon,
  FolderPlus, Sparkles, Zap, Square, Users, Camera, Crosshair, Box, Layers, Upload, ImageOff,
} from 'lucide-react';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';
import { cn } from '@/lib/utils';

// --- Types ---

interface Folder {
  id: string;
  name: string;
  name_zh: string | null;
  kind: string;
  description: string;
  sort_order: number;
  item_count: number;
}

interface Preset {
  id: string;
  name: string;
  name_zh: string | null;
  slug: string | null;
  default_name: string | null;
  age: number | null;
  rarity: string | null;
  gender: string;
  visual_style: string;
  relationship: string | null;
  ethnicity: string | null;
  face_shape: string | null;
  hair_style: string | null;
  hair_color: string | null;
  eye_color: string | null;
  body_type: string | null;
  fashion_style: string | null;
  occupation: string | null;
  voice: string | null;
  personality_tags: string[] | null;
  vibe_tags: string[] | null;
  short_description: string | null;
  backstory: string | null;
  hobbies: string | null;
  greeting_en: string | null;
  greeting_zh: string | null;
  scene_id: string | null;
  portrait_outfit: string | null;
  folder_id: string | null;
  sort_order: number;
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  portrait_cached: boolean;
  portrait_url: string | null;
  portrait_hits: number;
  portrait_misses: number;
}

const RARITY_STYLE: Record<string, string> = {
  N: 'bg-gray-500/15 text-gray-300 border-gray-500/40',
  R: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  SR: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
  SSR: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
};

const FOLDER_KINDS = [
  { value: 'character', zh: '角色预设', icon: Users },
  { value: 'scene', zh: '场景预设', icon: Camera },
  { value: 'pose', zh: '姿势预设', icon: Crosshair },
  { value: 'closeup', zh: '特写预设', icon: Camera },
  { value: 'other', zh: '其他', icon: Box },
] as const;

function kindZh(kind: string): string {
  return FOLDER_KINDS.find((k) => k.value === kind)?.zh || '其他';
}

function csv(text: string | string[] | null | undefined): string {
  return Array.isArray(text) ? text.join(', ') : text || '';
}

// --- Main Page ---

export default function AdminPresetLibraryContent({ embedded }: { embedded?: boolean }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>('all'); // 'all' | 'unfiled' | folderId
  const [presetDialog, setPresetDialog] = useState<{ mode: 'create' | 'edit'; preset?: Preset } | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'edit'; folder?: Folder } | null>(null);
  const [portraitJobs, setPortraitJobs] = useState<Record<string, { status: 'generating' | 'pending'; jobId?: string }>>({});
  /** 手工上传/删除立绘的进行中状态（按 slug） */
  const [imgBusy, setImgBusy] = useState<Record<string, 'upload' | 'delete' | undefined>>({});
  const [batch, setBatch] = useState<{ running: boolean; done: number; total: number; label: string }>({
    running: false, done: 0, total: 0, label: '',
  });
  const batchStopRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [presetsRes, foldersRes] = await Promise.all([
        authedFetch('/api/admin/presets?type=character_presets'),
        authedFetch('/api/admin/preset-folders'),
      ]);
      const presetsJson = await presetsRes.json();
      const foldersJson = await foldersRes.json();
      if (!presetsRes.ok) throw new Error(presetsJson.error || '加载预设失败');
      if (!foldersRes.ok) throw new Error(foldersJson.error || '加载文件夹失败');
      setPresets(presetsJson.character_presets || []);
      setFolders(foldersJson.folders || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (activeFolder === 'all') return presets;
    if (activeFolder === 'unfiled') return presets.filter((p) => !p.folder_id);
    return presets.filter((p) => p.folder_id === activeFolder);
  }, [presets, activeFolder]);

  const cachedCount = presets.filter((p) => p.portrait_cached).length;
  const unfiledCount = presets.filter((p) => !p.folder_id).length;

  // ─── Preset operations ────────────────────────────────────────────────────

  const deletePreset = async (preset: Preset) => {
    if (!confirm(`确认删除预设「${preset.name}」？\n会同时清理共享立绘缓存，此操作不可恢复。`)) return;
    try {
      const res = await authedFetch(`/api/admin/presets?type=character_preset&id=${preset.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      toast.success('已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const toggleActive = async (preset: Preset, active: boolean) => {
    try {
      const res = await authedFetch('/api/admin/presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'character_preset', id: preset.id, data: { is_active: active } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '更新失败');
      setPresets((prev) => prev.map((p) => (p.id === preset.id ? { ...p, is_active: active } : p)));
      toast.success(active ? '已上架' : '已下架');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  };

  // ─── Portrait generation (with job_id resume) ─────────────────────────────

  const patchPortrait = (slug: string, url: string) => {
    setPresets((prev) => prev.map((p) => (p.slug === slug
      ? { ...p, portrait_cached: true, portrait_url: url }
      : p)));
  };

  const clearPortraitLocal = (slug: string) => {
    setPresets((prev) => prev.map((p) => (p.slug === slug
      ? { ...p, portrait_cached: false, portrait_url: null }
      : p)));
  };

  // ─── 手工上传 / 删除立绘（写入同一共享缓存，创建页即时生效） ────────────

  const uploadPortrait = async (preset: Preset, file: File) => {
    const slug = preset.slug;
    if (!slug) { toast.error('该预设没有 slug，无法上传图片'); return; }
    setImgBusy((prev) => ({ ...prev, [slug]: 'upload' }));
    try {
      const fd = new FormData();
      fd.append('slug', slug);
      fd.append('file', file);
      const res = await authedFetch('/api/admin/preset-portraits', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '上传失败');
      patchPortrait(slug, data.portrait_url);
      toast.success(`图片已上传并生效：${preset.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setImgBusy((prev) => { const next = { ...prev }; delete next[slug]; return next; });
    }
  };

  const deletePortrait = async (preset: Preset) => {
    const slug = preset.slug;
    if (!slug) { toast.error('该预设没有 slug，无法删除图片'); return; }
    if (!confirm(`确认删除「${preset.name}」的立绘图片？\n删除后创建页不再展示该图，之后可重新生成或上传。`)) return;
    setImgBusy((prev) => ({ ...prev, [slug]: 'delete' }));
    try {
      const res = await authedFetch(`/api/admin/preset-portraits?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '删除失败');
      clearPortraitLocal(slug);
      toast.success('立绘图片已删除');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setImgBusy((prev) => { const next = { ...prev }; delete next[slug]; return next; });
    }
  };

  const generatePortrait = async (preset: Preset) => {
    const slug = preset.slug;
    if (!slug) { toast.error('该预设没有 slug，无法生成立绘'); return; }
    const job = portraitJobs[slug];
    if (job?.status === 'generating') return;
    const body = job?.jobId ? { slug, job_id: job.jobId } : { slug };
    setPortraitJobs((prev) => ({ ...prev, [slug]: { status: 'generating', jobId: job?.jobId } }));
    try {
      const res = await authedFetch('/api/admin/preset-portraits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`立绘已生成并缓存：${preset.name}`);
        patchPortrait(slug, data.portrait_url);
        setPortraitJobs((prev) => {
          const next = { ...prev };
          delete next[slug];
          return next;
        });
      } else if (res.status === 202 && data.pending) {
        setPortraitJobs((prev) => ({ ...prev, [slug]: { status: 'pending', jobId: data.job_id } }));
        toast.info('GPU 排队中，稍后再点「续跑」完成回写');
      } else {
        throw new Error(data.error || '生成失败');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
      setPortraitJobs((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    }
  };

  const batchFillMissing = async () => {
    const targets = presets.filter((p) => p.is_active && p.slug && !p.portrait_cached);
    if (!targets.length) { toast.info('所有上架预设都已有立绘'); return; }
    batchStopRef.current = false;
    setBatch({ running: true, done: 0, total: targets.length, label: '' });
    let ok = 0;
    let skipped = 0;
    for (let i = 0; i < targets.length; i++) {
      if (batchStopRef.current) break;
      const p = targets[i];
      const slug = p.slug as string;
      setBatch({ running: true, done: i, total: targets.length, label: p.name });
      setPortraitJobs((prev) => ({ ...prev, [slug]: { status: 'generating' } }));
      try {
        const res = await authedFetch('/api/admin/preset-portraits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        let data = await res.json();
        if (res.status === 202 && data.pending && data.job_id) {
          // Resume path: server polls the queued job up to ~140s and writes back
          const r2 = await authedFetch('/api/admin/preset-portraits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, job_id: data.job_id }),
          });
          data = await r2.json();
          if (r2.ok && data.success) {
            ok += 1;
            patchPortrait(slug, data.portrait_url);
          } else {
            skipped += 1;
            if (r2.status === 202 && data.job_id) {
              setPortraitJobs((prev) => ({ ...prev, [slug]: { status: 'pending', jobId: data.job_id } }));
            }
          }
        } else if (res.ok && data.success) {
          ok += 1;
          patchPortrait(slug, data.portrait_url);
        } else {
          skipped += 1;
          toast.error(`${p.name}：${data.error || '生成失败'}`);
        }
      } catch (e) {
        skipped += 1;
        toast.error(`${p.name}：${e instanceof Error ? e.message : '请求失败'}`);
      } finally {
        setPortraitJobs((prev) => {
          const next = { ...prev };
          if (next[slug]?.status === 'generating') delete next[slug];
          return next;
        });
      }
    }
    setBatch({ running: false, done: 0, total: 0, label: '' });
    toast.success(`批量完成：成功 ${ok}，跳过/排队 ${skipped}`);
  };

  // ─── Folder operations ────────────────────────────────────────────────────

  const deleteFolder = async (folder: Folder) => {
    const note = folder.item_count > 0
      ? `\n文件夹内有 ${folder.item_count} 个预设，删除后将变为「未分类」（预设不会被删除）。`
      : '';
    if (!confirm(`确认删除文件夹「${folder.name_zh || folder.name}」？${note}`)) return;
    try {
      const res = await authedFetch(`/api/admin/preset-folders?id=${folder.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      toast.success('文件夹已删除');
      if (activeFolder === folder.id) setActiveFolder('all');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading && !presets.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-400" /> 预设库管理
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {presets.length} 个预设 · 立绘已缓存 {cachedCount}/{presets.length} · 文件夹可收纳角色/场景/姿势/特写预设
          </p>
        </div>
        {!embedded && (
          <div className="flex flex-wrap items-center gap-2">
            {batch.running ? (
              <>
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {batch.done + 1}/{batch.total} {batch.label}
                </span>
                <Button variant="outline" size="sm" onClick={() => { batchStopRef.current = true; }}>
                  <Square className="w-3.5 h-3.5 mr-1" /> 停止
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={batchFillMissing} disabled={cachedCount >= presets.length}>
                <Zap className="w-4 h-4 mr-1" /> 补齐缺失立绘（{presets.length - cachedCount}）
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
            <Button size="sm" onClick={() => setPresetDialog({ mode: 'create' })} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-1" /> 新建预设
            </Button>
          </div>
        )}
      </div>

      {!embedded && <StylePreviewsCard />}

      <div className="flex gap-4 items-start">
        {/* Folder sidebar */}
        {!embedded && (
        <aside className="w-60 shrink-0 space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold tracking-wider text-gray-400 uppercase">文件夹</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-purple-400 hover:text-purple-300"
              onClick={() => setFolderDialog({ mode: 'create' })}>
              <FolderPlus className="w-3.5 h-3.5 mr-1" /> 新建
            </Button>
          </div>

          <button
            className={cn(
              'w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
              activeFolder === 'all' ? 'bg-[#1e1e2e] text-[#a78bfa]' : 'text-gray-400 hover:bg-white/[0.05]',
            )}
            onClick={() => setActiveFolder('all')}
          >
            <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> 全部</span>
            <span className="text-xs text-gray-600">{presets.length}</span>
          </button>

          {unfiledCount > 0 && (
            <button
              className={cn(
                'w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                activeFolder === 'unfiled' ? 'bg-[#1e1e2e] text-[#a78bfa]' : 'text-gray-400 hover:bg-white/[0.05]',
              )}
              onClick={() => setActiveFolder('unfiled')}
            >
              <span className="flex items-center gap-2"><Box className="w-3.5 h-3.5" /> 未分类</span>
              <span className="text-xs text-gray-600">{unfiledCount}</span>
            </button>
          )}

          {folders.map((folder) => {
            const active = activeFolder === folder.id;
            return (
              <div
                key={folder.id}
                className={cn(
                  'group w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-[#1e1e2e] text-[#a78bfa]' : 'text-gray-400 hover:bg-white/[0.05]',
                )}
              >
                <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => setActiveFolder(folder.id)}>
                  <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{folder.name_zh || folder.name}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">{kindZh(folder.kind)}</span>
                </button>
                <span className="flex items-center gap-0.5 shrink-0">
                  <span className="text-xs text-gray-600 mr-1">{folder.item_count}</span>
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-white"
                    onClick={() => setFolderDialog({ mode: 'edit', folder })}>
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-400"
                    onClick={() => deleteFolder(folder)}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              </div>
            );
          })}

          <p className="px-2 pt-3 text-[10px] leading-relaxed text-gray-600">
            场景 / 姿势 / 特写文件夹为后期预设类型预留；角色预设会展示在创建页预设墙。
          </p>
        </aside>
        )}

        {/* Preset grid */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-10 text-center text-gray-400 text-sm">
                此文件夹暂无预设，点右上角「新建预设」添加。
              </CardContent>
            </Card>
          ) : (
            <div className={cn('grid gap-3', embedded ? 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-5' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4')}>
              {filtered.map((preset) => {
                const job = preset.slug ? portraitJobs[preset.slug] : undefined;
                return (
                  <Card key={preset.id} className={cn('bg-[#16161f] border-gray-800 overflow-hidden', !preset.is_active && 'opacity-50')}>
                    {/* Portrait preview */}
                    <div className="relative aspect-[2/3] bg-gray-900">
                      {preset.portrait_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preset.portrait_url} alt={preset.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-1 text-gray-700">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[10px]">无立绘</span>
                        </div>
                      )}
                      {preset.rarity && (
                        <Badge variant="outline" className={cn('absolute top-1.5 left-1.5 text-[10px]', RARITY_STYLE[preset.rarity] || RARITY_STYLE.N)}>
                          {preset.rarity}
                        </Badge>
                      )}
                      <span className={cn(
                        'absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full border',
                        preset.portrait_cached
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-gray-800/80 text-gray-400 border-gray-700',
                      )}>
                        {preset.portrait_cached ? `缓存 ${preset.portrait_hits}/${preset.portrait_misses}` : '未缓存'}
                      </span>
                    </div>

                    <CardContent className="p-2.5 space-y-1.5">
                      <div className={cn('flex items-start justify-between gap-1', embedded && 'pr-0')}>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{preset.name}</div>
                          {preset.name_zh && <div className="text-[11px] text-gray-400 truncate">{preset.name_zh}</div>}
                        </div>
                        {!embedded && <Switch checked={preset.is_active} onCheckedChange={(v) => toggleActive(preset, v)} />}
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-700 text-gray-400">{preset.gender} · {preset.visual_style}</Badge>
                        {preset.occupation && <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-700 text-gray-400">{preset.occupation}</Badge>}
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-700 text-gray-400">用 {preset.usage_count}</Badge>
                      </div>
                      {!embedded && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]"
                          disabled={job?.status === 'generating' || !preset.slug}
                          onClick={() => generatePortrait(preset)}>
                          {job?.status === 'generating'
                            ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />生成中</>
                            : job?.status === 'pending'
                              ? <><RefreshCw className="w-3 h-3 mr-1" />续跑</>
                              : preset.portrait_cached
                                ? <><Sparkles className="w-3 h-3 mr-1" />重新生成</>
                                : <><Sparkles className="w-3 h-3 mr-1" />生成立绘</>}
                        </Button>
                        {/* 手工上传图片 → 直接写入共享缓存（支持 JPG/PNG/WEBP ≤10MB） */}
                        <label
                          title="上传图片（替换立绘）"
                          className={cn(
                            'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/10 hover:text-white',
                            (!preset.slug || imgBusy[preset.slug!] === 'upload') && 'pointer-events-none opacity-40',
                          )}
                        >
                          {imgBusy[preset.slug!] === 'upload'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Upload className="w-3.5 h-3.5" />}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) uploadPortrait(preset, file);
                            }}
                          />
                        </label>
                        {/* 删除已缓存图片 */}
                        {preset.portrait_cached && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-amber-400 hover:text-amber-300"
                            title="删除图片"
                            disabled={imgBusy[preset.slug!] === 'delete' || !preset.slug}
                            onClick={() => deletePortrait(preset)}>
                            {imgBusy[preset.slug!] === 'delete'
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <ImageOff className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400"
                          onClick={() => setPresetDialog({ mode: 'edit', preset })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                          onClick={() => deletePreset(preset)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {presetDialog && (
        <PresetDialog
          mode={presetDialog.mode}
          preset={presetDialog.preset}
          folders={folders}
          onClose={() => setPresetDialog(null)}
          onSaved={() => { setPresetDialog(null); load(); }}
        />
      )}
      {folderDialog && (
        <FolderDialog
          mode={folderDialog.mode}
          folder={folderDialog.folder}
          onClose={() => setFolderDialog(null)}
          onSaved={() => { setFolderDialog(null); load(); }}
        />
      )}
    </div>
  );
}


// --- Preset Create/Edit Dialog ---

function PresetDialog({
  mode, preset, folders, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  preset?: Preset;
  folders: Folder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: preset?.name || '',
    name_zh: preset?.name_zh || '',
    default_name: preset?.default_name || '',
    slug: preset?.slug || '',
    age: preset?.age ?? 22,
    rarity: preset?.rarity || 'R',
    gender: preset?.gender || 'Female',
    visual_style: preset?.visual_style || 'realistic',
    relationship: preset?.relationship || '',
    ethnicity: preset?.ethnicity || '',
    face_shape: preset?.face_shape || '',
    hair_style: preset?.hair_style || '',
    hair_color: preset?.hair_color || '',
    eye_color: preset?.eye_color || '',
    body_type: preset?.body_type || '',
    fashion_style: preset?.fashion_style || '',
    occupation: preset?.occupation || '',
    voice: preset?.voice || '',
    personality_tags: csv(preset?.personality_tags),
    vibe_tags: csv(preset?.vibe_tags),
    short_description: preset?.short_description || '',
    backstory: preset?.backstory || '',
    hobbies: preset?.hobbies || '',
    greeting_en: preset?.greeting_en || '',
    greeting_zh: preset?.greeting_zh || '',
    scene_id: preset?.scene_id || '',
    portrait_outfit: preset?.portrait_outfit || '',
    folder_id: preset?.folder_id || '',
    sort_order: preset?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('名称必填'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        name_zh: form.name_zh.trim() || null,
        default_name: form.default_name.trim() || null,
        age: Number(form.age) || 22,
        rarity: form.rarity,
        gender: form.gender,
        visual_style: form.visual_style,
        relationship: form.relationship.trim() || null,
        ethnicity: form.ethnicity.trim() || null,
        face_shape: form.face_shape.trim() || null,
        hair_style: form.hair_style.trim() || null,
        hair_color: form.hair_color.trim() || null,
        eye_color: form.eye_color.trim() || null,
        body_type: form.body_type.trim() || null,
        fashion_style: form.fashion_style.trim() || null,
        occupation: form.occupation.trim() || null,
        voice: form.voice.trim() || null,
        personality_tags: form.personality_tags,
        vibe_tags: form.vibe_tags,
        short_description: form.short_description.trim() || null,
        backstory: form.backstory.trim() || null,
        hobbies: form.hobbies.trim() || null,
        greeting_en: form.greeting_en.trim() || null,
        greeting_zh: form.greeting_zh.trim() || null,
        scene_id: form.scene_id || null,
        portrait_outfit: form.portrait_outfit.trim() || null,
        folder_id: form.folder_id || null,
        sort_order: Number(form.sort_order) || 0,
      };

      let res: Response;
      if (mode === 'create') {
        if (form.slug.trim()) payload.slug = form.slug.trim();
        res = await authedFetch('/api/admin/presets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'character_preset', data: payload }),
        });
      } else {
        res = await authedFetch('/api/admin/presets', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'character_preset', id: preset?.id, data: payload }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast.success(mode === 'create' ? '预设已创建' : '预设已更新');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder = '') => (
    <div className="space-y-1">
      <Label className="text-xs text-gray-400">{label}</Label>
      <Input
        value={String(form[key] ?? '')}
        onChange={(e) => update({ [key]: e.target.value } as Partial<typeof form>)}
        placeholder={placeholder}
        className="bg-[#0f0f17] border-gray-700 text-sm"
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">{mode === 'create' ? '新建预设' : `编辑预设 · ${preset?.name}`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic */}
          <div>
            <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-2">基础信息</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {field('名称 (EN) *', 'name', 'Sweet Neighbor')}
              {field('名称 (ZH)', 'name_zh', '邻家甜心')}
              {field('默认名字', 'default_name', 'Sofia')}
              {field('Slug（留空自动生成）', 'slug', 'sweet-neighbor')}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">稀有度</Label>
                <Select value={form.rarity} onValueChange={(v) => update({ rarity: v })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N">N</SelectItem>
                    <SelectItem value="R">R</SelectItem>
                    <SelectItem value="SR">SR</SelectItem>
                    <SelectItem value="SSR">SSR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">年龄</Label>
                <Input type="number" value={form.age} onChange={(e) => update({ age: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">性别</Label>
                <Select value={form.gender} onValueChange={(v) => update({ gender: v })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Transgender">Transgender</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">画风</Label>
                <Select value={form.visual_style} onValueChange={(v) => update({ visual_style: v })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realistic">写实</SelectItem>
                    <SelectItem value="anime">二次元</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {field('关系', 'relationship', 'girlfriend')}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">文件夹</Label>
                <Select value={form.folder_id || 'none'} onValueChange={(v) => update({ folder_id: v === 'none' ? '' : v })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未分类</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name_zh || f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-2">外观（与捏脸选项一致）</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {field('种族', 'ethnicity', 'Asian')}
              {field('脸型', 'face_shape', 'Oval')}
              {field('发型', 'hair_style', 'Long Flowing')}
              {field('发色（hex 或名称）', 'hair_color', '#d4a574')}
              {field('瞳色', 'eye_color', 'Brown')}
              {field('身材', 'body_type', 'Slim')}
              {field('穿搭风格', 'fashion_style', 'Casual')}
              {field('立绘服装描述', 'portrait_outfit', 'soft beige knit sweater')}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">立绘场景</Label>
                <Select value={form.scene_id || 'auto'} onValueChange={(v) => update({ scene_id: v === 'auto' ? '' : v })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动匹配</SelectItem>
                    {GIRLFRIEND_SCENE_RECIPES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Persona */}
          <div>
            <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-2">人设</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {field('职业', 'occupation', 'Student')}
              {field('声线', 'voice', 'soft')}
              {field('性格标签（逗号分隔）', 'personality_tags', 'Sweet, Playful')}
              {field('Vibe 标签（逗号分隔）', 'vibe_tags', 'sweet, romantic')}
              {field('爱好', 'hobbies', 'baking, film photography')}
              {field('排序（小在前）', 'sort_order', '0')}
            </div>
            <div className="grid grid-cols-1 gap-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">短简介</Label>
                <Input value={form.short_description} onChange={(e) => update({ short_description: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">背景故事</Label>
                <textarea value={form.backstory} onChange={(e) => update({ backstory: e.target.value })}
                  className="w-full min-h-[60px] rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">开场白 (EN)</Label>
                  <textarea value={form.greeting_en} onChange={(e) => update({ greeting_en: e.target.value })}
                    className="w-full min-h-[60px] rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">开场白 (ZH)</Label>
                  <textarea value={form.greeting_zh} onChange={(e) => update({ greeting_zh: e.target.value })}
                    className="w-full min-h-[60px] rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-[#1a1a25] pb-1">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} 保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Folder Create/Edit Dialog ---

function FolderDialog({
  mode, folder, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  folder?: Folder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: folder?.name || '',
    name_zh: folder?.name_zh || '',
    kind: folder?.kind || 'character',
    description: folder?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('文件夹名称必填'); return; }
    setSaving(true);
    try {
      const res = mode === 'create'
        ? await authedFetch('/api/admin/preset-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        : await authedFetch('/api/admin/preset-folders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: folder?.id, data: form }),
        });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast.success(mode === 'create' ? '文件夹已创建' : '文件夹已更新');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{mode === 'create' ? '新建文件夹' : '编辑文件夹'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">名称 (EN) *</Label>
              <Input value={form.name} onChange={(e) => update({ name: e.target.value })} placeholder="Scene Presets" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">名称 (ZH)</Label>
              <Input value={form.name_zh} onChange={(e) => update({ name_zh: e.target.value })} placeholder="场景预设" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">类型（后期预设分类）</Label>
            <Select value={form.kind} onValueChange={(v) => update({ kind: v })}>
              <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FOLDER_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.zh}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">描述</Label>
            <Input value={form.description} onChange={(e) => update({ description: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} 保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Style Sample Images Settings (create page 外观设定 style cards) ---

const STYLE_SLOTS = [
  { key: 'realistic', label: 'Realistic', labelZh: '写实' },
  { key: 'anime', label: 'Anime', labelZh: '二次元' },
] as const;

function StylePreviewsCard() {
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    authedFetch('/api/admin/style-previews')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.previews) setPreviews(data.previews);
      })
      .catch(() => { /* silent */ });
  }, []);

  const upload = async (style: string, file: File) => {
    setUploading(style);
    try {
      const fd = new FormData();
      fd.append('style', style);
      fd.append('file', file);
      const res = await authedFetch('/api/admin/style-previews', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '上传失败');
      setPreviews(json.previews);
      toast.success('风格示例图已更新，创建页稍后即生效');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(null);
    }
  };

  return (
    <Card className="bg-[#16161f] border-gray-800">
      <CardContent className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ImageIcon className="w-4 h-4 text-purple-400" /> 风格示例图设置
          </h2>
          {previews?.updated_at && (
            <span className="text-[10px] text-gray-500">
              更新于 {new Date(previews.updated_at).toLocaleString()}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-400">
          创建页「外观设定」的三张画风卡使用这里的示例图，点击上传即时生效（无需发版）。建议竖版 3:4，支持 JPG / PNG / WEBP，≤10MB。
        </p>
        <div className="grid grid-cols-3 gap-3">
          {STYLE_SLOTS.map((slot) => {
            const url = previews?.[slot.key];
            const busy = uploading === slot.key;
            return (
              <div key={slot.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">{slot.labelZh}</span>
                  <span className="text-[10px] text-gray-500">{slot.label}</span>
                </div>
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={slot.labelZh} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                  {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                    </div>
                  )}
                </div>
                <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gray-700 bg-[#0f0f17] text-xs text-gray-400 transition-colors hover:border-purple-500 hover:text-white">
                  <Upload className="h-3.5 w-3.5" /> 更换图片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) upload(slot.key, file);
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
