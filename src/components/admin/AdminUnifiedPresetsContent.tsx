'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Loader2, RefreshCw, Plus, Trash2, ImageIcon,
  FileText, Move, MapPin, ChevronDown, ChevronRight,
  Copy, Edit, Check,
} from 'lucide-react';

// --- Types ---

interface GenPreset {
  id: string;
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  prompt_fragment: string;
  negative_fragment: string;
  lora_hints: unknown[];
  nsfw_level: number;
  tier: string;
  model_family: string | null;
  sort_order: number;
  is_active: boolean;
  gender?: string;
  style_family?: string;
  pose_reference?: string | null;
  workflow_flags?: Record<string, unknown>;
  preset_group?: string;
  extra_params?: Record<string, unknown>;
}

type UnifiedCategory = 'prompt' | 'pose' | 'scene';

const CATEGORY_META: Record<UnifiedCategory, { label: string; icon: typeof FileText; hint: string; color: string }> = {
  prompt: { label: '提示词预设', icon: FileText, hint: 'FLUX / SDXL 提示词模板 · 生成参数', color: 'violet' },
  pose:   { label: '姿势 / 动作', icon: Move, hint: 'ControlNet 姿势参考 · 动作模板', color: 'cyan' },
  scene:  { label: '场景库', icon: MapPin, hint: '场景环境 · 服装 · 画风 · 氛围', color: 'emerald' },
};

const NSFW_BADGE: Record<number, string> = {
  0: 'SFW',
  1: 'LV1',
  2: 'LV2',
  3: 'LV3',
  4: 'LV4',
  5: 'LV5',
};

// --- Main Component ---

export default function AdminUnifiedPresetsContent({ embedded = false }: { embedded?: boolean }) {
  const [allPresets, setAllPresets] = useState<Record<UnifiedCategory, GenPreset[]>>({
    prompt: [], pose: [], scene: [],
  });
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [dialog, setDialog] = useState<{ category: UnifiedCategory; preset?: GenPreset } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/gen-presets?unified=1');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setAllPresets(json.unified || { prompt: [], pose: [], scene: [] });
      setSeeded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seedLegacy = async () => {
    try {
      const res = await authedFetch('/api/admin/gen-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Seed failed');
      toast.success(`已导入 ${json.upserted} 条预设`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed failed');
    }
  };

  const toggleActive = async (preset: GenPreset, active: boolean) => {
    try {
      const res = await authedFetch('/api/admin/gen-presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: preset.category,
          slug: preset.slug,
          is_active: active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      toast.success(active ? '已启用' : '已禁用');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const deletePreset = async (preset: GenPreset) => {
    if (!confirm(`确认删除 "${preset.label_en || preset.slug}"?`)) return;
    try {
      const res = await authedFetch(
        `/api/admin/gen-presets?category=${preset.category}&slug=${preset.slug}`,
        { method: 'DELETE' },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('已删除');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${embedded ? 'mt-0' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-400" />
          <h1 className="text-lg font-bold text-white">预设库</h1>
          <span className="text-xs text-gray-500 hidden sm:inline">
            提示词 · 姿势动作 · 场景
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!seeded && (
            <Button size="sm" variant="outline" onClick={seedLegacy}>
              导入遗留预设
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>
      </div>

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList className="bg-[#16161f] border border-gray-800">
          {(Object.keys(CATEGORY_META) as UnifiedCategory[]).map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = allPresets[cat]?.length || 0;
            return (
              <TabsTrigger key={cat} value={cat} className="gap-1">
                <meta.icon className="w-3.5 h-3.5" />
                {meta.label}
                <Badge variant="secondary" className="ml-1 h-4 min-w-[20px] px-1 text-[10px]">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(CATEGORY_META) as UnifiedCategory[]).map((cat) => (
          <TabsContent key={cat} value={cat} className="space-y-3">
            <CategoryPanel
              category={cat}
              presets={allPresets[cat] || []}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              onAdd={() => setDialog({ category: cat })}
              onEdit={(p) => setDialog({ category: cat, preset: p })}
              onToggle={toggleActive}
              onDelete={deletePreset}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog */}
      {dialog && (
        <PresetDialog
          category={dialog.category}
          preset={dialog.preset}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); load(); }}
        />
      )}
    </div>
  );
}

// --- Category Panel ---

function CategoryPanel({
  category,
  presets,
  expandedGroups,
  toggleGroup,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: UnifiedCategory;
  presets: GenPreset[];
  expandedGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  onAdd: () => void;
  onEdit: (p: GenPreset) => void;
  onToggle: (p: GenPreset, active: boolean) => void;
  onDelete: (p: GenPreset) => void;
}) {
  const meta = CATEGORY_META[category];
  const [nsfwFilter, setNsfwFilter] = useState<number | null>(null);

  // Filter presets by NSFW level
  const filteredPresets = useMemo(() => {
    if (nsfwFilter === null) return presets;
    return presets.filter((p) => p.nsfw_level === nsfwFilter);
  }, [presets, nsfwFilter]);

  // Group presets by preset_group (or 'ungrouped')
  const groups = useMemo(() => {
    const map = new Map<string, GenPreset[]>();
    for (const p of filteredPresets) {
      const group = p.preset_group || '未分组';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(p);
    }
    return map;
  }, [filteredPresets]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {filteredPresets.length}/{presets.length} 条预设 · {meta.hint}
        </p>
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" /> 添加
        </Button>
      </div>

      {/* NSFW level filter */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-gray-500 mr-1">NSFW:</span>
        {[
          { value: null, label: '全部', count: presets.length },
          { value: 0, label: 'SFW', count: presets.filter((p) => p.nsfw_level === 0).length },
          { value: 1, label: 'LV1', count: presets.filter((p) => p.nsfw_level === 1).length },
          { value: 2, label: 'LV2', count: presets.filter((p) => p.nsfw_level === 2).length },
          { value: 3, label: 'LV3', count: presets.filter((p) => p.nsfw_level === 3).length },
          { value: 4, label: 'LV4', count: presets.filter((p) => p.nsfw_level === 4).length },
          { value: 5, label: 'LV5', count: presets.filter((p) => p.nsfw_level === 5).length },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setNsfwFilter(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border',
              nsfwFilter === opt.value
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                : 'bg-gray-800/40 text-gray-500 border-gray-700/40 hover:text-gray-300 hover:border-gray-600',
            )}
          >
            {opt.label}
            <span className="opacity-60">{opt.count}</span>
          </button>
        ))}
      </div>

      {filteredPresets.length === 0 && (
        <Card className="bg-[#16161f] border-gray-800">
          <CardContent className="p-8 text-center text-gray-400 text-sm">
            {presets.length === 0 ? '暂无预设。点击"添加"创建第一条。' : '当前筛选无结果。'}
          </CardContent>
        </Card>
      )}

      {/* Render grouped presets */}
      {groups.size <= 1 ? (
        // Single group: flat list
        <div className="space-y-2">
          {filteredPresets.map((p) => (
            <PresetCard key={p.id} preset={p} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        // Multiple groups: collapsible sections
        <div className="space-y-2">
          {Array.from(groups.entries()).map(([group, items]) => {
            const groupKey = `${category}-${group}`;
            const expanded = expandedGroups[groupKey] !== false; // default expanded
            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className="flex items-center gap-1.5 py-1 text-xs font-semibold text-gray-400 hover:text-white transition"
                >
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  {group}
                  <Badge variant="secondary" className="h-4 min-w-[18px] px-1 text-[10px]">
                    {items.length}
                  </Badge>
                </button>
                {expanded && (
                  <div className="space-y-2 ml-1">
                    {items.map((p) => (
                      <PresetCard key={p.id} preset={p} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Copy Button Helper ---

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className={cn(
        'shrink-0 rounded p-0.5 transition-colors',
        copied ? 'text-green-400' : 'text-gray-600 hover:text-gray-400',
        className,
      )}
      title="复制"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// --- Preset Card ---

function PresetCard({
  preset,
  onEdit,
  onToggle,
  onDelete,
}: {
  preset: GenPreset;
  onEdit: (p: GenPreset) => void;
  onToggle: (p: GenPreset, active: boolean) => void;
  onDelete: (p: GenPreset) => void;
}) {
  const ep = preset.extra_params as Record<string, unknown> | undefined;
  const loraArr = Array.isArray(preset.lora_hints) ? preset.lora_hints.filter(Boolean) : [];
  const hasLora = loraArr.length > 0;
  const hasParams = ep && Object.keys(ep).length > 0;

  return (
    <Card className={`bg-[#16161f] border-gray-800 ${!preset.is_active ? 'opacity-50' : ''}`}>
      <CardContent className="p-3">
        {/* Row 1: Header — thumbnail, name, badges, actions */}
        <div className="flex items-start gap-3">
          {/* Preview thumbnail */}
          <div className="w-12 h-12 rounded-md bg-gray-900 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {preset.preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preset.preview_url} alt={preset.label_en} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-5 h-5 text-gray-700" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-white truncate">
                {preset.label_zh || preset.label_en || preset.slug}
              </span>
              {preset.label_zh && preset.label_en && (
                <span className="text-[10px] text-gray-500 truncate hidden sm:inline">
                  {preset.label_en}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <Badge variant="outline" className={`text-[10px] px-1 py-0 ${
                preset.tier === 'premium'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
              }`}>
                {preset.tier}
              </Badge>
              {preset.nsfw_level > 0 && (
                <Badge variant="outline" className={`text-[10px] px-1 py-0 ${
                  preset.nsfw_level >= 4
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                }`}>
                  {NSFW_BADGE[preset.nsfw_level] || `LV${preset.nsfw_level}`}
                </Badge>
              )}
              {preset.model_family && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] px-1 py-0">
                  {preset.model_family}
                </Badge>
              )}
              {preset.style_family && preset.style_family !== 'realistic' && (
                <Badge variant="outline" className="bg-pink-500/10 text-pink-400 border-pink-500/30 text-[10px] px-1 py-0">
                  {preset.style_family}
                </Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-400 hover:text-violet-300"
              onClick={() => onEdit(preset)} title="编辑">
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
              onClick={() => onDelete(preset)} title="删除">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Switch checked={preset.is_active} onCheckedChange={(v) => onToggle(preset, v)} />
          </div>
        </div>

        {/* Row 2: Positive prompt */}
        {preset.prompt_fragment && (
          <div className="mt-2 rounded-md bg-[#0d0d15] px-2.5 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-emerald-500/70 uppercase tracking-wider shrink-0">正向</span>
              <p className="text-[11px] text-gray-400 font-mono line-clamp-2 flex-1">
                {preset.prompt_fragment}
              </p>
              <CopyButton text={preset.prompt_fragment} />
            </div>
          </div>
        )}

        {/* Row 3: Negative prompt */}
        {preset.negative_fragment && (
          <div className="mt-1 rounded-md bg-[#0d0d15] px-2.5 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-red-500/70 uppercase tracking-wider shrink-0">反向</span>
              <p className="text-[11px] text-gray-400 font-mono line-clamp-1 flex-1">
                {preset.negative_fragment}
              </p>
              <CopyButton text={preset.negative_fragment} />
            </div>
          </div>
        )}

        {/* Row 4: Model / Params / LoRA */}
        {(hasParams || hasLora) && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {hasParams && (
              <span className="text-[10px] text-gray-500 font-mono">
                {ep?.steps ? `${String(ep.steps)}步` : ''}
                {ep?.cfg ? ` · CFG ${String(ep.cfg)}` : ''}
                {ep?.sampler ? ` · ${String(ep.sampler)}` : ''}
                {ep?.width && ep?.height ? ` · ${String(ep.width)}×${String(ep.height)}` : ''}
              </span>
            )}
            {hasLora && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px] px-1 py-0">
                LoRA ×{loraArr.length}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Preset Dialog ---

function PresetDialog({
  category,
  preset,
  onClose,
  onSaved,
}: {
  category: UnifiedCategory;
  preset?: GenPreset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!preset;
  const [form, setForm] = useState({
    slug: preset?.slug || '',
    label_en: preset?.label_en || '',
    label_zh: preset?.label_zh || '',
    prompt_fragment: preset?.prompt_fragment || '',
    negative_fragment: preset?.negative_fragment || '',
    preview_url: preset?.preview_url || '',
    nsfw_level: preset?.nsfw_level ?? 0,
    tier: preset?.tier || 'free',
    model_family: preset?.model_family || '',
    preset_group: preset?.preset_group || '',
    gender: preset?.gender || 'all',
    style_family: preset?.style_family || 'realistic',
    sort_order: preset?.sort_order ?? 0,
    // Extra params fields
    steps: Number(preset?.extra_params?.steps || 28),
    cfg: Number(preset?.extra_params?.cfg || 3.5),
    sampler: String(preset?.extra_params?.sampler || 'euler'),
    scheduler: String(preset?.extra_params?.scheduler || 'simple'),
    width: Number(preset?.extra_params?.width || 704),
    height: Number(preset?.extra_params?.height || 960),
    pose_reference: preset?.pose_reference || '',
  });
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.slug) { toast.error('Slug is required'); return; }
    if (category !== 'pose' && !form.prompt_fragment) { toast.error('Prompt fragment is required'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        category,
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
        label_en: form.label_en,
        label_zh: form.label_zh,
        prompt_fragment: form.prompt_fragment,
        negative_fragment: form.negative_fragment,
        preview_url: form.preview_url || null,
        nsfw_level: form.nsfw_level,
        tier: form.tier,
        model_family: form.model_family || null,
        preset_group: form.preset_group,
        gender: form.gender,
        style_family: form.style_family,
        sort_order: form.sort_order,
        is_active: true,
      };

      // Build extra_params for prompt presets
      if (category === 'prompt') {
        body.extra_params = {
          steps: form.steps,
          cfg: form.cfg,
          sampler: form.sampler,
          scheduler: form.scheduler,
          width: form.width,
          height: form.height,
        };
      }

      // Pose reference
      if (category === 'pose') {
        body.pose_reference = form.pose_reference || null;
      }

      const res = await authedFetch('/api/admin/gen-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(isEdit ? '已更新' : '已创建');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const meta = CATEGORY_META[category];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? '编辑' : '添加'} {meta.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Slug + Group */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Slug *</Label>
              <Input value={form.slug} onChange={(e) => update({ slug: e.target.value })}
                placeholder="my-preset-slug" disabled={isEdit}
                className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">分组</Label>
              <Input value={form.preset_group} onChange={(e) => update({ preset_group: e.target.value })}
                placeholder={category === 'prompt' ? 'flux / sdxl' : category === 'pose' ? 'standing / action' : 'portrait / nsfw'}
                className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>

          {/* Labels */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">英文标签</Label>
              <Input value={form.label_en} onChange={(e) => update({ label_en: e.target.value })}
                className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">中文标签</Label>
              <Input value={form.label_zh} onChange={(e) => update({ label_zh: e.target.value })}
                className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">
              {category === 'prompt' ? '正向提示词' : category === 'pose' ? '姿势描述 / Prompt 片段' : '场景 Prompt 片段'}
            </Label>
            <textarea value={form.prompt_fragment} onChange={(e) => update({ prompt_fragment: e.target.value })}
              className="w-full min-h-[80px] rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white resize-y"
              placeholder={category === 'prompt' ? 'photorealistic portrait of...' : 'prompt fragment...'} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-gray-400">负向提示词</Label>
            <Input value={form.negative_fragment} onChange={(e) => update({ negative_fragment: e.target.value })}
              className="bg-[#0f0f17] border-gray-700 text-sm" placeholder="bad anatomy, deformed..." />
          </div>

          {/* Preview URL */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">预览图 URL</Label>
            <Input value={form.preview_url} onChange={(e) => update({ preview_url: e.target.value })}
              placeholder="https://..." className="bg-[#0f0f17] border-gray-700 text-sm" />
            {form.preview_url && (
              <div className="mt-1 aspect-video max-h-32 bg-gray-900 rounded-md overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.preview_url} alt="preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Pose reference (pose only) */}
          {category === 'pose' && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">ControlNet 姿势参考图 URL</Label>
              <Input value={form.pose_reference} onChange={(e) => update({ pose_reference: e.target.value })}
                placeholder="https://... (pose reference image)" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          )}

          {/* Meta row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">NSFW 等级</Label>
              <Select value={String(form.nsfw_level)} onValueChange={(v) => update({ nsfw_level: Number(v) })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} - {NSFW_BADGE[n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => update({ tier: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">模型族</Label>
              <Input value={form.model_family} onChange={(e) => update({ model_family: e.target.value })}
                placeholder="flux / sdxl / pony" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">排序</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => update({ sort_order: +e.target.value })}
                className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>

          {/* Gender + Style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">性别</Label>
              <Select value={form.gender} onValueChange={(v) => update({ gender: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="trans">Trans</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">画风</Label>
              <Select value={form.style_family} onValueChange={(v) => update({ style_family: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">写实 Realistic</SelectItem>
                  <SelectItem value="anime">二次元 Anime</SelectItem>
                  <SelectItem value="3d">3D</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prompt-specific: generation params */}
          {category === 'prompt' && (
            <div className="border-t border-gray-800 pt-3 space-y-3">
              <Label className="text-xs text-gray-500 font-semibold">生成参数（存入 extra_params）</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Steps</Label>
                  <Input type="number" value={form.steps} onChange={(e) => update({ steps: +e.target.value })}
                    className="bg-[#0f0f17] border-gray-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">CFG</Label>
                  <Input type="number" step={0.1} value={form.cfg} onChange={(e) => update({ cfg: +e.target.value })}
                    className="bg-[#0f0f17] border-gray-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">尺寸</Label>
                  <div className="flex items-center gap-1">
                    <Input type="number" value={form.width} onChange={(e) => update({ width: +e.target.value })}
                      className="bg-[#0f0f17] border-gray-700 text-sm w-16" />
                    <span className="text-gray-600 text-xs">×</span>
                    <Input type="number" value={form.height} onChange={(e) => update({ height: +e.target.value })}
                      className="bg-[#0f0f17] border-gray-700 text-sm w-16" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Sampler</Label>
                  <Select value={form.sampler} onValueChange={(v) => update({ sampler: v })}>
                    <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="euler">euler</SelectItem>
                      <SelectItem value="euler_ancestral">euler_ancestral</SelectItem>
                      <SelectItem value="dpmpp_2m">dpmpp_2m</SelectItem>
                      <SelectItem value="dpmpp_2m_sde">dpmpp_2m_sde</SelectItem>
                      <SelectItem value="uni_pc">uni_pc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Scheduler</Label>
                  <Select value={form.scheduler} onValueChange={(v) => update({ scheduler: v })}>
                    <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">simple</SelectItem>
                      <SelectItem value="normal">normal</SelectItem>
                      <SelectItem value="karras">karras</SelectItem>
                      <SelectItem value="exponential">exponential</SelectItem>
                      <SelectItem value="sgm_uniform">sgm_uniform</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {isEdit ? '保存' : '创建'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
