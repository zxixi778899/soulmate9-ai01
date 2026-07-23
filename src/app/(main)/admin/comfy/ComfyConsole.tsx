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
  Zap, Upload, Download, CheckSquare, Square, Copy, ImagePlus, FileImage,
  Users, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  COMPANION_CATEGORIES,
  COMPANION_CATEGORY_LABELS,
  STUDIO_PROMPTS,
  type CompanionCategory,
} from '@/lib/companion-category';
import { getPresetsForCategory, type GenPreset } from './presets';
import { buildCompanionGenerationPrompt } from '@/lib/companion-generation';
import {
  GIRLFRIEND_NEGATIVE_FLUX,
  resolveGirlfriendLoraPlan,
  subjectFromGirlfriendRow,
} from '@/lib/prompt/girlfriend';

type Any = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  body: '身材',
  action: '人物动作 / NSFW',
  outfit: '服装',
  prop: '道具',
  detail: '细节质感',
};


const CAT_ORDER = ['body', 'action', 'outfit', 'prop', 'detail'];

type ComfyConsoleProps = { girlfriendId?: string; embedded?: boolean };

export default function ComfyConsole({ girlfriendId, embedded = false }: ComfyConsoleProps) {
  const [tab, setTab] = useState<'generate' | 'loras' | 'library' | 'workflows' | 'infra'>('generate');
  const [config, setConfig] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [assets, setAssets] = useState<Any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceImageInputRef = useRef<HTMLInputElement | null>(null);
  const [loraFilter, setLoraFilter] = useState<string>('all');
  const [genMode, setGenMode] = useState<'txt2img' | 'img2img' | 'img2video'>('txt2img');
  const [installedLoras, setInstalledLoras] = useState<string[]>([]);
  const [volumeInfo, setVolumeInfo] = useState<Any | null>(null);
  const [syncingInstalled, setSyncingInstalled] = useState(false);

  // Generate form
  const [workflowId, setWorkflowId] = useState('wf-girlfriend');
  const [endpointKey, setEndpointKey] = useState('portrait-v9');
  const [ckptId, setCkptId] = useState('flux-fp8');
  const [loraId, setLoraId] = useState('none');
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [selectedLoras, setSelectedLoras] = useState<Array<{ id: string; strength: number }>>([]);
  const [prompt, setPrompt] = useState('');
  const [negative, setNegative] = useState('');
  const [companionCategory, setCompanionCategory] = useState<CompanionCategory>('female');
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const [steps, setSteps] = useState(28);
  const [cfg, setCfg] = useState(1);
  const [imageCount, setImageCount] = useState(1);
  const [customPresets, setCustomPresets] = useState<Array<GenPreset>>([]);
  const [presetName, setPresetName] = useState('');
  const [sampler, setSampler] = useState('euler');
  const [scheduler, setScheduler] = useState('simple');
  const [seed, setSeed] = useState(-1);
  const [denoise, setDenoise] = useState(0.55);
  const [inputImage, setInputImage] = useState('');
  const [referenceImageUploading, setReferenceImageUploading] = useState(false);
  const [identityConsistency, setIdentityConsistency] = useState(Boolean(girlfriendId));
  const [kind, setKind] = useState('girlfriend');
  const [lastResult, setLastResult] = useState<Any[]>([]);
  const [scopedGirlfriend, setScopedGirlfriend] = useState<Any | null>(null);
  const [gfLoading, setGfLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchGirlfriends, setBatchGirlfriends] = useState<Any[]>([]);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Array<{ id: string; name: string; status: 'pending' | 'running' | 'success' | 'failed'; error?: string }>>([]);


  const applyPreset = (p: GenPreset) => {
    const assembled = buildCompanionGenerationPrompt(
      scopedGirlfriend || {
        gender: companionCategory === 'male' ? 'Male' : companionCategory === 'transgender' ? 'Transgender' : 'Female',
        appearance_style: companionCategory === 'anime' ? 'anime' : 'realistic',
        age: 25,
      },
      { action: p.prompt, adult: true },
    );
    setPrompt(assembled.positive);
    setNegative(`${assembled.negative}, ${p.negative}`);
    setWidth(p.width);
    setHeight(p.height);
    setSteps(p.steps);
    setCfg(p.cfg);
    toast.success(`已应用预设：${p.name}`);
  };
  const applyCategoryPrompt = (category: CompanionCategory) => {
    const preset = STUDIO_PROMPTS[category];
    setCompanionCategory(category);
    setPrompt(preset.prompt);
    setNegative(preset.negative);
    toast.success(`已切换为${COMPANION_CATEGORY_LABELS[category].zh}成人提示词`);
  };


  useEffect(() => {
    try {
      const saved = localStorage.getItem('soulmate-comfy-presets');
      if (saved) setCustomPresets(JSON.parse(saved));
    } catch { /* ignore invalid local preset data */ }
  }, []);

  const persistCustomPresets = (items: Array<GenPreset>) => {
    setCustomPresets(items);
    localStorage.setItem('soulmate-comfy-presets', JSON.stringify(items));
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name || !prompt.trim()) return toast.error('请输入预设名称并填写提示词');
    const item = {
      id: `custom-${Date.now()}`,
      name,
      desc: '自定义预设',
      prompt: prompt.trim(), negative: negative.trim(), width, height, steps, cfg,
    };
    persistCustomPresets([...customPresets, item]);
    setPresetName('');
    toast.success('预设已保存到当前浏览器');
  };

  const loadVolume = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/comfy?view=volume');
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) return;
      setInstalledLoras(Array.isArray(data.installed_loras) ? data.installed_loras : []);
      setVolumeInfo(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConfig = useCallback(async () => {

    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=config');
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      const wf = data.config?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')
        || data.config?.workflows?.[0];
      // 有伴侣卡时只套参数，不写死通用 positive（避免盖住已调试提示词）
      if (wf) applyWorkflow(wf, data.config, { preservePrompt: Boolean(girlfriendId) });
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
    loadVolume();
  }, [loadConfig, loadVolume]);

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
          // 强制使用已调试的 assembleGirlfriendFromRow，而不是字段逗号拼接
          fillPromptFromGirlfriend(one, { force: true, toastOn: true });
          toast.message(`已载入伴侣：${one.name || girlfriendId}`);
        }
      } catch {
        if (!cancelled) toast.error('载入伴侣失败');
      } finally {
        if (!cancelled) setGfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [girlfriendId]);


  useEffect(() => {
    if (tab === 'library') loadAssets();
  }, [tab, loadAssets]);

  function applyWorkflow(wf: Any, cfg?: Any, opts?: { preservePrompt?: boolean }) {
    const c = cfg || config;
    setWorkflowId(wf.id);
    setKind(wf.kind || 'custom');
    setEndpointKey(wf.defaults?.endpoint_key || 'comfy-default');
    setCkptId(wf.defaults?.ckpt_id || 'flux-fp8');
    setLoraId(wf.defaults?.lora_id || 'none');
    setLoraStrength(wf.defaults?.lora_strength ?? 0.8);
    setSelectedLoras(wf.defaults?.lora_id
      ? [{ id: wf.defaults.lora_id, strength: wf.defaults?.lora_strength ?? 0.8 }]
      : []);
    setWidth(wf.defaults?.width || 832);
    setHeight(wf.defaults?.height || 1216);
    setSteps(wf.defaults?.steps || 28);
    setCfg(String(wf.defaults?.ckpt_id || '').startsWith('flux') ? 1 : (wf.defaults?.cfg || 7));
    setDenoise(wf.defaults?.denoise ?? 0.55);
    if (!opts?.preservePrompt) {
      setPrompt(wf.defaults?.positive || '');
      setNegative(wf.defaults?.negative || '');
    }
    void c;
  }

  /** 用已调试的伴侣卡提示词配方（特征+动作+环境+质量），覆盖通用工作流默认句 */
  function fillPromptFromGirlfriend(row: Any, opts?: { force?: boolean; toastOn?: boolean }) {
    if (!row) return false;
    try {
      const assembled = buildCompanionGenerationPrompt(row as Record<string, unknown>, { adult: true });
      const nextPrompt = String(assembled.positive || '').trim();
      const nextNeg = String(assembled.negative || GIRLFRIEND_NEGATIVE_FLUX).trim();
      if (!nextPrompt) return false;
      if (opts?.force) {
        setPrompt(nextPrompt);
        setNegative(nextNeg || GIRLFRIEND_NEGATIVE_FLUX);
      } else {
        setPrompt((prev: string) => {
          const p = (prev || '').trim();
          const isGeneric =
            !p ||
            p.startsWith('three-quarter body portrait of a beautiful young adult woman') ||
            p === String((config as Any)?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')?.defaults?.positive || '').trim();
          return isGeneric ? nextPrompt : p;
        });
        setNegative((prev: string) => {
          const n = (prev || '').trim();
          if (!n || n.includes('flat chest') || n.startsWith('blurry, deformed, bad anatomy, child')) {
            return nextNeg || GIRLFRIEND_NEGATIVE_FLUX;
          }
          return n;
        });
      }

      try {
        const plan = resolveGirlfriendLoraPlan(subjectFromGirlfriendRow(row as Record<string, unknown>));
        if (plan?.lora_name) {
          const match = (config?.loras || []).find((l: Any) =>
            String(l.filename || '') === plan.lora_name || String(l.id || '') === plan.lora_name,
          );
          if (match) {
            setLoraId((cur: string) => (cur && cur !== 'none' ? cur : match.id));
            setLoraStrength((s: number) => (s > 0 ? s : plan.lora_strength_model || match.default_strength || 0.75));
            setSelectedLoras((current) => current.length
              ? current
              : [{ id: match.id, strength: plan.lora_strength_model || match.default_strength || 0.75 }]);
          }
        }
      } catch {
        /* ignore lora plan */
      }

      if (opts?.toastOn !== false) {
        toast.success(`已套用伴侣卡提示词配方：${row.name || 'companion'}`);
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提示词组装失败');
      return false;
    }
  }

  /** AI 优化提示词：随机画面/动作/环境（含 NSFW），保持人物特性 */
  const randomizePrompt = useCallback(() => {
    const row = scopedGirlfriend || {
      gender: companionCategory === 'male'
        ? 'Male'
        : companionCategory === 'transgender'
          ? 'Transgender'
          : 'Female',
      appearance_style: companionCategory === 'anime' ? 'anime' : 'realistic',
      age: 25,
    };
    const assembled = buildCompanionGenerationPrompt(row as Record<string, unknown>, {
      adult: true,
      random: Math.random(),
    });
    setPrompt(assembled.positive);
    setNegative(assembled.negative);
    toast.success('已生成伴侣专属随机动作提示词');
  }, [companionCategory, scopedGirlfriend]);

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
    setSelectedLoras((current) => current.some((item) => item.id === lora.id)
      ? current
      : [...current, { id: lora.id, strength: lora.default_strength ?? 0.75 }].slice(-4));
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
      setSelectedLoras([{ id: lora.id, strength: recipe.lora_strength ?? lora.default_strength ?? 0.75 }]);
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

  const installedSet = useMemo(() => new Set(installedLoras), [installedLoras]);

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

  const filteredBatchGirlfriends = useMemo(() => {
    const query = batchSearch.trim().toLowerCase();
    if (!query) return batchGirlfriends;
    return batchGirlfriends.filter((item) =>
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.slug || '').toLowerCase().includes(query),
    );
  }, [batchGirlfriends, batchSearch]);

  const loadBatchGirlfriends = async () => {
    setBatchLoading(true);
    try {
      const res = await authedFetch('/api/admin/girlfriends?limit=100&sort=name&order=asc');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '加载伴侣列表失败');
      setBatchGirlfriends(Array.isArray(data.girlfriends) ? data.girlfriends : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载伴侣列表失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleBatchGirlfriend = (id: string) => {
    setBatchSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 20) {
        toast.error('单次批量任务最多选择 20 位伴侣');
        return current;
      }
      return [...current, id];
    });
  };

  const generationBody = (overrides?: { girlfriendId?: string; prompt?: string; negative?: string }) => ({
    action: 'generate',
    girlfriend_id: overrides?.girlfriendId || girlfriendId || undefined,
    workflow_id: workflowId,
    endpoint_key: endpointKey,
    endpoint_id: selectedEndpoint?.endpoint_id || undefined,
    ckpt_id: ckptId,
    lora_id: loraId === 'none' ? null : loraId,
    lora_strength: loraStrength,
    loras: selectedLoras,
    prompt: overrides?.prompt ?? prompt,
    negative: overrides?.negative ?? negative,
    width,
    height,
    steps,
    cfg,
    sampler_name: sampler,
    scheduler,
    num_images: imageCount,
    seed,
    denoise: genMode === 'img2img' || inputImage ? denoise : undefined,
    input_image: genMode === 'img2img' || inputImage.trim() ? inputImage.trim() || undefined : undefined,
    character_consistency: identityConsistency,
    gen_mode: genMode,
    kind,
  });

  // 轮询任务完成后调后端 finalize：把图片搬到正确目录并写入 generation_assets
  const finalizeAssets = async (
    jobId: string,
    images: string[],
    overrides?: { girlfriendId?: string; prompt?: string; negative?: string },
  ): Promise<Any[] | null> => {
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generationBody(overrides),
          action: 'finalize',
          job_id: jobId,
          images,
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (res.ok && Array.isArray(data.assets) && data.assets.length > 0) {
        return data.assets as Any[];
      }
    } catch { /* 保存失败不影响预览 */ }
    return null;
  };

  const runBatchGeneration = async () => {
    const selected = batchGirlfriends.filter((item) => batchSelectedIds.includes(String(item.id)));
    if (!selected.length) return toast.error('请先选择需要生成的伴侣');
    if (genMode === 'img2img' && !inputImage.trim()) return toast.error('批量图生图需要先上传参考图');
    const actionText = prompt.includes('. She is ') ? prompt.split('. She is ').slice(1).join('. She is ') : prompt;
    setBatchRunning(true);
    setLastResult([]);
    setBatchProgress(selected.map((item) => ({ id: String(item.id), name: String(item.name || item.id), status: 'pending' })));
    const generatedAssets: Any[] = [];
    let succeeded = 0;
    let failed = 0;
    for (const girlfriend of selected) {
      const id = String(girlfriend.id);
      const name = String(girlfriend.name || id);
      setBatchProgress((items) => items.map((item) => item.id === id ? { ...item, status: 'running' } : item));
      try {
        const assembled = buildCompanionGenerationPrompt(girlfriend as Record<string, unknown>, { action: actionText, adult: true });
        const res = await authedFetch('/api/admin/comfy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...generationBody({ girlfriendId: id, prompt: assembled.positive, negative: assembled.negative }),
            character_consistency: true,
          }),
        });
        const data = await readResponseJson(res).catch(() => ({} as Any));
        if (!res.ok) throw new Error(data.error || '生成失败');

        // Handle async pending — poll until done
        if (data.pending && data.job_id) {
          const jobId = String(data.job_id);
          let done = false;
          for (let p = 0; p < 60; p++) {
            await new Promise((r) => setTimeout(r, 3000));
            const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
            if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
              let polled: Any[] = pollData.images.map((url: string) => ({ url, storage_key: '', id: null }));
              const saved = await finalizeAssets(jobId, pollData.images, {
                girlfriendId: id,
                prompt: assembled.positive,
                negative: assembled.negative,
              });
              if (saved) polled = saved;
              generatedAssets.push(...polled);
              done = true;
              break;
            }
            if (pollData.status === 'FAILED') throw new Error(pollData.error || 'RunPod 任务失败');
          }
          if (!done) throw new Error('GPU 排队超时');
        } else {
          generatedAssets.push(...(Array.isArray(data.assets) ? data.assets : []));
        }
        succeeded += 1;
        setBatchProgress((items) => items.map((item) => item.id === id ? { ...item, status: 'success' } : item));
      } catch (error) {
        failed += 1;
        setBatchProgress((items) => items.map((item) => item.id === id
          ? { ...item, status: 'failed', error: error instanceof Error ? error.message : '生成失败' }
          : item));
      }
    }
    setLastResult(generatedAssets);
    setBatchRunning(false);
    if (failed) toast.warning(`批量任务完成：成功 ${succeeded}，失败 ${failed}`);
    else toast.success(`批量任务完成：${succeeded} 位伴侣全部生成成功`);
  };

  const syncInstalled = async () => {
    setSyncingInstalled(true);
    try {
      const res = await authedFetch('/api/admin/model-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_installed' }),
      });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '同步失败');
      await loadVolume();
      toast.success(`已同步盘状态 · 更新 ${data.updated ?? 0} 条`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncingInstalled(false);
    }
  };

  const generate = async () => {
    if (genMode === 'img2video') {
      toast.message('图生视频接口预留中，请先用文生图/图生图');
      return;
    }
    if (!prompt.trim()) {
      toast.error('请填写正向提示词');
      return;
    }
    if (genMode === 'img2img' && !inputImage.trim()) {
      toast.error('图生图需要参考图 URL');
      return;
    }
    setGenerating(true);
    setLastResult([]);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generationBody()),
      });
      const data = await readResponseJson(res).catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error || '生成失败');

      // Handle async pending response — poll until job completes
      if (data.pending && data.job_id) {
        toast.message('GPU 排队中，等待出图…');
        const jobId = String(data.job_id);
        const maxPolls = 60; // 60 × 3s = 3 min max
        let completed = false;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as any));
            if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
              let polledAssets: Any[] = pollData.images.map((url: string) => ({ url, storage_key: '', id: null }));
              const saved = await finalizeAssets(jobId, pollData.images);
              if (saved) polledAssets = saved;
              setLastResult(polledAssets);
              toast.success(`生成成功 ${polledAssets.length} 张`);
              if (tab === 'library') loadAssets();
              completed = true;
              break;
            }
            if (pollData.status === 'FAILED') {
              throw new Error(pollData.error || 'RunPod 任务失败');
            }
            // Still pending — continue polling
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes('RunPod')) throw pollErr;
            // Network hiccup — keep polling
          }
        }
        if (!completed) {
          throw new Error('GPU 排队超时（3 分钟），请稍后重试');
        }
        return;
      }

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

  const uploadReferenceImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    setReferenceImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('action', 'upload_assets');
      fd.append('kind', 'reference');
      if (girlfriendId) fd.append('girlfriend_id', girlfriendId);
      fd.append('files', file);
      const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(String(data.error || '参考图上传失败'));
      const uploaded = Array.isArray(data.assets) ? data.assets[0] : null;
      const url = String(uploaded?.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('上传成功但未返回可用的 HTTPS 图片地址');
      setInputImage(url);
      setGenMode('img2img');
      toast.success('参考图已上传并启用图生图');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '参考图上传失败');
    } finally {
      setReferenceImageUploading(false);
      if (referenceImageInputRef.current) referenceImageInputRef.current.value = '';
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
    <div className={embedded ? 'bg-transparent p-3 sm:p-4 text-slate-100' : 'min-h-screen bg-[#0b0f14] p-4 sm:p-6 text-slate-100'}>
      {girlfriendId ? (
        <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
          {gfLoading ? '正在载入伴侣…' : scopedGirlfriend ? (
            <span>
              按伴侣创作：<strong>{scopedGirlfriend.name || girlfriendId}</strong>
              <span className="ml-2 text-xs text-violet-200/70">资产写入 girlfriends/{girlfriendId}/ · 不进公共库</span>
            </span>
          ) : (
            <span>按伴侣创作 · ID {girlfriendId}（资料未取到也可生成）</span>
          )}
          <button
            type="button"
            className="ml-3 text-xs underline text-violet-200"
            onClick={() => {
              if (!scopedGirlfriend) return;
              fillPromptFromGirlfriend(scopedGirlfriend, { force: true, toastOn: true });
            }}
          >
            一键填充提示词
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          公共创作模式：结果进入 comfy-outputs / 公共资产库。从「伴侣与媒体」点创作可切换为按卡隔离。
        </div>
      )}
      {!embedded && (
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
          <Button size="sm" variant="outline" onClick={() => { loadConfig(); loadVolume(); }} className="border-slate-700">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
          </Button>
        </div>
      </div>

      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1 w-fit">
        {[
          { id: 'generate', label: '生成', icon: Play },
          { id: 'loras', label: 'LoRA 清单', icon: Layers },
          { id: 'library', label: '图库', icon: ImageIcon },
          { id: 'workflows', label: '工作流', icon: Workflow },
          { id: 'infra', label: '网络卷/端点', icon: HardDrive },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id as typeof tab)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm',
              tab === tabItem.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <tabItem.icon className="h-3.5 w-3.5" />
            {tabItem.label}
          </button>
        ))}
        </div>
        <Button size="sm" variant="outline" className="border-cyan-800 text-cyan-200 h-9" disabled={syncingInstalled} onClick={syncInstalled}>
          {syncingInstalled ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <HardDrive className="h-3.5 w-3.5 mr-1" />}
          同步盘状态
        </Button>
        <Button size="sm" variant="outline" className="border-emerald-800 text-emerald-200 h-9" onClick={async () => {
          try {
            const res = await authedFetch('/api/admin/comfy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify_loras' }) });
            const data = await res.json();
            if (data.health) {
              const h = data.health;
              if (h.inventorySource === 'unavailable') toast.warning('未取得 RunPod 运行卷清单，LoRA 只能标记为待验证');
              else if (h.missing === 0) toast.success('LoRA 真实性检查通过：' + h.ok + '/' + h.total + ' 已由运行卷确认');
              else toast.warning('运行卷缺失 ' + h.missing + ' 个 LoRA：' + h.entries.filter((e: Any) => e.status === 'missing').map((e: Any) => e.label).join(', '));
            }
          } catch { toast.error('LoRA 健康检查失败'); }
        }}>
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          LoRA检测
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn('h-9 border-violet-700 text-violet-100', batchOpen && 'bg-violet-600/25')}
          onClick={() => {
            const next = !batchOpen;
            setBatchOpen(next);
            if (next && batchGirlfriends.length === 0) void loadBatchGirlfriends();
          }}
        >
          <Users className="mr-1 h-3.5 w-3.5" /> 批量生成
          {batchSelectedIds.length ? <Badge className="ml-1.5 bg-violet-500 text-white">{batchSelectedIds.length}</Badge> : null}
        </Button>
        <span className="text-[10px] text-slate-500">
          {volumeInfo?.inventory_source === 'runtime-volume' ? `卷上已验证 ${installedLoras.length}` : '卷清单未验证'} · {volumeInfo?.paths?.loras || config.network_volume?.loras_dir || 'models/loras'}
        </span>
      </div>

      {/* GENERATE — SD: left params sticky / right preview */}
      {tab === 'generate' && (
        <div className="space-y-4 text-slate-100">
          {batchOpen ? (
            <section className="rounded-xl border border-violet-500/40 bg-violet-950/20 p-3 shadow-lg shadow-violet-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-violet-300" /> 批量生成伴侣</h2>
                  <p className="mt-1 text-[11px] text-slate-300">逐个读取伴侣卡特征并生成，每张图片自动进入对应伴侣独立资源库。单次最多 20 位。</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={batchRunning || batchLoading} onClick={() => {
                    setBatchSelectedIds(filteredBatchGirlfriends.slice(0, 20).map((item) => String(item.id)));
                  }}>选择当前结果</Button>
                  <Button type="button" size="sm" variant="outline" disabled={batchRunning} onClick={() => setBatchSelectedIds([])}>清空</Button>
                  <Button type="button" size="sm" className="bg-violet-600 hover:bg-violet-500" disabled={batchRunning || batchSelectedIds.length === 0} onClick={() => void runBatchGeneration()}>
                    {batchRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                    {batchRunning ? '批量生成中' : `开始生成 ${batchSelectedIds.length || ''}`}
                  </Button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <Input value={batchSearch} onChange={(event) => setBatchSearch(event.target.value)} placeholder="搜索伴侣名字 / slug" className="h-9 border-slate-700 bg-slate-950 pl-8 text-sm" />
              </div>
              {batchLoading ? (
                <div className="flex h-28 items-center justify-center text-sm text-slate-300"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载伴侣列表…</div>
              ) : (
                <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredBatchGirlfriends.map((item) => {
                    const id = String(item.id);
                    const checked = batchSelectedIds.includes(id);
                    const progress = batchProgress.find((entry) => entry.id === id);
                    const image = String(item.avatar_url || item.portrait_url || item.card_url || '');
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={checked}
                        disabled={batchRunning}
                        onClick={() => toggleBatchGirlfriend(id)}
                        className={cn('flex items-center gap-2 rounded-lg border p-2 text-left transition', checked ? 'border-violet-400 bg-violet-500/20' : 'border-slate-700 bg-slate-950/70 hover:border-slate-500')}
                      >
                        <div className="h-11 w-9 shrink-0 overflow-hidden rounded bg-slate-800">
                          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="m-2 h-5 w-5 text-slate-500" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{item.name || id}</p>
                          <p className={cn('mt-0.5 text-[10px]', progress?.status === 'failed' ? 'text-red-300' : progress?.status === 'success' ? 'text-emerald-300' : progress?.status === 'running' ? 'text-cyan-300' : 'text-slate-400')}>
                            {progress?.status === 'running' ? '生成中…' : progress?.status === 'success' ? '已完成' : progress?.status === 'failed' ? '失败' : checked ? '已选择' : '待选择'}
                          </p>
                        </div>
                        {checked ? <CheckSquare className="h-4 w-4 shrink-0 text-violet-300" /> : <Square className="h-4 w-4 shrink-0 text-slate-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {batchProgress.some((item) => item.status === 'failed') ? (
                <div className="mt-2 rounded border border-red-500/30 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-200">
                  {batchProgress.filter((item) => item.status === 'failed').map((item) => `${item.name}: ${item.error || '生成失败'}`).join('；')}
                </div>
              ) : null}
            </section>
          ) : null}
          <section className="rounded-md border border-slate-700 bg-[#111214] p-3 shadow-xl shadow-black/30">
            <div className="mb-3 flex flex-wrap gap-2" aria-label="角色分类">
              {COMPANION_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={companionCategory === category ? 'default' : 'outline'}
                  className={cn('h-8', companionCategory === category && 'bg-fuchsia-600 hover:bg-fuchsia-500')}
                  onClick={() => applyCategoryPrompt(category)}
                >
                  {COMPANION_CATEGORY_LABELS[category].zh}
                </Button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">正向提示词 · 人物 + 做什么</h2>
                <p className="text-[11px] text-slate-300">使用自然语言描述成年 AI 伴侣及其正在进行的性感、妩媚或亲密动作。</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 gap-1 border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10" onClick={randomizePrompt} title="随机生成优化提示词（保持人物特性，含 NSFW）">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI优化提示词
                </Button>
                <Badge className="border-violet-400/40 bg-violet-500/15 text-violet-100">{prompt.length} 字符</Badge>
              </div>
            </div>
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px]">
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="min-h-28 resize-y border-slate-600 bg-[#0b0c0e] text-sm leading-6 text-white placeholder:text-slate-500 focus-visible:ring-violet-500" placeholder="例如：Daisy 是一位曲线优美的成年伴侣。她正倚在床边，用妩媚的眼神邀请观众靠近。" />
              <Button className="min-h-28 bg-slate-100 text-base font-bold !text-slate-950 hover:bg-white" disabled={generating} onClick={generate}>
                {generating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
                {generating ? '生成中…' : '生成'}
              </Button>
            </div>
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-semibold text-slate-300">反向提示词</div>
              <Textarea value={negative} onChange={(e) => setNegative(e.target.value)} rows={2} className="min-h-16 resize-y border-slate-700 bg-[#0b0c0e] font-mono text-xs leading-5 text-slate-200 placeholder:text-slate-600 focus-visible:ring-rose-500" placeholder="blurry, bad anatomy, underage, watermark…" />
            </div>
          </section>

          <section className="grid gap-3 rounded-md border border-slate-700 bg-[#17181b] p-3 md:grid-cols-[1fr_1fr_1.2fr]">
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">采样方法 (Sampler)</Label>
              <Select value={sampler} onValueChange={setSampler}>
                <SelectTrigger className="h-9 border-slate-600 bg-[#0b0c0e] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="euler">Euler（FLUX 推荐）</SelectItem>
                  <SelectItem value="euler_ancestral">Euler ancestral</SelectItem>
                  <SelectItem value="dpmpp_2m">DPM++ 2M</SelectItem>
                  <SelectItem value="dpmpp_sde">DPM++ SDE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">调度类型 (Scheduler)</Label>
              <Select value={scheduler} onValueChange={setScheduler}>
                <SelectTrigger className="h-9 border-slate-600 bg-[#0b0c0e] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple（FLUX 推荐）</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="karras">Karras</SelectItem>
                  <SelectItem value="sgm_uniform">SGM Uniform</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-300"><span>迭代步数 (Steps)</span><span>{steps}</span></div>
              <input type="range" min={8} max={50} step={1} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="mt-2 w-full accent-violet-500" />
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(460px,1fr)_minmax(520px,1fr)] gap-4 items-start">
          <div className="space-y-3 xl:sticky xl:top-14 xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto pr-0.5">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-lg shadow-black/20">
              <div className="text-xs font-semibold text-slate-100 mb-2 flex items-center gap-1">
                <Settings2 className="h-3.5 w-3.5" /> 生成模式
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { id: 'txt2img' as const, label: '文生图', icon: FileImage },
                  { id: 'img2img' as const, label: '图生图', icon: ImagePlus },
                ]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setGenMode(m.id);
                      if (m.id === 'img2img' && identityConsistency) setDenoise((value) => Math.min(value, 0.45));
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px]',
                      genMode === m.id
                        ? 'border-violet-400 bg-violet-600/60 !text-white'
                        : 'border-slate-500 bg-slate-950 !text-slate-100 hover:border-violet-400 hover:!text-white',
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={identityConsistency}
                onClick={() => setIdentityConsistency((enabled) => {
                  const next = !enabled;
                  if (next && genMode === 'img2img') setDenoise((value) => Math.min(value, 0.45));
                  return next;
                })}
                className={cn(
                  'mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition',
                  identityConsistency
                    ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-50'
                    : 'border-slate-600 bg-slate-950/60 text-slate-300 hover:border-slate-500',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  {identityConsistency ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4" />}
                  人物一致性
                </span>
                <span className="text-[10px] opacity-80">
                  {identityConsistency
                    ? girlfriendId ? '已锁定当前伴侣特征' : '需先选择伴侣卡'
                    : '关闭'}
                </span>
              </button>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                文生图优先使用伴侣卡肖像保持身份；图生图把上传图片作为姿势与构图参考，人物仍以伴侣卡的脸型、发色、眼睛和身材为准。
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-white">快速预设</div>
                <Badge variant="outline" className="text-[10px]">中文</Badge>
              </div>
              <div className="flex gap-1.5">
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} className="h-8 border-slate-600 bg-slate-950 text-xs text-white" placeholder="新预设名称" />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 border-slate-500 text-white" onClick={saveCurrentPreset}>保存当前</Button>
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto">
                {[...getPresetsForCategory(companionCategory), ...customPresets].map((pr) => (
                  <div key={pr.id} className="flex items-stretch rounded-lg border border-slate-600 bg-slate-950 hover:border-pink-400">
                    <button type="button" onClick={() => applyPreset(pr)} className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-100">
                        {pr.name}
                        {pr.nsfw ? <span className="rounded bg-rose-500/25 px-1 text-[9px] font-bold leading-4 text-rose-300">18+</span> : null}
                      </div>
                      <div className="text-[11px] text-slate-100">{pr.desc}</div>
                    </button>
                    {pr.id.startsWith('custom-') && (
                      <button type="button" className="px-2 text-red-300 hover:bg-red-950/40 hover:text-red-100" aria-label={`删除预设 ${pr.name}`} onClick={() => persistCustomPresets(customPresets.filter((item) => item.id !== pr.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-lg shadow-black/20 [&_label]:font-medium [&_label]:text-slate-200">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                <Settings2 className="h-4 w-4" /> 参数
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-400">工作流</Label>
                  <Select value={workflowId} onValueChange={(id) => { const wf = workflows.find((w) => w.id === id); if (wf) applyWorkflow(wf); else setWorkflowId(id); }}>
                    <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{workflows.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-slate-400">端点</Label>
                  <Select value={endpointKey} onValueChange={setEndpointKey}>
                    <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{endpoints.map((e) => (<SelectItem key={e.id} value={e.id}>{e.label || e.id}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Checkpoint</Label>
                <Select value={ckptId} onValueChange={setCkptId}>
                  <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{checkpoints.map((c) => (<SelectItem key={c.id} value={c.id}>{c.label || c.filename || c.id}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] flex items-center justify-between">
                  <span>LoRA 叠加（最多 4 个）</span>
                  <span className="text-[10px] text-cyan-300">已选 {selectedLoras.length}</span>
                </Label>
                <Select value="none" onValueChange={(id) => {
                  if (id === 'none') return;
                  const l = loras.find((x) => x.id === id);
                  if (!l) return;
                  setLoraId(id);
                  setLoraStrength(l.default_strength ?? 0.7);
                  setSelectedLoras((current) => current.some((item) => item.id === id)
                    ? current
                    : [...current, { id, strength: l.default_strength ?? 0.7 }].slice(-4));
                }}>
                  <SelectTrigger className="h-9 bg-slate-950 border-slate-600 text-xs text-slate-100"><SelectValue placeholder="添加 LoRA…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">添加 LoRA…</SelectItem>
                    {loras.map((l) => {
                      const fn = String(l.filename || '');
                      const on = !fn || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(fn));
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {on ? '● ' : '○ '}{String(l.label || l.id).replace(/^\[[^\]]+\]\s*/, '')}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {selectedLoras.length > 0 && (
                <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-950/20 p-2.5">
                  {selectedLoras.map((selection) => {
                    const asset = loras.find((item) => item.id === selection.id);
                    const filename = String(asset?.filename || '');
                    const onDisk = !filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(filename));
                    return (
                      <div key={selection.id} className="rounded-md border border-slate-700 bg-slate-950 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-white">{asset?.label || selection.id}</p>
                            <p className={cn('truncate text-[10px] font-mono', onDisk ? 'text-cyan-300' : 'text-amber-300')}>
                              {onDisk ? filename : `${filename} · 未在盘上`}
                            </p>
                          </div>
                          <button type="button" className="text-slate-300 hover:text-red-300" onClick={() => {
                            setSelectedLoras((current) => current.filter((item) => item.id !== selection.id));
                            if (loraId === selection.id) setLoraId('none');
                          }} aria-label={`移除 ${asset?.label || selection.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <input type="range" min={0} max={1.2} step={0.05} value={selection.strength} onChange={(event) => {
                            const strength = Number(event.target.value);
                            setSelectedLoras((current) => current.map((item) => item.id === selection.id ? { ...item, strength } : item));
                          }} className="w-full accent-violet-500" />
                          <span className="w-9 text-right text-[11px] font-semibold text-violet-200">{selection.strength.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" className="text-[10px] font-medium text-slate-300 hover:text-white" onClick={() => { setSelectedLoras([]); setLoraId('none'); }}>
                    清空全部 LoRA
                  </button>
                </div>
              )}
              {(genMode === 'img2img' || genMode === 'img2video') && (
                <div className="space-y-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-amber-200/90">参考图</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={referenceImageUploading}
                      onClick={() => referenceImageInputRef.current?.click()}
                      className="h-7 border-amber-700/60 bg-amber-950/40 px-2 text-[11px] text-amber-100 hover:bg-amber-900/50"
                    >
                      {referenceImageUploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                      上传图片
                    </Button>
                    <input
                      ref={referenceImageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => void uploadReferenceImage(event.target.files?.[0] || null)}
                    />
                  </div>
                  <Input value={inputImage} onChange={(e) => setInputImage(e.target.value)} className="bg-slate-950 border-slate-700 text-xs font-mono" placeholder="也可粘贴 HTTPS 图片地址" />
                  {inputImage ? (
                    <div className="flex items-center gap-2 rounded border border-white/10 bg-black/20 p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inputImage} alt="参考图预览" className="h-16 w-12 rounded object-cover" />
                      <div className="min-w-0 flex-1 text-[10px] text-slate-300">
                        <p className="font-medium text-amber-100">已启用参考图</p>
                        <p className="truncate">{inputImage}</p>
                      </div>
                      <button type="button" onClick={() => setInputImage('')} className="px-1 text-[10px] text-slate-400 hover:text-white">清除</button>
                    </div>
                  ) : null}
                  {genMode === 'img2img' && (
                    <div>
                      <Label className="text-[11px] text-slate-400">Denoise {denoise.toFixed(2)}</Label>
                      <input type="range" min={0.15} max={0.95} step={0.05} value={denoise} onChange={(e) => setDenoise(Number(e.target.value))} className="w-full accent-amber-500" />
                      {identityConsistency ? <p className="mt-1 text-[10px] text-cyan-200/80">一致性开启时服务端会将有效 Denoise 限制在 0.45 以内，降低换脸和体貌漂移。</p> : null}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px] text-slate-400">宽</Label><Input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">高</Label><Input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">Steps</Label><Input type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">CFG</Label><Input type="number" step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">Seed</Label><Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-200">生成数量</Label><Select value={String(imageCount)} onValueChange={(value) => setImageCount(Number(value))}><SelectTrigger className="h-9 border-slate-600 bg-slate-950 text-xs text-white"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((count) => <SelectItem key={count} value={String(count)}>{count} 张</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-[11px] text-slate-400">kind</Label><Input value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 min-h-[calc(100vh-11rem)] flex flex-col shadow-xl shadow-black/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-violet-400" /> 输出预览
              </div>
              <div className="text-[11px] font-medium text-slate-300">
                {genMode === 'txt2img' && '文生图'}
                {genMode === 'img2img' && '图生图'}
                {genMode === 'img2video' && '图生视频（预留）'}
              </div>
            </div>
            {generating && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400 py-16">
                <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                <p className="text-sm">RunPod 排队 / 推理中…</p>
              </div>
            )}
            {!generating && lastResult.length === 0 && (
              <div className="flex flex-1 min-h-[560px] flex-col items-center justify-center border border-dashed border-slate-600 bg-slate-950/70 rounded-lg text-slate-300 text-sm py-20">
                <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
                生成结果会出现在这里
              </div>
            )}
            {!generating && lastResult.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lastResult.map((a, idx) => (
                  <div key={a.id || a.url || idx} className="rounded-lg border border-slate-700 overflow-hidden bg-black/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="w-full object-contain max-h-[70vh] bg-black" />
                    <div className="p-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-700 flex-1" onClick={async () => { try { await navigator.clipboard.writeText(a.url || ''); toast.success('已复制 URL'); } catch { toast.message(a.url || ''); } }}>
                        <Copy className="h-3 w-3 mr-1" /> 复制
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-700" onClick={() => { setInputImage(a.url || ''); setGenMode('img2img'); toast.message('已设为参考图'); }}>
                        作参考
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-red-900 text-red-400" onClick={() => deleteAsset(a)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                          <Badge className={cn('text-[9px]', (!l.filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(String(l.filename)))) ? 'bg-emerald-900/50 text-emerald-100' : 'bg-amber-900/40 text-amber-100')}>
                            {(!l.filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(String(l.filename)))) ? '卷上已验证' : volumeInfo?.inventory_source === 'runtime-volume' ? '卷上缺失' : '待验证'}
                          </Badge>
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
      <footer className="mt-8 border-t border-white/10 pt-4 pb-6 text-[11px] text-slate-500 space-y-2 max-w-4xl">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> 使用说明
        </h3>
        <ol className="list-decimal pl-4 space-y-1 text-slate-400">
          <li>左侧参数（文生图 / 图生图），右侧输出预览；说明固定在页面底部。</li>
          <li>LoRA 须对应网络卷 models/loras/ 真实文件名；● 盘上可调，未安装会在服务端回退。</li>
          <li>下载：模型库导出 lora-urls.txt → RunPod downloader → 在 LORA_REGISTRY 添加条目或设置 RUNPOD_INSTALLED_LORAS → 同步盘状态。</li>
          <li>伴侣模式写入 girlfriends/&#123;id&#125;/；公共模式写入 comfy-outputs。</li>
          <li>当前仅展示已接通的文生图与图生图；采样器、调度器、Steps、CFG、Seed 和 LoRA 均写入真实工作流。</li>
        </ol>
      </footer>

    </div>
  );
}
