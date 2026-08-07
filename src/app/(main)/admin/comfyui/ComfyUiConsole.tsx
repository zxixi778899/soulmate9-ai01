'use client';

/**
 * ComfyUI 控制台 — 全站图片生产
 * 9 大预设工作流：生成角色 / 立绘(一致性) / 场景 / 服装道具 /
 * 一键换装 / 一键姿势 / 一键换背景 / WAN2.2 视频 / 动态工作流
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PROMPT_PRESETS } from '@/lib/comfyui-console/prompt-presets';
import {
  Workflow, Play, Loader2, User, Frame, Mountain, Shirt, Wand2, PersonStanding,
  Image as ImageIcon, Video, Braces, RefreshCw, Save, Trash2, Copy, Plus,
  Upload, X, Dices, CheckCircle2, XCircle, Clock, ExternalLink, Settings2,
  Layers, Server, FileJson, History, Sparkles, ChevronDown, AlertTriangle, Power,
  Heart,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  extractRawControls,
  applyRawControlValues,
  validateRawGraph,
  type RawControl,
} from '@/lib/comfyui-console/workflow-controls';

type Any = Record<string, any>;

const API = '/api/admin/comfyui';

const ICONS: Record<string, any> = {
  User, Frame, Mountain, Shirt, Wand2, PersonStanding, Image: ImageIcon, Video, Braces, Workflow,
};

const ENGINE_META: Record<string, { label: string; cls: string }> = {
  flux: { label: 'Flux FP8', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  wan: { label: 'WAN 2.2', cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
  raw: { label: 'RAW 图', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  IN_QUEUE: { label: '排队中', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  IN_PROGRESS: { label: '生成中', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  COMPLETED: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  FAILED: { label: '失败', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const SIZE_PRESETS = [
  { label: '竖版 832×1216', w: 832, h: 1216 },
  { label: '横版 1216×832', w: 1216, h: 832 },
  { label: '方形 1024×1024', w: 1024, h: 1024 },
  { label: '视频 832×480', w: 832, h: 480 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

/** 客户端压缩参考图（≤1280px JPEG），避免请求体过大 */
async function compressImageFile(file: File, maxDim = 1280): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read file failed'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('decode failed'));
    im.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 1 && file.size < 800_000) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.88);
  const b64 = out.split(',')[1] || '';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' });
}

function EngineBadge({ engine }: { engine: string }) {
  const meta = ENGINE_META[engine] || ENGINE_META.flux;
  return (
    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold', meta.cls)}>
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.IN_QUEUE;
  const pending = status === 'IN_QUEUE' || status === 'IN_PROGRESS';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold', meta.cls)}>
      {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : status === 'COMPLETED' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {meta.label}
    </span>
  );
}

/** 参考图选择器：上传 / URL / 预览 / 清除；选中伴侣时优先展示其资源库图片 */
function ImagePicker(props: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  library?: Array<{ url?: string; workflow_key?: string | null }>;
  libraryTitle?: string;
  preferFace?: boolean;
}) {
  const { value, onChange, library, libraryTitle, preferFace } = props;
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const libraryImages = useMemo(() => {
    const items = (library || []).filter((a) => !!a.url && !isVideoUrl(String(a.url)));
    if (!preferFace) return items.slice(0, 12);
    const isFace = (a: { workflow_key?: string | null }) =>
      a.workflow_key === 'wf-character';
    return [...items.filter(isFace), ...items.filter((a) => !isFace(a))].slice(0, 12);
  }, [library, preferFace]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const fd = new FormData();
      fd.append('action', 'upload_ref');
      fd.append('file', compressed);
      const res = await authedFetch(API, { method: 'POST', body: fd });
      const data = await readResponseJson<Any>(res);
      if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
      onChange(String(data.url));
      toast.success('参考图已上传');
    } catch (e) {
      toast.error(`参考图上传失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="参考图"
            className="h-28 w-28 rounded-md border border-white/10 object-cover"
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white hover:bg-rose-500"
            title="移除参考图"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-white/15 bg-white/[0.03] text-slate-500">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
        </div>
      )}
      {libraryImages.length > 0 ? (
        <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.05] p-1.5">
          <p className="mb-1 text-[10px] text-violet-300">{libraryTitle || '优先从伴侣资源库选择'}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {libraryImages.map((a, i) => (
              <button
                key={`${a.url}-${i}`}
                type="button"
                onClick={() => { onChange(String(a.url)); toast.success('已从伴侣资源库选用'); }}
                className={cn(
                  'h-14 w-11 shrink-0 overflow-hidden rounded border transition',
                  value === a.url ? 'border-violet-400' : 'border-white/15 hover:border-violet-300',
                )}
                title="点击选用"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="伴侣资源" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : library ? (
        <p className="rounded-md border border-dashed border-white/10 px-2 py-1.5 text-[10px] text-slate-500">
          伴侣资源库暂无图片，可本地上传或先生成角色
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3 w-3" /> 上传图片
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] || null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
          onClick={() => {
            const url = window.prompt('粘贴图片 URL');
            if (url?.trim()) onChange(url.trim());
          }}
        >
          <ExternalLink className="h-3 w-3" /> URL
        </Button>
      </div>
    </div>
  );
}

/** LoRA 多选叠加器（下拉菜单选择 + 强度调节） */
function LoraPicker(props: {
  loras: Any[];
  installed: string[];
  value: Array<{ id: string; strength: number }>;
  onChange: (v: Array<{ id: string; strength: number }>) => void;
}) {
  const { loras, installed, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return loras
      .filter((l) => l.id !== 'none' && l.filename)
      .filter((l) => !q || String(l.label).toLowerCase().includes(q) || String(l.filename).toLowerCase().includes(q))
      .slice(0, 60);
  }, [loras, filter]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="space-y-2">
      {value.map((item, idx) => {
        const meta = loras.find((l) => l.id === item.id);
        return (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-slate-200">{meta?.label || item.id}</div>
              <div className="truncate text-[10px] text-slate-500">{meta?.filename || ''}</div>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={item.strength}
              onChange={(e) => {
                const next = [...value];
                next[idx] = { ...next[idx], strength: Number(e.target.value) };
                onChange(next);
              }}
              className="w-24 accent-violet-500"
              title="LoRA 强度"
            />
            <span className="w-9 text-right text-[11px] text-slate-300">{item.strength.toFixed(2)}</span>
            <button type="button" onClick={() => onChange(value.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-rose-400">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {value.length < 3 ? (
        <div className="relative" ref={wrapRef}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-between border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="inline-flex items-center gap-1"><Plus className="h-3 w-3" /> 添加 LoRA（{value.length}/3）</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </Button>
          {open && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-white/15 bg-[#14141f] shadow-xl shadow-black/40">
              <div className="border-b border-white/10 p-1.5">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="搜索 LoRA（名称 / 文件名）"
                  className="h-7 border-white/10 bg-white/[0.03] text-[11px] text-slate-200"
                />
              </div>
              <div className="max-h-44 overflow-y-auto">
                {candidates.map((l) => {
                  const added = value.some((v) => v.id === l.id);
                  const isInstalled = installed.includes(l.filename);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      disabled={added}
                      onClick={() => {
                        onChange([...value, { id: l.id, strength: Number(l.default_strength ?? 0.7) }]);
                        setOpen(false);
                        setFilter('');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-white/5',
                        added ? 'opacity-40' : 'text-slate-200',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      {isInstalled ? (
                        <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-300">已挂载</span>
                      ) : (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] text-amber-300">未验证</span>
                      )}
                    </button>
                  );
                })}
                {!candidates.length && <div className="px-2 py-2 text-[11px] text-slate-500">无匹配 LoRA</div>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-slate-500">最多叠加 3 个 LoRA，总强度过高会自动等比缩放</p>
      )}
    </div>
  );
}

export default function ComfyUiConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const girlfriendId =
    searchParams.get('girlfriendId') || searchParams.get('girlfriend_id') || '';
  const [tab, setTab] = useState<'console' | 'workflows' | 'jobs' | 'loras' | 'infra'>('console');
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Any[]>([]);
  const [jobs, setJobs] = useState<Any[]>([]);
  const [config, setConfig] = useState<Any | null>(null);
  const [runpod, setRunpod] = useState<Any | null>(null);
  const [activeKey, setActiveKey] = useState('');
  const [form, setForm] = useState<Any>({});
  const [rawText, setRawText] = useState('');
  const [rawValues, setRawValues] = useState<Any>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<Any | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loraSearch, setLoraSearch] = useState('');
  const [loraCat, setLoraCat] = useState('all');
  const [healthResults, setHealthResults] = useState<Any>({});
  const [editing, setEditing] = useState<Any | null>(null);
  const [editTexts, setEditTexts] = useState({ defaults: '{}', schema: '[]', graph: '' });
  // 伴侣上下文
  const [girlfriend, setGirlfriend] = useState<Any | null>(null);
  const [girlfriendAssets, setGirlfriendAssets] = useState<Any[]>([]);
  const [girlfriends, setGirlfriends] = useState<Any[]>([]);
  const pollTokenRef = useRef(0);
  const girlfriendRef = useRef<Any | null>(null);

  const activeWf = useMemo(
    () => workflows.find((w) => w.key === activeKey) || null,
    [workflows, activeKey],
  );

  /** 切换当前伴侣（URL 参数驱动重新加载） */
  const selectGirlfriend = useCallback(
    (id: string) => {
      const clean = String(id || '').trim();
      router.replace(clean ? `/admin/comfyui?girlfriendId=${encodeURIComponent(clean)}` : '/admin/comfyui');
    },
    [router],
  );

  const loadAll = useCallback(async (keepActive = false) => {
    try {
      const url = girlfriendId
        ? `${API}?girlfriend_id=${encodeURIComponent(girlfriendId)}`
        : API;
      const res = await authedFetch(url);
      const data = await readResponseJson<Any>(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setWorkflows(data.workflows || []);
      setJobs(data.jobs || []);
      setConfig(data.config || null);
      setRunpod(data.runpod || null);
      const gf = data.girlfriend || null;
      girlfriendRef.current = gf;
      setGirlfriend(gf);
      setGirlfriendAssets(data.girlfriend_assets || []);
      setGirlfriends(data.girlfriends || []);
      if (!keepActive || !activeKey) {
        const first = (data.workflows || []).find((w: Any) => w.is_active !== false);
        if (first && !keepActive) setActiveKey(String(first.key));
      }
    } catch (e) {
      toast.error(`控制台加载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [activeKey, girlfriendId]);

  useEffect(() => {
    void loadAll();
    return () => {
      pollTokenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [girlfriendId]);

  /** 用伴侣描述预填 prompt 字段 */
  const prefillPrompt = useCallback((base: Any): Any => {
    const desc = String(girlfriendRef.current?.description || '').trim();
    if (desc && typeof base.prompt === 'string' && !base.prompt.trim()) {
      return { ...base, prompt: desc };
    }
    return base;
  }, []);

  /** 选中工作流 → 重置表单 */
  useEffect(() => {
    if (!activeWf) return;
    setForm(prefillPrompt(JSON.parse(JSON.stringify(activeWf.defaults || {}))));
    const graph = activeWf.workflow_json || null;
    setRawText(graph ? JSON.stringify(graph, null, 2) : '');
    setRawValues({});
    setShowAdvanced(false);
    setShowGraph(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  /** 伴侣数据加载完成 → 若当前表单 prompt 为空则补填 */
  useEffect(() => {
    if (!girlfriend) return;
    setForm((prev: Any) => prefillPrompt(prev || {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [girlfriend]);

  const rawControls: RawControl[] = useMemo(() => {
    if (activeWf?.engine !== 'raw' || !rawText) return [];
    try {
      return extractRawControls(JSON.parse(rawText));
    } catch {
      return [];
    }
  }, [activeWf, rawText]);

  const refreshJobs = useCallback(async () => {
    const res = await authedFetch(`${API}?view=jobs&limit=60`).catch(() => null);
    if (!res) return;
    const data = await readResponseJson<Any>(res).catch(() => null);
    if (data?.jobs) setJobs(data.jobs);
  }, []);

  const pollUntilDone = useCallback(async (jobId: string) => {
    const token = ++pollTokenRef.current;
    for (let i = 0; i < 180; i++) {
      if (pollTokenRef.current !== token) return;
      try {
        const res = await authedFetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', job_id: jobId }),
        });
        const data = await readResponseJson<Any>(res);
        if (data?.job) setActiveJob(data.job);
        const status = String(data?.job?.status || '');
        if (status === 'COMPLETED') {
          toast.success(data?.saved_to_girlfriend ? '生成完成，已存入伴侣资源库' : '生成完成');
          void refreshJobs();
          if (girlfriendRef.current) void loadAll(true);
          return;
        }
        if (status === 'FAILED') {
          toast.error(`任务失败: ${String(data?.job?.error || '未知错误').slice(0, 160)}`);
          void refreshJobs();
          return;
        }
      } catch {
        /* 网络抖动继续轮询 */
      }
      await sleep(4000);
    }
  }, [refreshJobs, loadAll]);

  const [optimizing, setOptimizing] = useState(false);
  const optimizePrompt = async () => {
    const wf = activeWf;
    const prompt = String(form.prompt || '').trim();
    if (!wf || !prompt) {
      toast.error('请先填写提示词');
      return;
    }
    setOptimizing(true);
    try {
      const res = await authedFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'optimize_prompt',
          prompt,
          intensity: Number(form.intensity) || 1,
          engine: wf.engine,
          girlfriend_id: girlfriendId || undefined,
        }),
      });
      const data = await readResponseJson<Any>(res);
      if (!res.ok || data.error) {
        toast.error(data.error || '提示词优化失败');
        return;
      }
      setForm((prev: Any) => ({ ...prev, prompt: data.optimized }));
      toast.success(
        data.channel === 'nsfw'
          ? `已用 ${data.model}（NSFW 路由）优化提示词`
          : `已用 ${data.model} 优化提示词`,
      );
    } catch {
      toast.error('提示词优化请求失败');
    } finally {
      setOptimizing(false);
    }
  };

  const handleSubmit = async () => {
    const wf = activeWf;
    if (!wf) return;
    for (const f of (wf.params_schema || []) as Any[]) {
      if (!f.required) continue;
      const v = form[f.key];
      if (v == null || (typeof v === 'string' && !v.trim())) {
        toast.error(`请填写「${f.label}」`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const params: Any = { ...form };
      if (wf.engine === 'raw') {
        let graph: Any;
        try {
          graph = JSON.parse(rawText || '{}');
        } catch {
          toast.error('工作流 JSON 解析失败，请检查语法');
          return;
        }
        const chk = validateRawGraph(graph);
        if (!chk.ok) {
          toast.error(chk.error || '工作流无效');
          return;
        }
        const merged = applyRawControlValues(graph, rawValues) as Any;
        for (const node of Object.values(merged) as Any[]) {
          if (node?.inputs && 'seed' in node.inputs && Number(node.inputs.seed) === -1) {
            node.inputs.seed = Math.floor(Math.random() * 2 ** 31);
          }
        }
        params.raw_graph = merged;
      }
      const res = await authedFetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          workflow_key: wf.key,
          params,
          girlfriend_id: girlfriendId || undefined,
        }),
      });
      const data = await readResponseJson<Any>(res);
      if (!res.ok || data.error) {
        toast.error(data.error || `提交失败 (HTTP ${res.status})`);
        return;
      }
      toast.success('任务已提交，GPU 排队中…');
      setActiveJob(data.job);
      void pollUntilDone(String(data.job.id));
    } finally {
      setSubmitting(false);
    }
  };

  /** 把结果图发送到指定工作流的参考图字段 */
  const sendToWorkflow = (targetKey: string, url: string) => {
    const target = workflows.find((w) => w.key === targetKey);
    if (!target) return;
    const nextForm: Any = JSON.parse(JSON.stringify(target.defaults || {}));
    const schema = (target.params_schema || []) as Any[];
    let applied = false;
    if (schema.some((f) => f.key === 'input_image')) {
      nextForm.input_image = url;
      applied = true;
    }
    if (schema.some((f) => f.key === 'ip_adapter_image')) {
      nextForm.ip_adapter_image = url;
      applied = true;
    }
    if (schema.some((f) => f.key === 'image')) {
      nextForm.image = url;
      applied = true;
    }
    if (!applied) {
      toast.error('目标工作流没有参考图字段');
      return;
    }
    setActiveKey(targetKey);
    setForm(nextForm);
    setTab('console');
    toast.success(`已发送到「${target.name}」`);
  };

  const asCurrentReference = (url: string) => {
    const wf = activeWf;
    if (!wf) return;
    const schema = (wf.params_schema || []) as Any[];
    const keys = ['input_image', 'ip_adapter_image', 'image'].filter((k) => schema.some((f) => f.key === k));
    if (!keys.length) {
      toast.error('当前工作流没有参考图字段');
      return;
    }
    const next = { ...form };
    for (const k of keys) next[k] = url;
    setForm(next);
    toast.success('已设为参考图');
  };

  const setField = (key: string, value: unknown) => {
    setForm((prev: Any) => ({ ...prev, [key]: value }));
  };

  const cancelJob = async (jobId: string) => {
    const res = await authedFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', job_id: jobId }),
    });
    const data = await readResponseJson<Any>(res);
    if (res.ok && data.success) {
      toast.success('已取消');
      if (activeJob?.id === jobId) setActiveJob({ ...activeJob, status: 'FAILED', error: '管理员手动取消' });
      void refreshJobs();
    } else {
      toast.error(data.error || '取消失败');
    }
  };

  const saveWorkflow = async () => {
    if (!editing) return;
    let defaults: Any = {};
    let schema: Any[] = [];
    let graph: Any | null = null;
    try {
      defaults = JSON.parse(editTexts.defaults || '{}');
    } catch {
      toast.error('默认参数 JSON 解析失败');
      return;
    }
    try {
      schema = JSON.parse(editTexts.schema || '[]');
      if (!Array.isArray(schema)) throw new Error('params_schema 必须是数组');
    } catch (e) {
      toast.error(`参数模板 JSON 无效: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (String(editing.engine) === 'raw' || editTexts.graph.trim()) {
      try {
        graph = JSON.parse(editTexts.graph || 'null');
      } catch {
        toast.error('工作流图 JSON 解析失败');
        return;
      }
    }
    const payload = {
      ...editing,
      name: String(editing.name || '').trim(),
      description: String(editing.description || ''),
      engine: editing.engine,
      category: editing.category,
      key: editing.key,
      sort_order: Number(editing.sort_order ?? 50),
      defaults,
      params_schema: schema,
      workflow_json: graph,
    };
    const res = await authedFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_workflow', workflow: payload }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok || data.error) {
      toast.error(data.error || '保存失败');
      return;
    }
    toast.success('工作流已保存');
    setEditing(null);
    await loadAll(true);
  };

  const openEditor = (wf?: Any) => {
    const base = wf
      ? { ...wf }
      : {
          id: '',
          key: '',
          name: '新建自定义工作流',
          category: 'image',
          engine: 'flux',
          description: '',
          icon: 'Workflow',
          sort_order: 50,
          is_preset: false,
          is_active: true,
          defaults: {},
          params_schema: [],
          workflow_json: null,
        };
    if (wf) base.id = wf.id;
    else base.id = '';
    setEditing(base);
    setEditTexts({
      defaults: JSON.stringify(wf?.defaults || {}, null, 2),
      schema: JSON.stringify(wf?.params_schema || [], null, 2),
      graph: wf?.workflow_json ? JSON.stringify(wf.workflow_json, null, 2) : '',
    });
  };

  const runWorkflowAction = async (action: string, extra: Any, okMsg: string) => {
    const res = await authedFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await readResponseJson<Any>(res);
    if (!res.ok || data.error) {
      toast.error(data.error || '操作失败');
      return false;
    }
    toast.success(okMsg);
    await loadAll(true);
    return true;
  };

  const checkHealth = async (endpointId: string) => {
    setHealthResults((prev: Any) => ({ ...prev, [endpointId]: { loading: true } }));
    const res = await authedFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'endpoint_health', endpoint_id: endpointId }),
    });
    const data = await readResponseJson<Any>(res);
    setHealthResults((prev: Any) => ({ ...prev, [endpointId]: data }));
  };

  const [presetValue, setPresetValue] = useState('');
  /** 预设只追加、不覆盖：中文选择 → 英文自然语言追加到提示词 */
  const applyPreset = (text: string) => {
    if (!text) return;
    setForm((prev: Any) => {
      const cur = String(prev.prompt || '').trim();
      return { ...prev, prompt: cur ? `${cur}, ${text}` : text };
    });
  };

  /** 表单字段渲染 */
  const renderField = (f: Any) => {
    const value = form[f.key];
    const common = 'border-white/10 bg-white/[0.03] text-slate-200';
    switch (f.type) {
      case 'textarea':
        return (
          <div className="space-y-1.5" key={f.key}>
            {f.key === 'prompt' && activeWf?.engine !== 'raw' ? (
              <div className="flex items-center justify-between gap-2">
                <FieldLabel field={f} />
                <div className="flex items-center gap-1.5">
                  <Select
                    value={presetValue}
                    onValueChange={(v) => {
                      applyPreset(v);
                      setPresetValue('');
                    }}
                  >
                    <SelectTrigger className="h-7 w-[132px] border-white/15 bg-white/5 text-[10px] text-violet-300">
                      <SelectValue placeholder="预设模板 (20 SFW + 30 NSFW)" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#16161f] text-slate-200 max-h-80">
                      <SelectGroup>
                        <SelectLabel className="text-[10px] text-violet-400">SFW · 场景 / 画质</SelectLabel>
                        {PROMPT_PRESETS.filter((p) => !p.nsfw).map((p) => (
                          <SelectItem key={p.label} value={p.text} className="text-[11px]">
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-[10px] text-rose-400">NSFW · 性爱 / 姿势</SelectLabel>
                        {PROMPT_PRESETS.filter((p) => p.nsfw).map((p) => (
                          <SelectItem key={p.label} value={p.text} className="text-[11px]">
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => void optimizePrompt()}
                  disabled={optimizing}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {optimizing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI 优化提示词
                </button>
                </div>
              </div>
            ) : (
              <FieldLabel field={f} />
            )}
            {Array.isArray(f.chips) && f.chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.chips.map((c: Any) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setForm((prev: Any) => ({ ...prev, ...(c.patch || {}) }))}
                    className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 hover:bg-violet-500/20"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={String(value ?? '')}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.placeholder}
              rows={f.key === 'prompt' ? 4 : 2}
              className={cn(common, 'text-[12px]')}
            />
          </div>
        );
      case 'image':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <ImagePicker
              value={String(value ?? '')}
              onChange={(url) => setField(f.key, url)}
              library={girlfriend ? girlfriendAssets : undefined}
              libraryTitle={girlfriend ? `${String(girlfriend.name || '伴侣')} 的资源库 · 点击选用` : undefined}
              preferFace={f.key === 'ip_adapter_image'}
            />
          </div>
        );
      case 'loras':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <LoraPicker
              loras={config?.loras || []}
              installed={config?.installed_loras || []}
              value={Array.isArray(value) ? value : []}
              onChange={(v) => setField(f.key, v)}
            />
          </div>
        );
      case 'slider':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} right={`${Number(value ?? f.min ?? 0).toFixed(2)}`} />
            <input
              type="range"
              min={f.min ?? 0}
              max={f.max ?? 1}
              step={f.step ?? 0.01}
              value={Number(value ?? f.min ?? 0)}
              onChange={(e) => setField(f.key, Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>
        );
      case 'seed':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <div className="flex gap-1.5">
              <Input
                type="number"
                value={Number(value ?? -1)}
                onChange={(e) => setField(f.key, Number(e.target.value))}
                className={cn(common, 'h-8 text-[12px]')}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                onClick={() => setField(f.key, -1)}
                title="随机种子"
              >
                <Dices className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      case 'select':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <Select value={String(value ?? '')} onValueChange={(v) => setField(f.key, v)}>
              <SelectTrigger className={cn(common, 'h-8 text-[12px]')}>
                <SelectValue placeholder="选择" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                {(f.options || []).map((o: Any) => (
                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'checkpoint':
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <Select value={String(value ?? '')} onValueChange={(v) => setField(f.key, v)}>
              <SelectTrigger className={cn(common, 'h-8 text-[12px]')}>
                <SelectValue placeholder="选择底模" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                {(config?.checkpoints || []).map((c: Any) => (
                  <SelectItem key={c.id} value={c.filename} className="text-[12px]">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'number':
      default:
        return (
          <div className="space-y-1.5" key={f.key}>
            <FieldLabel field={f} />
            <Input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step ?? 1}
              value={value == null ? '' : Number(value)}
              onChange={(e) => setField(f.key, e.target.value === '' ? '' : Number(e.target.value))}
              className={cn(common, 'h-8 text-[12px]')}
            />
          </div>
        );
    }
  };

  const mainFields = ((activeWf?.params_schema || []) as Any[]).filter((f) => !f.advanced);
  const advFields = ((activeWf?.params_schema || []) as Any[]).filter((f) => f.advanced);
  const imageTargets = workflows.filter(
    (w) => w.is_active !== false && ((w.params_schema || []) as Any[]).some((f) => f.type === 'image'),
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 正在加载 ComfyUI 控制台…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f17] px-3 py-4 text-slate-100 md:px-5">
      <div className="mx-auto max-w-[1500px] space-y-4">
        {/* 头部 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">ComfyUI 控制台</h1>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                Flux FP8 · 全站图片生产
              </span>
              {runpod?.configured ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> RunPod 已连接
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                  <AlertTriangle className="h-3 w-3" /> RunPod 未配置
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              9 大预设工作流 · LoRA 叠加 · IP-Adapter 人物一致 · WAN2.2 视频 · 动态工作流
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
              onClick={() => void loadAll(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" /> 刷新
            </Button>
          </div>
        </div>

        {/* 伴侣上下文栏 */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-300">
            <Heart className="h-3.5 w-3.5" /> 伴侣上下文
          </div>
          <Select value={girlfriendId || undefined} onValueChange={(v) => selectGirlfriend(v)}>
            <SelectTrigger className="h-8 w-52 border-white/15 bg-white/[0.04] text-[11px] text-slate-200">
              <SelectValue placeholder="选择伴侣…" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
              {girlfriends.map((g) => (
                <SelectItem key={String(g.id)} value={String(g.id)} className="text-[11px]">
                  {String(g.name || '未命名伴侣')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {girlfriend ? (
            <div className="flex flex-wrap items-center gap-2">
              {String(girlfriend.portrait_url || girlfriend.face_reference_url || '') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={String(girlfriend.portrait_url || girlfriend.face_reference_url)}
                  alt={String(girlfriend.name || '')}
                  className="h-8 w-8 rounded-full border border-violet-400/40 object-cover"
                />
              ) : null}
              <div className="leading-tight">
                <div className="text-[12px] font-semibold text-white">{String(girlfriend.name || '未命名伴侣')}</div>
                <div className="text-[10px] text-slate-400">生成图片将自动存入 TA 的资源库</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-violet-500/30 bg-violet-500/10 text-[11px] text-violet-200 hover:bg-violet-500/20"
                onClick={() => {
                  const desc = String(girlfriend.description || '').trim();
                  if (!desc) {
                    toast.error('该伴侣暂无描述（image_prompt）');
                    return;
                  }
                  setForm((prev: Any) => ({ ...prev, prompt: desc }));
                  toast.success('已填入伴侣描述');
                }}
              >
                <Sparkles className="h-3 w-3" /> 填入伴侣描述
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-violet-500/30 bg-violet-500/10 text-[11px] text-violet-200 hover:bg-violet-500/20"
                onClick={() => {
                  const url = String(girlfriend.face_reference_url || girlfriend.portrait_url || '').trim();
                  if (!url) {
                    toast.error('该伴侣暂无肖像 / 人脸参考图');
                    return;
                  }
                  const schema = ((activeWf?.params_schema || []) as Any[]);
                  const target = schema.find((f) => f.key === 'ip_adapter_image' || f.key === 'input_image' || f.key === 'image');
                  if (!target) {
                    toast.error('当前工作流没有参考图字段');
                    return;
                  }
                  setField(String(target.key), url);
                  toast.success(`已设为「${String(target.label || '参考图')}」`);
                }}
              >
                <ImageIcon className="h-3 w-3" /> 设肖像为人脸参考
              </Button>
              <button
                type="button"
                onClick={() => selectGirlfriend('')}
                className="ml-1 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-300"
              >
                <X className="h-3 w-3" /> 退出
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500">
              未选择伴侣 — 从伴侣页「为该伴侣创作」进入可自动读取伴侣资料
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {([
            { id: 'console', label: '生成控制台', icon: Sparkles },
            { id: 'workflows', label: '工作流管理', icon: Workflow },
            { id: 'jobs', label: '任务历史', icon: History },
            { id: 'loras', label: 'LoRA 模型', icon: Layers },
            { id: 'infra', label: '端点与模型', icon: Server },
          ] as Array<{ id: typeof tab; label: string; icon: any }>).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition',
                tab === t.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 生成控制台 ─────────────────────────────────────── */}
        {tab === 'console' && (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            {/* 工作流列表 */}
            <div className="space-y-1.5">
              {workflows.filter((w) => w.is_active !== false).map((wf, idx) => {
                const Icon = ICONS[String(wf.icon)] || Workflow;
                const active = wf.key === activeKey;
                return (
                  <button
                    key={wf.key}
                    onClick={() => setActiveKey(String(wf.key))}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition',
                      active
                        ? 'border-violet-500/50 bg-violet-500/10'
                        : 'border-white/10 bg-[#1a1a28] hover:border-white/20',
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                      active ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400',
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500">{idx + 1}.</span>
                        <span className="truncate text-[12px] font-semibold text-slate-100">{wf.name}</span>
                        <EngineBadge engine={wf.engine} />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-400">
                        {wf.description}
                      </p>
                    </div>
                  </button>
                );
              })}
              {!workflows.length && (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-[12px] text-slate-500">
                  暂无工作流
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 block w-full border-white/15 bg-white/5 text-[11px] text-slate-200"
                    onClick={() => void runWorkflowAction('reset_presets', {}, '预设已写入')}
                  >
                    写入 9 大预设
                  </Button>
                </div>
              )}
            </div>

            {/* 参数表单 + 结果 */}
            <div className="space-y-4">
              {activeWf ? (
                <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-bold text-white">{activeWf.name}</h2>
                      <EngineBadge engine={activeWf.engine} />
                    </div>
                    <span className="text-[10px] text-slate-500">{activeWf.key}</span>
                  </div>

                  {/* RAW 引擎：节点自动控件 + JSON 编辑 */}
                  {activeWf.engine === 'raw' ? (
                    <div className="space-y-3">
                      <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
                        已根据工作流节点自动生成 {rawControls.length} 个参数控件（完整功能 → 对应控件）
                      </div>
                      {rawControls.map((c) => (
                        <div className="space-y-1.5" key={c.id}>
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] font-medium text-slate-300">{c.label}</Label>
                            <span className="text-[9px] text-slate-600">
                              {c.class_type} · 节点{c.node_id} · {c.input_key}
                            </span>
                          </div>
                          {c.kind === 'text' ? (
                            <Textarea
                              value={String(rawValues[c.id] ?? c.value ?? '')}
                              onChange={(e) => setRawValues((p: Any) => ({ ...p, [c.id]: e.target.value }))}
                              rows={/提示词/.test(c.label) ? 3 : 1}
                              className="border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                            />
                          ) : c.kind === 'image' ? (
                            <ImagePicker
                              value={String(rawValues[c.id] ?? '')}
                              onChange={(url) => setRawValues((p: Any) => ({ ...p, [c.id]: url }))}
                            />
                          ) : c.kind === 'seed' ? (
                            <div className="flex gap-1.5">
                              <Input
                                type="number"
                                value={Number(rawValues[c.id] ?? c.value ?? -1)}
                                onChange={(e) => setRawValues((p: Any) => ({ ...p, [c.id]: Number(e.target.value) }))}
                                className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-white/15 bg-white/5 text-slate-200"
                                onClick={() => setRawValues((p: Any) => ({ ...p, [c.id]: -1 }))}
                              >
                                <Dices className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : c.kind === 'boolean' ? (
                            <Select
                              value={String(rawValues[c.id] ?? c.value ?? false)}
                              onValueChange={(v) => setRawValues((p: Any) => ({ ...p, [c.id]: v === 'true' }))}
                            >
                              <SelectTrigger className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                                <SelectItem value="true">true</SelectItem>
                                <SelectItem value="false">false</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="number"
                              value={Number(rawValues[c.id] ?? c.value ?? 0)}
                              onChange={(e) => setRawValues((p: Any) => ({ ...p, [c.id]: Number(e.target.value) }))}
                              className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                            />
                          )}
                        </div>
                      ))}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowGraph((v) => !v)}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                        >
                          <FileJson className="h-3.5 w-3.5" />
                          {showGraph ? '收起' : '编辑'}完整工作流 JSON
                          <ChevronDown className={cn('h-3 w-3 transition', showGraph && 'rotate-180')} />
                        </button>
                        {showGraph && (
                          <Textarea
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                            rows={16}
                            spellCheck={false}
                            className="mt-2 border-white/10 bg-[#0d0d15] font-mono text-[11px] text-emerald-200"
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mainFields.map(renderField)}
                      {advFields.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowAdvanced((v) => !v)}
                            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            <Settings2 className="h-3.5 w-3.5" />
                            高级参数（尺寸 / 步数 / 采样器 / 底模）
                            <ChevronDown className={cn('h-3 w-3 transition', showAdvanced && 'rotate-180')} />
                          </button>
                          {showAdvanced && (
                            <div className="mt-2 grid gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-2">
                              <div className="flex flex-wrap gap-1 sm:col-span-2">
                                {SIZE_PRESETS.map((s) => (
                                  <button
                                    key={s.label}
                                    type="button"
                                    onClick={() => setForm((p: Any) => ({ ...p, width: s.w, height: s.h }))}
                                    className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                              {advFields.map(renderField)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                    <Button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="gap-1.5 bg-violet-600 text-[12px] font-semibold hover:bg-violet-500"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {submitting ? '提交中…' : activeWf.engine === 'wan' ? '提交视频任务' : '开始生成'}
                    </Button>
                    {activeWf.engine === 'wan' && !runpod?.wan_env_set && (
                      <span className="text-[10px] text-amber-400">
                        WAN 端点使用默认 id（RUNPOD_WAN_VIDEO_ENDPOINT 未配置），standby 冷启动较慢
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-[12px] text-slate-500">
                  从左侧选择一个工作流
                </div>
              )}

              {/* 当前任务结果 */}
              {activeJob && (
                <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-bold text-white">任务结果</h3>
                      <StatusBadge status={String(activeJob.status || 'IN_QUEUE')} />
                      <span className="text-[10px] text-slate-500">
                        {activeJob.workflow_name} · RunPod {String(activeJob.runpod_job_id || '').slice(0, 10)}…
                      </span>
                      {activeJob.girlfriend_id && (
                        <span className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">
                          <Heart className="h-2.5 w-2.5" /> 存入伴侣资源库
                        </span>
                      )}
                    </div>
                    {imageTargets.length > 0 && (String(activeJob.output_urls || []).length > 0) && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">发送到工作流:</span>
                        <Select
                          value=""
                          onValueChange={(target) => {
                            const first = String((activeJob.output_urls || [])[0] || '');
                            if (first && target) sendToWorkflow(target, first);
                          }}
                        >
                          <SelectTrigger className="h-7 w-40 border-white/15 bg-white/5 text-[11px] text-slate-200">
                            <SelectValue placeholder="选择目标…" />
                          </SelectTrigger>
                          <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                            {imageTargets.map((w) => (
                              <SelectItem key={w.key} value={w.key} className="text-[11px]">
                                {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {(activeJob.status === 'IN_QUEUE' || activeJob.status === 'IN_PROGRESS') && (
                    <div className="flex items-center gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-3 text-[12px] text-sky-300">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      GPU {activeJob.status === 'IN_QUEUE' ? '排队中' : '生成中'}，页面保持打开自动轮询；队列可能 2-5 分钟
                    </div>
                  )}

                  {activeJob.status === 'FAILED' && (
                    <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-3 text-[12px] text-rose-300">
                      {String(activeJob.error || '未知错误')}
                    </div>
                  )}

                  {String(activeJob.output_urls || []).length > 0 && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {(activeJob.output_urls as string[]).map((url) => (
                        <div key={url} className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30">
                          {isVideoUrl(url) ? (
                            <video src={url} controls className="max-h-72 w-full object-contain" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt="生成结果"
                              className="max-h-72 w-full cursor-zoom-in object-contain"
                              onClick={() => setLightbox(url)}
                            />
                          )}
                          <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-[#14141f] px-2 py-1.5">
                            <button
                              type="button"
                              className="text-[10px] text-slate-400 hover:text-white"
                              onClick={() => {
                                void navigator.clipboard.writeText(url).then(() => toast.success('链接已复制'));
                              }}
                            >
                              复制链接
                            </button>
                            <button
                              type="button"
                              className="text-[10px] text-violet-400 hover:text-violet-300"
                              onClick={() => asCurrentReference(url)}
                            >
                              设为参考图
                            </button>
                            {activeJob.workflow_key === 'wf-character' && !isVideoUrl(url) && (
                              <button
                                type="button"
                                className="text-[10px] text-pink-400 hover:text-pink-300"
                                onClick={() => sendToWorkflow('wf-portrait', url)}
                              >
                                发送为人脸参考
                              </button>
                            )}
                            <a href={url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeJob.id && (activeJob.status === 'IN_QUEUE' || activeJob.status === 'IN_PROGRESS') && (
                    <div className="mt-3 text-right">
                      <button
                        type="button"
                        onClick={() => void cancelJob(String(activeJob.id))}
                        className="text-[11px] text-slate-500 hover:text-rose-400"
                      >
                        取消任务
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 最近任务 */}
              {jobs.length > 0 && (
                <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
                  <h3 className="mb-2 text-[13px] font-bold text-white">最近任务</h3>
                  <div className="space-y-1.5">
                    {jobs.slice(0, 6).map((job) => (
                      <div key={job.id} className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                        <StatusBadge status={String(job.status)} />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{job.workflow_name}</span>
                        <span className="text-[10px] text-slate-500">{fmtTime(job.created_at)}</span>
                        {(job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS') && (
                          <button
                            type="button"
                            className="text-[10px] text-sky-400 hover:text-sky-300"
                            onClick={() => {
                              setActiveJob(job);
                              void pollUntilDone(String(job.id));
                            }}
                          >
                            继续轮询
                          </button>
                        )}
                        {job.status === 'COMPLETED' && (
                          <button
                            type="button"
                            className="text-[10px] text-violet-400 hover:text-violet-300"
                            onClick={() => setActiveJob(job)}
                          >
                            查看结果
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 工作流管理 ─────────────────────────────────────── */}
        {tab === 'workflows' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                预设工作流可编辑参数模板，不可删除（可停用）；自定义工作流可完全修改或删除
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                  onClick={() => void runWorkflowAction('reset_presets', {}, '9 大预设已重置')}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 重置预设
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1 bg-violet-600 text-[11px] hover:bg-violet-500"
                  onClick={() => openEditor(undefined)}
                >
                  <Plus className="h-3.5 w-3.5" /> 新建工作流
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">工作流</th>
                    <th className="px-3 py-2">引擎</th>
                    <th className="px-3 py-2">分类</th>
                    <th className="px-3 py-2">排序</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {workflows.map((wf) => {
                    const Icon = ICONS[String(wf.icon)] || Workflow;
                    return (
                      <tr key={wf.id} className="bg-[#1a1a28] hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-200">
                                {wf.name}
                                {wf.is_preset && <span className="ml-1.5 text-[9px] text-violet-400">预设</span>}
                              </div>
                              <div className="truncate text-[10px] text-slate-500">{wf.key}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2"><EngineBadge engine={wf.engine} /></td>
                        <td className="px-3 py-2 text-slate-400">{wf.category}</td>
                        <td className="px-3 py-2 text-slate-400">{wf.sort_order}</td>
                        <td className="px-3 py-2">
                          {wf.is_active ? (
                            <span className="text-[11px] text-emerald-400">启用</span>
                          ) : (
                            <span className="text-[11px] text-slate-500">停用</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="编辑"
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                              onClick={() => openEditor(wf)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="复制为新工作流"
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                              onClick={() => openEditor({ ...wf, id: '', key: '', name: `${wf.name} 副本`, is_preset: false })}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title={wf.is_active ? '停用' : '启用'}
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                              onClick={() => void runWorkflowAction('toggle_workflow', { id: wf.id }, wf.is_active ? '已停用' : '已启用')}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="删除（预设自动转为停用）"
                              className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                              onClick={() => {
                                if (window.confirm(`确认处理「${wf.name}」？预设将被停用，自定义将被删除。`)) {
                                  void runWorkflowAction('delete_workflow', { id: wf.id }, '已处理');
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 编辑器 */}
            {editing && (
              <div className="rounded-lg border border-violet-500/30 bg-[#16161f] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-white">
                    {editing.id ? `编辑工作流 · ${editing.name}` : '新建工作流'}
                  </h3>
                  <button type="button" onClick={() => setEditing(null)} className="text-slate-500 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-slate-400">名称</Label>
                    <Input
                      value={String(editing.name || '')}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-slate-400">标识 key（唯一，英文）</Label>
                    <Input
                      value={String(editing.key || '')}
                      placeholder="wf-my-custom"
                      onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                      className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-slate-400">描述</Label>
                    <Input
                      value={String(editing.description || '')}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-slate-400">引擎</Label>
                      <Select value={String(editing.engine)} onValueChange={(v) => setEditing({ ...editing, engine: v })}>
                        <SelectTrigger className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                          <SelectItem value="flux">flux</SelectItem>
                          <SelectItem value="wan">wan</SelectItem>
                          <SelectItem value="raw">raw</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-slate-400">分类</Label>
                      <Select value={String(editing.category)} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                        <SelectTrigger className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                          <SelectItem value="image">image</SelectItem>
                          <SelectItem value="video">video</SelectItem>
                          <SelectItem value="dynamic">dynamic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-slate-400">排序</Label>
                      <Input
                        type="number"
                        value={Number(editing.sort_order ?? 50)}
                        onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                        className="h-8 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-[11px] text-slate-400">默认参数 defaults（JSON）</Label>
                    <Textarea
                      value={editTexts.defaults}
                      onChange={(e) => setEditTexts((p) => ({ ...p, defaults: e.target.value }))}
                      rows={5}
                      spellCheck={false}
                      className="border-white/10 bg-[#0d0d15] font-mono text-[11px] text-sky-200"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-[11px] text-slate-400">参数模板 params_schema（JSON 数组，flux/wan 引擎用）</Label>
                    <Textarea
                      value={editTexts.schema}
                      onChange={(e) => setEditTexts((p) => ({ ...p, schema: e.target.value }))}
                      rows={5}
                      spellCheck={false}
                      className="border-white/10 bg-[#0d0d15] font-mono text-[11px] text-sky-200"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-[11px] text-slate-400">工作流图 workflow_json（raw 引擎必填，ComfyUI API 格式）</Label>
                    <Textarea
                      value={editTexts.graph}
                      onChange={(e) => setEditTexts((p) => ({ ...p, graph: e.target.value }))}
                      rows={8}
                      spellCheck={false}
                      placeholder='{"1":{"class_type":"CheckpointLoaderSimple","inputs":{...}}, ...}'
                      className="border-white/10 bg-[#0d0d15] font-mono text-[11px] text-emerald-200"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-white/15 bg-white/5 text-[11px] text-slate-200"
                    onClick={() => setEditing(null)}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-violet-600 text-[11px] hover:bg-violet-500"
                    onClick={() => void saveWorkflow()}
                  >
                    <Save className="h-3.5 w-3.5" /> 保存工作流
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 任务历史 ───────────────────────────────────────── */}
        {tab === 'jobs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">共 {jobs.length} 条任务记录（最近 60 条）</p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                onClick={() => void refreshJobs()}
              >
                <RefreshCw className="h-3.5 w-3.5" /> 刷新
              </Button>
            </div>
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-white/10 bg-[#1a1a28] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={String(job.status)} />
                    <span className="text-[12px] font-semibold text-slate-200">{job.workflow_name}</span>
                    <EngineBadge engine={job.engine} />
                    <span className="text-[10px] text-slate-500">{fmtTime(job.created_at)}</span>
                    <span className="text-[10px] text-slate-600">RunPod: {String(job.runpod_job_id || '').slice(0, 14)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {(job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS') && (
                        <>
                          <button
                            type="button"
                            className="text-[11px] text-sky-400 hover:text-sky-300"
                            onClick={() => {
                              setActiveJob(job);
                              setTab('console');
                              void pollUntilDone(String(job.id));
                            }}
                          >
                            继续轮询
                          </button>
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-rose-400"
                            onClick={() => void cancelJob(String(job.id))}
                          >
                            取消
                          </button>
                        </>
                      )}
                      {job.status === 'COMPLETED' && (
                        <button
                          type="button"
                          className="text-[11px] text-violet-400 hover:text-violet-300"
                          onClick={() => {
                            setActiveJob(job);
                            setTab('console');
                          }}
                        >
                          在控制台查看
                        </button>
                      )}
                    </div>
                  </div>
                  {job.error && job.status === 'FAILED' && (
                    <p className="mt-2 rounded border border-rose-500/20 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-300">
                      {String(job.error).slice(0, 300)}
                    </p>
                  )}
                  {Array.isArray(job.output_urls) && job.output_urls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(job.output_urls as string[]).slice(0, 6).map((url) =>
                        isVideoUrl(url) ? (
                          <video key={url} src={url} controls className="h-20 rounded border border-white/10" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt="输出"
                            className="h-20 w-20 cursor-zoom-in rounded border border-white/10 object-cover"
                            onClick={() => setLightbox(url)}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!jobs.length && (
                <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-[12px] text-slate-500">
                  暂无任务记录
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LoRA 模型 ──────────────────────────────────────── */}
        {tab === 'loras' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={loraSearch}
                onChange={(e) => setLoraSearch(e.target.value)}
                placeholder="搜索 LoRA 名称 / 文件名 / 触发词"
                className="h-8 w-64 border-white/10 bg-white/[0.03] text-[12px] text-slate-200"
              />
              <Select value={loraCat} onValueChange={setLoraCat}>
                <SelectTrigger className="h-8 w-36 border-white/10 bg-white/[0.03] text-[12px] text-slate-200">
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#16161f] text-slate-200">
                  <SelectItem value="all">全部分类</SelectItem>
                  {['style', 'body', 'action', 'outfit', 'prop', 'detail', 'none'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-slate-500">
                运行卷已验证 {config?.installed_loras?.length || 0} 个 · 清单共 {(config?.loras || []).filter((l: Any) => l.id !== 'none').length} 个
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(config?.loras || [])
                .filter((l: Any) => l.id !== 'none' && l.filename)
                .filter((l: Any) => loraCat === 'all' || String(l.category || '') === loraCat)
                .filter((l: Any) => {
                  const q = loraSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    String(l.label || '').toLowerCase().includes(q) ||
                    String(l.filename || '').toLowerCase().includes(q) ||
                    (l.trigger_words || []).some((t: string) => String(t).toLowerCase().includes(q))
                  );
                })
                .slice(0, 90)
                .map((l: Any) => {
                  const installed = (config?.installed_loras || []).includes(l.filename);
                  return (
                    <div key={l.id} className="rounded-lg border border-white/10 bg-[#1a1a28] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-200">{l.label}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-400">{l.category || 'style'}</span>
                            {l.nsfw && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] text-rose-300">NSFW</span>}
                            {installed ? (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">已挂载</span>
                            ) : (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">未验证</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          title="复制文件名"
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                          onClick={() => void navigator.clipboard.writeText(l.filename).then(() => toast.success('文件名已复制'))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 truncate font-mono text-[10px] text-slate-500">{l.filename}</div>
                      {Array.isArray(l.trigger_words) && l.trigger_words.length > 0 && (
                        <div className="mt-1 truncate text-[10px] text-violet-400">触发词: {l.trigger_words.join(', ')}</div>
                      )}
                      {l.usage && <p className="mt-1 line-clamp-2 text-[10px] text-slate-400">{l.usage}</p>}
                      <div className="mt-1 text-[10px] text-slate-500">推荐强度 {Number(l.default_strength ?? 0.7).toFixed(2)}</div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── 端点与模型 ─────────────────────────────────────── */}
        {tab === 'infra' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-white">
                <Server className="h-4 w-4 text-violet-400" /> ComfyUI 统一端点
              </h3>
              <div className="space-y-1.5 text-[12px] text-slate-300">
                <p>端点 ID: <span className="font-mono text-violet-300">{runpod?.comfy_endpoint || '-'}</span></p>
                <p>状态: {runpod?.configured ? <span className="text-emerald-400">API Key 已配置</span> : <span className="text-rose-400">未配置 RUNPOD_API_KEY</span>}</p>
                <p className="text-[11px] text-slate-500">Flux FP8 / Pony / Illustrious + 全部 LoRA 挂载同一 worker，支持 IP-Adapter{runpod?.ipadapter_installed ? '（已启用）' : '（未检测到 env 标记）'}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                  disabled={!!healthResults[runpod?.comfy_endpoint]?.loading}
                  onClick={() => runpod?.comfy_endpoint && void checkHealth(runpod.comfy_endpoint)}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', healthResults[runpod?.comfy_endpoint]?.loading && 'animate-spin')} />
                  健康检查
                </Button>
                {healthResults[runpod?.comfy_endpoint] && !healthResults[runpod?.comfy_endpoint].loading && (
                  <span className="text-[11px] text-slate-400">
                    {JSON.stringify(healthResults[runpod?.comfy_endpoint].health || healthResults[runpod?.comfy_endpoint].error || '').slice(0, 120)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-white">
                <Video className="h-4 w-4 text-pink-400" /> WAN 2.2 视频端点
              </h3>
              <div className="space-y-1.5 text-[12px] text-slate-300">
                <p>端点 ID: <span className="font-mono text-pink-300">{runpod?.wan_endpoint || '-'}</span></p>
                <p>env 配置: {runpod?.wan_env_set ? <span className="text-emerald-400">RUNPOD_WAN_VIDEO_ENDPOINT 已设置</span> : <span className="text-amber-400">未设置（使用默认 standby 端点）</span>}</p>
                <p className="text-[11px] text-slate-500">Workers 0-1 standby：首次任务冷启动可能需要数分钟；长期不用请到 RunPod 控制台确认端点存在</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 border-white/15 bg-white/5 text-[11px] text-slate-200 hover:bg-white/10"
                  disabled={!!healthResults[runpod?.wan_endpoint]?.loading}
                  onClick={() => runpod?.wan_endpoint && void checkHealth(runpod.wan_endpoint)}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', healthResults[runpod?.wan_endpoint]?.loading && 'animate-spin')} />
                  健康检查
                </Button>
                {healthResults[runpod?.wan_endpoint] && !healthResults[runpod?.wan_endpoint].loading && (
                  <span className="text-[11px] text-slate-400">
                    {JSON.stringify(healthResults[runpod?.wan_endpoint].health || healthResults[runpod?.wan_endpoint].error || '').slice(0, 120)}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-white">
                <Layers className="h-4 w-4 text-sky-400" /> Checkpoints
              </h3>
              <div className="space-y-1.5">
                {(config?.checkpoints || []).map((c: Any) => (
                  <div key={c.id} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                    <span className="text-[12px] text-slate-300">{c.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">{c.filename}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#1a1a28] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-white">
                <Layers className="h-4 w-4 text-emerald-400" /> 网络卷 & 已挂载 LoRA
              </h3>
              <div className="space-y-1.5 text-[12px] text-slate-300">
                <p>网络卷: <span className="font-mono text-emerald-300">{config?.network_volume?.name || '-'}</span></p>
                <p>区域: {config?.network_volume?.region || '-'}</p>
                <p>运行卷已验证 LoRA: {config?.installed_loras?.length || 0} 个</p>
              </div>
              {!!(config?.installed_loras?.length) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">展开清单</summary>
                  <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                    {(config.installed_loras as string[]).map((f) => (
                      <div key={f} className="truncate font-mono text-[10px] text-slate-400">{f}</div>
                    ))}
                  </div>
                </details>
              )}
              {!(config?.installed_loras?.length) && (
                <p className="mt-2 text-[11px] text-amber-400">
                  RUNPOD_INSTALLED_LORAS 未配置时无法验证卷上文件；生成时会自动跳过未挂载 LoRA
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setLightbox(null)}
        >
          {isVideoUrl(lightbox) ? (
            <video src={lightbox} controls autoPlay className="max-h-full max-w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox} alt="预览" className="max-h-full max-w-full object-contain" />
          )}
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function FieldLabel(props: { field: Any; right?: string }) {
  const { field, right } = props;
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] font-medium text-slate-300">
        {field.label}
        {field.required && <span className="ml-0.5 text-rose-400">*</span>}
      </Label>
      <div className="flex items-center gap-2">
        {field.hint && <span className="text-[9px] text-slate-600">{field.hint}</span>}
        {right && <span className="text-[10px] text-slate-400">{right}</span>}
      </div>
    </div>
  );
}
