'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Archive, Coins, Crown, Film, ImageIcon, Loader2, Package2, Plus,
  RefreshCw, Search, Shirt, Sparkles, Star, Upload, WandSparkles,
  Flame, Edit3,
} from 'lucide-react';

const COLLECTIONS = ['outfit', 'prop', 'membership', 'credits'] as const;
type Collection = (typeof COLLECTIONS)[number];

type ShopItem = {
  id: string;
  collection: Collection;
  sku: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  price_credits: number;
  image_url: string;
  video_url: string;
  effect_asset_url: string;
  effect_type: string;
  effect_config: Record<string, unknown>;
  wear_prompt: string;
  auto_generate_image: boolean;
  auto_generate_video: boolean;
  membership_tier: string;
  duration_days: number;
  token_amount: number;
  rarity: string;
  active: boolean;
  featured: boolean;
  sort_order: number;
};

type FormState = Omit<ShopItem, 'id'>;

const EMPTY: FormState = {
  collection: 'outfit', sku: '', name: '', description: '', category: 'daily',
  price_cents: 0, price_credits: 0, image_url: '', video_url: '', effect_asset_url: '',
  effect_type: '', effect_config: {}, wear_prompt: '', auto_generate_image: true,
  auto_generate_video: false, membership_tier: '', duration_days: 30, token_amount: 0,
  rarity: 'common', active: true, featured: false, sort_order: 100,
};

const META: Record<Collection, { label: string; icon: typeof Shirt; color: string }> = {
  outfit: { label: '服装', icon: Shirt, color: 'from-fuchsia-500 to-pink-500' },
  prop: { label: '道具', icon: WandSparkles, color: 'from-violet-500 to-indigo-500' },
  membership: { label: '会员', icon: Crown, color: 'from-amber-400 to-orange-500' },
  credits: { label: '积分', icon: Coins, color: 'from-cyan-400 to-blue-500' },
};

function money(cents: number): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : '操作失败';
}

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [tab, setTab] = useState<'all' | Collection>('all');
  const [counts, setCounts] = useState<Record<'all' | Collection, number>>({ all: 0, outfit: 0, prop: 0, membership: 0, credits: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const effectInput = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<'image_url' | 'video_url' | 'effect_asset_url'>('image_url');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ collection: tab, search });
      const response = await authedFetch(`/api/admin/shop?${query}`);
      const data = await response.json() as { items?: ShopItem[]; counts?: typeof counts; error?: string };
      if (!response.ok) throw new Error(data.error || '商城加载失败');
      setItems(data.items || []);
      if (data.counts) setCounts(data.counts);
    } catch (error) {
      logger.error('admin shop load', { error: errorMessage(error) });
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [search, tab]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = (collection: Collection = tab === 'all' ? 'outfit' : tab) => {
    setEditingId(null);
    setForm({ ...EMPTY, collection, category: collection === 'outfit' ? 'daily' : collection });
    setOpen(true);
  };

  const openEdit = (item: ShopItem) => {
    const { id, ...rest } = item;
    setEditingId(id);
    setForm(rest);
    setOpen(true);
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const upload = async (file: File, field: 'image_url' | 'video_url' | 'effect_asset_url') => {
    setUploadTarget(field);
    setSaving(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await authedFetch('/api/admin/shop', { method: 'POST', body });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || '上传失败');
      update(field, data.url);
      toast.success(field === 'image_url' ? '图片已上传' : field === 'video_url' ? '视频已上传' : '特效文件已上传');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.description.trim()) {
      toast.error('请填写商品名称和说明');
      return;
    }
    setSaving(true);
    try {
      const response = await authedFetch('/api/admin/shop', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: editingId || undefined }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast.success(editingId ? '商品已更新' : '商品已创建');
      setOpen(false);
      await load();
    } catch (error) {
      logger.error('admin shop save', { error: errorMessage(error) });
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = async (item: ShopItem) => {
    try {
      const response = await authedFetch('/api/admin/shop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, featured: !item.featured }),
      });
      if (!response.ok) throw new Error('更新失败');
      toast.success(item.featured ? '已取消推荐' : '已设为推荐');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const archive = async (item: ShopItem) => {
    if (!window.confirm(`确定下架"${item.name}"？历史订单与用户库存不会删除。`)) return;
    try {
      const response = await authedFetch(`/api/admin/shop?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '下架失败');
      toast.success('商品已下架');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const filtered = useMemo(() => items, [items]);

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      {/* ── Header ── */}
      <div className="border-b border-white/10 bg-gradient-to-r from-fuchsia-950/40 via-slate-950 to-violet-950/30 px-4 py-5 md:px-6">
        <div className="mx-auto max-w-[1920px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fuchsia-300/80">Commerce</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">商城管理</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                统一管理服装、道具、会员和积分商品。参数同步到前台商城与伴侣衣柜。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/15 bg-white/5" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
              </Button>
              <Button className="bg-fuchsia-600 hover:bg-fuchsia-500" onClick={() => openCreate()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 新建商品
              </Button>
            </div>
          </div>

          {/* Collection tabs */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                tab === 'all'
                  ? 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-200'
                  : 'border-white/10 bg-black/30 text-slate-400 hover:bg-white/5',
              )}
            >
              全部 <span className="font-mono text-xs">{counts.all}</span>
            </button>
            {COLLECTIONS.map((col) => {
              const meta = META[col];
              const Icon = meta.icon;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => setTab(col)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    tab === col
                      ? 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-200'
                      : 'border-white/10 bg-black/30 text-slate-400 hover:bg-white/5',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label} <span className="font-mono text-xs">{counts[col]}</span>
                </button>
              );
            })}
            <div className="ml-auto relative min-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索名称 / SKU / 说明"
                className="h-9 border-white/10 bg-black/30 pl-8 text-sm"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">共 {filtered.length} 个商品</p>
        </div>
      </div>

      {/* ── Card Grid ── */}
      <div className="mx-auto max-w-[1920px] px-3 py-4 md:px-5">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center text-sm text-slate-500">
            <Package2 className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            暂无商品。点击「新建商品」添加。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((item) => {
              const meta = META[item.collection];
              const Icon = meta.icon;
              return (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5"
                >
                  <button type="button" onClick={() => openEdit(item)} className="block w-full text-left">
                    <div className="relative aspect-[3/4] bg-black/40">
                      {item.video_url ? (
                        <video
                          src={item.video_url}
                          poster={item.image_url || undefined}
                          muted loop playsInline
                          className="h-full w-full object-cover"
                          onMouseEnter={(e) => void e.currentTarget.play()}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                      ) : item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-600">
                          <Icon className="h-8 w-8" />
                          <span className="text-[10px]">无图</span>
                        </div>
                      )}
                      {/* Tags overlay */}
                      <div className="absolute left-1 top-1 flex flex-wrap gap-0.5">
                        <span className={cn('rounded px-1 py-0.5 text-[9px] font-semibold text-white bg-gradient-to-r', meta.color)}>
                          {meta.label}
                        </span>
                        {item.featured && (
                          <span className="rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-semibold text-black">推荐</span>
                        )}
                      </div>
                      {item.video_url && (
                        <Film className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded bg-black/60 p-0.5 text-slate-300" />
                      )}
                      {/* Bottom info overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5 pt-6">
                        <p className="truncate text-xs font-semibold text-white">{item.name}</p>
                        <p className="truncate text-[10px] text-slate-300">
                          {item.price_credits.toLocaleString()} 积分 · {money(item.price_cents)}
                        </p>
                        <p className="truncate text-[9px] text-fuchsia-200/80">
                          {item.category} · {item.rarity}
                        </p>
                      </div>
                    </div>
                  </button>
                  {/* Quick actions */}
                  <div className="flex items-center justify-between gap-1 border-t border-white/5 px-1 py-1">
                    <div className="flex gap-0.5 text-slate-500">
                      {item.active ? (
                        <span className="text-[10px] text-emerald-400">上架</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">下架</span>
                      )}
                    </div>
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        title="推荐"
                        onClick={(e) => { e.stopPropagation(); void toggleFeatured(item); }}
                        className={cn('rounded p-0.5', item.featured ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300')}
                      >
                        <Star className="h-3.5 w-3.5" fill={item.featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        title="编辑"
                        onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                        className="rounded p-0.5 text-violet-400 hover:bg-violet-500/20"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="下架"
                        onClick={(e) => { e.stopPropagation(); void archive(item); }}
                        className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Dialog (landscape full-screen) ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[92vh] w-[94vw] max-w-[94vw] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-white/10 bg-[#12121c] text-slate-100 sm:max-w-[94vw] xl:max-w-[1400px]">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑商品' : '新建商品'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              参数同步到前台商城。媒体上传后直接绑定商品记录。
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-6 overflow-y-auto lg:grid-cols-[1fr_380px]">
            {/* Left: Form fields */}
            <div className="space-y-5 overflow-y-auto pr-2">
              {/* Collection selector */}
              <div className="grid grid-cols-4 gap-2">
                {COLLECTIONS.map((col) => {
                  const Icon = META[col].icon;
                  return (
                    <button
                      type="button"
                      key={col}
                      onClick={() => update('collection', col)}
                      className={cn(
                        'rounded-xl border p-2.5 text-left text-sm transition-colors',
                        form.collection === col
                          ? 'border-fuchsia-400/60 bg-fuchsia-400/10 text-fuchsia-200'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/5',
                      )}
                    >
                      <Icon className="mb-1 h-4 w-4" />
                      {META[col].label}
                    </button>
                  );
                })}
              </div>

              {/* Name + SKU */}
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="商品名称">
                  <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="border-white/10 bg-black/30" />
                </Field>
                <Field label="SKU（留空自动生成）">
                  <Input value={form.sku} onChange={(e) => update('sku', e.target.value)} disabled={!!editingId} className="border-white/10 bg-black/30" />
                </Field>
              </div>

              {/* Description */}
              <Field label="商品说明">
                <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} className="border-white/10 bg-black/30" />
              </Field>

              {/* Pricing row */}
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="现金价格（美分）">
                  <Input type="number" min={0} value={form.price_cents} onChange={(e) => update('price_cents', Number(e.target.value))} className="border-white/10 bg-black/30" />
                </Field>
                <Field label="积分价格">
                  <Input type="number" min={0} value={form.price_credits} onChange={(e) => update('price_credits', Number(e.target.value))} className="border-white/10 bg-black/30" />
                </Field>
                <Field label="子分类">
                  <Input value={form.category} onChange={(e) => update('category', e.target.value)} className="border-white/10 bg-black/30" />
                </Field>
              </div>

              {/* Status row */}
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="稀有度">
                  <Select value={form.rarity} onValueChange={(v) => update('rarity', v)}>
                    <SelectTrigger className="border-white/10 bg-black/30"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['common', 'rare', 'epic', 'legendary'].map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="排序">
                  <Input type="number" value={form.sort_order} onChange={(e) => update('sort_order', Number(e.target.value))} className="border-white/10 bg-black/30" />
                </Field>
                <div className="flex items-end gap-4 pb-2">
                  <Toggle label="上架" checked={form.active} onChange={(v) => update('active', v)} />
                  <Toggle label="推荐" checked={form.featured} onChange={(v) => update('featured', v)} />
                </div>
              </div>

              {/* Collection-specific sections */}
              {form.collection === 'outfit' && (
                <div className="space-y-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-fuchsia-200">
                    <Shirt className="h-4 w-4" /> 换装生成
                  </h3>
                  <Field label="穿搭提示词（仅描述服装，不覆盖伴侣脸型、发色和身材）">
                    <Textarea value={form.wear_prompt} onChange={(e) => update('wear_prompt', e.target.value)} rows={3} className="border-white/10 bg-black/30" />
                  </Field>
                  <div className="flex flex-wrap gap-5">
                    <Toggle label="赠送后自动生成立绘" checked={form.auto_generate_image} onChange={(v) => update('auto_generate_image', v)} />
                    <Toggle label="生成/绑定换装视频" checked={form.auto_generate_video} onChange={(v) => update('auto_generate_video', v)} />
                  </div>
                </div>
              )}

              {form.collection === 'prop' && (
                <div className="space-y-3 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4">
                  <Field label="特效类型">
                    <Input value={form.effect_type} onChange={(e) => update('effect_type', e.target.value)} placeholder="intimacy_boost / animation / scene_unlock" className="border-white/10 bg-black/30" />
                  </Field>
                  <Field label="特效参数（JSON）">
                    <Textarea
                      value={JSON.stringify(form.effect_config, null, 2)}
                      onChange={(e) => { try { update('effect_config', JSON.parse(e.target.value || '{}') as Record<string, unknown>); } catch { /* allow typing */ } }}
                      rows={4}
                      className="border-white/10 bg-black/30 font-mono text-xs"
                    />
                  </Field>
                </div>
              )}

              {form.collection === 'membership' && (
                <div className="grid gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 md:grid-cols-2">
                  <Field label="会员等级">
                    <Input value={form.membership_tier} onChange={(e) => update('membership_tier', e.target.value)} placeholder="pro / unlimited" className="border-white/10 bg-black/30" />
                  </Field>
                  <Field label="有效期（天）">
                    <Input type="number" min={1} value={form.duration_days} onChange={(e) => update('duration_days', Number(e.target.value))} className="border-white/10 bg-black/30" />
                  </Field>
                </div>
              )}

              {form.collection === 'credits' && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <Field label="到账积分数量">
                    <Input type="number" min={1} value={form.token_amount} onChange={(e) => update('token_amount', Number(e.target.value))} className="border-white/10 bg-black/30" />
                  </Field>
                </div>
              )}
            </div>

            {/* Right: Media uploads */}
            <div className="space-y-4 overflow-y-auto pr-2">
              <MediaBox title="商品图片" icon={ImageIcon} value={form.image_url} kind="image" onPick={() => imageInput.current?.click()} />
              <MediaBox title="商品视频" icon={Film} value={form.video_url} kind="video" onPick={() => videoInput.current?.click()} />
              <MediaBox title="特效文件" icon={Sparkles} value={form.effect_asset_url} kind="file" onPick={() => effectInput.current?.click()} />
              <input ref={imageInput} hidden type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'image_url'); }} />
              <input ref={videoInput} hidden type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'video_url'); }} />
              <input ref={effectInput} hidden type="file" accept="image/*,video/*,.svga,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'effect_asset_url'); }} />
              {saving && (
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {uploadTarget === 'image_url' ? '正在上传图片' : uploadTarget === 'video_url' ? '正在上传视频' : '正在上传特效'}
                </p>
              )}

              {/* Client preview */}
              <div className="rounded-xl border border-white/[0.08] bg-[#1a1a28] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Sparkles className="h-3 w-3" /> 客户效果
                </div>
                <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-black/30">
                  {form.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.image_url} alt={form.name} className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-slate-700" />
                    </div>
                  )}
                  <div className="space-y-1.5 p-2.5">
                    <Badge variant="outline" className="text-[10px] border-white/10">
                      {META[form.collection].label}
                    </Badge>
                    <p className="text-sm font-semibold text-slate-200">{form.name || '商品名称'}</p>
                    <p className="line-clamp-2 text-[11px] text-slate-500">{form.description || '商品说明'}</p>
                    <div className="flex items-center gap-2 text-[10px] text-fuchsia-300">
                      {form.price_credits.toLocaleString()} 积分
                      <span className="text-slate-600">{money(form.price_cents)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving} className="bg-fuchsia-600 hover:bg-fuchsia-500">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存商品
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-xs text-slate-400">
      <span className="text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-300">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function MediaBox({ title, icon: Icon, value, kind, onPick }: {
  title: string; icon: typeof ImageIcon; value: string; kind: 'image' | 'video' | 'file'; onPick: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a28]">
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-black/30">
        {kind === 'image' && value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={title} className="h-full w-full object-cover" />
        ) : kind === 'video' && value ? (
          <video src={value} controls className="h-full w-full object-contain" />
        ) : (
          <Icon className="h-8 w-8 text-slate-700" />
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{title}</span>
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onPick}>
            <Upload className="mr-1 h-3 w-3" /> 上传
          </Button>
        </div>
        <Input value={value} readOnly placeholder="上传后自动写入 URL" className="h-7 text-[10px] border-white/10 bg-black/30" />
      </div>
    </div>
  );
}
