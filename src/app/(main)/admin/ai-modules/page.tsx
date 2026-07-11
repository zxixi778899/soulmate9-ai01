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
  ImageIcon, Languages, Database, AlertTriangle, CheckCircle2, Plus, Trash2, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

type AnyConfig = Record<string, any>;

const SCENE_LABELS: Record<string, string> = {
  girlfriend_portrait: '女友肖像',
  chat_selfie: '聊天自拍',
  outfit_prop: '换装道具',
  shop_item: '商城道具',
  admin_batch: '管理批量',
};

export default function AdminAiModulesPage() {
  const [tab, setTab] = useState<'overview' | 'chat' | 'image' | 'language' | 'endpoints'>('overview');
  const [config, setConfig] = useState<AnyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<AnyConfig | null>(null);
  const [previewTier, setPreviewTier] = useState('pro');
  const [previewMsg, setPreviewMsg] = useState('kiss me hard');
  const [previewIntimacy, setPreviewIntimacy] = useState(4);
  const [previewScene, setPreviewScene] = useState('chat_selfie');
  const [env, setEnv] = useState<AnyConfig | null>(null);
  const [dirty, setDirty] = useState(false);
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
      toast.success('已恢复默认方案');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      setSaving(false);
    }
  };

  const seedModels = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/ai-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_models' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '写入失败');
      toast.success(`已同步到 ai_model_configs（${data.inserted}/${data.attempted}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSaving(false);
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

  const endpointOptions = (config?.endpoints || []).map((e: AnyConfig) => ({
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="h-6 w-6 text-[#2563EB]" />
            AI 模块方案
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            聊天路由 · 出图场景 · 语言回复 · 按市面竞品 + 本站 NSFW/套餐逻辑
          </p>
          <p className="text-[11px] text-[#64748B] mt-0.5">
            更新于 {config.updated_at || '—'} · v{config.version}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </Button>
          <Button variant="outline" size="sm" onClick={seedModels} disabled={saving} className="gap-1.5">
            <Database className="h-3.5 w-3.5" /> 同步模型表
          </Button>
          <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1.5 bg-[#FF2D78] hover:bg-[#e0266b]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存方案
          </Button>
        </div>
      </div>

      
      {env && (env.warnings?.length ?? 0) > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-200 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Environment health
            </div>
            <ul className="text-xs text-amber-100/80 space-y-1 list-disc pl-5">
              {(env.warnings ?? []).map((w: string) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge className={env.imageReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                {env.imageReady ? 'Image RunPod ready' : 'Image RunPod missing'}
              </Badge>
              <Badge className={env.chatReady?.together ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                Together {env.chatReady?.together ? 'OK' : 'missing'}
              </Badge>
              <Badge className={env.chatReady?.runpod_vllm ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                vLLM {env.chatReady?.runpod_vllm ? 'OK' : 'missing'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

{/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1 w-fit">
        {[
          { id: 'overview', label: '总览预览', icon: Play },
          { id: 'chat', label: '聊天', icon: MessageSquare },
          { id: 'image', label: '出图', icon: ImageIcon },
          { id: 'language', label: '语言', icon: Languages },
          { id: 'endpoints', label: '端点', icon: Brain },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.id ? 'bg-[#2563EB] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-white">默认方案摘要</h3>
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

      {/* Chat */}
      {tab === 'chat' && (
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
                      {endpointOptions.map((e: AnyConfig) => (
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
                          {endpointOptions.map((e: AnyConfig) => (
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
                          {endpointOptions.filter((e: AnyConfig) => e.nsfw).map((e: AnyConfig) => (
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
                    onChange={(e) => { setDirty(true); markDirtyConfig({ ...config, image: { ...config.image, free_daily_images: Number(e.target.value) || 0 } }); }} />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">Pro 每日出图（空=不限）</Label>
                  <Input type="number" className="mt-1" value={config.image.pro_daily_images ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => { setDirty(true); markDirtyConfig({ ...config, image: { ...config.image, pro_daily_images: e.target.value === '' ? null : Number(e.target.value) } }); }} />
                </div>
                <div>
                  <Label className="text-xs text-[#8B8BA3]">Unlimited 每日（空=不限）</Label>
                  <Input type="number" className="mt-1" value={config.image.unlimited_daily_images ?? ''}
                    placeholder="unlimited"
                    onChange={(e) => { setDirty(true); markDirtyConfig({ ...config, image: { ...config.image, unlimited_daily_images: e.target.value === '' ? null : Number(e.target.value) } }); }} />
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

          {Object.entries(config.image.scenes || {}).map(([scene, sc]: [string, any]) => (
            <Card key={scene} className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold text-white font-mono text-sm">{scene}</h3>
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

      {/* Endpoints */}
      {tab === 'endpoints' && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
              const id = `custom-${Date.now().toString(36)}`;
              setDirty(true);
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
          {(config.endpoints || []).map((ep: AnyConfig, idx: number) => (
            <Card key={ep.id} className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{ep.label}</h3>
                    <p className="text-[11px] font-mono text-[#8B8BA3]">{ep.id}</p>
                  </div>
                  <div className="flex gap-1">
                    <Badge className="text-[10px]">{ep.provider}</Badge>
                    {ep.nsfw_capable && <Badge className="text-[10px] bg-rose-500/20 text-rose-300">NSFW</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <Label className="text-[10px] text-[#64748B]">model_id</Label>
                    <Input className="h-8 font-mono text-[11px]" value={ep.model_id}
                      onChange={(e) => {
                        const endpoints = [...config.endpoints];
                        endpoints[idx] = { ...ep, model_id: e.target.value };
                        markDirtyConfig({ ...config, endpoints });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[#64748B]">api_key_env</Label>
                    <Input className="h-8 font-mono text-[11px]" value={ep.api_key_env || ''}
                      onChange={(e) => {
                        const endpoints = [...config.endpoints];
                        endpoints[idx] = { ...ep, api_key_env: e.target.value };
                        markDirtyConfig({ ...config, endpoints });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[#64748B]">temperature</Label>
                    <Input type="number" step={0.05} className="h-8" value={ep.temperature}
                      onChange={(e) => {
                        const endpoints = [...config.endpoints];
                        endpoints[idx] = { ...ep, temperature: Number(e.target.value) };
                        markDirtyConfig({ ...config, endpoints });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[#64748B]">max_tokens</Label>
                    <Input type="number" className="h-8" value={ep.max_tokens}
                      onChange={(e) => {
                        const endpoints = [...config.endpoints];
                        endpoints[idx] = { ...ep, max_tokens: Number(e.target.value) };
                        markDirtyConfig({ ...config, endpoints });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-[#64748B]">api_base_url</Label>
                    <Input className="h-8 font-mono text-[11px]" value={ep.api_base_url || ''}
                      onChange={(e) => {
                        const endpoints = [...config.endpoints];
                        endpoints[idx] = { ...ep, api_base_url: e.target.value || null };
                        markDirtyConfig({ ...config, endpoints });
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}
