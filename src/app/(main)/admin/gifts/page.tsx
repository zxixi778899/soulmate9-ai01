'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Gift,
  RefreshCw,
  Sparkles,
  Eye,
  Upload,
  Image as ImageIcon,
  Film,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CHAT_GIFTS,
  GIFT_EFFECT_OPTIONS,
  isSvgaUrl,
  type ChatGift,
  type GiftEffectType,
} from '@/lib/gifts/catalog';
import { GiftEffectOverlay, type GiftBurstState } from '@/components/chat/GiftEffectOverlay';
import { cn } from '@/lib/utils';

type FormState = {
  id?: string;
  code: string;
  name: string;
  description: string;
  emoji: string;
  icon_url: string;
  cost_tokens: number;
  intimacy_boost: number;
  effect_type: GiftEffectType;
  effect_config_json: string;
  effect_asset_url: string;
  sort_order: number;
  is_active: boolean;
};

function emptyForm(): FormState {
  return {
    code: '',
    name: '',
    description: '',
    emoji: '🎁',
    icon_url: '',
    cost_tokens: 1,
    intimacy_boost: 1,
    effect_type: 'float_emoji',
    effect_config_json: '{\n  "duration_ms": 2400,\n  "intensity": 0.75,\n  "colors": ["#ff2e88", "#c026d3"]\n}',
    effect_asset_url: '',
    sort_order: 0,
    is_active: true,
  };
}

function toForm(g: ChatGift): FormState {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    description: g.description || '',
    emoji: g.emoji,
    icon_url: g.icon_url || '',
    cost_tokens: g.cost_tokens,
    intimacy_boost: g.intimacy_boost,
    effect_type: g.effect_type,
    effect_config_json: JSON.stringify(g.effect_config || {}, null, 2),
    effect_asset_url: g.effect_asset_url || '',
    sort_order: g.sort_order,
    is_active: g.is_active,
  };
}

export default function AdminGiftsPage() {
  const [gifts, setGifts] = useState<ChatGift[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('db');
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<GiftBurstState | null>(null);
  const [q, setQ] = useState('');
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadingSvga, setUploadingSvga] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/gifts?all=1');
      const data = await readResponseJson<{
        gifts?: ChatGift[];
        source?: string;
        hint?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || '加载失败');
      setGifts(data.gifts || DEFAULT_CHAT_GIFTS);
      setSource(data.source || 'db');
      setHint(data.hint || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setGifts(DEFAULT_CHAT_GIFTS);
      setSource('defaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return gifts;
    return gifts.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.code.toLowerCase().includes(s) ||
        g.effect_type.toLowerCase().includes(s),
    );
  }, [gifts, q]);

  const openCreate = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (g: ChatGift) => {
    setForm(toForm(g));
    setOpen(true);
  };

  const playPreview = (g: ChatGift, combo = 1) => {
    setPreview({ gift: g, combo, key: Date.now(), senderName: '预览用户' });
  };

  const uploadGiftFile = async (
    file: File,
    kind: 'icon' | 'svga',
  ): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', kind === 'svga' ? 'gifts/svga' : 'gifts/icons');
    const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
    const data = await readResponseJson<{ url?: string; error?: string; kind?: string }>(res);
    if (!res.ok || !data.url) {
      throw new Error(data.error || '上传失败');
    }
    return data.url;
  };

  const onPickIcon = async (file?: File | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      toast.error('请上传图片（png/jpg/webp/gif）');
      return;
    }
    setUploadingIcon(true);
    try {
      const url = await uploadGiftFile(file, 'icon');
      if (url) {
        setForm((f) => ({ ...f, icon_url: url }));
        toast.success('礼物图标已上传');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '图标上传失败');
    } finally {
      setUploadingIcon(false);
    }
  };

  const onPickSvga = async (file?: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.svga') && file.type && !file.type.includes('octet')) {
      toast.error('请上传 .svga 文件（抖音直播礼物格式）');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('SVGA 请小于 20MB');
      return;
    }
    setUploadingSvga(true);
    try {
      const url = await uploadGiftFile(file, 'svga');
      if (url) {
        setForm((f) => ({
          ...f,
          effect_asset_url: url,
          effect_type: 'svga',
        }));
        toast.success('SVGA 特效已上传，特效类型已设为 SVGA');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'SVGA 上传失败');
    } finally {
      setUploadingSvga(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请填写礼物名称');
      return;
    }
    let effect_config: Record<string, unknown> = {};
    try {
      effect_config = JSON.parse(form.effect_config_json || '{}') as Record<string, unknown>;
    } catch {
      toast.error('特效配置 JSON 格式错误');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim(),
        emoji: form.emoji || '🎁',
        icon_url: form.icon_url.trim() || null,
        cost_tokens: form.cost_tokens,
        intimacy_boost: form.intimacy_boost,
        effect_type: form.effect_type,
        effect_config,
        effect_asset_url: form.effect_asset_url.trim() || null,
        sort_order: form.sort_order,
        is_active: form.is_active,
      };

      const isPersisted = Boolean(form.id && !form.id.startsWith('seed-'));
      if (isPersisted) {
        const res = await authedFetch('/api/admin/gifts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: form.id, ...payload }),
        });
        const data = await readResponseJson<{ error?: string; source?: string }>(res);
        if (!res.ok) throw new Error(data.error || '保存失败');
        toast.success(
          data.source === 'site_settings' ? '礼物已更新（已写入 site_settings）' : '礼物已更新',
        );
      } else {
        // seed-* or new: always create
        const res = await authedFetch('/api/admin/gifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await readResponseJson<{ error?: string; source?: string }>(res);
        if (!res.ok) throw new Error(data.error || '创建失败');
        toast.success(
          data.source === 'site_settings'
            ? '礼物已创建（已写入 site_settings，无需 chat_gifts 表）'
            : '礼物已创建',
        );
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败', { duration: 6000 });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: ChatGift, hard: boolean) => {
    if (g.id.startsWith('seed-')) {
      toast.error('默认种子数据未入库，请先「同步默认礼物」');
      return;
    }
    const ok = window.confirm(
      hard
        ? `确定永久删除礼物「${g.name}」？`
        : `确定停用礼物「${g.name}」？`,
    );
    if (!ok) return;
    try {
      const qs = hard ? `id=${g.id}` : `id=${g.id}&soft=1`;
      const res = await authedFetch(`/api/admin/gifts?${qs}`, { method: 'DELETE' });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success(hard ? '已删除' : '已停用');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const seedDefaults = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/gifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_defaults' }),
      });
      const data = await readResponseJson<{
        error?: string;
        seeded?: number;
        source?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || '同步失败');
      toast.success(
        `已同步 ${data.seeded ?? 0} 个默认礼物` +
          (data.source === 'site_settings' ? '（site_settings 存储）' : ''),
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败', { duration: 8000 });
    } finally {
      setSaving(false);
    }
  };

  const effectLabel = (t: string) =>
    GIFT_EFFECT_OPTIONS.find((o) => o.value === t)?.label || t;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GiftEffectOverlay burst={preview} onDone={() => setPreview(null)} />

      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Gift className="h-6 w-6 text-[#e11d48]" />
            直播礼物与特效
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            管理对话页礼物：价格、亲密值、对应全屏特效。数据源：
            <Badge variant="outline" className="ml-1">
              {source}
            </Badge>
          </p>
          {hint && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {hint}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => void seedDefaults()} disabled={saving}>
            <Sparkles className="h-4 w-4 mr-1" />
            同步默认礼物
          </Button>
          <Button size="sm" className="bg-[#e11d48] hover:bg-[#be123c]" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            添加礼物
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Input
          placeholder="搜索名称 / code / 特效…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm bg-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#e11d48]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((g) => (
            <div
              key={g.id}
              className={cn(
                'rounded-2xl border bg-white p-4 shadow-sm',
                g.is_active ? 'border-[#E2E8F0]' : 'border-dashed border-slate-300 opacity-70',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-50 to-fuchsia-50 flex items-center justify-center text-3xl border border-rose-100 overflow-hidden">
                  {g.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.icon_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    g.emoji
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[#1E293B] truncate">{g.name}</h3>
                    {!g.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        停用
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-[#94A3B8] font-mono">{g.code}</p>
                  <p className="text-xs text-[#64748B] mt-1 line-clamp-2">{g.description || '—'}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="outline">特效 {effectLabel(g.effect_type)}</Badge>
                {isSvgaUrl(g.effect_asset_url) && (
                  <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">SVGA</Badge>
                )}
                {g.icon_url && (
                  <Badge variant="outline" className="text-emerald-700">
                    有图标
                  </Badge>
                )}
                <Badge variant="outline">+{g.intimacy_boost} 亲密</Badge>
                <Badge variant="outline">{g.cost_tokens} 代币</Badge>
                <Badge variant="outline">排序 {g.sort_order}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8" onClick={() => playPreview(g)}>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  预览特效
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(g)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-amber-700"
                  onClick={() => void handleDelete(g, false)}
                >
                  停用
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-red-600"
                  onClick={() => void handleDelete(g, true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{form.id ? '编辑礼物' : '添加礼物'}</DialogTitle>
            <DialogDescription>
              配置礼物参数与对应全屏特效。特效在对话送礼时播放。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>名称</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Rose"
                />
              </div>
              <div>
                <Label>Emoji</Label>
                <Input
                  value={form.emoji}
                  onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                  className="text-center text-xl"
                />
              </div>
            </div>

            <div>
              <Label>Code（唯一标识，创建后不可改）</Label>
              <Input
                value={form.code}
                disabled={Boolean(form.id && !form.id.startsWith('seed-'))}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="rose（可空，自动生成）"
              />
            </div>

            <div>
              <Label>描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>代币价格</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.cost_tokens}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cost_tokens: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label>亲密加成</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.intimacy_boost}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, intimacy_boost: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>特效类型</Label>
              <Select
                value={form.effect_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, effect_type: v as GiftEffectType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GIFT_EFFECT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label} — {o.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>特效配置 JSON</Label>
              <Textarea
                value={form.effect_config_json}
                onChange={(e) => setForm((f) => ({ ...f, effect_config_json: e.target.value }))}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-[#94A3B8] mt-1">
                duration_ms / intensity / colors[] / particle_count / sound_url
              </p>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1E293B]">
                <ImageIcon className="h-4 w-4 text-[#e11d48]" />
                礼物图标（面板 / 横幅）
              </div>
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl border bg-white flex items-center justify-center overflow-hidden text-2xl">
                  {form.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.icon_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    form.emoji || '🎁'
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-white text-xs font-medium cursor-pointer hover:bg-slate-50">
                    {uploadingIcon ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    上传图片
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        void onPickIcon(f);
                      }}
                    />
                  </label>
                  <Input
                    value={form.icon_url}
                    onChange={(e) => setForm((f) => ({ ...f, icon_url: e.target.value }))}
                    placeholder="或粘贴图标 URL"
                    className="text-xs h-8"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1E293B]">
                <Film className="h-4 w-4 text-violet-600" />
                SVGA 全屏特效（抖音直播礼物）
              </div>
              <p className="text-[11px] text-[#64748B]">
                支持上传 <code className="text-[10px]">.svga</code> 文件；也可填 gif/webm URL 作兜底。有
                SVGA 时优先播放全屏动画 + 左侧横幅 + 连击数字。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-white text-xs font-medium cursor-pointer hover:bg-slate-50">
                  {uploadingSvga ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  上传 SVGA
                  <input
                    type="file"
                    accept=".svga,application/octet-stream"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void onPickSvga(f);
                    }}
                  />
                </label>
                {form.effect_asset_url && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      isSvgaUrl(form.effect_asset_url)
                        ? 'border-violet-300 text-violet-700'
                        : 'border-slate-300',
                    )}
                  >
                    {isSvgaUrl(form.effect_asset_url) ? 'SVGA 已绑定' : '静态资源'}
                  </Badge>
                )}
              </div>
              <Input
                value={form.effect_asset_url}
                onChange={(e) => {
                  const url = e.target.value;
                  setForm((f) => ({
                    ...f,
                    effect_asset_url: url,
                    effect_type: isSvgaUrl(url) ? 'svga' : f.effect_type,
                  }));
                }}
                placeholder="https://.../xxx.svga"
                className="text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm font-medium">启用</div>
                <div className="text-[11px] text-[#94A3B8]">关闭后对话页不展示</div>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  const cfg = JSON.parse(form.effect_config_json || '{}') as ChatGift['effect_config'];
                  playPreview({
                    id: form.id || 'preview',
                    code: form.code || 'preview',
                    name: form.name || 'Preview',
                    description: form.description,
                    emoji: form.emoji || '🎁',
                    cost_tokens: form.cost_tokens,
                    intimacy_boost: form.intimacy_boost,
                    effect_type: form.effect_type,
                    effect_config: cfg,
                    effect_asset_url: form.effect_asset_url || null,
                    sort_order: form.sort_order,
                    is_active: true,
                  });
                } catch {
                  toast.error('JSON 无效，无法预览');
                }
              }}
            >
              预览特效
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-[#e11d48] hover:bg-[#be123c]"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
