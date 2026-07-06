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
  Settings, RefreshCw,
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
  const [tab, setTab] = useState<'models' | 'dashboard'>('models');
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Dashboard state
  const [usageStats, setUsageStats] = useState<ModelUsageStat[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Dialog state
  const [editDialog, setEditDialog] = useState(false);
  const [editModel, setEditModel] = useState<Partial<ModelConfig>>({});
  const [saving, setSaving] = useState(false);

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
      const res = await authedFetch('/api/admin/models?view=usage');
      const data = await res.json();
      setUsageStats(data.stats || []);
      setHourlyData(data.hourly || []);
      setTotals(data.totals || null);
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to load usage data');
    } finally {
      setDashLoading(false);
    }
  }, []);

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
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await authedFetch(`/api/admin/models?id=${id}`, { method: 'DELETE' });
      setConfigs(prev => prev.filter(c => c.id !== id));
      toast.success('Model deleted');
    } catch { toast.error('Delete failed'); }
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
            <Cpu className="h-6 w-6 text-[#FF2D78]" />
            AI Model Management
          </h1>
          <p className="text-sm text-[#8B8BA3] mt-1">Configure providers, monitor usage, manage costs</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            <button
              onClick={() => setTab('models')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all ${
                tab === 'models' ? 'bg-[#FF2D78] text-white shadow-sm' : 'text-[#8B8BA3] hover:text-white'
              }`}
            >
              <Settings className="h-3.5 w-3.5 inline mr-1.5" />Models
            </button>
            <button
              onClick={() => setTab('dashboard')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition-all ${
                tab === 'dashboard' ? 'bg-[#FF2D78] text-white shadow-sm' : 'text-[#8B8BA3] hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 inline mr-1.5" />Dashboard
            </button>
          </div>
          {tab === 'models' && (
            <Button onClick={openAdd} size="sm" className="gap-1.5 bg-[#FF2D78] hover:bg-[#e0266b]">
              <Plus className="h-4 w-4" /> Add Model
            </Button>
          )}
          {tab === 'dashboard' && (
            <Button variant="outline" size="sm" onClick={fetchDashboard} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </div>
      </div>

      {/* ═══ MODELS TAB ═══ */}
      {tab === 'models' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                      onClick={() => toggleActive(config)}
                      className={`p-1.5 rounded-md transition-colors ${
                        config.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-500 hover:bg-gray-500/10'
                      }`}
                      title={config.is_active ? 'Disable' : 'Enable'}
                    >
                      {config.is_active ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => openEdit(config)} className="p-1.5 rounded-md text-[#8B8BA3] hover:text-white hover:bg-white/[0.06] transition-colors">
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(config.id, config.display_name)} className="p-1.5 rounded-md text-[#8B8BA3] hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Name + model ID */}
                <h3 className="text-sm font-semibold text-white mb-0.5 truncate">{config.display_name}</h3>
                <p className="text-[11px] text-[#8B8BA3] font-mono truncate mb-3">{config.model_id}</p>

                {/* Config grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Temp</span>
                    <span className="text-white/80">{config.temperature}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Max Tokens</span>
                    <span className="text-white/80">{config.max_tokens}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Input $/1K</span>
                    <span className="text-white/80">${config.cost_per_1k_input}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Output $/1K</span>
                    <span className="text-white/80">${config.cost_per_1k_output}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Priority</span>
                    <span className="text-white/80">{config.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B8BA3]">Min Tier</span>
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
          {/* Totals */}
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Total Calls (24h)', value: totals.total_calls.toLocaleString(), icon: Activity, color: 'text-blue-400' },
                { label: 'Total Cost', value: `$${totals.total_cost_usd.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-400' },
                { label: 'Total Tokens', value: (totals.total_tokens / 1000).toFixed(0) + 'K', icon: Zap, color: 'text-amber-400' },
                { label: 'Avg Latency', value: `${totals.avg_latency_ms}ms`, icon: Clock, color: 'text-violet-400' },
                { label: 'Success Rate', value: `${totals.avg_success_rate}%`, icon: TrendingUp, color: 'text-cyan-400' },
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
                Per-Model Usage (Last 24h)
              </h3>
              {usageStats.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-8 w-8 text-[#8B8BA3] mx-auto mb-2" />
                  <p className="text-sm text-[#8B8BA3]">No usage data yet. Logs will appear once models are called.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['Model', 'Provider', 'Calls', 'Success', 'Tokens (In/Out)', 'Cost', 'Latency', 'Tasks'].map(h => (
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

      {/* ═══ ADD/EDIT DIALOG ═══ */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-lg bg-[#0E0E1A] border-white/[0.08] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editModel.id ? 'Edit Model' : 'Add Model'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">Provider *</Label>
                <Select value={editModel.provider || ''} onValueChange={v => setEditModel(p => ({ ...p, provider: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">Task Type *</Label>
                <Select value={editModel.task_type || ''} onValueChange={v => setEditModel(p => ({ ...p, task_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">Model ID *</Label>
              <Input className="mt-1 font-mono text-sm" placeholder="e.g. doubao-seed-2-0-pro-260215"
                value={editModel.model_id || ''} onChange={e => setEditModel(p => ({ ...p, model_id: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">Display Name *</Label>
              <Input className="mt-1" placeholder="e.g. Doubao Pro 2.0"
                value={editModel.display_name || ''} onChange={e => setEditModel(p => ({ ...p, display_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">Temperature</Label>
                <Input type="number" step="0.05" min="0" max="2" className="mt-1"
                  value={editModel.temperature ?? 0.85} onChange={e => setEditModel(p => ({ ...p, temperature: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">Max Tokens</Label>
                <Input type="number" className="mt-1"
                  value={editModel.max_tokens ?? 2048} onChange={e => setEditModel(p => ({ ...p, max_tokens: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">Cost Input ($/1K tokens)</Label>
                <Input type="number" step="0.0001" className="mt-1"
                  value={editModel.cost_per_1k_input ?? 0} onChange={e => setEditModel(p => ({ ...p, cost_per_1k_input: parseFloat(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">Cost Output ($/1K tokens)</Label>
                <Input type="number" step="0.0001" className="mt-1"
                  value={editModel.cost_per_1k_output ?? 0} onChange={e => setEditModel(p => ({ ...p, cost_per_1k_output: parseFloat(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-[#8B8BA3]">Priority</Label>
                <Input type="number" className="mt-1"
                  value={editModel.priority ?? 0} onChange={e => setEditModel(p => ({ ...p, priority: parseInt(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs text-[#8B8BA3]">Min Tier</Label>
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
                  <span className="text-xs text-[#8B8BA3]">Active</span>
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">API Base URL (optional)</Label>
              <Input className="mt-1 font-mono text-sm" placeholder="Override default API base URL"
                value={editModel.api_base_url || ''} onChange={e => setEditModel(p => ({ ...p, api_base_url: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-[#8B8BA3]">Notes</Label>
              <Input className="mt-1" placeholder="Description or notes"
                value={editModel.notes || ''} onChange={e => setEditModel(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-[#FF2D78] hover:bg-[#e0266b]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editModel.id ? 'Update' : 'Add Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
