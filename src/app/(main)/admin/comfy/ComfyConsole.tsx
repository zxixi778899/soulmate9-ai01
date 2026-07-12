'use client';

/**
 * Comfy 操作台 — 工作流 / 模型 / LoRA 清单一键调用 / 生成 / 图库
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Play, Trash2, RefreshCw, HardDrive, Workflow, ImageIcon,
  Settings2, BookOpen, Save, RotateCcw, Sparkles, Layers, ExternalLink,
  Zap, Upload, Download, CheckSquare, Square, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Any = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  body: '身材',
  action: '人物动作 / NSFW',
  outfit: '服装',
  prop: '道具',
  detail: '细节质感',
};


const CAT_ORDER = ['body', 'action', 'outfit', 'prop', 'detail'];

/** Civitai-style generation presets (中文说明 + 可一键应用) */
const CIVITAI_PRESETS = [
  {
    id: 'portrait-soft',
    name: '窗边人像',
    desc: '特征清晰 · 侧光自然 · 适合主页卡',
    prompt:
      'young woman with unique facial features, soft freckles, looking over shoulder by a window, sheer curtains, golden side sunlight, natural skin, candid three-quarter portrait, photorealistic, sharp eyes',
    negative: 'blurry, deformed, same face, plastic skin, child, underage, watermark, text',
    width: 832, height: 1216, steps: 28, cfg: 3.5,
  },
  {
    id: 'fullbody-glam',
    name: '夜景全长',
    desc: '动作站姿变化 · 城市轮廓光',
    prompt:
      'attractive young woman, full body, leaning on rooftop railing, hip cocked, city skyline bokeh at night, fitted evening outfit, cool ambient light with warm rim light, photorealistic, natural proportions',
    negative: 'blurry, cropped head, bad anatomy, same face, watermark',
    width: 768, height: 1344, steps: 28, cfg: 3.5,
  },
  {
    id: 'nsfw-intimate',
    name: '卧室亲密',
    desc: '回眸跪姿 · 粉光 · 成人氛围',
    prompt:
      'young woman kneeling on bed looking back over shoulder, arched back, soft lingerie, pink LED bedroom light plus warm lamp, intimate mood, detailed skin, photorealistic',
    negative: 'gore, violence, child, underage, blurry, deformed, watermark',
    width: 832, height: 1216, steps: 28, cfg: 3.2,
  },
  {
    id: 'selfie-flash',
    name: '镜子自拍',
    desc: '动作与光线变化 · 减少脸模版感',
    prompt:
      'messy wavy hair young woman, bathroom mirror selfie, phone in hand, hip popped, direct flash lighting, casual crop top, candid expression, photorealistic, natural skin texture',
    negative: 'studio softbox only, plastic skin, same face, child, underage, watermark',
    width: 832, height: 1216, steps: 26, cfg: 3.5,
  },
  {
    id: 'cafe-day',
    name: '咖啡馆日间',
    desc: '日常动作 · 窗光 · 更生活化',
    prompt:
      'young woman at cafe window seat, chin on hand, soft daylight, coffee cup, casual outfit, easy smile, 50mm candid portrait, photorealistic, detailed eyes',
    negative: 'blurry, deformed, plastic skin, same face, watermark, text',
    width: 832, height: 1216, steps: 26, cfg: 3.5,
  },
];



type ComfyConsoleProps = { girlfriendId?: string };

export default function ComfyConsole({ girlfriendId }: ComfyConsoleProps) {
  const [tab, setTab] = useState<'generate' | 'loras' | 'library' | 'workflows' | 'infra'>('generate');
  const [config, setConfig] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assets, setAssets] = useState<Any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loraFilter, setLoraFilter] = useState<string>('all');

  // Generate form
  const [workflowId, setWorkflowId] = useState('wf-girlfriend');
  const [endpointKey, setEndpointKey] = useState('portrait-v9');
  const [ckptId, setCkptId] = useState('flux-fp8');
  const [loraId, setLoraId] = useState('none');
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const [steps, setSteps] = useState(28);
  const [cfg, setCfg] = useState(3.5);
  const [seed, setSeed] = useState(-1);
  const [denoise, setDenoise] = useState(0.55);
  const [inputImage, setInputImage] = useState('');
  const [kind, setKind] = useState('girlfriend');
  const [lastResult, setLastResult] = useState<Any[]>([]);
  const [scopedGirlfriend, setScopedGirlfriend] = useState<Any | null>(null);
  const [gfLoading, setGfLoading] = useState(false);


  const applyPreset = (p: (typeof CIVITAI_PRESETS)[number]) => {
    setPrompt(p.prompt);
    setNegative(p.negative);
    setWidth(p.width);
    setHeight(p.height);
    setSteps(p.steps);
    setCfg(p.cfg);
    toast.success(`已应用预设：${p.name}`);
  };

  const loadConfig = useCallback(async () => {

    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=config');
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      const wf = data.config?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')
        || data.config?.workflows?.[0];
      if (wf) applyWorkflow(wf, data.config);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const qs = new URLSearchParams({ view: 'assets', limit: '120' });
      if (girlfriendId) qs.set('girlfriend_id', girlfriendId);
      else qs.set('scope', 'public');
      const res = await authedFetch(`/api/admin/comfy?${qs.toString()}`);
      const data = await readResponseJson(res).catch(() => ({} as any));
      setAssets(data.assets || []);
      setSelectedAssetKeys([]);

      if (data.warning) toast.message(data.warning);
    } catch {
      toast.error('图库加载失败');
    } finally {
      setAssetsLoading(false);
    }
  }, [girlfriendId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!girlfriendId) {
      setScopedGirlfriend(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setGfLoading(true);
      try {
        const res = await authedFetch(`/api/admin/girlfriends?id=${encodeURIComponent(girlfriendId)}`);
        const data = await readResponseJson(res).catch(() => ({} as Any));
        const list = data.girlfriends || data.items || [];
        const one = data.girlfriend || list[0] || null;
        if (!cancelled) setScopedGirlfriend(one);
        if (one) {
          // fill prompt from card fields if empty
          const bits = [
            one.image_prompt,
            one.appearance_hair_color,
            one.appearance_hair,
            one.appearance_eyes,
            one.appearance_body,
            one.appearance_style,
            one.personality,
          ].filter(Boolean);
          if (bits.length) {
            setPrompt((prev: string) => prev.trim() ? prev : bits.join(', '));
          }
          if (one.negative_prompt) {
            setNegative((prev: string) => prev.trim() ? prev : String(one.negative_prompt));
          }
          toast.message(`已载入女友：${one.name || girlfriendId}`);
        }
      } catch {
        if (!cancelled) toast.error('载入女友失败');
      } finally {
        if (!cancelled) setGfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [girlfriendId]);


  useEffect(() => {
    if (tab === 'library') loadAssets();
  }, [tab, loadAssets]);

  function applyWorkflow(wf: Any, cfg?: Any) {
    const c = cfg || config;
    setWorkflowId(wf.id);
    setKind(wf.kind || 'custom');
    setEndpointKey(wf.defaults?.endpoint_key || 'comfy-default');
    setCkptId(wf.defaults?.ckpt_id || 'flux-fp8');
    setLoraId(wf.defaults?.lora_id || 'none');
    setLoraStrength(wf.defaults?.lora_strength ?? 0.8);
    setWidth(wf.defaults?.width || 832);
    setHeight(wf.defaults?.height || 1216);
    setSteps(wf.defaults?.steps || 28);
    setCfg(wf.defaults?.cfg || 3.5);
    setDenoise(wf.defaults?.denoise ?? 0.55);
    setPrompt(wf.defaults?.positive || '');
    setNegative(wf.defaults?.negative || '');
    void c;
  }

  /** 一键调用：选中 LoRA + 强度 + 触发词写入提示词 */
  function applyLora(lora: Any, opts?: { appendTriggers?: boolean; goGenerate?: boolean }) {
    if (!lora || lora.id === 'none') {
      setLoraId('none');
      setLoraStrength(0);
      toast.message('已关闭 LoRA');
      return;
    }
    setLoraId(lora.id);
    setLoraStrength(lora.default_strength ?? 0.75);
    const triggers = (lora.trigger_words || []).slice(0, 4).join(', ');
    if (opts?.appendTriggers !== false && triggers) {
      setPrompt((p) => {
        if (!p.trim()) return triggers;
        if (p.includes(triggers.split(',')[0]?.trim() || '___')) return p;
        return `${triggers}, ${p}`;
      });
    }
    toast.success(`已调用：${lora.label?.replace(/^\[[^\]]+\]\s*/, '') || lora.id}`);
    if (opts?.goGenerate !== false) setTab('generate');
  }

  /** 快捷配方 */
  function applyRecipe(recipe: Any) {
    const wf = workflows.find((w) => w.id === recipe.workflow_id);
    if (wf) applyWorkflow(wf);
    const lora = loras.find((l) => l.id === recipe.lora_id);
    if (lora) {
      setLoraId(lora.id);
      setLoraStrength(recipe.lora_strength ?? lora.default_strength ?? 0.75);
      const triggers =
        recipe.append_triggers !== false
          ? (lora.trigger_words || []).slice(0, 4).join(', ')
          : '';
      const extra = recipe.positive_extra || '';
      const base = wf?.defaults?.positive || prompt;
      const parts = [triggers, extra, base].filter(Boolean);
      setPrompt(parts.join(', '));
    }
    toast.success(`已应用配方：${recipe.label}`);
    setTab('generate');
  }

  const workflows: Any[] = config?.workflows || [];
  const endpoints: Any[] = config?.endpoints || [];
  const checkpoints: Any[] = config?.checkpoints || [];
  const loras: Any[] = config?.loras || [];
  const recipes: Any[] = config?.lora_recipes || [];
  const stackingTips: string[] = config?.lora_stacking_tips || [];

  const selectedLora = useMemo(
    () => loras.find((l) => l.id === loraId),
    [loras, loraId],
  );

  const lorasByCat = useMemo(() => {
    const map: Record<string, Any[]> = {};
    for (const l of loras) {
      if (!l.id || l.id === 'none') continue;
      const cat = l.category || 'other';
      if (loraFilter !== 'all' && cat !== loraFilter) continue;
      if (!map[cat]) map[cat] = [];
      map[cat].push(l);
    }
    return map;
  }, [loras, loraFilter]);

  const selectedEndpoint = useMemo(
    () => endpoints.find((e) => e.id === endpointKey),
    [endpoints, endpointKey],
  );

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error('请填写正向提示词');
      return;
    }
    setGenerating(true);
    setLastResult([]);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
        girlfriend_id: girlfriendId || undefined,
          workflow_id: workflowId,
          endpoint_key: endpointKey,
          endpoint_id: selectedEndpoint?.endpoint_id || undefined,
          ckpt_id: ckptId,
          lora_id: loraId === 'none' ? null : loraId,
          lora_strength: loraStrength,
          prompt,
          negative,
          width,
          height,
          steps,
          cfg,
          seed,
          denoise: inputImage ? denoise : undefined,
          input_image: inputImage.trim() || undefined,
          kind,
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '生成失败');
      const assets = (data.assets || []).map((a: Any) => {
        let url = String(a.url || '').trim();
        // Bare storage key → public URL (never leave prompt text as src)
        if (url && !/^https?:\/\//i.test(url) && !url.startsWith('data:')) {
          const base =
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            process.env.NEXT_PUBLIC_COZE_SUPABASE_URL ||
            '';
          if (base && a.storage_key) {
            url = `${base.replace(/\/$/, '')}/storage/v1/object/public/portraits/${String(a.storage_key).replace(/^\/+/, '')}`;
          } else if (base && url.includes('/')) {
            url = `${base.replace(/\/$/, '')}/storage/v1/object/public/portraits/${url.replace(/^\/+/, '')}`;
          }
        }
        if (/\s/.test(url) && /masterpiece|photorealistic|raw photo/i.test(url)) {
          url = '';
        }
        return { ...a, url };
      }).filter((a: Any) => a.url && /^https?:\/\//i.test(a.url));
      if (assets.length === 0) {
        throw new Error('生成完成但没有可预览的 HTTPS 地址');
      }
      setLastResult(assets);
      toast.success(`生成成功 ${assets.length} 张`);
      if (tab === 'library') loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const deleteAsset = async (idOrAsset: string | Any) => {
    const id = typeof idOrAsset === 'string' ? idOrAsset : idOrAsset?.id;
    const storage_key = typeof idOrAsset === 'string' ? undefined : idOrAsset?.storage_key;
    if ((!id && !storage_key) || !confirm('删除这张图？会同时删存储文件。')) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_asset', id, storage_key }),
      });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      setAssets((a) => a.filter((x) => x.id !== id && x.storage_key !== storage_key));
      setLastResult((a) => a.filter((x) => x.id !== id && x.storage_key !== storage_key));
      setSelectedAssetKeys((keys) => keys.filter((k) => k !== String(id || storage_key || '')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const assetKey = (a: Any) => String(a.id || a.storage_key || a.url || '');

  const toggleSelect = (a: Any) => {
    const k = assetKey(a);
    if (!k) return;
    setSelectedAssetKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const selectAllVisible = () => {
    setSelectedAssetKeys(assets.map(assetKey).filter(Boolean));
  };

  const clearSelection = () => setSelectedAssetKeys([]);

  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedAssetKeys.includes(assetKey(a))),
    [assets, selectedAssetKeys],
  );

  const batchDelete = async () => {
    if (!selectedAssets.length) {
      toast.message('先勾选图片');
      return;
    }
    if (!confirm(`批量删除 ${selectedAssets.length} 张？会同时删存储文件。`)) return;
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
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '批量删除失败');
      toast.success(`已删除 ${data.deleted ?? selectedAssets.length} 张`);
      clearSelection();
      await loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量删除失败');
    }
  };

  const batchDownload = async () => {
    const list = selectedAssets.length ? selectedAssets : assets.slice(0, 20);
    if (!list.length) {
      toast.message('没有可下载的图');
      return;
    }
    toast.message(`开始下载 ${list.length} 张（浏览器可能拦截多文件）`);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const url = a.url as string;
      if (!url) continue;
      try {
        const aEl = document.createElement('a');
        aEl.href = url;
        aEl.download = `comfy_${a.id || i}.png`;
        aEl.target = '_blank';
        aEl.rel = 'noreferrer';
        document.body.appendChild(aEl);
        aEl.click();
        aEl.remove();
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  const onUploadFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).slice(0, 30);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('action', 'upload_assets');
      if (girlfriendId) fd.append('girlfriend_id', girlfriendId);
      fd.append('kind', kind || 'girlfriend');
      for (const f of files) fd.append('files', f);
      const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '上传失败');
      toast.success(`上传成功 ${data.uploaded ?? files.length} 张`);
      setTab('library');
      await loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  const saveEndpoints = async () => {
    if (!config) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, replace: true }),
      });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setConfig(data.config);
      toast.success('配置已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const resetConfig = async () => {
    if (!confirm('恢复默认 Comfy 配置？')) return;
    const res = await authedFetch('/api/admin/comfy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_config' }),
    });
    const data = await readResponseJson(res).catch(() => ({} as any));
    if (res.ok) {
      setConfig(data.config);
      toast.success('已恢复默认');
    }
  };

  if (loading || !config) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] p-4 sm:p-6 text-slate-100">
      {girlfriendId ? (
        <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
          {gfLoading ? '正在载入女友…' : scopedGirlfriend ? (
            <span>
              按女友创作：<strong>{scopedGirlfriend.name || girlfriendId}</strong>
              <span className="ml-2 text-xs text-violet-200/70">资产写入 girlfriends/{girlfriendId}/ · 不进公共库</span>
            </span>
          ) : (
            <span>按女友创作 · ID {girlfriendId}（资料未取到也可生成）</span>
          )}
          <button
            type="button"
            className="ml-3 text-xs underline text-violet-200"
            onClick={() => {
              if (!scopedGirlfriend) return;
              const bits = [
                scopedGirlfriend.image_prompt,
                scopedGirlfriend.appearance_hair_color,
                scopedGirlfriend.appearance_hair,
                scopedGirlfriend.appearance_eyes,
                scopedGirlfriend.appearance_body,
                scopedGirlfriend.appearance_style,
              ].filter(Boolean);
              if (bits.length) setPrompt(bits.join(', '));
              if (scopedGirlfriend.negative_prompt) setNegative(String(scopedGirlfriend.negative_prompt));
              toast.success('已用女友卡填充提示词');
            }}
          >
            一键填充提示词
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          公共创作模式：结果进入 comfy-outputs / 公共资产库。从「女友与媒体」点创作可切换为按卡隔离。
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-violet-400" />
            Comfy 出图操作台
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            工作流 · LoRA 清单一键调用 · Checkpoint（网络卷）· 图库存删
          <Link href="/admin/model-library" className="mt-2 inline-flex text-xs text-rose-300 hover:text-rose-200 underline-offset-2 hover:underline">打开 Civitai 模型库（搜索 / 入库 / 导出下载清单）→</Link>
            {config.lora_catalog_version != null && (
              <span className="ml-2 text-violet-400/80">catalog v{config.lora_catalog_version}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadConfig} className="border-slate-700">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1 w-fit">
        {[
          { id: 'generate', label: '生成', icon: Play },
          { id: 'loras', label: 'LoRA 清单', icon: Layers },
          { id: 'library', label: '图库', icon: ImageIcon },
          { id: 'workflows', label: '工作流', icon: Workflow },
          { id: 'infra', label: '网络卷/端点', icon: HardDrive },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm',
              tab === t.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* GENERATE */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">

          <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">生成预设（Civitai 风格）</div>
                <p className="text-[11px] text-white/55">一键填充提示词 / 尺寸 / Steps / CFG，再按需微调。</p>
              </div>
              <Badge variant="outline" className="text-[10px]">中文解说</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CIVITAI_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2 transition-colors"
                >
                  <div className="text-xs font-semibold text-pink-200">{p.name}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{p.desc}</div>
                  <div className="text-[10px] text-white/35 mt-1">{p.width}×{p.height} · steps {p.steps} · cfg {p.cfg}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
              <Settings2 className="h-4 w-4" /> 节点参数
            </div>

            <div>
              <Label className="text-[11px] text-slate-400">工作流预设</Label>
              <Select
                value={workflowId}
                onValueChange={(id) => {
                  const wf = workflows.find((w) => w.id === id);
                  if (wf) applyWorkflow(wf);
                }}
              >
                <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-slate-500">
                {workflows.find((w) => w.id === workflowId)?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-slate-400">类型 kind</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['girlfriend', 'outfit', 'prop', 'custom', 'tryon'].map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">端点</Label>
                <Select value={endpointKey} onValueChange={setEndpointKey}>
                  <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {endpoints.filter((e) => e.kind === 'comfy').map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              endpoint_id: {selectedEndpoint?.endpoint_id || '(空 — 请到「网络卷/端点」填写)'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-slate-400">Checkpoint</Label>
                <Select value={ckptId} onValueChange={setCkptId}>
                  <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {checkpoints.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">LoRA（网络卷）</Label>
                <Select
                  value={loraId || 'none'}
                  onValueChange={(id) => {
                    setLoraId(id);
                    const l = loras.find((x) => x.id === id);
                    if (l?.default_strength != null) setLoraStrength(l.default_strength);
                  }}
                >
                  <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {loras.map((l) => (
                      <SelectItem key={l.id} value={l.id || 'none'}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loraId && loraId !== 'none' && (
              <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-2 space-y-2">
                <div>
                  <Label className="text-[11px] text-slate-400">
                    LoRA 强度 {loraStrength.toFixed(2)}
                    {selectedLora?.default_strength != null && (
                      <span className="ml-1 text-slate-500">
                        （推荐 {selectedLora.default_strength}）
                      </span>
                    )}
                  </Label>
                  <input
                    type="range" min={0} max={1.5} step={0.05}
                    value={loraStrength}
                    onChange={(e) => setLoraStrength(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                </div>
                {selectedLora?.usage && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">{selectedLora.usage}</p>
                )}
                {selectedLora?.filename && (
                  <p className="text-[10px] font-mono text-cyan-400/80">{selectedLora.filename}</p>
                )}
                {(selectedLora?.trigger_words?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedLora!.trigger_words!.map((t: string) => (
                      <button
                        key={t}
                        type="button"
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-violet-200 hover:bg-violet-800"
                        onClick={() => {
                          setPrompt((p) => (p.includes(t) ? p : p ? `${t}, ${p}` : t));
                          toast.message(`已插入：${t}`);
                        }}
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] border-slate-700 w-full"
                  onClick={() => setTab('loras')}
                >
                  打开完整 LoRA 清单
                </Button>
              </div>
            )}

            <div>
              <Label className="text-[11px] text-slate-400">Positive</Label>
              <Textarea
                className="mt-1 min-h-[100px] bg-slate-950 border-slate-700 text-xs font-mono"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Negative</Label>
              <Textarea
                className="mt-1 min-h-[60px] bg-slate-950 border-slate-700 text-xs font-mono"
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px] text-slate-400">宽</Label>
                <Input type="number" className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">高</Label>
                <Input type="number" className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={height} onChange={(e) => setHeight(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Steps</Label>
                <Input type="number" className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">CFG</Label>
                <Input type="number" step={0.1} className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={cfg} onChange={(e) => setCfg(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Seed (-1随机)</Label>
                <Input type="number" className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Denoise</Label>
                <Input type="number" step={0.05} className="mt-1 bg-slate-950 border-slate-700 h-8"
                  value={denoise} onChange={(e) => setDenoise(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <Label className="text-[11px] text-slate-400">参考图 URL（img2img / 换装）</Label>
              <Input
                className="mt-1 bg-slate-950 border-slate-700 h-8 text-xs"
                placeholder="https://... 女友肖像"
                value={inputImage}
                onChange={(e) => setInputImage(e.target.value)}
              />
            </div>

            <Button
              className="w-full h-11 bg-violet-600 hover:bg-violet-500 font-bold"
              disabled={generating}
              onClick={generate}
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> 生成中（30–90s）…</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Queue Prompt 生成</>
              )}
            </Button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-h-[420px]">
            <div className="mb-3 text-sm font-semibold text-slate-300">输出预览</div>
            {generating && (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-10 w-10 animate-spin text-violet-400 mb-2" />
                正在调用 RunPod Comfy…
              </div>
            )}
            {!generating && lastResult.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center text-slate-500 text-sm gap-2">
                <span>左侧填参数后点生成</span>
                <Button size="sm" variant="outline" className="border-slate-700" onClick={() => setTab('loras')}>
                  或从 LoRA 清单一键调用
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {lastResult.map((a, i) => (
                <div key={a.id || i} className="group relative rounded-lg overflow-hidden border border-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="aspect-[3/4] w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    {a.id && (
                      <button
                        type="button"
                        className="flex-1 text-[10px] py-1 rounded bg-red-600/80"
                        onClick={() => deleteAsset(a.id)}
                      >
                        删除
                      </button>
                    )}
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center text-[10px] py-1 rounded bg-slate-700"
                    >
                      打开
                    </a>
                    <button
                      type="button"
                      className="flex-1 text-[10px] py-1 rounded bg-violet-600/90"
                      title="复制图片 URL，可在图片管理页「操作台图库」中选用"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(a.url || '');
                          toast.success('已复制图片 URL · 去图片管理页可选用');
                        } catch {
                          toast.message(a.url || '');
                        }
                      }}
                    >
                      复制URL
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {lastResult.length > 0 && (
              <p className="mt-3 text-[11px] text-slate-500">
                生成图已入库图库。可在{' '}
                <a href="/admin/images" className="text-violet-400 underline">
                  图片管理
                </a>{' '}
                点「操作台图库」一键应用到女友/道具/商城。
              </p>
            )}
          </div>
        </div>
      )}

      {/* LORA CATALOG */}
      {tab === 'loras' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold flex items-center gap-2 text-violet-300">
                  <Sparkles className="h-4 w-4" />
                  LoRA 功能与用法
                </h2>
                <p className="mt-1 text-xs text-slate-400 max-w-2xl">
                  面向人物动作（NSFW）、服装、道具、身材。底座仅 FLUX（与 fp8 配套）。
                  文件放在网络卷 <code className="text-cyan-400">models/loras/</code>，
                  文件名须与下方 <code className="text-cyan-400">filename</code> 一致。
                  一键下载：<code className="text-violet-300">scripts/runpod/download-loras.sh</code>
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLoraFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px]',
                    loraFilter === 'all' ? 'bg-violet-600' : 'bg-slate-800 text-slate-400',
                  )}
                >
                  全部
                </button>
                {CAT_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLoraFilter(c)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px]',
                      loraFilter === c ? 'bg-violet-600' : 'bg-slate-800 text-slate-400',
                    )}
                  >
                    {CAT_LABEL[c] || c}
                  </button>
                ))}
              </div>
            </div>

            {stackingTips.length > 0 && (
              <ul className="mt-3 grid sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                {stackingTips.map((t, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-violet-400 shrink-0">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recipes */}
          {recipes.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-sm font-semibold text-amber-200/90 flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4" /> 快捷配方（一键填工作流 + LoRA + 提示词）
              </h3>
              <div className="flex flex-wrap gap-2">
                {recipes.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    className="bg-amber-700/80 hover:bg-amber-600 h-8 text-xs"
                    onClick={() => applyRecipe(r)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped list */}
          {CAT_ORDER.filter((c) => lorasByCat[c]?.length).map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-1">
                {CAT_LABEL[cat] || cat}
                <span className="ml-2 text-[10px] font-normal text-slate-500">
                  {lorasByCat[cat].length} 个
                </span>
              </h3>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {lorasByCat[cat].map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      'rounded-xl border p-3 space-y-2 bg-slate-900/50',
                      loraId === l.id ? 'border-violet-500' : 'border-slate-800',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-white">
                          {String(l.label || '').replace(/^\[[^\]]+\]\s*/, '')}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {l.nsfw && (
                            <Badge className="text-[9px] bg-rose-900/60 text-rose-100">NSFW</Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] border-slate-600">
                            强度 {l.default_strength}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 bg-violet-600 shrink-0"
                        onClick={() => applyLora(l)}
                      >
                        一键调用
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{l.usage}</p>
                    <p className="text-[10px] font-mono text-cyan-400/70 break-all">{l.filename}</p>
                    {(l.trigger_words?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {l.trigger_words.map((t: string) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] border-slate-700 flex-1"
                        onClick={() => applyLora(l, { appendTriggers: true })}
                      >
                        调用并跳转生成
                      </Button>
                      {l.page_url && (
                        <a
                          href={l.page_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center h-7 px-2 rounded border border-slate-700 text-[10px] text-slate-400 hover:text-white"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(lorasByCat).length === 0 && (
            <div className="text-center text-slate-500 text-sm py-12">该分类暂无 LoRA</div>
          )}
        </div>
      )}

      {/* LIBRARY */}
      {tab === 'library' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">生成图库</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                支持多选 · 批量上传 / 下载 / 删除 · 单张可作参考图
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => onUploadFiles(e.target.files)}
              />
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-500"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                批量上传
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={batchDownload}>
                <Download className="h-3.5 w-3.5 mr-1" /> 下载{selectedAssetKeys.length ? `(${selectedAssetKeys.length})` : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-900 text-red-300"
                onClick={batchDelete}
                disabled={!selectedAssetKeys.length}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> 批量删除{selectedAssetKeys.length ? `(${selectedAssetKeys.length})` : ''}
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={selectAllVisible}>
                全选
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={clearSelection}>
                清空
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" asChild>
                <a href="/admin/images">图片管理</a>
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={loadAssets}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
              </Button>
            </div>
          </div>
          {assetsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm space-y-3">
              <p>暂无记录。先生成，或点「批量上传」导入参考图。</p>
              <Button size="sm" className="bg-rose-600" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" /> 上传图片
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {assets.map((a, idx) => {
                const k = assetKey(a);
                const selected = selectedAssetKeys.includes(k);
                return (
                  <div
                    key={k || idx}
                    className={cn(
                      'rounded-lg border overflow-hidden bg-slate-900/50 relative group',
                      selected ? 'border-rose-500 ring-1 ring-rose-500/40' : 'border-slate-800',
                    )}
                  >
                    <button
                      type="button"
                      className="absolute left-2 top-2 z-10 rounded bg-black/60 p-1 text-white"
                      onClick={() => toggleSelect(a)}
                      title="选择"
                    >
                      {selected ? <CheckSquare className="h-4 w-4 text-rose-400" /> : <Square className="h-4 w-4" />}
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="aspect-[3/4] w-full object-cover" />
                    <div className="p-2 space-y-1">
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px] border-slate-600">{a.kind || 'img'}</Badge>
                        {a.lora_name && (
                          <Badge className="text-[9px] bg-violet-900/50">{a.lora_name}</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 font-mono">{a.prompt || a.storage_key}</p>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-[10px] border-slate-700"
                          onClick={() => {
                            setInputImage(a.url || '');
                            setTab('generate');
                            toast.message('已填入参考图');
                          }}
                        >
                          作参考
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-[10px] border-violet-800 text-violet-300"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(a.url || '');
                              toast.success('已复制 URL');
                            } catch {
                              toast.message(a.url || '');
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] border-slate-700"
                          onClick={() => {
                            if (!a.url) return;
                            const aEl = document.createElement('a');
                            aEl.href = a.url;
                            aEl.download = `comfy_${a.id || idx}.png`;
                            aEl.target = '_blank';
                            document.body.appendChild(aEl);
                            aEl.click();
                            aEl.remove();
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] border-red-900 text-red-400"
                          onClick={() => deleteAsset(a.id ? a.id : a)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WORKFLOWS */}

      
      {tab === 'workflows' && (
        <div className="grid md:grid-cols-2 gap-3">
          {workflows.map((w) => (
            <div key={w.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">{w.name}</h3>
                  <Badge className="mt-1 text-[10px]" variant="outline">{w.kind}</Badge>
                </div>
                <Button
                  size="sm"
                  className="bg-violet-600"
                  onClick={() => {
                    applyWorkflow(w);
                    setTab('generate');
                  }}
                >
                  使用
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-400">{w.description}</p>
              <pre className="mt-2 text-[10px] text-slate-500 overflow-auto max-h-24 font-mono">
                {JSON.stringify(w.defaults, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* INFRA */}
      {tab === 'infra' && (
        <div className="space-y-4 max-w-3xl">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="font-semibold flex items-center gap-2 text-violet-300">
              <BookOpen className="h-4 w-4" /> LoRA / 模型挂网络卷
            </h3>
            <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-slate-300">
              {(config.network_volume?.setup_notes || []).map((n: string, i: number) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/40 p-3">
                <div className="text-slate-500">网络卷</div>
                <div className="font-mono text-emerald-300">{config.network_volume?.name}</div>
                <div className="text-slate-500">{config.network_volume?.region}</div>
              </div>
              <div className="rounded-lg bg-black/40 p-3">
                <div className="text-slate-500">LoRA 目录</div>
                <div className="font-mono text-cyan-300">{config.network_volume?.loras_dir}</div>
                <div className="text-slate-500">Checkpoint</div>
                <div className="font-mono text-cyan-300">{config.network_volume?.checkpoints_dir}</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-black/40 p-3 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">一键下载（RunPod model-downloader）</div>
              <pre className="font-mono text-[11px] text-cyan-300/90 whitespace-pre-wrap">{`chmod +x download-loras.sh
./download-loras.sh
# 编辑 lora-urls.txt 后:
./download-loras.sh --from-file /runpod-volume/models/loras/lora-urls.txt`}</pre>
              <p className="text-slate-500">详见 scripts/runpod/README-LORA.md</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <h3 className="font-semibold">Serverless 端点 ID（填你的真实 ID）</h3>
            {endpoints.map((ep: Any, idx: number) => (
              <div key={ep.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-b border-slate-800 pb-3">
                <div>
                  <Label className="text-[11px] text-slate-400">{ep.label}</Label>
                  <p className="text-[10px] text-slate-500">{ep.notes}</p>
                </div>
                <div className="sm:col-span-2">
                  <Input
                    className="font-mono text-xs bg-slate-950 border-slate-700"
                    placeholder="RunPod endpoint id"
                    value={ep.endpoint_id || ''}
                    onChange={(e) => {
                      const next = { ...config, endpoints: [...endpoints] };
                      next.endpoints[idx] = { ...ep, endpoint_id: e.target.value };
                      setConfig(next);
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={saveEndpoints} className="bg-violet-600 gap-1">
                <Save className="h-3.5 w-3.5" /> 保存端点配置
              </Button>
              <Button variant="outline" className="border-slate-700 gap-1" onClick={resetConfig}>
                <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400 space-y-2">
            <h3 className="font-semibold text-slate-200">你现有资源建议用法</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><b className="text-slate-300">model-downloader Pod</b>：启动后把 ckpt/LoRA 下到 <code className="text-cyan-400">soulmate-models-ca2</code></li>
              <li><b className="text-slate-300">ComfyUI 5.8.6 / portrait:v9</b>：挂同一网络卷，出图用</li>
              <li><b className="text-slate-300">soulmate-vllm-luminaid</b>：只聊天，不填到出图端点</li>
              <li>Serverless 显示 0/3 空闲 = 按需唤醒，正常；有请求会起 worker</li>
            </ul>
            <p className="text-[11px] pt-2">
              SQL 建图库表：执行仓库 <code className="text-violet-300">db/migrations/0009_comfy_console.sql</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
