'use client';

/**
 * Comfy 操作台 — 参考 ComfyUI 的手动出图控制台
 * 工作流 / 模型 / LoRA / 生成 / 图库删除
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
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
  Settings2, BookOpen, Save, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Any = Record<string, any>;

export default function AdminComfyConsolePage() {
  const [tab, setTab] = useState<'generate' | 'library' | 'workflows' | 'infra'>('generate');
  const [config, setConfig] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assets, setAssets] = useState<Any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

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

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      // seed form from first workflow
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
      const res = await authedFetch('/api/admin/comfy?view=assets&limit=60');
      const data = await res.json();
      setAssets(data.assets || []);
      if (data.warning) toast.message(data.warning);
    } catch {
      toast.error('图库加载失败');
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

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
    // keep endpoint from config
    void c;
  }

  const workflows: Any[] = config?.workflows || [];
  const endpoints: Any[] = config?.endpoints || [];
  const checkpoints: Any[] = config?.checkpoints || [];
  const loras: Any[] = config?.loras || [];

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setLastResult(data.assets || []);
      toast.success(`生成成功 ${data.assets?.length || 0} 张`);
      if (tab === 'library') loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const deleteAsset = async (id: string) => {
    if (!id || !confirm('删除这张图？会同时删存储文件。')) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_asset', id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      setAssets((a) => a.filter((x) => x.id !== id));
      setLastResult((a) => a.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
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
      const data = await res.json();
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
    const data = await res.json();
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-violet-400" />
            Comfy 出图操作台
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            工作流 · Checkpoint / LoRA（网络卷）· 手动参数 · 图库存删
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
          { id: 'library', label: '图库', icon: ImageIcon },
          { id: 'workflows', label: '工作流', icon: Workflow },
          { id: 'infra', label: '网络卷/端点', icon: HardDrive },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'generate' | 'library' | 'workflows' | 'infra')}
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
          {/* Left controls — Comfy-like panel */}
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
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
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
                <Select value={loraId || 'none'} onValueChange={setLoraId}>
                  <SelectTrigger className="mt-1 bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {loras.map((l) => (
                      <SelectItem key={l.id} value={l.id || 'none'}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loraId && loraId !== 'none' && (
              <div>
                <Label className="text-[11px] text-slate-400">
                  LoRA 强度 {loraStrength.toFixed(2)}
                </Label>
                <input
                  type="range" min={0} max={1.5} step={0.05}
                  value={loraStrength}
                  onChange={(e) => setLoraStrength(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
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

          {/* Right preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-h-[420px]">
            <div className="mb-3 text-sm font-semibold text-slate-300">输出预览</div>
            {generating && (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-10 w-10 animate-spin text-violet-400 mb-2" />
                正在调用 RunPod Comfy…
              </div>
            )}
            {!generating && lastResult.length === 0 && (
              <div className="flex h-64 items-center justify-center text-slate-500 text-sm">
                左侧填参数后点生成
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY */}
      {tab === 'library' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">生成图库（可随时调用 / 删除）</h2>
            <Button size="sm" variant="outline" className="border-slate-700" onClick={loadAssets}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
            </Button>
          </div>
          {assetsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-500 text-sm">
              暂无记录。先生成，或执行 migration 0009 创建 generation_assets 表。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {assets.map((a) => (
                <div key={a.id} className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="aspect-[3/4] w-full object-cover" />
                  <div className="p-2 space-y-1">
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-[9px] border-slate-600">{a.kind}</Badge>
                      {a.lora_name && (
                        <Badge className="text-[9px] bg-violet-900/50">{a.lora_name}</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-2 font-mono">{a.prompt}</p>
                    <div className="flex gap-1">
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
                        className="h-7 text-[10px] border-red-900 text-red-400"
                        onClick={() => deleteAsset(a.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WORKFLOWS list */}
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
