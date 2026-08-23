'use client';

/**
 * Admin — Generation Control Center (生成控制中心).
 *
 * Consolidates the four operational surfaces of the unified generation
 * gateway into one page:
 *   Tab 1 Provider 健康  — breaker state / failures / route toggles
 *   Tab 2 任务监控       — 24h success rate, latency, top errors, refunds
 *   Tab 3 预设目录       — gen_preset_catalog CRUD + preview regeneration
 *   Tab 4 内容分级       — global SFW/NSFW kill switch + level legend
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Plus, Trash2, Pencil, ImageIcon,
  ShieldCheck, ShieldOff, Activity, Layers, SlidersHorizontal,
  Package, Network, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────

type Tab = 'providers' | 'monitor' | 'presets' | 'rating' | 'assets' | 'matrix';

interface ProviderHealth {
  id: string;
  provider: string;
  label: string;
  enabled: boolean;
  circuit_open: boolean;
  failures: number;
  configured: boolean;
}

interface KindStat {
  kind: string;
  total: number;
  completed: number;
  failed: number;
  avg_latency_ms: number | null;
}

interface ProviderStat {
  provider: string;
  total: number;
  completed: number;
  failed: number;
  avg_latency_ms: number | null;
}

interface RecentJob {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  provider: string | null;
  cost_tokens: number;
  refunded: boolean;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface GenStats {
  window_hours: number;
  total: number;
  completed: number;
  failed: number;
  refunded: number;
  success_rate: number | null;
  by_kind: KindStat[];
  by_provider: ProviderStat[];
  top_errors: Array<{ error: string; count: number }>;
  recent: RecentJob[];
}

interface ModelAssetRow {
  id: string;
  asset_type: string;
  model_family: string;
  name: string;
  endpoint_scope: string;
  civitai_source: string | null;
  tags: string[];
  installed: boolean;
  verified: boolean;
  nsfw: boolean;
  notes: string;
  sort_order: number;
  is_active: boolean;
}

interface MatrixGate {
  ready: boolean;
  endpoint_configured: boolean;
  active: boolean;
}

interface MatrixPlan {
  endpointKey: string;
  modelFamily: string;
  checkpoint: string;
  loras: string[];
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  clipSkip: number;
  width: number;
  height: number;
  reason: string;
}

interface PresetRow {
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  prompt_fragment: string;
  negative_fragment: string;
  nsfw_level: number;
  tier: string;
  model_family: string | null;
  sort_order: number;
  is_active: boolean;
  gender?: string;
  style_family?: string;
  pose_reference?: string | null;
}

interface PresetDraft {
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  prompt_fragment: string;
  negative_fragment: string;
  nsfw_level: number;
  tier: string;
  model_family: string;
  sort_order: number;
  is_active: boolean;
  gender: string;
  style_family: string;
  pose_reference: string;
}

const CATEGORIES = ['scene', 'pose', 'outfit', 'style', 'mood'];
const CATEGORY_LABELS: Record<string, string> = {
  scene: '场景', pose: '姿态', outfit: '服装', style: '风格', mood: '氛围',
};
const LEVEL_LABELS = ['日常', '暧昧', '内衣', '性感', '裸露', '显性'];
const PRESET_GENDERS = [
  { value: 'all', label: '通用' },
  { value: 'female', label: '女性' },
  { value: 'male', label: '男性' },
  { value: 'trans', label: '跨性别' },
];
const PRESET_STYLE_FAMILIES = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '二次元' },
  { value: '3d', label: '3D' },
];

/** Worker volume target directory per asset type (for download snippets). */
const ASSET_TARGET_DIRS: Record<string, string> = {
  checkpoint: 'models/checkpoints',
  lora: 'models/loras',
  controlnet: 'models/controlnet',
  upscaler: 'models/upscale_models',
  embedding: 'models/embeddings',
  ipadapter: 'models/ipadapter',
  detector: 'models/ultralytics',
};

function assetDownloadSnippet(asset: ModelAssetRow): string {
  const dir = ASSET_TARGET_DIRS[asset.asset_type] || 'models';
  const target = `${dir}/${asset.name}`;
  if (!asset.civitai_source) {
    return `# 未配置 civitai_source，手动放置文件到 worker 卷：${target}`;
  }
  return `curl -L "${asset.civitai_source}" -o ${target}`;
}

const EMPTY_DRAFT: PresetDraft = {
  category: 'scene', slug: '', label_en: '', label_zh: '',
  prompt_fragment: '', negative_fragment: '', nsfw_level: 0,
  tier: 'free', model_family: '', sort_order: 0, is_active: true,
  gender: 'all', style_family: 'realistic', pose_reference: '',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    failed: 'bg-red-500/15 text-red-400 border-red-500/30',
    cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    uploading: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    queued: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  return <Badge variant="outline" className={map[status] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}>{status}</Badge>;
}

// ─── Main Page ───────────────────────────────────────────────

export default function AdminGenerationPage() {
  const [tab, setTab] = useState<Tab>('monitor');
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [stats, setStats] = useState<GenStats | null>(null);
  const [nsfwEnabled, setNsfwEnabled] = useState(true);
  const [savingRating, setSavingRating] = useState(false);
  const [assets, setAssets] = useState<ModelAssetRow[]>([]);
  const [assetsTableMissing, setAssetsTableMissing] = useState(false);
  const [matrixGate, setMatrixGate] = useState<MatrixGate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/generation');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setHealth(data.provider_health || []);
      setStats(data.stats || null);
      setNsfwEnabled(Boolean(data.rating?.nsfw_enabled));
      setAssets(data.assets || []);
      setAssetsTableMissing(Boolean(data.assets_table_missing));
      setMatrixGate(data.matrix || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleRoute = async (routeId: string, enabled: boolean) => {
    try {
      const res = await authedFetch('/api/admin/provider-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_image_route', route_id: routeId, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      toast.success(enabled ? `已启用 ${routeId}` : `已停用 ${routeId}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const refundJob = async (jobId: string) => {
    if (!confirm(`确认为任务 ${jobId.slice(0, 8)}… 执行手动退款？`)) return;
    try {
      const res = await authedFetch('/api/admin/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refund_job', job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '退款失败');
      toast.success(data.outcome?.refunded ? '退款成功' : `已跳过（${data.outcome?.skipped || '未知原因'}）`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '退款失败');
    }
  };

  const saveRating = async (enabled: boolean) => {
    setSavingRating(true);
    try {
      const res = await authedFetch('/api/admin/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_rating', nsfw_enabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setNsfwEnabled(enabled);
      toast.success(enabled ? 'NSFW 已全局开启' : 'NSFW 已全局关闭（全站降级为 SFW）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingRating(false);
    }
  };

  const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'monitor', label: '任务监控', icon: Activity },
    { key: 'providers', label: 'Provider 健康', icon: Layers },
    { key: 'presets', label: '预设目录', icon: ImageIcon },
    { key: 'assets', label: '模型资产', icon: Package },
    { key: 'matrix', label: '路由矩阵', icon: Network },
    { key: 'rating', label: '内容分级', icon: SlidersHorizontal },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">生成控制中心</h1>
          <p className="text-sm text-gray-400 mt-1">
            统一网关（gen-hub）的 Provider 状态、任务指标、预设目录、模型资产、路由矩阵与内容分级
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          刷新
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors border ${
              tab === key
                ? 'bg-pink-500/15 text-pink-300 border-pink-500/40'
                : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'monitor' && <MonitorTab stats={stats} onRefund={refundJob} />}
      {tab === 'providers' && <ProvidersTab health={health} onToggle={toggleRoute} nsfwEnabled={nsfwEnabled} />}
      {tab === 'presets' && <PresetsTab />}
      {tab === 'assets' && (
        <AssetsTab
          assets={assets}
          tableMissing={assetsTableMissing}
          onReload={load}
        />
      )}
      {tab === 'matrix' && <MatrixTab gate={matrixGate} />}
      {tab === 'rating' && (
        <RatingTab
          nsfwEnabled={nsfwEnabled}
          saving={savingRating}
          onSave={saveRating}
        />
      )}
    </div>
  );
}

// ─── Tab 2: 任务监控 ─────────────────────────────────────────

function MonitorTab(props: { stats: GenStats | null; onRefund: (jobId: string) => void }) {
  const { stats, onRefund } = props;
  if (!stats) {
    return <Card><CardContent className="py-10 text-center text-gray-500">暂无任务数据（generation_jobs 迁移上线后自动统计）</CardContent></Card>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={`近 ${stats.window_hours}h 任务`} value={String(stats.total)} />
        <StatCard
          label="成功率"
          value={stats.success_rate != null ? `${stats.success_rate}%` : '—'}
          accent={stats.success_rate != null && stats.success_rate < 90 ? 'text-red-400' : 'text-emerald-400'}
        />
        <StatCard label="失败" value={String(stats.failed)} accent="text-red-400" />
        <StatCard label="已退款" value={String(stats.refunded)} accent="text-amber-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-white mb-3">按类型（kind）</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1.5">kind</th><th>总数</th><th>完成</th><th>失败</th><th>平均延迟</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {stats.by_kind.map((row) => (
                  <tr key={row.kind} className="border-t border-white/5">
                    <td className="py-1.5 font-mono">{row.kind}</td>
                    <td>{row.total}</td>
                    <td className="text-emerald-400">{row.completed}</td>
                    <td className="text-red-400">{row.failed}</td>
                    <td>{row.avg_latency_ms != null ? `${(row.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
                {!stats.by_kind.length && <tr><td colSpan={5} className="py-4 text-center text-gray-500">无数据</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-white mb-3">按 Provider</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1.5">provider</th><th>总数</th><th>完成</th><th>失败</th><th>平均延迟</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {stats.by_provider.map((row) => (
                  <tr key={row.provider} className="border-t border-white/5">
                    <td className="py-1.5 font-mono">{row.provider}</td>
                    <td>{row.total}</td>
                    <td className="text-emerald-400">{row.completed}</td>
                    <td className="text-red-400">{row.failed}</td>
                    <td>{row.avg_latency_ms != null ? `${(row.avg_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
                {!stats.by_provider.length && <tr><td colSpan={5} className="py-4 text-center text-gray-500">无数据</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {stats.top_errors.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-white mb-3">失败 Top 原因</h3>
            <div className="space-y-1.5">
              {stats.top_errors.map((item) => (
                <div key={item.error} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 shrink-0">×{item.count}</Badge>
                  <span className="text-gray-400 break-all">{item.error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-white mb-3">最近任务（可手动退款）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1.5">任务</th><th>kind</th><th>状态</th><th>provider</th><th>积分</th><th>时间</th><th></th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {stats.recent.map((job) => (
                  <tr key={job.id} className="border-t border-white/5">
                    <td className="py-1.5 font-mono text-gray-400">{job.id.slice(0, 8)}…</td>
                    <td className="font-mono">{job.kind}</td>
                    <td>{statusBadge(job.status)}</td>
                    <td className="font-mono text-gray-400">{job.provider || '—'}</td>
                    <td>{job.cost_tokens}{job.refunded ? ' ↩' : ''}</td>
                    <td className="text-gray-500">{new Date(job.created_at).toLocaleString()}</td>
                    <td className="text-right">
                      {(job.status === 'failed' || job.status === 'cancelled') && !job.refunded && job.cost_tokens > 0 && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void onRefund(job.id)}>
                          退款
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!stats.recent.length && <tr><td colSpan={7} className="py-4 text-center text-gray-500">无数据</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard(props: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-gray-500">{props.label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${props.accent || 'text-white'}`}>{props.value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Tab 1: Provider 健康 ────────────────────────────────────

function ProvidersTab(props: {
  health: ProviderHealth[];
  onToggle: (routeId: string, enabled: boolean) => void;
  nsfwEnabled: boolean;
}) {
  const { health, onToggle } = props;
  if (!health.length) {
    return <Card><CardContent className="py-10 text-center text-gray-500">无生图路由配置</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <p className="text-xs text-gray-500 mb-3">
          断路器状态经 Upstash Redis 跨实例共享；停用路由后网关立即跳过该 Provider。
        </p>
        {health.map((route) => (
          <div key={route.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex-wrap">
            <div className="min-w-[180px]">
              <p className="text-sm text-white font-medium">{route.label}</p>
              <p className="text-[11px] font-mono text-gray-500">{route.id} · {route.provider}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {route.circuit_open
                ? <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">熔断中</Badge>
                : <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">正常</Badge>}
              <Badge variant="outline" className="bg-gray-500/15 text-gray-400 border-gray-500/30">失败 {route.failures}</Badge>
              {!route.configured && (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">未配置密钥</Badge>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">{route.enabled ? '已启用' : '已停用'}</span>
              <Switch checked={route.enabled} onCheckedChange={(v) => void onToggle(route.id, v)} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Tab 3: 预设目录 ─────────────────────────────────────────

function PresetsTab() {
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [seeded, setSeeded] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/gen-presets');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setPresets(data.presets || []);
      setSeeded(Boolean(data.seeded));
      setTableMissing(Boolean(data.table_missing));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (filter === 'all' ? presets : presets.filter((p) => p.category === filter)),
    [presets, filter],
  );

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await authedFetch('/api/admin/gen-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '播种失败');
      toast.success(`已写入 ${data.upserted} 条预设`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '播种失败');
    } finally {
      setSeeding(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.slug.trim()) { toast.error('slug 不能为空'); return; }
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/gen-presets', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success('已保存');
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (preset: PresetRow) => {
    try {
      const res = await authedFetch('/api/admin/gen-presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: preset.category, slug: preset.slug, is_active: !preset.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const removePreset = async (preset: PresetRow) => {
    if (!confirm(`确认删除预设 ${preset.category}/${preset.slug}？`)) return;
    try {
      const res = await authedFetch(
        `/api/admin/gen-presets?category=${encodeURIComponent(preset.category)}&slug=${encodeURIComponent(preset.slug)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  /** Regenerate the preview thumbnail; polls when the provider queues. */
  const regeneratePreview = async (preset: PresetRow) => {
    const key = `${preset.category}/${preset.slug}`;
    setPreviewing(key);
    try {
      let jobId: string | null = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        const res = await authedFetch('/api/admin/gen-presets/regenerate-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: preset.category,
            slug: preset.slug,
            force: true,
            ...(jobId ? { job_id: jobId } : {}),
          }),
        });
        const data = await res.json();
        if (res.status === 202 && data.job_id) {
          jobId = String(data.job_id);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        if (!res.ok) throw new Error(data.error || '预览生成失败');
        toast.success('预览图已更新');
        await load();
        return;
      }
      toast.error('预览生成超时，请稍后重试');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '预览生成失败');
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1 text-xs border ${filter === 'all' ? 'bg-pink-500/15 text-pink-300 border-pink-500/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>
          全部 ({presets.length})
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs border ${filter === c ? 'bg-pink-500/15 text-pink-300 border-pink-500/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>
            {CATEGORY_LABELS[c]} ({presets.filter((p) => p.category === c).length})
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {!seeded && !tableMissing && (
            <Button size="sm" variant="outline" onClick={() => void seed()} disabled={seeding}>
              {seeding ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              一键播种旧预设
            </Button>
          )}
          <Button size="sm" onClick={() => { setIsNew(true); setDraft({ ...EMPTY_DRAFT }); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />新增预设
          </Button>
        </div>
      </div>

      {tableMissing && (
        <p className="text-xs text-amber-400">
          gen_preset_catalog 表尚未创建（迁移 0040 未执行），当前展示的是内置 legacy 映射，保存/删除需先执行迁移。
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-pink-400" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((preset) => {
            const key = `${preset.category}/${preset.slug}`;
            return (
              <Card key={key} className={preset.is_active ? '' : 'opacity-50'}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {preset.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dynamic external storage URL
                      <img src={preset.preview_url} alt="" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-gray-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{preset.label_zh || preset.label_en || preset.slug}</p>
                      <p className="text-[11px] font-mono text-gray-500 truncate">{preset.category}/{preset.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="bg-gray-500/15 text-gray-400 border-gray-500/30">{CATEGORY_LABELS[preset.category] || preset.category}</Badge>
                    <Badge variant="outline" className={preset.nsfw_level >= 3 ? 'bg-pink-500/15 text-pink-400 border-pink-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'}>
                      Lv{preset.nsfw_level} {LEVEL_LABELS[preset.nsfw_level] || ''}
                    </Badge>
                    {preset.tier === 'premium' && (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">VIP</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 line-clamp-2">{preset.prompt_fragment}</p>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void regeneratePreview(preset)} disabled={previewing === key}>
                      {previewing === key ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                      预览图
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => {
                      setIsNew(false);
                      setDraft({
                        category: preset.category, slug: preset.slug,
                        label_en: preset.label_en, label_zh: preset.label_zh,
                        prompt_fragment: preset.prompt_fragment,
                        negative_fragment: preset.negative_fragment,
                        nsfw_level: preset.nsfw_level, tier: preset.tier,
                        model_family: preset.model_family || '',
                        sort_order: preset.sort_order, is_active: preset.is_active,
                        gender: preset.gender || 'all',
                        style_family: preset.style_family || 'realistic',
                        pose_reference: preset.pose_reference || '',
                      });
                    }}>
                      <Pencil className="h-3 w-3 mr-1" />编辑
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void toggleActive(preset)}>
                      {preset.is_active ? '下线' : '上线'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400 ml-auto" onClick={() => void removePreset(preset)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!filtered.length && <p className="text-sm text-gray-500 col-span-full text-center py-10">暂无预设</p>}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? '新增预设' : '编辑预设'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>分类</Label>
                  <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })} disabled={!isNew}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>slug</Label>
                  <Input className="mt-1" value={draft.slug} disabled={!isNew}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="kebab-case-id" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>中文标签</Label>
                  <Input className="mt-1" value={draft.label_zh} onChange={(e) => setDraft({ ...draft, label_zh: e.target.value })} />
                </div>
                <div>
                  <Label>英文标签</Label>
                  <Input className="mt-1" value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>提示词片段（prompt_fragment）</Label>
                <Textarea className="mt-1" rows={3} value={draft.prompt_fragment}
                  onChange={(e) => setDraft({ ...draft, prompt_fragment: e.target.value })} />
              </div>
              <div>
                <Label>负向片段（可选）</Label>
                <Textarea className="mt-1" rows={2} value={draft.negative_fragment}
                  onChange={(e) => setDraft({ ...draft, negative_fragment: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>适用题材（gender）</Label>
                  <Select value={draft.gender} onValueChange={(v) => setDraft({ ...draft, gender: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESET_GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>风格家族（style_family）</Label>
                  <Select value={draft.style_family} onValueChange={(v) => setDraft({ ...draft, style_family: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESET_STYLE_FAMILIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>姿势参考描述（pose_reference，可选）</Label>
                <Input className="mt-1" value={draft.pose_reference}
                  onChange={(e) => setDraft({ ...draft, pose_reference: e.target.value })}
                  placeholder="e.g. sitting cross-legged, looking over shoulder" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>NSFW 等级</Label>
                  <Select value={String(draft.nsfw_level)} onValueChange={(v) => setDraft({ ...draft, nsfw_level: Number(v) })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map((lv) => (
                        <SelectItem key={lv} value={String(lv)}>Lv{lv} {LEVEL_LABELS[lv]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>档位</Label>
                  <Select value={draft.tier} onValueChange={(v) => setDraft({ ...draft, tier: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">免费</SelectItem>
                      <SelectItem value="premium">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>排序</Label>
                  <Input type="number" className="mt-1" value={draft.sort_order}
                    onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value || 0) })} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  <span className="text-xs text-gray-400">{draft.is_active ? '已上线' : '已下线'}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDraft(null)}>取消</Button>
                  <Button onClick={() => void saveDraft()} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}保存
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 4: 模型资产 ─────────────────────────────────────

const ASSET_TYPE_LABELS: Record<string, string> = {
  checkpoint: '底模', lora: 'LoRA', controlnet: 'ControlNet',
  upscaler: '放大器', embedding: 'Embedding', ipadapter: 'IP-Adapter', detector: '检测器',
};

function AssetsTab(props: {
  assets: ModelAssetRow[];
  tableMissing: boolean;
  onReload: () => Promise<void>;
}) {
  const { assets, tableMissing, onReload } = props;
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await authedFetch('/api/admin/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_assets' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '播种失败');
      toast.success(`已写入 ${data.upserted} 条资产清单`);
      await onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '播种失败');
    } finally {
      setSeeding(false);
    }
  };

  const copySnippet = async (asset: ModelAssetRow) => {
    try {
      await navigator.clipboard.writeText(assetDownloadSnippet(asset));
      toast.success('下载命令已复制');
    } catch {
      toast.error('复制失败，请手动选取命令');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-gray-500 flex-1 min-w-[240px]">
          gen_model_assets 清单（迁移 0041）：提交前门控检查 checkpoint 是否在目标端点就绪；
          worker 卷实际携带文件后将 installed 置位，验收通过后置 verified。
        </p>
        <Button size="sm" variant="outline" onClick={() => void seed()} disabled={seeding}>
          {seeding ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          一键播种标准清单
        </Button>
      </div>

      {tableMissing && (
        <p className="text-xs text-amber-400">
          gen_model_assets 表尚未创建（迁移 0041 未执行），当前路由门控降级为 env 清单模式。
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="py-1.5">类型</th><th>家族</th><th>名称</th>
                  <th>端点</th><th>状态</th><th>标签</th><th></th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                {assets.map((asset) => (
                  <tr key={asset.id} className={`border-t border-white/5 ${asset.is_active ? '' : 'opacity-50'}`}>
                    <td className="py-2">{ASSET_TYPE_LABELS[asset.asset_type] || asset.asset_type}</td>
                    <td className="font-mono">{asset.model_family}</td>
                    <td>
                      <p className="font-mono text-white break-all">{asset.name}</p>
                      {asset.notes && <p className="text-[10px] text-gray-500">{asset.notes}</p>}
                    </td>
                    <td className="font-mono text-gray-400">{asset.endpoint_scope}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {asset.installed
                          ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">installed</Badge>
                          : <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">未安装</Badge>}
                        {asset.verified
                          ? <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">verified</Badge>
                          : <Badge variant="outline" className="bg-gray-500/15 text-gray-400 border-gray-500/30">未验收</Badge>}
                      </div>
                    </td>
                    <td className="text-gray-500">{asset.tags.join(', ') || '—'}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => void copySnippet(asset)}>
                        <Copy className="h-3 w-3 mr-1" />下载命令
                      </Button>
                    </td>
                  </tr>
                ))}
                {!assets.length && (
                  <tr><td colSpan={7} className="py-6 text-center text-gray-500">
                    {tableMissing ? '表未创建，先执行迁移 0041 再播种' : '清单为空，点击“一键播种标准清单”'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: 路由矩阵预览 ──────────────────────────────────

function MatrixTab(props: { gate: MatrixGate | null }) {
  const { gate } = props;
  const [category, setCategory] = useState('female');
  const [renderStyle, setRenderStyle] = useState('realistic');
  const [nsfwLevel, setNsfwLevel] = useState(1);
  const [tier, setTier] = useState('standard');
  const [plan, setPlan] = useState<MatrixPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const preview = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'matrix_preview',
          category, render_style: renderStyle, nsfw_level: nsfwLevel, tier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '预览失败');
      setPlan(data.plan || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '预览失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {gate && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-500">矩阵总闸：</span>
          {gate.active
            ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">SDXL 矩阵生效</Badge>
            : <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">fail-open 回 FLUX</Badge>}
          {!gate.ready && <span className="text-amber-400">RUNPOD_SDXL_MODELS_READY 未开</span>}
          {!gate.endpoint_configured && <span className="text-amber-400">RUNPOD_ENDPOINT_ID_SDXL 未配置</span>}
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label>题材</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">写实女</SelectItem>
                  <SelectItem value="male">写实男</SelectItem>
                  <SelectItem value="transgender">跨性别</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>风格</Label>
              <Select value={renderStyle} onValueChange={setRenderStyle}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">写实</SelectItem>
                  <SelectItem value="2d">二次元</SelectItem>
                  <SelectItem value="3d">3D</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>NSFW 强度</Label>
              <Select value={String(nsfwLevel)} onValueChange={(v) => setNsfwLevel(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <SelectItem key={lv} value={String(lv)}>Lv{lv} {LEVEL_LABELS[lv] || ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>档位</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">标准</SelectItem>
                  <SelectItem value="premium">精品（FLUX，仅 SFW）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => void preview()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Network className="h-4 w-4 mr-1" />}
            解析路由
          </Button>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-white mb-3">命中结果</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-gray-500">端点</p>
                <p className="font-mono text-pink-300 mt-0.5">{plan.endpointKey}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-gray-500">模型家族</p>
                <p className="font-mono text-white mt-0.5">{plan.modelFamily}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-gray-500">Checkpoint</p>
                <p className="font-mono text-white mt-0.5 break-all">{plan.checkpoint}</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 sm:col-span-2 lg:col-span-3">
                <p className="text-gray-500">推荐 LoRA（下游按卷清单复核）</p>
                {plan.loras.length ? (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {plan.loras.map((lora) => (
                      <Badge key={lora} variant="outline" className="font-mono bg-violet-500/15 text-violet-300 border-violet-500/30">{lora}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 mt-0.5">无</p>
                )}
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-gray-500">采样</p>
                <p className="font-mono text-gray-300 mt-0.5">
                  {plan.steps} steps · cfg {plan.cfg} · {plan.sampler}/{plan.scheduler} · clipSkip {plan.clipSkip}
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-gray-500">尺寸</p>
                <p className="font-mono text-gray-300 mt-0.5">{plan.width}×{plan.height}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3">{plan.reason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 6: 内容分级 ─────────────────────────────────────────

function RatingTab(props: {
  nsfwEnabled: boolean;
  saving: boolean;
  onSave: (enabled: boolean) => void;
}) {
  const { nsfwEnabled, saving, onSave } = props;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            {nsfwEnabled
              ? <ShieldCheck className="h-8 w-8 text-pink-400" />
              : <ShieldOff className="h-8 w-8 text-emerald-400" />}
            <div className="flex-1 min-w-[220px]">
              <h3 className="text-sm font-semibold text-white">全站 NSFW 开关</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                关闭后：生图通道强制 SFW（内衣级封顶）、预设目录重新上锁、gen/start 预设片段按 SFW 封顶。亲密解锁逻辑不受影响。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{nsfwEnabled ? '已开启' : '已关闭'}</span>
              <Switch checked={nsfwEnabled} disabled={saving} onCheckedChange={(v) => void onSave(v)} />
              {saving && <Loader2 className="h-4 w-4 animate-spin text-pink-400" />}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-white mb-3">分级图例（content-rating level 0-5）</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="py-1.5">级别</th><th>语义</th><th>可达通道</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {[
                ['0 日常', '完全着装、生活化场景', 'SFW'],
                ['1 暧昧', '调情氛围、无暴露', 'SFW'],
                ['2 内衣', '内衣/睡衣、局部遮挡', 'SFW（封顶）'],
                ['3 性感', '全身裸露、无性行为', 'NSFW（亲密 Lv3+）'],
                ['4 裸露', '显性单人、高潮前', 'NSFW（亲密 Lv4+）'],
                ['5 显性', '显性单人、至顶点', 'NSFW（亲密 Lv5+）'],
              ].map(([lv, desc, channel]) => (
                <tr key={lv} className="border-t border-white/5">
                  <td className="py-1.5 font-mono">{lv}</td>
                  <td>{desc}</td>
                  <td className={channel.startsWith('NSFW') ? 'text-pink-400' : 'text-emerald-400'}>{channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500 mt-3">
            通道判定唯一入口：<span className="font-mono">src/lib/content-rating.ts</span>（亲密度 ≥300 分 / Lv3 解锁 NSFW 通道）；
            NSFW 模型通道在「Provider 健康 / provider-routes 面板」中按路由的 nsfw_capable 配置。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
