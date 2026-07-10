'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, Plus, Save, Trash2, Power, PowerOff, Cpu, Activity,
  DollarSign, Clock, Zap, AlertTriangle, TrendingUp, BarChart3,
  Settings, RefreshCw, Play, Calculator, Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ModelConfig = {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  task_type: string;
  is_active: boolean;
  api_base_url: string | null;
  api_key_env: string | null;
  temperature: number;
  max_tokens: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  priority: number;
  nsfw_capable: boolean;
  min_tier: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ModelUsageStat = {
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
};

type UsageTotals = {
  total_calls: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_latency_ms: number;
  avg_success_rate: number;
};

type HourlyData = {
  hour: string;
  calls: number;
  cost: number;
  errors: number;
};

const PROVIDERS = ['coze', 'together', 'runpod', 'anthropic', 'openai'];
const TASK_TYPES = ['chat', 'nsfw_chat', 'emotion', 'metadata', 'image_prompt', 'complex'];
const TIERS = ['free', 'pro', 'unlimited'];

const providerColors: Record<string, string> = {
  coze: 'bg-blue-500/15 text-blue-400',
  together: 'bg-emerald-500/15 text-emerald-400',
  runpod: 'bg-purple-500/15 text-purple-400',
  anthropic: 'bg-orange-500/15 text-orange-400',
  openai: 'bg-cyan-500/15 text-cyan-400',
};

const taskColors: Record<string, string> = {
  chat: 'text-blue-400',
  nsfw_chat: 'text-rose-400',
  emotion: 'text-amber-400',
  metadata: 'text-violet-400',
  image_prompt: 'text-pink-400',
  complex: 'text-cyan-400',
};

export default function AdminModelsPage() {
  const [tab, setTab] = useState<'models' | 'dashboard' | 'guide'>('models');
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard state
  const [usageStats, setUsageStats] = useState<ModelUsageStat[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [usagePeriod, setUsagePeriod] = useState<'24h' | '7d' | '30d'>('24h');

  // Dialog state
  const [editDialog, setEditDialog] = useState(false);
  const [editModel, setEditModel] = useState<Partial<ModelConfig>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency_ms?: number;
    sample?: string;
    error?: string | null;
    cost_usd?: number;
  } | null>(null);

  // Cost calculator
  const [calcIn, setCalcIn] = useState(500);
  const [calcOut, setCalcOut] = useState(300);
  const [calcCalls, setCalcCalls] = useState(1000);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/models');
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await authedFetch(`/api/admin/models?view=usage&period=${usagePeriod}`);
      const data = await res.json();
      setUsageStats(data.stats || []);
      setHourlyData(data.hourly || []);
      setTotals(data.totals || null);
    } catch (err) {
      logger.error(String(err));
      toast.error('加载用量失败');
    } finally {
      setDashLoading(false);
    }
  }, [usagePeriod]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);
  useEffect(() => {
    if (tab === 'dashboard') fetchDashboard();
  }, [tab, fetchDashboard]);

  const openAdd = () => {
    setEditModel({
      provider: 'coze', task_type: 'chat', is_active: true,
      temperature: 0.85, max_tokens: 2048, cost_per_1k_input: 0,
      cost_per_1k_output: 0, priority: 0, nsfw_capable: false, min_tier: 'free',
    });
    setEditDialog(true);
  };

  const openEdit = (config: ModelConfig) => {
    setEditModel({ ...config });
    setEditDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = !!editModel.id;
      const res = await authedFetch('/api/admin/models', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editModel),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      toast.success(isEdit ? 'Model updated' : 'Model added');
      setEditDialog(false);
      fetchConfigs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (config: ModelConfig) => {
    try {
      await authedFetch('/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, is_active: !config.is_active }),
      });
      setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, is_active: !c.is_active } : c));
      toast.success(`${config.display_name} ${!config.is_active ? 'enabled' : 'disabled'}`);
    } catch { toast.error('Toggle failed'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`删除「${name}」？`)) return;
    try {
      await authedFetch(`/api/admin/models?id=${id}`, { method: 'DELETE' });
      setConfigs(prev => prev.filter(c => c.id !== id));
      toast.success('已删除模型');
    } catch { toast.error('删除失败'); }
  };

  const handleTest = async (config?: Partial<ModelConfig>) => {
    const target = config || editModel;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authedFetch('/api/admin/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          provider: target.provider,
          model_id: target.model_id,
          api_base_url: target.api_base_url,
          api_key_env: target.api_key_env,
          temperature: target.temperature,
          max_tokens: Math.min(target.max_tokens || 64, 128),
          cost_per_1k_input: target.cost_per_1k_input,
          cost_per_1k_output: target.cost_per_1k_output,
          prompt: 'Reply with exactly one word: OK',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '测试失败');
      setTestResult(data);
      if (data.success) toast.success(`连通成功 · ${data.latency_ms}ms`);
      else toast.error(data.error || '调用失败');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '测试失败';
      setTestResult({ success: false, error: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const estCost = (c: ModelConfig) => {
    const perCall =
      (calcIn / 1000) * (c.cost_per_1k_input || 0) +
      (calcOut / 1000) * (c.cost_per_1k_output || 0);
    return {
      perCall,
      total: perCall * calcCalls,
    };
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Cpu className="h-6 w-6 text-[#2563EB]" />
            AI 模型管理
          </h1>
          <p className="text-sm text-[#64748B] mt-1">配置模型提供商、监控用量、管理费用</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-0.5">
            <button
              onClick={() => setTab('models')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all ${
                tab === 'models' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              <Settings className="h-3.5 w-3.5 inline mr-1.5" />模型配置
            </button>
            <button
              onClick={() => setTab('dashboard')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all ${
                tab === 'dashboard' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 inline mr-1.5" />使用仪表盘
            </button>
            <button
              onClick={() => setTab('guide')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all ${
                tab === 'guide' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              📖 使用说明
            </button>
          </div>
          {tab === 'models' && (
            <Button onClick={openAdd} size="sm" className="gap-1.5 bg-[#FF2D78] hover:bg-[#e0266b]">
              <Plus className="h-4 w-4" /> 添加模型
            </Button>
          )}
          {tab === 'dashboard' && (
            <div className="flex items-center gap-2">
              <Select value={usagePeriod} onValueChange={(v) => setUsagePeriod(v as '24h' | '7d' | '30d')}>
                <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">近 24h</SelectItem>
                  <SelectItem value="7d">近 7 天</SelectItem>
                  <SelectItem value="30d">近 30 天</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchDashboard} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> 刷新
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODELS TAB ═══ */}
      {tab === 'models' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {configs.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-white/10 p-12 text-center text-sm text-[#8B8BA3]">
              暂无模型配置，点击「添加模型」开始配置 API
            </div>
          )}
          {configs.map((config) => (
            <Card
              key={config.id}
              className={`border-white/[0.06] bg-white/[0.03] backdrop-blur-sm transition-all hover:border-white/[0.12] ${
                !config.is_active ? 'opacity-50' : ''
              }`}
            >
              <CardContent className="p-5">
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge className={`text-[10px] px-2 py-0.5 ${providerColors[config.provider] || 'bg-gray-500/15 text-gray-400'}`}>
                      {config.provider}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${taskColors[config.task_type] || ''}`}>
                      {config.task_type}
                    </Badge>
                    {config.nsfw_capable && (
                      <Badge className="text-[10px] bg-rose-500/15 text-rose-400">NSFW</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleTest(config)}
                      className="p-1.5 rounded-md text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      title="测试 API"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(config)}
                      className={`p-1.5 rounded-md transition-colors ${
                        config.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-500 hover:bg-gray-500/10'
                      }`}
                      title={config.is_active ? '禁用' : '启用'}
                    >
                      {config.is_active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => { setTestResult(null); openEdit(config); }} className="p-1.5 rounded-md text-[#8B8BA3] hover:text-white hover:bg-white/[0.06] transition-colors" title="编辑">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(config.id, config.display_name)} className="p-1.5 rounded-md text-[#8B8BA3] hover:text-red-400 hover:bg-red-500/10 transition-colors" title="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Name + model ID */}
                <h3 className="text-sm font-semibold text-white mb-0.5 truncate">{config.display_name}</h3>
                <p className="text-[11px] text-[#8B8BA3] font-mono truncate mb-1">{config.model_id}</p>
                {config.api_base_url && (
                  <p className="text-[10px] text-cyan-400/80 font-mono truncate mb-1" title={config.api_base_url}>
                    API: {config.api_base_url}
                  </p>
                )}
                {config.api_key_env && (
                  <p className="text-[10px] text-amber-400/80 flex items-center gap-1 mb-2">
                    <Key className="h-3 w-3" /> {config.api_key_env}
                  </p>
                )}

                {/* Config grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">温度</span>
                    <span className="text-white/80">{config.temperature}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">最大 Tokens</span>
                    <span className="text-white/80">{config.max_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">输入 $/1K</span>
                    <span className="text-white/80">${config.cost_per_1k_input}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">输出 $/1K</span>
                    <span className="text-white/80">${config.cost_per_1k_output}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">优先级</span>
                    <span className="text-white/80">{config.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">最低套餐</span>
                    <span className="text-white/80 capitalize">{config.min_tier}</span>
                  </div>
                </div>

                {config.notes && (
                  <p className="text-[10px] text-[#8B8BA3] mt-3 line-clamp-2 border-t border-white/[0.05] pt-2">
                    {config.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══ DASHBOARD TAB ═══ */}
      {tab === 'dashboard' && dashLoading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
        </div>
      )}

      {tab === 'dashboard' && !dashLoading && (
        <div className="space-y-6">
          {/* Cost calculator */}
          <Card className="border-white/[0.06] bg-white/[0.03]">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-400" />
                成本估算器（按当前模型单价）
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div>
                  <Label className="text-[11px] text-[#8B8BA3]">输入 tokens/次</Label>
                  <Input type="number" className="mt-1 h-9" value={calcIn} onChange={(e) => setCalcIn(Number(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-[11px] text-[#8B8BA3]">输出 tokens/次</Label>
                  <Input type="number" className="mt-1 h-9" value={calcOut} onChange={(e) => setCalcOut(Number(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-[11px] text-[#8B8BA3]">调用次数</Label>
                  <Input type="number" className="mt-1 h-9" value={calcCalls} onChange={(e) => setCalcCalls(Number(e.target.value) || 0)} />
                </div>
                <div className="flex items-end text-xs text-[#8B8BA3] pb-2">
                  估算 = (in×单价 + out×单价) × 次数
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[#8B8BA3]">
                      <th className="text-left py-2 px-2">模型</th>
                      <th className="text-right py-2 px-2">单次成本</th>
                      <th className="text-right py-2 px-2">合计 ({calcCalls} 次)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.filter((c) => c.is_active).map((c) => {
                      const e = estCost(c);
                      return (
                        <tr key={c.id} className="border-b border-white/[0.03]">
                          <td className="py-2 px-2 text-white">{c.display_name}</td>
                          <td className="py-2 px-2 text-right text-emerald-400 font-mono">${e.perCall.toFixed(6)}</td>
                          <td className="py-2 px-2 text-right text-emerald-300 font-mono">${e.total.toFixed(4)}</td>
                        </tr>
                      );
                    })}
                    {configs.filter((c) => c.is_active).length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-[#8B8BA3]">暂无启用模型</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: `调用次数 (${usagePeriod})`, value: totals.total_calls.toLocaleString(), icon: Activity, color: 'text-blue-400' },
                { label: '总成本', value: `$${totals.total_cost_usd.toFixed(4)}`, icon: DollarSign, color: 'text-emerald-400' },
                { label: '总 Tokens', value: (totals.total_tokens / 1000).toFixed(0) + 'K', icon: Zap, color: 'text-amber-400' },
                { label: '平均延迟', value: `${totals.avg_latency_ms}ms`, icon: Clock, color: 'text-violet-400' },
                { label: '成功率', value: `${totals.avg_success_rate}%`, icon: TrendingUp, color: 'text-cyan-400' },
              ].map((stat) => (
                <Card key={stat.label} className="border-white/[0.06] bg-white/[0.03]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                      <span className="text-[11px] text-[#8B8BA3]">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Per-model usage table */}
          <Card className="border-white/[0.06] bg-white/[0.03]">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#FF2D78]" />
                分模型用量（{usagePeriod}）
              </h3>
              {usageStats.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-8 w-8 text-[#8B8BA3] mx-auto mb-2" />
                  <p className="text-sm text-[#8B8BA3]">暂无用量日志。模型被调用后会出现在这里。</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['模型', '提供商', '调用', '成功', 'Tokens 入/出', '成本', '延迟', '任务'].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-[11px] font-medium text-[#8B8BA3] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usageStats.map((stat) => (
                        <tr key={stat.model_id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3">
                            <span className="text-white text-xs font-medium">{stat.model_id.split('/').pop()}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-[10px] ${providerColors[stat.provider] || ''}`}>{stat.provider}</Badge>
                          </td>
                          <td className="py-2.5 px-3 text-white/80 text-xs">{stat.total_calls}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-xs ${stat.success_rate >= 95 ? 'text-emerald-400' : stat.success_rate >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                              {stat.success_rate}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-white/60 text-xs font-mono">
                            {(stat.total_input_tokens / 1000).toFixed(0)}K / {(stat.total_output_tokens / 1000).toFixed(0)}K
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 text-xs">${stat.total_cost_usd.toFixed(4)}</td>
                          <td className="py-2.5 px-3 text-white/60 text-xs">{stat.avg_latency_ms}ms</td>
                          <td className="py-2.5 px-3">
                            <div className="flex gap-1">
                              {Object.entries(stat.task_types).map(([task, count]) => (
                                <Badge key={task} variant="outline" className={`text-[9px] ${taskColors[task] || ''}`}>
                                  {task} ({count})
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hourly chart (simple bar representation) */}
          {hourlyData.length > 0 && (
            <Card className="border-white/[0.06] bg-white/[0.03]">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#FF2D78]" />
                  Hourly Calls (Last 24h)
                </h3>
                <div className="flex items-end gap-1 h-32">
                  {hourlyData.map((h) => {
                    const maxCalls = Math.max(...hourlyData.map(d => d.calls), 1);
                    const height = (h.calls / maxCalls) * 100;
                    return (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-6 hidden group-hover:block bg-black/90 border border-white/10 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap z-10">
                          {h.hour.slice(11)}: {h.calls} calls, ${h.cost.toFixed(4)}
                        </div>
                        <div
                          className="w-full rounded-t bg-[#FF2D78]/60 hover:bg-[#FF2D78] transition-colors min-h-[2px]"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[8px] text-[#8B8BA3] -rotate-45 origin-top-left whitespace-nowrap">
                          {h.hour.slice(11, 16)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══ GUIDE TAB ═══ */}
      {tab === 'guide' && (
        <div className="space-y-6">
          {/* Provider Overview */}
          <Card className="border-[#E2E8F0] bg-white">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-[#1E293B] mb-4">📚 模型使用指南</h3>
              <div className="space-y-6">
                {/* Coze/Doubao */}
                <div className="border-b border-[#E2E8F0] pb-4">
                  <h4 className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 text-[10px]">COZE</span>
                    豆包 Doubao 系列（中国合规，SFW 专用）
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#475569]">
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Doubao Pro 2.0</p>
                      <p className="mt-1">🎯 <b>用途</b>：Pro/Unlimited 用户的日常聊天</p>
                      <p>💰 <b>费用</b>：输入 $0.40/M token，输出 $1.20/M token</p>
                      <p>⚠️ <b>限制</b>：有内容审核，不适合 NSFW 内容</p>
                      <p>📊 <b>单条成本</b>：约 $0.002-0.004</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Doubao Lite 2.0</p>
                      <p className="mt-1">🎯 <b>用途</b>：Free 用户的日常聊天（节约成本）</p>
                      <p>💰 <b>费用</b>：输入 $0.10/M token，输出 $0.30/M token</p>
                      <p>⚠️ <b>限制</b>：回复质量略低于 Pro，有内容审核</p>
                      <p>📊 <b>单条成本</b>：约 $0.0005-0.001</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Doubao Mini 2.0</p>
                      <p className="mt-1">🎯 <b>用途</b>：情感检测（分类用户情绪）</p>
                      <p>💰 <b>费用</b>：输入 $0.05/M token，输出 $0.15/M token</p>
                      <p>⚠️ <b>限制</b>：仅用于分类任务，温度设为 0.1</p>
                      <p>📊 <b>单次成本</b>：约 $0.0001</p>
                    </div>
                  </div>
                </div>

                {/* Together AI */}
                <div className="border-b border-[#E2E8F0] pb-4">
                  <h4 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 text-[10px]">TOGETHER</span>
                    Together AI（开源模型，轻度无审查）
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#475569]">
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Llama 3.3 70B Instruct</p>
                      <p className="mt-1">🎯 <b>用途</b>：Pro 用户的高质量 SFW 聊天</p>
                      <p>💰 <b>费用</b>：$0.20/M token（输入输出同价）</p>
                      <p>✅ <b>优势</b>：比豆包便宜，无中国审查，质量高</p>
                      <p>⚠️ <b>注意</b>：轻度 NSFW 可能通过，重度会被拦截</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Llama 3.1 8B Instruct</p>
                      <p className="mt-1">🎯 <b>用途</b>：Free 用户的快速低成本聊天</p>
                      <p>💰 <b>费用</b>：$0.10/M token</p>
                      <p>✅ <b>优势</b>：最便宜的选择，响应速度快</p>
                      <p>⚠️ <b>注意</b>：回复质量较低，适合简单对话</p>
                    </div>
                  </div>
                </div>

                {/* RunPod vLLM */}
                <div className="pb-4">
                  <h4 className="text-sm font-semibold text-purple-600 mb-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 text-[10px]">RUNPOD</span>
                    RunPod vLLM（自托管，完全无审查 NSFW）
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#475569]">
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Lumimaid 8B (NeverSleep)</p>
                      <p className="mt-1">🎯 <b>用途</b>：Pro 用户的 NSFW 聊天（亲密度 ≥ Lv.4 自动触发）</p>
                      <p>💰 <b>费用</b>：RunPod A4000 ~$0.0044/秒 × 约10秒 = ~$0.04/条</p>
                      <p>✅ <b>优势</b>：完全无审查，专为 NSFW 角色扮演微调</p>
                      <p>🔧 <b>部署</b>：RunPod Serverless，RTX A4000 GPU</p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC]">
                      <p className="font-medium text-[#1E293B]">Noromaid 12B</p>
                      <p className="mt-1">🎯 <b>用途</b>：Unlimited 用户的高质量 NSFW 聊天</p>
                      <p>💰 <b>费用</b>：RunPod A40 ~$0.007/秒 × 约15秒 = ~$0.10/条</p>
                      <p>✅ <b>优势</b>：最高质量 NSFW 回复，角色一致性好</p>
                      <p>🔧 <b>部署</b>：RunPod Serverless，需要更大显存</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Routing Logic */}
          <Card className="border-[#E2E8F0] bg-white">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-[#1E293B] mb-4">🔀 路由逻辑说明</h3>
              <div className="text-sm text-[#475569] space-y-3">
                <div className="p-3 rounded-lg bg-[#F8FAFC]">
                  <p className="font-medium text-[#1E293B]">模型选择流程：</p>
                  <ol className="list-decimal pl-5 mt-2 space-y-1">
                    <li>检测用户消息是否包含 NSFW 关键词（如 kiss, touch, bed, naked 等）</li>
                    <li>检查用户亲密度等级（≥ Lv.4 自动启用 NSFW 模型）</li>
                    <li>如果 NSFW 内容 + Pro/Unlimited 用户 → <b>RunPod vLLM</b></li>
                    <li>否则 Free 用户 → <b>Together AI 8B</b>（最便宜）</li>
                    <li>否则 Pro/Unlimited 用户 → <b>Together AI 70B</b>（高质量）</li>
                    <li>所有提供商失败时 → <b>Coze 豆包</b>（最终降级）</li>
                  </ol>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="font-medium text-amber-800">⚠️ 重要提醒：</p>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-amber-700">
                    <li>豆包（Coze）是中国公司的模型，<b>严格禁止 NSFW 内容</b>，发送色情内容会导致封号</li>
                    <li>NSFW 功能仅对 Pro 和 Unlimited 用户开放，Free 用户始终使用 SFW 模型</li>
                    <li>RunPod vLLM 需要先在 RunPod 控制台部署模型端点，并配置 RUNPOD_VLLM_URL 环境变量</li>
                    <li>Together AI 需要注册账号获取 API Key，配置 TOGETHER_API_KEY 环境变量</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Optimization Tips */}
          <Card className="border-[#E2E8F0] bg-white">
            <CardContent className="p-6">
              <h3 className="text-lg font-bold text-[#1E293B] mb-4">💡 成本优化建议</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#475569]">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="font-medium text-emerald-800">✅ 降低成本</p>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-emerald-700">
                    <li>Free 用户始终用最便宜的模型（Llama 8B 或 Doubao Lite）</li>
                    <li>控制 max_tokens 限制回复长度（Free: 512, Pro: 1024）</li>
                    <li>利用 generation_cache 缓存重复请求</li>
                    <li>RunPod 使用 Spot 实例可节省 50-70%</li>
                  </ul>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="font-medium text-blue-800">📈 提升质量</p>
                  <ul className="list-disc pl-5 mt-1 space-y-1 text-blue-700">
                    <li>Pro 用户用 Llama 70B 或 Doubao Pro 获得更好回复</li>
                    <li>Unlimited 用户用 Noromaid 12B 获得最佳 NSFW 体验</li>
                    <li>情感检测使用 Mini 模型（便宜且足够准确）</li>
                    <li>复杂推理场景使用 DeepSeek V3（思维模式）</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ ADD/EDIT DIALOG ═══ */}
      <Dialog open={editDialog} onOpenChange={(o) => { setEditDialog(o); if (!o) setTestResult(null); }}>
        <DialogContent className="sm:max-w-lg bg-[#0E0E1A] border-white/[0.08] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editModel.id ? '编辑模型' : '添加模型'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">提供商 *</Label>
                <Select value={editModel.provider || ''} onValueChange={v => setEditModel(p => ({ ...p, provider: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">任务类型 *</Label>
                <Select value={editModel.task_type || ''} onValueChange={v => setEditModel(p => ({ ...p, task_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">模型 ID *</Label>
              <Input className="mt-1 font-mono text-sm" placeholder="e.g. meta-llama/Llama-3.3-70B-Instruct-Turbo"
                value={editModel.model_id || ''} onChange={e => setEditModel(p => ({ ...p, model_id: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">显示名称 *</Label>
              <Input className="mt-1" placeholder="e.g. Llama 70B Chat"
                value={editModel.display_name || ''} onChange={e => setEditModel(p => ({ ...p, display_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">温度 Temperature</Label>
                <Input type="number" step="0.05" min="0" max="2" className="mt-1"
                  value={editModel.temperature ?? 0.85} onChange={e => setEditModel(p => ({ ...p, temperature: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">最大 Tokens</Label>
                <Input type="number" className="mt-1"
                  value={editModel.max_tokens ?? 2048} onChange={e => setEditModel(p => ({ ...p, max_tokens: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">输入成本 ($/1K tokens)</Label>
                <Input type="number" step="0.0001" className="mt-1"
                  value={editModel.cost_per_1k_input ?? 0} onChange={e => setEditModel(p => ({ ...p, cost_per_1k_input: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">输出成本 ($/1K tokens)</Label>
                <Input type="number" step="0.0001" className="mt-1"
                  value={editModel.cost_per_1k_output ?? 0} onChange={e => setEditModel(p => ({ ...p, cost_per_1k_output: parseFloat(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">优先级</Label>
                <Input type="number" className="mt-1"
                  value={editModel.priority ?? 0} onChange={e => setEditModel(p => ({ ...p, priority: parseInt(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">最低套餐</Label>
                <Select value={editModel.min_tier || 'free'} onValueChange={v => setEditModel(p => ({ ...p, min_tier: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editModel.nsfw_capable || false}
                    onChange={e => setEditModel(p => ({ ...p, nsfw_capable: e.target.checked }))}
                    className="rounded accent-[#FF2D78]" />
                  <span className="text-xs text-[#8B8BA3]">NSFW</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editModel.is_active !== false}
                    onChange={e => setEditModel(p => ({ ...p, is_active: e.target.checked }))}
                    className="rounded accent-[#FF2D78]" />
                  <span className="text-xs text-[#8B8BA3]">启用</span>
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">API Base URL</Label>
              <Input className="mt-1 font-mono text-sm" placeholder="https://api.together.xyz/v1 或 RunPod 端点"
                value={editModel.api_base_url || ''} onChange={e => setEditModel(p => ({ ...p, api_base_url: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">API Key 环境变量名</Label>
              <Input className="mt-1 font-mono text-sm" placeholder="TOGETHER_API_KEY / RUNPOD_VLLM_API_KEY"
                value={editModel.api_key_env || ''} onChange={e => setEditModel(p => ({ ...p, api_key_env: e.target.value }))} />
              <p className="mt-1 text-[10px] text-[#64748B]">密钥只存环境变量名，不写库；测试时从服务器 env 读取</p>
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">备注</Label>
              <Input className="mt-1" placeholder="用途说明、限流注意等"
                value={editModel.notes || ''} onChange={e => setEditModel(p => ({ ...p, notes: e.target.value }))} />
            </div>

            {testResult && (
              <div className={`rounded-lg border p-3 text-xs ${testResult.success ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                {testResult.success ? (
                  <>
                    <p className="font-medium">连通成功 · {testResult.latency_ms}ms · 约 ${Number(testResult.cost_usd || 0).toFixed(6)}</p>
                    {testResult.sample && <p className="mt-1 font-mono opacity-80 line-clamp-3">回复: {testResult.sample}</p>}
                  </>
                ) : (
                  <p>失败: {testResult.error}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={testing || !editModel.provider || !editModel.model_id}
              onClick={() => handleTest()}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              测试 API
            </Button>
            <Button variant="outline" onClick={() => setEditDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#FF2D78] hover:bg-[#e0266b]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editModel.id ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
