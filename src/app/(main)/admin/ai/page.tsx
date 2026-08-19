'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Save, RefreshCw, RotateCcw, Play, Brain, MessageSquare,
  ImageIcon, Languages, AlertTriangle, Plus, BarChart3, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 管理后台动态配置 JSON，嵌套结构异构且按 key 泛化编辑
type AnyConfig = Record<string, any>;

interface SceneConfig {
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  count?: number;
  token_cost?: number;
  use_consistency_default?: boolean;
  allow_llm_prompt_polish?: boolean;
  [key: string]: number | boolean | string | undefined;
}

interface UsageStat {
  model_id: string;
  provider: string;
  total_calls: number;
  success_calls: number;
  error_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
  task_types: Record<string, number>;
}

interface UsageData {
  stats: UsageStat[];
  hourly: Array<{ hour: string; calls: number; cost: number; errors: number }>;
  totals: {
    total_calls: number;
    total_cost_usd: number;
    total_tokens: number;
    avg_latency_ms: number;
    avg_success_rate: number;
  } | null;
  period: string;
  since: string;
  error?: string;
}

interface TestResult {
  success: boolean;
  latency_ms: number;
  sample?: string;
  error?: string | null;
}

const SCENE_LABELS: Record<string, string> = {
  girlfriend_portrait: '伴侣肖像',
  chat_selfie: '聊天自拍',
  outfit_prop: '换装道具',
  shop_item: '商城道具',
  admin_batch: '管理批量',
};

type TabId = 'endpoints' | 'routing' | 'usage' | 'image' | 'language' | 'preview';

export default function AdminAiPage() {
  const [tab, setTab] = useState<TabId>('endpoints');
  const [config, setConfig] = useState<AnyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [env, setEnv] = useState<AnyConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState<Record<string, TestResult | 'busy'>>({});
  // Usage state
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usagePeriod, setUsagePeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [usageLoading, setUsageLoading] = useState(false);
  // Preview state
  const [preview, setPreview] = useState<AnyConfig | null>(null);
  const [previewTier, setPreviewTier] = useState('pro');
  const [previewMsg, setPreviewMsg] = useState('kiss me hard');
  const [previewIntimacy, setPreviewIntimacy] = useState(4);
  const [previewScene, setPreviewScene] = useState('chat_selfie');

  const markDirtyConfig = (next: AnyConfig) => {
    setConfig(next);
    setDirty(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/ai-modules');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      if (data.env) setEnv(data.env);
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadUsage = useCallback(async (period: '24h' | '7d' | '30d') => {
    setUsageLoading(true);
    try {
      const res = await authedFetch(`/api/admin/ai-modules?usage=1&period=${period}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setUsage(data.usage || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '用量加载失败');
    } finally {
      setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'usage') void loadUsage(usagePeriod);
  }, [tab, usagePeriod, loadUsage]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/ai-modules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, replace: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setConfig(data.config);
      if (data.env) setEnv(data.env);
      setDirty(false);
      toast.success(`已保存（${data.source}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!confirm('恢复出厂默认方案？当前配置会被覆盖。')) return;
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/ai-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重置失败');
      setConfig(data.config);
      setDirty(false);
      toast.success('已恢复默认方案');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      setSaving(false);
    }
  };

  const testEndpoint = async (ep: AnyConfig) => {
    setTesting((prev) => ({ ...prev, [ep.id]: 'busy' }));
    try {
      const res = await authedFetch('/api/admin/ai-modules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: ep.provider,
          model_id: ep.model_id,
          api_base_url: ep.api_base_url || undefined,
          api_key_env: ep.api_key_env || undefined,
          temperature: ep.temperature ?? 0.3,
          cost_per_1k_input: ep.cost_per_1k_input ?? 0,
          cost_per_1k_output: ep.cost_per_1k_output ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '测试失败');
      setTesting((prev) => ({ ...prev, [ep.id]: data as TestResult }));
      if (data.success) toast.success(`${ep.label} 连通正常（${data.latency_ms}ms）`);
      else toast.error(`${ep.label} 测试失败：${data.error || '未知错误'}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '测试失败';
      setTesting((prev) => ({ ...prev, [ep.id]: { success: false, latency_ms: 0, error: msg } }));
      toast.error(msg);
    }
  };

  const runPreview = async () => {
    try {
      const qs = new URLSearchParams({
        preview: '1',
        tier: previewTier,
        message: previewMsg,
        intimacy: String(previewIntimacy),
        scene: previewScene,
      });
      const res = await authedFetch(`/api/admin/ai-modules?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '预览失败');
      setPreview(data.preview);
      if (data.env) setEnv(data.env);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '预览失败');
    }
  };

  const updateEndpoint = (idx: number, patch: AnyConfig) => {
    if (!config) return;
    const endpoints = [...config.endpoints];
    endpoints[idx] = { ...endpoints[idx], ...patch };
    markDirtyConfig({ ...config, endpoints });
  };

  const endpointOptions: Array<{ id: string; label: string; nsfw: boolean }> = (
    (config?.endpoints || []) as AnyConfig[]
  ).map((e) => ({
    id: e.id,
    label: `${e.label} (${e.provider})`,
    nsfw: e.nsfw_capable,
  }));

  if (loading || !config) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="h-6 w-6 text-[#2563EB]" />
            AI 模型与路由
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            统一管理聊天模型端点、套餐路由策略与用量成本（唯一生效配置源）
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">
            更新于 {config.updated_at || '—'} · v{config.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </Button>
          <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1.5 bg-[#FF2D78] hover:bg-[#e0266b]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存配置
          </Button>
        </div>
      </div>

      {/* Env health */}
      {env && (env.warnings?.length ?? 0) > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-200 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              环境健康检查
            </div>
            <ul className="text-xs text-amber-100/80 space-y-1 list-disc pl-5">
              {(env.warnings ?? []).map((w: string) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className={env.imageReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                {env.imageReady ? '出图 RunPod 就绪' : '出图 RunPod 缺失'}
              </Badge>
              <Badge className={env.chatReady?.together ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                Together {env.chatReady?.together ? 'OK' : '缺失'}
              </Badge>
              <Badge className={env.chatReady?.runpod_vllm ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                vLLM {env.chatReady?.runpod_vllm ? 'OK' : '缺失'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 w-fit">
        {([
          { id: 'endpoints', label: '模型端点', icon: Brain },
          { id: 'routing', label: '聊天路由', icon: MessageSquare },
          { id: 'usage', label: '用量统计', icon: BarChart3 },
          { id: 'image', label: '出图', icon: ImageIcon },
          { id: 'language', label: '语言', icon: Languages },
          { id: 'preview', label: '路由预览', icon: Play },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.id ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Endpoints */}
      {tab === 'endpoints' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#94A3B8]">
              聊天运行时真正使用的模型清单 · 修改后点「保存配置」生效 · 每个端点可直接测试连通性
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
              const id = `custom-${Date.now().toString(36)}`;
              markDirtyConfig({
                ...config,
                endpoints: [
                  ...config.endpoints,
                  {
                    id,
                    label: '新端点',
                    provider: 'together',
                    model_id: '',
                    api_base_url: 'https://api.together.xyz/v1',
                    api_key_env: 'TOGETHER_API_KEY',
                    temperature: 0.85,
                    max_tokens: 1024,
                    cost_per_1k_input: 0,
                    cost_per_1k_output: 0,
                    nsfw_capable: false,
                    notes: '',
                  },
                ],
              });
            }}>
              <Plus className="h-3.5 w-3.5" /> 添加端点
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(config.endpoints || []).map((ep: AnyConfig, idx: number) => {
              const testState = testing[ep.id];
              return (
                <Card key={ep.id} className="border-white/10 bg-white/[0.03]">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{ep.label}</h3>
                        <p className="text-[11px] font-mono text-[#8B8BA3]">{ep.id}</p>
                      </div>
                      <div className="flex gap-1 items-center">
                        <Badge className="text-[10px]">{ep.provider}</Badge>
                        {ep.nsfw_capable && <Badge className="text-[10px] bg-rose-500/20 text-rose-300">NSFW</Badge>}
                        {ep.user_selectable && <Badge className="text-[10px] bg-sky-500/20 text-sky-300">用户可选</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <Label className="text-[10px] text-[#94A3B8]">model_id</Label>
                        <Input className="h-8 font-mono text-[11px]" value={ep.model_id}
                          onChange={(e) => updateEndpoint(idx, { model_id: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-[#94A3B8]">api_key_env</Label>
                        <Input className="h-8 font-mono text-[11px]" value={ep.api_key_env || ''}
                          onChange={(e) => updateEndpoint(idx, { api_key_env: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-[#94A3B8]">temperature</Label>
                        <Input type="number" step={0.05} className="h-8" value={ep.temperature}
                          onChange={(e) => updateEndpoint(idx, { temperature: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-[#94A3B8]">max_tokens</Label>
                        <Input type="number" className="h-8" value={ep.max_tokens}
                          onChange={(e) => updateEndpoint(idx, { max_tokens: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] text-[#94A3B8]">api_base_url</Label>
                        <Input className="h-8 font-mono text-[11px]" value={ep.api_base_url || ''}
                          onChange={(e) => updateEndpoint(idx, { api_base_url: e.target.value || null })}
                        />
                      </div>
                      <div className="col-span-2 border-t border-white/10 pt-2 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <label className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
                            <Switch
                              checked={!!ep.user_selectable}
                              onCheckedChange={(v) => updateEndpoint(idx, { user_selectable: v })}
                            />
                            前端模型选择器可见
                          </label>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-[#94A3B8]">最低等级</Label>
                            <Select
                              value={ep.min_tier || 'free'}
                              onValueChange={(v) => updateEndpoint(idx, { min_tier: v })}
                            >
                              <SelectTrigger className="h-8 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="free">free</SelectItem>
                                <SelectItem value="basic">basic</SelectItem>
                                <SelectItem value="pro">pro</SelectItem>
                                <SelectItem value="unlimited">unlimited</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-[#94A3B8]">积分/条</Label>
                            <Input type="number" min={0} className="h-8 w-20" value={ep.credit_cost ?? 0}
                              onChange={(e) => updateEndpoint(idx, { credit_cost: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#94A3B8]">展示名称 (public_label)</Label>
                          <Input className="h-8 text-[11px]" value={ep.public_label || ''} placeholder={String(ep.label || '')}
                            onChange={(e) => updateEndpoint(idx, { public_label: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#94A3B8]">展示说明 (public_description)</Label>
                          <Textarea className="min-h-[44px] text-[11px]" value={ep.public_description || ''}
                            placeholder="面向用户的一句话说明，如 Fast, light everyday chat"
                            onChange={(e) => updateEndpoint(idx, { public_description: e.target.value })}
                          />
                        </div>
                        {/* Actions */}
                        <div className="flex items-center justify-between border-t border-white/10 pt-2">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                            onClick={() => testEndpoint(ep)} disabled={testState === 'busy'}>
                            {testState === 'busy'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Play className="h-3 w-3" />}
                            测试连通
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-red-400 hover:text-red-300"
                            onClick={() => {
                              if (!confirm(`删除端点 "${ep.label}"？保存后生效。`)) return;
                              markDirtyConfig({ ...config, endpoints: config.endpoints.filter((_: AnyConfig, i: number) => i !== idx) });
                            }}>
                            <Trash2 className="h-3 w-3" /> 删除
                          </Button>
                        </div>
                        {testState && testState !== 'busy' && (
                          <div className={`rounded-md border px-2.5 py-2 text-[11px] ${
                            testState.success
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-red-500/30 bg-red-500/10 text-red-200'
                          }`}>
                            {testState.success ? (
                              <>OK · {testState.latency_ms}ms{testState.sample ? ` · ${String(testState.sample).slice(0, 80)}` : ''}</>
                            ) : (
                              <>失败 · {testState.error || '未知错误'}</>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Routing */}
      {tab === 'routing' && (
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">聊天总开关</h3>
                <Switch
                  checked={!!config.chat.enabled}
                  onCheckedChange={(v) => markDirtyConfig({ ...config, chat: { ...config.chat, enabled: v } })}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-[#8B8BA3]">NSFW 最低亲密度</Label>
                  <Input type="number" min={1} max={6} className="mt-1"
                    value={config.chat.nsfw_min_intimacy}
                    onChange={(e) => markDirtyConfig({
                      ...config,
                      chat: { ...config.chat, nsfw_min_intimacy: Number(e.target.value) || 4 },
                    })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">NSFW 检测</Label>
                  <Select
                    value={config.chat.nsfw_detection}
                    onValueChange={(v) => markDirtyConfig({
                      ...config,
                      chat: { ...config.chat, nsfw_detection: v },
                    })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keywords">关键词</SelectItem>
                      <SelectItem value="off">关闭</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">降级端点</Label>
                  <Select
                    value={config.chat.fallback_endpoint_id}
                    onValueChange={(v) => markDirtyConfig({
                      ...config,
                      chat: { ...config.chat, fallback_endpoint_id: v },
                    })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {endpointOptions.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">全局 System 后缀</Label>
                <Textarea
                  className="mt-1 min-h-[72px]"
                  value={config.chat.global_system_suffix || ''}
                  onChange={(e) => markDirtyConfig({
                    ...config,
                    chat: { ...config.chat, global_system_suffix: e.target.value },
                  })}
                />
              </div>
            </CardContent>
          </Card>

          {(['free', 'pro', 'unlimited'] as const).map((tier) => {
            const r = config.chat.tiers[tier];
            return (
              <Card key={tier} className="border-white/10 bg-white/[0.03]">
                <CardContent className="p-5 space-y-3">
                  <h3 className="font-semibold text-white capitalize">{tier} 套餐路由</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-[#8B8BA3]">SFW 模型</Label>
                      <Select
                        value={r.sfw_endpoint_id}
                        onValueChange={(v) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: { ...config.chat.tiers, [tier]: { ...r, sfw_endpoint_id: v } },
                          },
                        })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {endpointOptions.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-[#8B8BA3]">NSFW 模型</Label>
                      <Select
                        value={r.nsfw_endpoint_id || '__none__'}
                        onValueChange={(v) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: {
                              ...config.chat.tiers,
                              [tier]: { ...r, nsfw_endpoint_id: v === '__none__' ? null : v },
                            },
                          },
                        })}
                      >
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">无（禁止 NSFW）</SelectItem>
                          {endpointOptions.filter((e) => e.nsfw).map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-[#8B8BA3]">max_tokens</Label>
                      <Input type="number" className="mt-1" value={r.max_tokens}
                        onChange={(e) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: { ...config.chat.tiers, [tier]: { ...r, max_tokens: Number(e.target.value) || 512 } },
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-[#8B8BA3]">上下文条数</Label>
                      <Input type="number" className="mt-1" value={r.context_messages}
                        onChange={(e) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: { ...config.chat.tiers, [tier]: { ...r, context_messages: Number(e.target.value) || 10 } },
                          },
                        })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-[#8B8BA3]">日消息上限（空=无限）</Label>
                      <Input type="number" className="mt-1" value={r.daily_message_limit ?? ''}
                        placeholder="无限"
                        onChange={(e) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: {
                              ...config.chat.tiers,
                              [tier]: {
                                ...r,
                                daily_message_limit: e.target.value === '' ? null : Number(e.target.value),
                              },
                            },
                          },
                        })}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-2">
                      <Switch
                        checked={!!r.allow_nsfw}
                        onCheckedChange={(v) => markDirtyConfig({
                          ...config,
                          chat: {
                            ...config.chat,
                            tiers: { ...config.chat.tiers, [tier]: { ...r, allow_nsfw: v } },
                          },
                        })}
                      />
                      <span className="text-xs text-[#8B8BA3]">允许 NSFW 通道</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Usage */}
      {tab === 'usage' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-[#94A3B8]">
              来源 ai_model_usage_logs（聊天/生图/测试调用均计入）· 最多回溯 5000 条
            </p>
            <div className="flex items-center gap-2">
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button key={p}
                  onClick={() => setUsagePeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    usagePeriod === p
                      ? 'bg-[#2563EB] text-white border-[#2563EB]'
                      : 'bg-white/[0.03] text-[#94A3B8] border-white/10 hover:text-white'
                  }`}>
                  {p === '24h' ? '近 24 小时' : p === '7d' ? '近 7 天' : '近 30 天'}
                </button>
              ))}
              <Button variant="outline" size="sm" onClick={() => loadUsage(usagePeriod)} disabled={usageLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${usageLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {usageLoading && !usage ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : usage?.error ? (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4 text-sm text-red-200">用量数据加载失败：{usage.error}</CardContent>
            </Card>
          ) : usage && usage.totals ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard label="总调用" value={String(usage.totals.total_calls)} />
                <StatCard label="总成本 (USD)" value={`$${usage.totals.total_cost_usd.toFixed(4)}`} />
                <StatCard label="总 Tokens" value={usage.totals.total_tokens.toLocaleString()} />
                <StatCard label="平均延迟" value={`${(usage.totals.avg_latency_ms / 1000).toFixed(2)}s`} />
                <StatCard label="平均成功率" value={`${usage.totals.avg_success_rate}%`}
                  accent={usage.totals.avg_success_rate < 90 ? 'text-red-400' : 'text-emerald-400'} />
              </div>

              {usage.hourly.length > 0 && (
                <Card className="border-white/10 bg-white/[0.03]">
                  <CardContent className="p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-white">每小时调用量</h3>
                    <div className="flex items-end gap-[3px] h-24 overflow-x-auto">
                      {usage.hourly.map((h) => {
                        const max = Math.max(...usage.hourly.map((x) => x.calls), 1);
                        return (
                          <div key={h.hour} className="flex flex-col items-center gap-1 min-w-[14px]"
                            title={`${h.hour} · ${h.calls} 次 · $${h.cost.toFixed(4)}${h.errors ? ` · ${h.errors} 失败` : ''}`}>
                            <div
                              className={`w-3 rounded-t ${h.errors > 0 ? 'bg-amber-500/70' : 'bg-[#2563EB]/80'}`}
                              style={{ height: `${Math.max(4, (h.calls / max) * 80)}px` }}
                            />
                            <span className="text-[9px] text-[#64748B]">{h.hour.slice(11, 13)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-white/10 bg-white/[0.03]">
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">分模型统计</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[#64748B] text-left">
                          <th className="py-1.5 pr-3">模型</th>
                          <th className="py-1.5 pr-3">供应商</th>
                          <th className="py-1.5 pr-3">调用</th>
                          <th className="py-1.5 pr-3">成功率</th>
                          <th className="py-1.5 pr-3">Tokens</th>
                          <th className="py-1.5 pr-3">成本</th>
                          <th className="py-1.5">平均延迟</th>
                        </tr>
                      </thead>
                      <tbody className="text-[#CBD5E1]">
                        {usage.stats.map((m) => (
                          <tr key={m.model_id} className="border-t border-white/5">
                            <td className="py-2 pr-3 font-mono max-w-[220px] truncate">{m.model_id}</td>
                            <td className="py-2 pr-3">{m.provider}</td>
                            <td className="py-2 pr-3">{m.total_calls}</td>
                            <td className={`py-2 pr-3 ${m.success_rate < 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {m.success_rate}%
                            </td>
                            <td className="py-2 pr-3">{(m.total_input_tokens + m.total_output_tokens).toLocaleString()}</td>
                            <td className="py-2 pr-3">${m.total_cost_usd.toFixed(4)}</td>
                            <td className="py-2">{(m.avg_latency_ms / 1000).toFixed(2)}s</td>
                          </tr>
                        ))}
                        {!usage.stats.length && (
                          <tr><td colSpan={7} className="py-6 text-center text-[#64748B]">该时段暂无调用记录</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="py-10 text-center text-[#64748B]">暂无用量数据</CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Image */}
      {tab === 'image' && (
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">出图总开关</h3>
                <Switch
                  checked={!!config.image.enabled}
                  onCheckedChange={(v) => markDirtyConfig({ ...config, image: { ...config.image, enabled: v } })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#8B8BA3]">RunPod Endpoint 环境变量</Label>
                  <Input className="mt-1 font-mono text-sm" value={config.image.runpod_endpoint_env}
                    onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, runpod_endpoint_env: e.target.value } })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">API Key 环境变量</Label>
                  <Input className="mt-1 font-mono text-sm" value={config.image.runpod_api_key_env}
                    onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, runpod_api_key_env: e.target.value } })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-[#8B8BA3]">Free 每日出图</Label>
                  <Input type="number" className="mt-1" value={config.image.free_daily_images}
                    onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, free_daily_images: Number(e.target.value) || 0 } })} />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">Pro 每日出图（空=不限）</Label>
                  <Input type="number" className="mt-1" value={config.image.pro_daily_images ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, pro_daily_images: e.target.value === '' ? null : Number(e.target.value) } })} />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">Unlimited 每日（空=不限）</Label>
                  <Input type="number" className="mt-1" value={config.image.unlimited_daily_images ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, unlimited_daily_images: e.target.value === '' ? null : Number(e.target.value) } })} />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">默认 Negative</Label>
                <Textarea className="mt-1 min-h-[60px]" value={config.image.default_negative}
                  onChange={(e) => markDirtyConfig({ ...config, image: { ...config.image, default_negative: e.target.value } })}
                />
              </div>
            </CardContent>
          </Card>

          {(Object.entries(config.image.scenes || {}) as Array<[string, SceneConfig]>).map(([scene, sc]) => (
            <Card key={scene} className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-white font-mono text-sm">{SCENE_LABELS[scene] || scene}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['width', 'height', 'steps', 'cfg', 'count', 'token_cost'] as const).map((k) => (
                    <div key={k}>
                      <Label className="text-xs text-[#8B8BA3]">{k}</Label>
                      <Input
                        type="number"
                        step={k === 'cfg' ? 0.1 : 1}
                        className="mt-1"
                        value={sc[k]}
                        onChange={(e) => markDirtyConfig({
                          ...config,
                          image: {
                            ...config.image,
                            scenes: {
                              ...config.image.scenes,
                              [scene]: { ...sc, [k]: Number(e.target.value) },
                            },
                          },
                        })}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-[#8B8BA3]">
                    <Switch
                      checked={!!sc.use_consistency_default}
                      onCheckedChange={(v) => markDirtyConfig({
                        ...config,
                        image: {
                          ...config.image,
                          scenes: {
                            ...config.image.scenes,
                            [scene]: { ...sc, use_consistency_default: v },
                          },
                        },
                      })}
                    />
                    默认一致性参考图
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[#8B8BA3]">
                    <Switch
                      checked={!!sc.allow_llm_prompt_polish}
                      onCheckedChange={(v) => markDirtyConfig({
                        ...config,
                        image: {
                          ...config.image,
                          scenes: {
                            ...config.image.scenes,
                            [scene]: { ...sc, allow_llm_prompt_polish: v },
                          },
                        },
                      })}
                    />
                    允许 LLM 润色提示词
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Language */}
      {tab === 'language' && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">语言模块</h3>
              <Switch
                checked={!!config.language.enabled}
                onCheckedChange={(v) => markDirtyConfig({ ...config, language: { ...config.language, enabled: v } })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-[#8B8BA3]">默认语言</Label>
                <Select
                  value={config.language.default_locale}
                  onValueChange={(v) => markDirtyConfig({
                    ...config,
                    language: { ...config.language, default_locale: v },
                  })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(config.language.supported_locales || []).map((l: string) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3 pb-1">
                <label className="flex items-center gap-2 text-xs text-[#8B8BA3]">
                  <Switch
                    checked={!!config.language.force_reply_language}
                    onCheckedChange={(v) => markDirtyConfig({
                      ...config,
                      language: { ...config.language, force_reply_language: v },
                    })}
                  />
                  强制按语言回复
                </label>
                <label className="flex items-center gap-2 text-xs text-[#8B8BA3]">
                  <Switch
                    checked={!!config.language.auto_detect}
                    onCheckedChange={(v) => markDirtyConfig({
                      ...config,
                      language: { ...config.language, auto_detect: v },
                    })}
                  />
                  自动检测
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#8B8BA3]">各语言 System 指令</Label>
              {Object.entries(config.language.reply_instructions || {}).map(([loc, text]) => (
                <div key={loc} className="grid grid-cols-[48px_1fr] gap-2 items-start">
                  <Badge variant="outline" className="mt-2 justify-center">{loc}</Badge>
                  <Textarea
                    className="min-h-[52px] text-sm"
                    value={String(text)}
                    onChange={(e) => markDirtyConfig({
                      ...config,
                      language: {
                        ...config.language,
                        reply_instructions: {
                          ...config.language.reply_instructions,
                          [loc]: e.target.value,
                        },
                      },
                    })}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {tab === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-white">当前方案摘要</h3>
              <ul className="text-sm text-[#94A3B8] space-y-2 list-disc pl-5">
                <li><b className="text-white">Free</b>：Together Llama 8B · 无 NSFW · 日限 {config.chat.tiers.free.daily_message_limit} 条</li>
                <li><b className="text-white">Pro</b>：70B SFW + RunPod Lumimaid NSFW（亲密度≥{config.chat.nsfw_min_intimacy}）</li>
                <li><b className="text-white">Unlimited</b>：Noromaid 12B NSFW · 更长上下文</li>
                <li><b className="text-white">出图</b>：FLUX 场景；聊天气泡 {config.image.scenes.chat_selfie.token_cost} tokens/张</li>
                <li><b className="text-white">语言</b>：默认 {config.language.default_locale} · 强制回复语言 {config.language.force_reply_language ? '开' : '关'}</li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge className={config.chat.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                  聊天 {config.chat.enabled ? '启用' : '关闭'}
                </Badge>
                <Badge className={config.image.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                  出图 {config.image.enabled ? '启用' : '关闭'}
                </Badge>
                <Badge className={config.language.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                  语言 {config.language.enabled ? '启用' : '关闭'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-white">路由预览（模拟请求）</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-[#8B8BA3]">套餐</Label>
                  <Select value={previewTier} onValueChange={setPreviewTier}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">free</SelectItem>
                      <SelectItem value="pro">pro</SelectItem>
                      <SelectItem value="unlimited">unlimited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">亲密度</Label>
                  <Input type="number" min={1} max={6} className="mt-1 h-9" value={previewIntimacy}
                    onChange={(e) => setPreviewIntimacy(Number(e.target.value) || 1)} />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">出图场景</Label>
                  <Select value={previewScene} onValueChange={setPreviewScene}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(config.image.scenes || {}).map((s: string) => (
                        <SelectItem key={s} value={s}>{SCENE_LABELS[s] || s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button size="sm" className="w-full h-9" onClick={runPreview}>预览</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">测试消息</Label>
                <Input className="mt-1" value={previewMsg} onChange={(e) => setPreviewMsg(e.target.value)} />
              </div>
              {preview && (
                <pre className="text-[11px] bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-64 text-emerald-200/90">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="p-4">
        <p className="text-[11px] text-[#94A3B8]">{label}</p>
        <p className={`text-lg font-bold mt-1 ${accent || 'text-white'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
