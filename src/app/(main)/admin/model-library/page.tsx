'use client';

/**
 * Admin · Civitai 模型库
 * 搜索 Civitai → 入库 → 批量选择 → 自动生成下载脚本 → RunPod 执行
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Search, RefreshCw, ExternalLink, Plus, Trash2,
  Library, Copy, Layers, Sparkles,
  CheckSquare, Square, Terminal, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Any = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  body: '身材', action: '动作 NSFW', outfit: '服装', prop: '道具',
  detail: '细节', style: '风格', checkpoint: '主模型',
};

const STATUS_LABEL: Record<string, string> = {
  wishlist: '想下', queued: '待下载', downloaded: '已下载', failed: '失败',
};

const STATUS_COLOR: Record<string, string> = {
  wishlist: 'text-slate-400',
  queued: 'text-amber-400',
  downloaded: 'text-emerald-400',
  failed: 'text-rose-400',
};

export default function AdminModelLibraryPage() {
  const [tab, setTab] = useState<'search' | 'library' | 'export'>('search');
  const [status, setStatus] = useState<Any | null>(null);
  const [library, setLibrary] = useState<Any[]>([]);
  const [loadingLib, setLoadingLib] = useState(true);

  // search
  const [query, setQuery] = useState('curvy body flux');
  const [type, setType] = useState('LORA');
  const [sort, setSort] = useState('Most Downloaded');
  const [nsfw, setNsfw] = useState(true);
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<Any[]>([]);

  // library filters + selection
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // export
  const [exportScript, setExportScript] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/model-library?view=status');
      const data = await readResponseJson<Any>(res);
      setStatus(data);
    } catch { /* ignore */ }
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoadingLib(true);
    try {
      const res = await authedFetch('/api/admin/model-library?view=library');
      const data = await readResponseJson<Any>(res);
      setLibrary(data.library?.items || []);
      setStatus((s) => ({
        ...(s || {}),
        civitai_configured: data.civitai_configured,
        catalog_version: data.catalog_version,
      }));
    } catch {
      toast.error('加载模型库失败');
    } finally {
      setLoadingLib(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadLibrary();
  }, [loadStatus, loadLibrary]);

  // ─── Search ─────────────────────────────────────────────
  async function doSearch() {
    setSearching(true);
    try {
      const qs = new URLSearchParams({
        view: 'search', query, type, sort,
        nsfw: nsfw ? '1' : '0', base: 'Flux.1 D', limit: '24',
      });
      const res = await authedFetch(`/api/admin/model-library?${qs}`);
      const data = await readResponseJson<Any>(res);
      if (!res.ok) {
        const msg = data.error || '搜索失败';
        if (/CIVITAI_API_TOKEN|auth/i.test(msg)) {
          toast.error('Civitai API Token 未配置！在 Vercel 环境变量添加 CIVITAI_API_TOKEN 后重新部署');
        } else {
          toast.error(msg);
        }
        return;
      }
      setHits(data.items || []);
      if (!(data.items || []).length) toast.message('没有结果，换个关键词试试');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Civitai 搜索失败');
    } finally {
      setSearching(false);
    }
  }

  // ─── Add to library ─────────────────────────────────────
  async function addHit(item: Any, category?: string) {
    try {
      const res = await authedFetch('/api/admin/model-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_civitai', item, category, status: 'queued' }),
      });
      const data = await readResponseJson<Any>(res);
      if (!res.ok) {
        const msg = data.error || '入库失败';
        if (/Invalid|filename|version/i.test(msg)) {
          toast.error(`入库失败：Civitai 返回数据不完整（${msg}）。尝试换一个版本`);
        } else {
          toast.error(`入库失败：${msg}`);
        }
        return;
      }
      setLibrary(data.library?.items || []);
      toast.success(`已入库：${item.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '入库失败');
    }
  }

  // ─── Batch add all search results ────────────────────────
  async function addAllHits() {
    if (!hits.length) return;
    let added = 0;
    let failed = 0;
    for (const h of hits) {
      try {
        const res = await authedFetch('/api/admin/model-library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_civitai', item: h, status: 'queued' }),
        });
        if (res.ok) added++;
        else failed++;
      } catch {
        failed++;
      }
    }
    toast.success(`批量入库完成：${added} 成功，${failed} 失败`);
    void loadLibrary();
  }

  // ─── Update / Remove ────────────────────────────────────
  async function updateItem(id: string, patch: Any) {
    const res = await authedFetch('/api/admin/model-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, patch }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok) { toast.error(data.error || '更新失败'); return; }
    setLibrary(data.library?.items || []);
  }

  async function removeItem(id: string) {
    if (!confirm('从模型库移除？不会删除网盘文件。')) return;
    const res = await authedFetch('/api/admin/model-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok) { toast.error(data.error || '删除失败'); return; }
    setLibrary(data.library?.items || []);
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    toast.success('已移除');
  }

  // ─── Bulk operations ────────────────────────────────────
  async function bulkStatus(newStatus: string) {
    if (!selected.size) { toast.message('先勾选要操作的项'); return; }
    const ids = [...selected];
    const res = await authedFetch('/api/admin/model-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_status', ids, status: newStatus }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok) { toast.error(data.error || '批量更新失败'); return; }
    setLibrary(data.library?.items || []);
    setSelected(new Set());
    toast.success(`已批量标记 ${ids.length} 项为「${STATUS_LABEL[newStatus] || newStatus}」`);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    const ids = filteredLibrary.map((i) => i.id);
    if (ids.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ids));
    }
  }

  // ─── Generate download script ───────────────────────────
  async function generateScript() {
    try {
      const res = await authedFetch('/api/admin/model-library?view=export&status=queued');
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      if (!lines.length) {
        toast.message('没有待下载项目。先在「我的库」勾选并标记为「待下载」');
        return;
      }

      const script = [
        '#!/bin/bash',
        '# SoulMate LoRA 自动下载脚本',
        `# 生成时间: ${new Date().toLocaleString()}`,
        `# 共 ${lines.length} 个文件`,
        '',
        '# 配置',
        'VOLUME_DIR="${VOLUME_DIR:-/runpod-volume/models/loras}"',
        'TOKEN="${CIVITAI_API_TOKEN:-}"',
        '',
        'mkdir -p "$VOLUME_DIR"',
        'cd "$VOLUME_DIR"',
        '',
        '# 下载函数（支持断点续传）',
        'download_file() {',
        '  local filename="$1"',
        '  local url="$2"',
        '  if [ -f "$filename" ]; then',
        '    echo "[SKIP] $filename 已存在"',
        '    return 0',
        '  fi',
        '  echo "[DOWN] $filename"',
        '  if [ -n "$TOKEN" ]; then',
        '    wget -c --header="Authorization: Bearer $TOKEN" -O "$filename" "$url" 2>/dev/null',
        '  else',
        '    wget -c -O "$filename" "$url" 2>/dev/null',
        '  fi',
        '  if [ $? -eq 0 ]; then',
        '    echo "[OK] $filename"',
        '  else',
        '    echo "[FAIL] $filename"',
        '  fi',
        '}',
        '',
      ];

      for (const line of lines) {
        const [filename, url] = line.split('|');
        if (filename && url) {
          script.push(`download_file "${filename}" "${url}"`);
        }
      }

      script.push(
        '',
        'echo ""',
        'echo "===== 下载完成 ====="',
        'echo "文件位置: $VOLUME_DIR"',
        'ls -lh "$VOLUME_DIR"/*.safetensors 2>/dev/null | wc -l | xargs -I{} echo "共 {} 个 safetensors 文件"',
      );

      setExportScript(script.join('\n'));
      toast.success(`已生成下载脚本（${lines.length} 个文件）`);
    } catch {
      toast.error('生成脚本失败');
    }
  }

  function downloadScript() {
    if (!exportScript) { void generateScript(); return; }
    const blob = new Blob([exportScript], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'download-loras.sh';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyScript() {
    if (!exportScript) { void generateScript(); return; }
    navigator.clipboard.writeText(exportScript).then(
      () => toast.success('已复制到剪贴板'),
      () => toast.error('复制失败'),
    );
  }

  // ─── Filtered library ───────────────────────────────────
  const filteredLibrary = useMemo(() => {
    return library.filter((i) => {
      if (filter !== 'all' && i.category !== filter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      return true;
    });
  }, [library, filter, statusFilter]);

  const queuedCount = library.filter((i) => i.status === 'queued').length;
  const downloadedCount = library.filter((i) => i.status === 'downloaded').length;

  return (
    <div className="min-h-screen bg-[#0f0f17] text-slate-100">
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Library className="h-5 w-5 text-purple-400" />
              Civitai 模型库
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              搜索 FLUX LoRA → 入库 → 批量选择 → 自动生成下载脚本 → RunPod 执行
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="border-white/10" onClick={() => { void loadLibrary(); void loadStatus(); }}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> 刷新
            </Button>
            <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-500">
              <Link href="/admin/studio">创作工作台</Link>
            </Button>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1a1a28] p-3 text-xs text-slate-400">
          <Badge variant="outline" className={cn(status?.civitai_configured ? 'border-emerald-500/50 text-emerald-400' : 'border-amber-500/50 text-amber-400')}>
            {status?.civitai_configured ? 'Civitai Token ✓' : '缺少 CIVITAI_API_TOKEN'}
          </Badge>
          <span>库内 {library.length} 项</span>
          <span className="text-amber-400">待下载 {queuedCount}</span>
          <span className="text-emerald-400">已下载 {downloadedCount}</span>
          {!status?.civitai_configured && (
            <span className="text-amber-400 font-medium">
              → Vercel 环境变量添加 CIVITAI_API_TOKEN 后重部署
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.08] bg-[#16161f] p-1 w-fit">
          {[
            { id: 'search', label: 'Civitai 搜索', icon: Search },
            { id: 'library', label: `我的库 (${library.length})`, icon: Layers },
            { id: 'export', label: `下载脚本 (${queuedCount})`, icon: Terminal },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors',
                tab === t.id ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ Search Tab ═══ */}
        {tab === 'search' && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-white/[0.08] bg-[#1a1a28] p-4 md:grid-cols-[1fr_120px_140px_auto_auto]">
              <div>
                <Label className="text-xs text-slate-500">关键词</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
                  placeholder="例如：curvy body / lingerie / cowgirl"
                  className="mt-1 border-white/10 bg-black/30"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500">类型</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1 border-white/10 bg-black/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LORA">LoRA</SelectItem>
                    <SelectItem value="Checkpoint">Checkpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500">排序</Label>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="mt-1 border-white/10 bg-black/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Most Downloaded">下载最多</SelectItem>
                    <SelectItem value="Highest Rated">评分最高</SelectItem>
                    <SelectItem value="Newest">最新</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-400 pb-2">
                  <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="rounded" />
                  NSFW
                </label>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => void doSearch()} disabled={searching} className="bg-purple-600 hover:bg-purple-500">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-1">搜索</span>
                </Button>
              </div>
            </div>

            {hits.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{hits.length} 个结果</span>
                <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-300" onClick={() => void addAllHits()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> 全部入库
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {hits.map((h) => (
                <div key={`${h.model_id}-${h.version_id}`} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a28] shadow-sm">
                  <div className="relative aspect-[3/4] bg-black/40">
                    {h.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.preview_url} alt={h.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-600 text-sm">无预览</div>
                    )}
                    {h.nsfw && <Badge className="absolute left-2 top-2 bg-rose-600">NSFW</Badge>}
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="line-clamp-2 text-sm font-semibold text-slate-100">{h.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {h.base_model || '—'} · v{h.version_name}
                      {h.size_kb ? ` · ${(h.size_kb / 1024).toFixed(1)}MB` : ''}
                    </div>
                    {!!h.trigger_words?.length && (
                      <div className="line-clamp-1 text-[11px] text-purple-400">
                        触发词：{h.trigger_words.slice(0, 3).join(', ')}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-500" onClick={() => void addHit(h)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> 入库
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 border-white/10" asChild>
                        <a href={h.page_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                    <div className="truncate font-mono text-[10px] text-slate-500">{h.filename}</div>
                  </div>
                </div>
              ))}
            </div>

            {!hits.length && !searching && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-sm text-slate-500">
                输入关键词搜索 Civitai FLUX LoRA（需要 CIVITAI_API_TOKEN）
              </div>
            )}
          </div>
        )}

        {/* ═══ Library Tab ═══ */}
        {tab === 'library' && (
          <div className="space-y-3">
            {/* Filters + Bulk actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-32 border-white/10 bg-black/30"><SelectValue placeholder="分类" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {Object.entries(CAT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 border-white/10 bg-black/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="wishlist">想下</SelectItem>
                  <SelectItem value="queued">待下载</SelectItem>
                  <SelectItem value="downloaded">已下载</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>

              <div className="mx-2 h-5 w-px bg-white/10" />

              {/* Select all */}
              <Button
                size="sm" variant="ghost"
                className="text-slate-400 hover:text-white"
                onClick={toggleSelectAll}
              >
                {filteredLibrary.length > 0 && filteredLibrary.every((i) => selected.has(i.id))
                  ? <CheckSquare className="mr-1 h-4 w-4 text-purple-400" />
                  : <Square className="mr-1 h-4 w-4" />
                }
                全选 ({filteredLibrary.length})
              </Button>

              {selected.size > 0 && (
                <>
                  <span className="text-xs text-purple-400">已选 {selected.size}</span>
                  <Button size="sm" variant="outline" className="h-7 border-amber-500/30 text-amber-300 text-xs" onClick={() => void bulkStatus('queued')}>
                    标记待下载
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 border-emerald-500/30 text-emerald-300 text-xs" onClick={() => void bulkStatus('downloaded')}>
                    标记已下载
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 border-slate-500/30 text-slate-400 text-xs" onClick={() => void bulkStatus('wishlist')}>
                    改为想下
                  </Button>
                </>
              )}
            </div>

            {/* Library list */}
            {loadingLib ? (
              <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
            ) : (
              <div className="space-y-1">
                {filteredLibrary.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                      selected.has(item.id)
                        ? 'border-purple-500/40 bg-purple-500/[0.06]'
                        : 'border-white/[0.06] bg-[#1a1a28] hover:border-white/[0.12]',
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.id)}
                      className="shrink-0 text-slate-500 hover:text-purple-400"
                    >
                      {selected.has(item.id)
                        ? <CheckSquare className="h-4 w-4 text-purple-400" />
                        : <Square className="h-4 w-4" />
                      }
                    </button>

                    {/* Thumbnail */}
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-black/30">
                      {item.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.preview_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-200">{item.label}</span>
                        <Badge variant="outline" className="text-[10px] border-white/10 text-slate-500">
                          {CAT_LABEL[item.category] || item.category}
                        </Badge>
                        <span className={cn('text-[10px] font-medium', STATUS_COLOR[item.status] || 'text-slate-500')}>
                          {STATUS_LABEL[item.status] || item.status}
                        </span>
                        {item.nsfw && <Badge className="bg-rose-600/80 text-[10px] h-4">NSFW</Badge>}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500 truncate">{item.filename}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Select
                        value={item.status}
                        onValueChange={(v) => void updateItem(item.id, { status: v })}
                      >
                        <SelectTrigger className="h-7 w-24 border-white/10 bg-black/30 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wishlist">想下</SelectItem>
                          <SelectItem value="queued">待下载</SelectItem>
                          <SelectItem value="downloaded">已下载</SelectItem>
                          <SelectItem value="failed">失败</SelectItem>
                        </SelectContent>
                      </Select>
                      {item.page_url && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" asChild>
                          <a href={item.page_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-rose-500/60 hover:text-rose-400"
                        onClick={() => void removeItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {!filteredLibrary.length && (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
                    库为空或筛选无结果
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ Export Tab ═══ */}
        {tab === 'export' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#1a1a28] p-5 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Terminal className="h-4 w-4 text-purple-400" /> 自动生成下载脚本
              </h2>

              <div className="text-sm text-slate-400 space-y-2">
                <p><strong className="text-slate-200">使用方法：</strong></p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>在「我的库」勾选要下载的项，标记为「待下载」</li>
                  <li>点击下方按钮生成 shell 脚本</li>
                  <li>在 RunPod pod（挂载 soulmate-models-ca2）执行脚本</li>
                </ol>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void generateScript()} className="bg-purple-600 hover:bg-purple-500">
                  <Sparkles className="mr-1 h-4 w-4" /> 生成下载脚本
                </Button>
                {exportScript && (
                  <>
                    <Button variant="outline" className="border-white/10" onClick={copyScript}>
                      <Copy className="mr-1 h-4 w-4" /> 复制脚本
                    </Button>
                    <Button variant="outline" className="border-white/10" onClick={downloadScript}>
                      <FileDown className="mr-1 h-4 w-4" /> 下载 .sh
                    </Button>
                  </>
                )}
              </div>

              {exportScript && (
                <pre className="overflow-x-auto rounded-lg bg-black/50 border border-white/[0.06] p-4 text-[11px] text-emerald-300 leading-relaxed max-h-[400px] overflow-y-auto">
                  {exportScript}
                </pre>
              )}

              {!exportScript && (
                <pre className="overflow-x-auto rounded-lg bg-black/50 border border-white/[0.06] p-4 text-[11px] text-slate-500 leading-relaxed">
{`# 点击「生成下载脚本」自动生成
# 脚本包含：
#   - 自动创建目录
#   - 断点续传 wget
#   - 自动跳过已下载文件
#   - Civitai Token 认证（如果设置了环境变量）
#
# 执行方式：
#   export CIVITAI_API_TOKEN=你的token
#   chmod +x download-loras.sh
#   ./download-loras.sh`}
                </pre>
              )}
            </div>

            {/* Quick reference */}
            <div className="rounded-xl border border-white/[0.08] bg-[#1a1a28] p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">RunPod 快速命令</h3>
              <pre className="overflow-x-auto rounded-lg bg-black/50 border border-white/[0.06] p-3 text-[11px] text-cyan-300">
{`# 挂载 volume 后一键执行
export CIVITAI_API_TOKEN=你的token
cd /runpod-volume/models/loras/
# 粘贴脚本内容，或：
wget -O download-loras.sh <你的脚本URL>
chmod +x download-loras.sh
./download-loras.sh`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
