'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Play, Plus, Trash2, GripVertical,
  AlertTriangle, CheckCircle2, XCircle, Zap, Shield,
  ArrowUpDown, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────

interface ImageRoute {
  id: string;
  provider: string;
  label: string;
  enabled: boolean;
  priority: number;
  timeout_ms: number;
  switch_on_queue: boolean;
  failure_threshold: number;
  reset_ms: number;
  supports_lora: boolean;
  supports_reference: boolean;
  nsfw_capable: boolean;
  endpoint_env?: string;
  notes?: string;
}

interface LlmRoute {
  id: string;
  label: string;
  provider: string;
  model_id: string;
  enabled: boolean;
  priority: number;
  nsfw_capable: boolean;
  tiers: string[];
  channel: 'sfw' | 'nsfw' | 'both';
  timeout_ms: number;
  failure_threshold: number;
  reset_ms: number;
  api_base_url?: string;
  api_base_env?: string;
  api_key_env?: string;
  notes?: string;
}

interface ProviderRoutesConfig {
  version: number;
  updated_at: string;
  image_routes: ImageRoute[];
  llm_routes: LlmRoute[];
  settings: {
    user_notify_switch_ms: number;
    auto_failover: boolean;
    verbose_logging: boolean;
  };
}

interface ImageHealth {
  id: string;
  provider: string;
  label: string;
  enabled: boolean;
  circuit_open: boolean;
  failures: number;
  configured: boolean;
}

interface EnvStatus {
  [key: string]: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  runpod: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  runpod_dc2: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  fal: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  together: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  openrouter: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  openai: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  anthropic: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function providerBadge(provider: string) {
  const cls = PROVIDER_COLORS[provider] || 'bg-gray-500/15 text-gray-400 border-gray-500/30';
  return <Badge variant="outline" className={cls}>{provider}</Badge>;
}

function channelBadge(channel: string) {
  if (channel === 'nsfw') return <Badge variant="outline" className="bg-pink-500/15 text-pink-400 border-pink-500/30">NSFW</Badge>;
  if (channel === 'sfw') return <Badge variant="outline" className="bg-sky-500/15 text-sky-400 border-sky-500/30">SFW</Badge>;
  return <Badge variant="outline" className="bg-violet-500/15 text-violet-400 border-violet-500/30">Both</Badge>;
}

// ─── Main Page ───────────────────────────────────────────────

export default function AdminProviderRoutesPage() {
  const [tab, setTab] = useState<'image' | 'llm' | 'settings'>('image');
  const [config, setConfig] = useState<ProviderRoutesConfig | null>(null);
  const [imageHealth, setImageHealth] = useState<ImageHealth[]>([]);
  const [envStatus, setEnvStatus] = useState<EnvStatus>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{ type: 'image' | 'llm'; route: ImageRoute | LlmRoute | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/provider-routes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      setImageHealth(data.image_health || []);
      setEnvStatus(data.env_status || {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const postAction = async (body: Record<string, unknown>) => {
    try {
      const res = await authedFetch('/api/admin/provider-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      toast.success('操作成功');
      await load();
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
      return null;
    }
  };

  const toggleRoute = (type: 'image' | 'llm', routeId: string, enabled: boolean) => {
    postAction({ action: type === 'image' ? 'toggle_image_route' : 'toggle_llm_route', route_id: routeId, enabled });
  };

  const removeRoute = (type: 'image' | 'llm', routeId: string) => {
    if (!confirm(`确定删除路由 "${routeId}"？`)) return;
    postAction({ action: type === 'image' ? 'remove_image_route' : 'remove_llm_route', route_id: routeId });
  };

  const testRoute = async (type: 'image' | 'llm', routeId: string) => {
    setTesting(routeId);
    try {
      const res = await authedFetch('/api/admin/provider-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_route', route_id: routeId, type }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`路由正常 (${data.latency_ms}ms)`);
      } else {
        toast.error(`路由异常: ${data.error || '未配置'}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '测试失败');
    } finally {
      setTesting(null);
    }
  };

  const saveRoute = (type: 'image' | 'llm', route: ImageRoute | LlmRoute, isNew: boolean) => {
    const action = isNew
      ? (type === 'image' ? 'add_image_route' : 'add_llm_route')
      : (type === 'image' ? 'update_image_route' : 'update_llm_route');
    if (isNew) {
      postAction({ action, route });
    } else {
      postAction({ action, route_id: route.id, ...route });
    }
    setEditDialog(null);
  };

  const moveRoute = (type: 'image' | 'llm', routes: Array<{ id: string }>, fromIdx: number, toIdx: number) => {
    const ids = routes.map((r) => r.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    postAction({ action: 'reorder', type, ordered_ids: ids });
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!config) return null;

  const sortedImage = [...config.image_routes].sort((a, b) => a.priority - b.priority);
  const sortedLlm = [...config.llm_routes].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">路由线路管理</h1>
          <p className="text-sm text-gray-400 mt-1">
            图片/LLM 多供应商路由 · 自动故障转移 · 熔断器 · 按需计费
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> 刷新
        </Button>
      </div>

      {/* Env Status */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">环境变量状态</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(envStatus).map(([key, ok]) => (
              <Badge
                key={key}
                variant="outline"
                className={ok
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-400 border-red-500/30'}
              >
                {ok ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                {key.replace('RUNPOD_', 'RP_').replace('_API_KEY', '_KEY').replace('_ID', '')}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#16161f] rounded-lg p-1 w-fit">
        {([['image', '图片路由'], ['llm', 'LLM 路由'], ['settings', '全局设置']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Image Routes Tab */}
      {tab === 'image' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              优先级从上到下递减 · 熔断器自动跳过故障节点 · 队列感知切换
            </p>
            <Button size="sm" onClick={() => setEditDialog({ type: 'image', route: null })}>
              <Plus className="w-4 h-4 mr-1" /> 添加图片路由
            </Button>
          </div>

          {sortedImage.map((route, idx) => {
            const health = imageHealth.find((h) => h.id === route.id);
            return (
              <Card key={route.id} className={`bg-[#16161f] border-gray-800 ${!route.enabled ? 'opacity-50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => moveRoute('image', sortedImage, idx, idx - 1)}
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <GripVertical className="w-4 h-4 text-gray-600" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{route.label}</span>
                        {providerBadge(route.provider)}
                        {route.nsfw_capable && <Badge variant="outline" className="bg-pink-500/10 text-pink-400 border-pink-500/30 text-xs">NSFW</Badge>}
                        {route.supports_lora && <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-xs">LoRA</Badge>}
                        {route.supports_reference && <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">Ref</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>优先级: {route.priority}</span>
                        <span>超时: {(route.timeout_ms / 1000).toFixed(0)}s</span>
                        <span>熔断: {route.failure_threshold}次/{(route.reset_ms / 1000).toFixed(0)}s</span>
                        {route.switch_on_queue && <span className="text-amber-400">队列切换</span>}
                        {route.endpoint_env && <span className="text-gray-600">{route.endpoint_env}</span>}
                      </div>
                    </div>

                    {/* Health indicator */}
                    {health && (
                      <div className="flex items-center gap-1">
                        {health.circuit_open ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                            <AlertTriangle className="w-3 h-3 mr-1" /> 熔断
                          </Badge>
                        ) : health.configured ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> 就绪
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/30">
                            未配置
                          </Badge>
                        )}
                        {health.failures > 0 && !health.circuit_open && (
                          <span className="text-xs text-amber-400">{health.failures}次失败</span>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => testRoute('image', route.id)}
                        disabled={testing === route.id}
                      >
                        {testing === route.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setEditDialog({ type: 'image', route })}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                        onClick={() => removeRoute('image', route.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Switch
                        checked={route.enabled}
                        onCheckedChange={(v) => toggleRoute('image', route.id, v)}
                      />
                    </div>
                  </div>
                  {route.notes && (
                    <p className="text-xs text-gray-600 mt-2 ml-10">{route.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* LLM Routes Tab */}
      {tab === 'llm' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              按 tier + channel 路由 · NSFW 走自托管 · SFW 走 Together · 自动降级
            </p>
            <Button size="sm" onClick={() => setEditDialog({ type: 'llm', route: null })}>
              <Plus className="w-4 h-4 mr-1" /> 添加 LLM 路由
            </Button>
          </div>

          {sortedLlm.map((route, idx) => (
            <Card key={route.id} className={`bg-[#16161f] border-gray-800 ${!route.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="text-gray-600 hover:text-gray-300 disabled:opacity-30"
                      disabled={idx === 0}
                      onClick={() => moveRoute('llm', sortedLlm, idx, idx - 1)}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <GripVertical className="w-4 h-4 text-gray-600" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{route.label}</span>
                      {providerBadge(route.provider)}
                      {channelBadge(route.channel)}
                      {route.nsfw_capable && <Badge variant="outline" className="bg-pink-500/10 text-pink-400 border-pink-500/30 text-xs">NSFW</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="font-mono">{route.model_id}</span>
                      <span>优先级: {route.priority}</span>
                      <span>超时: {(route.timeout_ms / 1000).toFixed(0)}s</span>
                      <span>Tiers: {route.tiers.join(', ')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => testRoute('llm', route.id)}
                      disabled={testing === route.id}
                    >
                      {testing === route.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setEditDialog({ type: 'llm', route })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => removeRoute('llm', route.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Switch
                      checked={route.enabled}
                      onCheckedChange={(v) => toggleRoute('llm', route.id, v)}
                    />
                  </div>
                </div>
                {route.notes && (
                  <p className="text-xs text-gray-600 mt-2 ml-10">{route.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <Card className="bg-[#16161f] border-gray-800">
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-gray-300">用户通知切换阈值 (ms)</Label>
              <p className="text-xs text-gray-500">超过此时间后向用户显示"正在切换供应商"提示</p>
              <Input
                type="number"
                value={config.settings.user_notify_switch_ms}
                onChange={(e) => setConfig({ ...config, settings: { ...config.settings, user_notify_switch_ms: Number(e.target.value) } })}
                className="bg-[#0f0f17] border-gray-700 w-40"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-300">自动故障转移</Label>
                <p className="text-xs text-gray-500">关闭后仅使用手动指定的路由</p>
              </div>
              <Switch
                checked={config.settings.auto_failover}
                onCheckedChange={(v) => setConfig({ ...config, settings: { ...config.settings, auto_failover: v } })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-gray-300">详细路由日志</Label>
                <p className="text-xs text-gray-500">记录每次路由决策到 ai_model_usage_logs</p>
              </div>
              <Switch
                checked={config.settings.verbose_logging}
                onCheckedChange={(v) => setConfig({ ...config, settings: { ...config.settings, verbose_logging: v } })}
              />
            </div>

            <Button
              onClick={() => postAction({ action: 'save_config', config })}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Zap className="w-4 h-4 mr-1" /> 保存全局设置
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit/Add Dialog */}
      {editDialog && (
        <RouteEditDialog
          type={editDialog.type}
          route={editDialog.route}
          onClose={() => setEditDialog(null)}
          onSave={(route) => saveRoute(editDialog.type, route, !editDialog.route)}
        />
      )}
    </div>
  );
}

// ─── Route Edit Dialog ───────────────────────────────────────

function RouteEditDialog({ type, route, onClose, onSave }: {
  type: 'image' | 'llm';
  route: ImageRoute | LlmRoute | null;
  onClose: () => void;
  onSave: (route: ImageRoute | LlmRoute) => void;
}) {
  const isNew = !route;
  const [form, setForm] = useState<ImageRoute | LlmRoute>(
    route || (type === 'image'
      ? { id: '', provider: 'runpod', label: '', enabled: true, priority: 10, timeout_ms: 30000, switch_on_queue: false, failure_threshold: 3, reset_ms: 60000, supports_lora: false, supports_reference: false, nsfw_capable: true, notes: '' }
      : { id: '', label: '', provider: 'runpod', model_id: '', enabled: true, priority: 10, nsfw_capable: true, tiers: ['pro', 'unlimited'], channel: 'nsfw', timeout_ms: 25000, failure_threshold: 3, reset_ms: 60000, notes: '' }
    )
  );

  const update = (patch: Partial<ImageRoute & LlmRoute>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isNew ? `添加${type === 'image' ? '图片' : 'LLM'}路由` : `编辑: ${form.id}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">ID</Label>
              <Input
                value={form.id}
                onChange={(e) => update({ id: e.target.value })}
                disabled={!isNew}
                placeholder="my-route-id"
                className="bg-[#0f0f17] border-gray-700 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">供应商</Label>
              <Select value={form.provider} onValueChange={(v) => update({ provider: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['runpod', 'runpod_dc2', 'fal', 'together', 'openrouter', 'openai', 'anthropic'].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-400">名称</Label>
            <Input
              value={form.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="显示名称"
              className="bg-[#0f0f17] border-gray-700 text-sm"
            />
          </div>

          {type === 'llm' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Model ID</Label>
                <Input
                  value={(form as LlmRoute).model_id || ''}
                  onChange={(e) => update({ model_id: e.target.value })}
                  placeholder="model-name"
                  className="bg-[#0f0f17] border-gray-700 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Channel</Label>
                <Select value={(form as LlmRoute).channel || 'both'} onValueChange={(v) => update({ channel: v as 'sfw' | 'nsfw' | 'both' })}>
                  <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sfw">SFW</SelectItem>
                    <SelectItem value="nsfw">NSFW</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">优先级</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => update({ priority: Number(e.target.value) })}
                className="bg-[#0f0f17] border-gray-700 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">超时 (ms)</Label>
              <Input
                type="number"
                value={form.timeout_ms}
                onChange={(e) => update({ timeout_ms: Number(e.target.value) })}
                className="bg-[#0f0f17] border-gray-700 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">熔断阈值</Label>
              <Input
                type="number"
                value={form.failure_threshold}
                onChange={(e) => update({ failure_threshold: Number(e.target.value) })}
                className="bg-[#0f0f17] border-gray-700 text-sm"
              />
            </div>
          </div>

          {type === 'image' && (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <Switch checked={(form as ImageRoute).supports_lora} onCheckedChange={(v) => update({ supports_lora: v })} />
                LoRA
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <Switch checked={(form as ImageRoute).supports_reference} onCheckedChange={(v) => update({ supports_reference: v })} />
                Reference
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <Switch checked={(form as ImageRoute).switch_on_queue} onCheckedChange={(v) => update({ switch_on_queue: v })} />
                队列切换
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <Switch checked={form.nsfw_capable} onCheckedChange={(v) => update({ nsfw_capable: v })} />
            NSFW 支持
          </label>

          {type === 'image' && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Endpoint 环境变量</Label>
              <Input
                value={(form as ImageRoute).endpoint_env || ''}
                onChange={(e) => update({ endpoint_env: e.target.value })}
                placeholder="RUNPOD_ENDPOINT_ID_DC2"
                className="bg-[#0f0f17] border-gray-700 text-sm"
              />
            </div>
          )}

          {type === 'llm' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">API Base URL</Label>
                <Input
                  value={(form as LlmRoute).api_base_url || ''}
                  onChange={(e) => update({ api_base_url: e.target.value })}
                  placeholder="https://api.together.xyz/v1"
                  className="bg-[#0f0f17] border-gray-700 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">API Base Env</Label>
                <Input
                  value={(form as LlmRoute).api_base_env || ''}
                  onChange={(e) => update({ api_base_env: e.target.value })}
                  placeholder="RUNPOD_DC2_CHAT_URL"
                  className="bg-[#0f0f17] border-gray-700 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-gray-400">备注</Label>
            <Input
              value={form.notes || ''}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="路由说明"
              className="bg-[#0f0f17] border-gray-700 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.id || !form.label}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isNew ? '添加' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
