'use client';

/**
 * Admin · Civitai 模型库
 * 搜索 Civitai → 入库 → 导出下载清单 → 本机/RunPod 出图引擎使用
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
  Loader2, Search, Download, RefreshCw, ExternalLink, Plus, Trash2,
  Library, Sparkles, Copy, CheckCircle2, Layers, Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Any = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  body: '身材',
  action: '动作 NSFW',
  outfit: '服装',
  prop: '道具',
  detail: '细节',
  style: '风格',
  checkpoint: '主模型',
};

export default function AdminModelLibraryPage() {
  const [tab, setTab] = useState<'search' | 'library' | 'presets' | 'export'>('search');
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

  // presets
  const [paramPresets, setParamPresets] = useState<Any[]>([]);
  const [scenePresets, setScenePresets] = useState<Any[]>([]);
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadStatus = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/model-library?view=status');
      const data = await readResponseJson<Any>(res);
      setStatus(data);
    } catch {
      /* ignore */
    }
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
    } catch (e) {
      toast.error('加载模型库失败');
    } finally {
      setLoadingLib(false);
    }
  }, []);

  const loadPresets = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/model-library?view=presets');
      const data = await readResponseJson<Any>(res);
      setParamPresets(data.param_presets || []);
      setScenePresets(data.scene_presets || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadLibrary();
    void loadPresets();
  }, [loadStatus, loadLibrary, loadPresets]);

  async function doSearch() {
    setSearching(true);
    try {
      const qs = new URLSearchParams({
        view: 'search',
        query,
        type,
        sort,
        nsfw: nsfw ? '1' : '0',
        base: 'Flux.1 D',
        limit: '24',
      });
      const res = await authedFetch(`/api/admin/model-library?${qs}`);
      const data = await readResponseJson<Any>(res);
      if (!res.ok) throw new Error(data.error || '搜索失败');
      setHits(data.items || []);
      if (!(data.items || []).length) toast.message('没有结果，换个关键词试试');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Civitai 搜索失败');
    } finally {
      setSearching(false);
    }
  }

  async function addHit(item: Any, category?: string) {
    try {
      const res = await authedFetch('/api/admin/model-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_civitai',
          item,
          category,
          status: 'queued',
        }),
      });
      const data = await readResponseJson<Any>(res);
      if (!res.ok) throw new Error(data.error || '入库失败');
      setLibrary(data.library?.items || []);
      toast.success(`已入库：${item.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '入库失败');
    }
  }

  async function updateItem(id: string, patch: Any) {
    const res = await authedFetch('/api/admin/model-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, patch }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok) {
      toast.error(data.error || '更新失败');
      return;
    }
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
    if (!res.ok) {
      toast.error(data.error || '删除失败');
      return;
    }
    setLibrary(data.library?.items || []);
    toast.success('已移除');
  }

  async function copyExport() {
    try {
      const res = await authedFetch('/api/admin/model-library?view=export&status=queued');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      toast.success('已复制 lora-urls.txt（queued）');
    } catch {
      toast.error('导出失败');
    }
  }

  async function downloadExport() {
    const res = await authedFetch('/api/admin/model-library?view=export&status=queued');
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lora-urls.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filteredLibrary = useMemo(() => {
    return library.filter((i) => {
      if (filter !== 'all' && i.category !== filter) return false;
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      return true;
    });
  }, [library, filter, statusFilter]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-sm text-violet-900">
        <div className="font-semibold">创作中心 · 模型与 LoRA</div>
        <p className="mt-1 text-xs leading-relaxed text-violet-800/90">
          在此搜索 Civitai → 入库 → 导出下载清单到 RunPod 网盘。生成时在「创作工作台」选择模型/LoRA。
          一次只挂 1 个 LoRA；服装类需盘上文件名与清单一致。
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <a href="/admin/studio" className="rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white">打开创作工作台</a>
          <a href="/admin/assets" className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-violet-800">公共资产库</a>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Library className="h-5 w-5 text-violet-600" />
            Civitai 模型库
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            搜索并收藏 FLUX LoRA/Checkpoint → 导出下载清单 → 在你的 Comfy/RunPod 出图。
            引擎仍是本站 RunPod，不是 Civitai 在线生成。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { void loadLibrary(); void loadStatus(); }}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> 刷新
          </Button>
          <Button asChild size="sm" className="bg-violet-600 hover:bg-violet-500">
            <Link href="/admin/comfy">打开 Comfy 生成</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <Badge variant="outline" className={cn(status?.civitai_configured ? 'border-emerald-500 text-emerald-700' : 'border-amber-500 text-amber-700')}>
          {status?.civitai_configured ? 'CIVITAI_API_TOKEN 已配置' : '缺少 CIVITAI_API_TOKEN'}
        </Badge>
        <span>卷：{status?.volume || 'soulmate-models-ca2'}</span>
        <span>·</span>
        <span>区：{status?.region || 'US-CA-2'}</span>
        <span>·</span>
        <span>目录 v{status?.catalog_version ?? '—'}</span>
        <span>·</span>
        <span>库内 {library.length} 项</span>
        {!status?.civitai_configured && (
          <span className="text-amber-700">在 Vercel 环境变量加 CIVITAI_API_TOKEN 后可搜 NSFW 模型</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {[
          { id: 'search', label: 'Civitai 搜索', icon: Search },
          { id: 'library', label: '我的库', icon: Layers },
          { id: 'presets', label: '生成预设', icon: Settings2 },
          { id: 'export', label: '下载清单', icon: Download },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm',
              tab === t.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_160px_auto_auto]">
            <div>
              <Label className="text-xs text-slate-500">关键词</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void doSearch()}
                placeholder="例如：curvy body / lingerie / cowgirl"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">类型</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LORA">LoRA</SelectItem>
                  <SelectItem value="Checkpoint">Checkpoint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">排序</Label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Most Downloaded">下载最多</SelectItem>
                  <SelectItem value="Highest Rated">评分最高</SelectItem>
                  <SelectItem value="Newest">最新</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
                NSFW
              </label>
            </div>
            <div className="flex items-end">
              <Button onClick={() => void doSearch()} disabled={searching} className="w-full bg-violet-600 hover:bg-violet-500">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1">搜索</span>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {hits.map((h) => (
              <div key={`${h.model_id}-${h.version_id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="relative aspect-[3/4] bg-slate-100">
                  {h.preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.preview_url} alt={h.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400 text-sm">无预览</div>
                  )}
                  {h.nsfw && (
                    <Badge className="absolute left-2 top-2 bg-rose-600">NSFW</Badge>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="line-clamp-2 text-sm font-semibold text-slate-900">{h.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {h.base_model || '—'} · v{h.version_name}
                  </div>
                  {!!h.trigger_words?.length && (
                    <div className="line-clamp-2 text-[11px] text-violet-700">
                      触发词：{h.trigger_words.slice(0, 4).join(', ')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-500" onClick={() => void addHit(h)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> 入库
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" asChild>
                      <a href={h.page_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                  <div className="truncate font-mono text-[10px] text-slate-400">{h.filename}</div>
                </div>
              </div>
            ))}
          </div>
          {!hits.length && !searching && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
              输入关键词搜索 Civitai（默认 Base = Flux.1 D）
            </div>
          )}
        </div>
      )}

      {tab === 'library' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="分类" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {Object.entries(CAT_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="wishlist">想下</SelectItem>
                <SelectItem value="queued">待下载</SelectItem>
                <SelectItem value="downloaded">已下载</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingLib ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
          ) : (
            <div className="space-y-2">
              {filteredLibrary.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 md:flex-row md:items-center">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {item.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.preview_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{item.label}</span>
                      <Badge variant="outline">{CAT_LABEL[item.category] || item.category}</Badge>
                      <Badge variant="outline">{item.status}</Badge>
                      {item.nsfw && <Badge className="bg-rose-600">NSFW</Badge>}
                      <Badge variant="secondary">{item.source}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">{item.filename}</div>
                    {!!item.trigger_words?.length && (
                      <div className="mt-1 text-[11px] text-violet-700 line-clamp-1">
                        {item.trigger_words.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={item.status}
                      onValueChange={(v) => void updateItem(item.id, { status: v })}
                    >
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wishlist">想下</SelectItem>
                        <SelectItem value="queued">待下载</SelectItem>
                        <SelectItem value="downloaded">已下载</SelectItem>
                        <SelectItem value="failed">失败</SelectItem>
                      </SelectContent>
                    </Select>
                    {item.page_url && (
                      <Button size="sm" variant="outline" className="h-8" asChild>
                        <a href={item.page_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-rose-600" onClick={() => void removeItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {!filteredLibrary.length && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">库为空或筛选无结果</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'presets' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-violet-600" /> 参数预设（中文）
            </div>
            <div className="space-y-2">
              {paramPresets.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="font-medium text-slate-900">{p.label}</div>
                  <div className="text-xs text-slate-500">{p.hint}</div>
                  <div className="mt-1 font-mono text-[11px] text-slate-600">
                    {p.width}×{p.height} · steps {p.steps} · cfg {p.cfg} · {p.sampler}/{p.scheduler}
                  </div>
                </div>
              ))}
              {!paramPresets.length && <p className="text-sm text-slate-500">暂无预设</p>}
            </div>
            <p className="mt-3 text-xs text-slate-500">在 Comfy 生成页可一键套用同类参数。</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-pink-600" /> 场景预设
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {scenePresets.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="mt-1 line-clamp-3 text-[11px] text-slate-500">{s.positivePrompt}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" /> 下载到网盘
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>在「Civitai 搜索」入库模型（状态默认「待下载」）</li>
            <li>导出 <code className="rounded bg-slate-100 px-1">lora-urls.txt</code></li>
            <li>在 RunPod 下载机（挂载 soulmate-models-ca2）执行：</li>
          </ol>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-[12px] text-cyan-200">{`export CIVITAI_API_TOKEN=你的token
cd /runpod-volume
# 放入 download-loras.sh 与 lora-urls.txt
chmod +x download-loras.sh
./download-loras.sh --from-file ./lora-urls.txt
# 文件会出现在 models/loras/
`}</pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copyExport()} className="bg-violet-600 hover:bg-violet-500">
              <Copy className="mr-1 h-4 w-4" /> 复制待下载清单
            </Button>
            <Button variant="outline" onClick={() => void downloadExport()}>
              <Download className="mr-1 h-4 w-4" /> 下载 lora-urls.txt
            </Button>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            下载完成后，到 Comfy 页选对应 LoRA 文件名出图。把状态改成「已下载」方便管理。
          </div>
        </div>
      )}
    </div>
  );
}
