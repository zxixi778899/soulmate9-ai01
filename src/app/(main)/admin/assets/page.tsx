'use client';

/**
 * 公共资产库（文件夹模式）
 * - 已分类：每个伴侣一个文件夹
 * - 未分类：未绑定伴侣的生成/上传结果
 * - 支持多选、上传到当前文件夹、移动/复制到其它文件夹、删除
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, FolderOpen, Folder, RefreshCw, Trash2, Upload, ExternalLink, Heart,
  Sparkles, CheckSquare, Square, ArrowLeft, Scissors, Copy, ClipboardPaste, MoveRight,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

type Asset = {
  id?: string | null;
  url?: string;
  preview_url?: string;
  name?: string;
  created_at?: string;
  girlfriend_id?: string | null;
  kind?: string;
  storage_key?: string;
};

type Gf = {
  id: string;
  name?: string;
  slug?: string;
  avatar_url?: string;
  image_url?: string;
};

type ClipboardState = {
  mode: 'cut' | 'copy';
  items: Asset[];
} | null;

function assetKey(a: Asset): string {
  return String(a.id || a.storage_key || a.url || '');
}

export default function AdminAssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [girlfriends, setGirlfriends] = useState<Gf[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [folderQ, setFolderQ] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'folders' | 'folder'>('folders');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = uncategorized
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [moveTarget, setMoveTarget] = useState<string>('uncategorized');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetRes, gfRes] = await Promise.all([
        authedFetch('/api/admin/comfy?view=assets&limit=200'),
        authedFetch('/api/admin/girlfriends?limit=300'),
      ]);
      const assetData = await readResponseJson<{ assets?: Asset[]; items?: Asset[]; error?: string }>(assetRes);
      const gfData = await readResponseJson<{ girlfriends?: Gf[]; items?: Gf[]; error?: string }>(gfRes);
      if (!assetRes.ok) throw new Error(assetData.error || '加载资产失败');
      setItems((assetData.assets || assetData.items || []) as Asset[]);
      setGirlfriends((gfData.girlfriends || gfData.items || []) as Gf[]);
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

  const gfMap = useMemo(() => {
    const m = new Map<string, Gf>();
    for (const g of girlfriends) m.set(g.id, g);
    return m;
  }, [girlfriends]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorized = 0;
    for (const a of items) {
      const gid = (a.girlfriend_id || '').trim();
      if (!gid) uncategorized += 1;
      else counts.set(gid, (counts.get(gid) || 0) + 1);
    }
    // include girlfriends even if empty so you can open and upload
    const rows = girlfriends.map((g) => ({
      id: g.id,
      name: g.name || g.slug || g.id.slice(0, 8),
      count: counts.get(g.id) || 0,
      cover: g.avatar_url || g.image_url || '',
      classified: true as const,
    }));
    // orphan folders (assets point to missing gf)
    for (const [gid, count] of counts) {
      if (!gfMap.has(gid)) {
        rows.push({
          id: gid,
          name: `未知伴侣 ${gid.slice(0, 8)}`,
          count,
          cover: '',
          classified: true,
        });
      }
    }
    rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return {
      uncategorizedCount: uncategorized,
      classified: rows,
    };
  }, [items, girlfriends, gfMap]);

  const activeAssets = useMemo(() => {
    const list = items.filter((a) => {
      const gid = (a.girlfriend_id || '').trim() || null;
      if (kindFilter !== 'all' && (a.kind || 'girlfriend') !== kindFilter) return false;
      if (activeFolderId === null) return !gid;
      return gid === activeFolderId;
    });
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((a) =>
      (a.name || '').toLowerCase().includes(s) ||
      (a.id || '').toLowerCase().includes(s) ||
      (a.storage_key || '').toLowerCase().includes(s) ||
      (a.girlfriend_id || '').toLowerCase().includes(s),
    );
  }, [items, activeFolderId, q, kindFilter]);

  const visibleFolders = useMemo(() => {
    const term = folderQ.trim().toLowerCase();
    const matchingIds = kindFilter === 'all'
      ? null
      : new Set(items.filter((item) => (item.kind || 'girlfriend') === kindFilter && item.girlfriend_id).map((item) => String(item.girlfriend_id)));
    return folders.classified.filter((folder) =>
      (!matchingIds || matchingIds.has(folder.id)) &&
      (!term || folder.name.toLowerCase().includes(term) || folder.id.toLowerCase().includes(term)),
    );
  }, [folders.classified, folderQ, kindFilter, items]);

  const assetKinds = useMemo(() => Array.from(new Set(items.map((item) => item.kind || 'girlfriend'))).sort(), [items]);

  const openFolder = (id: string | null) => {
    setActiveFolderId(id);
    setView('folder');
    setSelected(new Set());
    setQ('');
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectedAssets = useMemo(
    () => activeAssets.filter((a) => selected.has(assetKey(a))),
    [activeAssets, selected],
  );

  const removeSelected = async () => {
    if (!selectedAssets.length) return;
    if (!confirm(`确定删除选中的 ${selectedAssets.length} 个资产？不可恢复。`)) return;
    setBusy(true);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_delete_assets',
          items: selectedAssets.map((a) => ({
            id: a.id || undefined,
            storage_key: a.storage_key || undefined,
            url: a.url || undefined,
          })),
        }),
      });
      const data = await readResponseJson<{ error?: string; deleted?: number }>(res);
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success(`已删除 ${data.deleted ?? selectedAssets.length} 项`);
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
      const fd = new FormData();
      fd.append('action', 'upload_assets');
      if (activeFolderId) fd.append('girlfriend_id', activeFolderId);
      fd.append('kind', 'girlfriend');
      for (const file of Array.from(files)) fd.append('files', file);
      const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
      const data = await readResponseJson<{ error?: string; uploaded?: number }>(res).catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '上传失败');
      toast.success(`已上传 ${(data as { uploaded?: number }).uploaded ?? files.length} 个文件到当前文件夹`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const cutSelected = () => {
    if (!selectedAssets.length) return toast.message('请先多选图片');
    setClipboard({ mode: 'cut', items: selectedAssets });
    toast.success(`已剪切 ${selectedAssets.length} 项`);
  };

  const copySelected = () => {
    if (!selectedAssets.length) return toast.message('请先多选图片');
    setClipboard({ mode: 'copy', items: selectedAssets });
    toast.success(`已复制 ${selectedAssets.length} 项`);
  };

  const pasteClipboard = async () => {
    if (!clipboard?.items?.length) return toast.message('剪贴板为空');
    setBusy(true);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: clipboard.mode === 'cut' ? 'move_assets' : 'copy_assets',
          girlfriend_id: activeFolderId,
          items: clipboard.items.map((a) => ({
            id: a.id || undefined,
            storage_key: a.storage_key || undefined,
          })),
        }),
      });
      const data = await readResponseJson<{ error?: string; changed?: number; failed?: number }>(res);
      if (!res.ok) throw new Error(data.error || '粘贴失败');
      toast.success(`${clipboard.mode === 'cut' ? '已移动' : '已复制'} ${data.changed ?? clipboard.items.length} 项`);
      if (clipboard.mode === 'cut') setClipboard(null);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '粘贴失败');
    } finally {
      setBusy(false);
    }
  };

  const moveSelectedTo = async () => {
    if (!selectedAssets.length) return toast.message('请先多选图片');
    const target = moveTarget === 'uncategorized' ? null : moveTarget;
    setBusy(true);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move_assets',
          girlfriend_id: target,
          items: selectedAssets.map((a) => ({
            id: a.id || undefined,
            storage_key: a.storage_key || undefined,
          })),
        }),
      });
      const data = await readResponseJson<{ error?: string; changed?: number }>(res);
      if (!res.ok) throw new Error(data.error || '移动失败');
      toast.success(`已移动 ${data.changed ?? selectedAssets.length} 项`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移动失败');
    } finally {
      setBusy(false);
    }
  };

  const folderTitle =
    activeFolderId === null
      ? '未分类'
      : gfMap.get(activeFolderId)?.name || `伴侣 ${activeFolderId.slice(0, 8)}`;

  return (
    <div className="min-h-screen bg-[#F5F7FA] p-4 md:p-6" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">创作中心</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-[#1E293B]">
            <FolderOpen className="h-6 w-6 text-violet-600" />
            公共资产库
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
            已分类按伴侣文件夹展示；未绑定伴侣的结果进入「未分类」。在文件夹内可多选、上传、剪切/复制/粘贴、移动与删除。
            创作工作台按伴侣生成会自动归入对应文件夹。
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
              <Heart className="h-4 w-4" /> 绑定伴侣
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {view === 'folders' ? (
        loading ? (
          <div className="flex h-48 items-center justify-center text-[#64748B]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载文件夹…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <div className="relative min-w-64 flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={folderQ} onChange={(e) => setFolderQ(e.target.value)} placeholder="搜索伴侣名称或资源库 ID" className="pl-9" />
              </div>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-[#334155]">
                <option value="all">全部分类</option>
                {assetKinds.map((kind) => <option key={kind} value={kind}>{kind === 'girlfriend' ? '伴侣图片' : kind === 'outfit' ? '服装' : kind === 'shop_item' ? '商品' : kind}</option>)}
              </select>
            </div>
            <section>
              <h2 className="mb-2 text-sm font-semibold text-[#334155]">未分类</h2>
              <button
                type="button"
                onClick={() => openFolder(null)}
                className="flex w-full max-w-sm items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:border-amber-300"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Folder className="h-7 w-7" />
                </div>
                <div>
                  <div className="font-semibold text-[#1E293B]">未分类</div>
                  <div className="text-xs text-[#64748B]">{folders.uncategorizedCount} 个文件 · 未绑定伴侣</div>
                </div>
              </button>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#334155]">已分类（按伴侣）</h2>
                <span className="text-xs text-[#94A3B8]">{visibleFolders.length} / {folders.classified.length} 个文件夹</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visibleFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => openFolder(f.id)}
                    className="group overflow-hidden rounded-xl border border-gray-100 bg-white text-left shadow-sm transition hover:border-violet-300 hover:shadow"
                  >
                    <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                      {f.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.cover} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-400">
                          <Folder className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-sm font-medium text-[#1E293B]">{f.name}</div>
                      <div className="mt-0.5 text-[11px] text-[#94A3B8]">{f.count} 个文件</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <Button variant="outline" size="sm" onClick={() => { setView('folders'); setSelected(new Set()); }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> 全部文件夹
            </Button>
            <div className="text-sm font-semibold text-[#1E293B]">{folderTitle}</div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索当前文件夹"
              className="max-w-xs"
            />
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-[#334155]">
              <option value="all">全部分类</option>
              {assetKinds.map((kind) => <option key={kind} value={kind}>{kind === 'girlfriend' ? '伴侣图片' : kind === 'outfit' ? '服装' : kind === 'shop_item' ? '商品' : kind}</option>)}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#334155] hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              上传到此文件夹
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
            <Button variant="outline" size="sm" disabled={!selected.size || busy} onClick={cutSelected} className="gap-1">
              <Scissors className="h-4 w-4" /> 剪切
            </Button>
            <Button variant="outline" size="sm" disabled={!selected.size || busy} onClick={copySelected} className="gap-1">
              <Copy className="h-4 w-4" /> 复制
            </Button>
            <Button variant="outline" size="sm" disabled={!clipboard || busy} onClick={pasteClipboard} className="gap-1">
              <ClipboardPaste className="h-4 w-4" /> 粘贴{clipboard ? `(${clipboard.items.length})` : ''}
            </Button>
            <div className="flex items-center gap-1">
              <select
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-[#334155]"
              >
                <option value="uncategorized">移动到：未分类</option>
                {girlfriends.map((g) => (
                  <option key={g.id} value={g.id}>移动到：{g.name || g.slug || g.id.slice(0, 8)}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" disabled={!selected.size || busy} onClick={moveSelectedTo} className="gap-1">
                <MoveRight className="h-4 w-4" /> 移动
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!selected.size || busy}
              onClick={removeSelected}
              className="gap-1 text-rose-600"
            >
              <Trash2 className="h-4 w-4" /> 删除选中 ({selected.size})
            </Button>
            <span className="text-xs text-[#94A3B8]">共 {activeAssets.length} 项</span>
            {activeFolderId ? (
              <Link href={`/admin/studio?girlfriendId=${encodeURIComponent(activeFolderId)}`} className="ml-auto">
                <Button size="sm" className="gap-1 bg-violet-600 hover:bg-violet-700">
                  <Sparkles className="h-4 w-4" /> 为该伴侣生成
                </Button>
              </Link>
            ) : null}
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center text-[#64748B]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载资产…
            </div>
          ) : activeAssets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-[#94A3B8]">
              此文件夹为空。可上传，或去{' '}
              <Link
                href={activeFolderId ? `/admin/studio?girlfriendId=${encodeURIComponent(activeFolderId)}` : '/admin/studio'}
                className="text-violet-600 underline"
              >
                创作工作台
              </Link>{' '}
              生成（会自动归类）。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {activeAssets.map((a) => {
                const key = assetKey(a);
                const url = a.preview_url || a.url || '';
                const on = selected.has(key);
                return (
                  <div
                    key={key}
                    className={`group relative overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                      on ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(key)}
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
                        <img src={url} alt={a.name || key} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">无预览</div>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate text-[11px] font-medium text-[#334155]">{a.name || a.storage_key || a.id}</div>
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
        </>
      )}
    </div>
  );
}
