'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Archive, Coins, Crown, Film, ImageIcon, Loader2, Package2, Plus, RefreshCw,
  Search, Shirt, Sparkles, Upload, WandSparkles,
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

const META: Record<Collection, { label: string; note: string; icon: typeof Shirt; color: string }> = {
  outfit: { label: '服装', note: '赠送后进入女友衣柜，可换装并生成新立绘/视频', icon: Shirt, color: 'from-fuchsia-500 to-pink-500' },
  prop: { label: '道具', note: '礼物、互动增益、动画与特效资源', icon: WandSparkles, color: 'from-violet-500 to-indigo-500' },
  membership: { label: '会员', note: '会员等级、有效期与权益说明', icon: Crown, color: 'from-amber-400 to-orange-500' },
  credits: { label: '积分', note: '积分充值包与赠送积分数量', icon: Coins, color: 'from-cyan-400 to-blue-500' },
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

  const archive = async (item: ShopItem) => {
    if (!window.confirm(`确定下架“${item.name}”？历史订单与用户库存不会删除。`)) return;
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

  const preview = useMemo(() => items.find((item) => item.featured) || items[0], [items]);

  return (
    <div className="min-h-screen space-y-6 bg-[#07070d] p-4 text-white md:p-6">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,.20),transparent_38%),linear-gradient(145deg,#12121d,#09090f)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <Badge className="mb-3 border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200">Commerce Studio</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">商城管理</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">统一管理服装、道具、会员和积分。媒体、价格、积分、说明、特效及换装生成参数都会保存到正式商品记录。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-white/15 bg-white/5" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
            <Button className="bg-gradient-to-r from-pink-500 to-fuchsia-600" onClick={() => openCreate()}><Plus className="mr-2 h-4 w-4" />新建商品</Button>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLLECTIONS.map((collection) => {
          const meta = META[collection];
          const Icon = meta.icon;
          return <button key={collection} type="button" onClick={() => setTab(tab === collection ? 'all' : collection)} className={`rounded-2xl border p-4 text-left transition ${tab === collection ? 'border-fuchsia-400/60 bg-white/10' : 'border-white/10 bg-white/[.035] hover:bg-white/[.07]'}`}>
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.color}`}><Icon className="h-5 w-5" /></div>
            <div className="flex items-center justify-between"><strong>{meta.label}</strong><span className="font-mono text-xl">{counts[collection]}</span></div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{meta.note}</p>
          </button>;
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-white/10 bg-white/[.025] p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、SKU、说明、分类" className="border-white/10 bg-black/30 pl-9 text-white" /></div>
            <Badge variant="outline" className="border-white/10 text-zinc-400">{items.length} 个商品</Badge>
          </div>
          {loading ? <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-fuchsia-400" /></div> : items.length === 0 ? <div className="py-24 text-center text-zinc-500"><Package2 className="mx-auto mb-3 h-10 w-10" />暂无商品</div> : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {items.map((item) => {
              const Icon = META[item.collection].icon;
              return <article key={item.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#101018]">
                <button type="button" onClick={() => openEdit(item)} className="relative block aspect-[4/3] w-full overflow-hidden bg-zinc-900 text-left">
                  {item.video_url ? <video src={item.video_url} poster={item.image_url || undefined} muted loop playsInline className="h-full w-full object-cover" onMouseEnter={(event) => void event.currentTarget.play()} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} /> : item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Icon className="h-12 w-12 text-zinc-700" /></div>}
                  <div className="absolute left-3 top-3 flex gap-2"><Badge className={`border-0 bg-gradient-to-r ${META[item.collection].color}`}>{META[item.collection].label}</Badge>{item.featured && <Badge className="bg-amber-400 text-black">推荐</Badge>}</div>
                  {item.video_url && <Film className="absolute bottom-3 right-3 h-5 w-5 rounded bg-black/60 p-1" />}
                </button>
                <div className="space-y-3 p-4">
                  <div><h3 className="font-medium">{item.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{item.description}</p></div>
                  <div className="flex items-end justify-between"><div><p className="text-lg font-semibold text-pink-400">{item.price_credits.toLocaleString()} 积分</p><p className="text-xs text-zinc-500">{money(item.price_cents)}</p></div><div className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => openEdit(item)}>编辑</Button><Button size="icon" variant="ghost" className="text-zinc-500 hover:text-red-400" onClick={() => void archive(item)}><Archive className="h-4 w-4" /></Button></div></div>
                </div>
              </article>;
            })}
          </div>}
        </section>

        <aside className="h-fit rounded-3xl border border-white/10 bg-gradient-to-b from-fuchsia-500/10 to-transparent p-5 xl:sticky xl:top-6">
          <div className="mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-fuchsia-300" /><h2 className="font-medium">客户效果预览</h2></div>
          {preview ? <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            {preview.image_url ? <img src={preview.image_url} alt={preview.name} className="aspect-[3/4] w-full object-cover" /> : <div className="flex aspect-[3/4] items-center justify-center"><ImageIcon className="h-10 w-10 text-zinc-700" /></div>}
            <div className="space-y-2 p-4"><Badge>{META[preview.collection].label}</Badge><h3 className="text-lg font-semibold">{preview.name}</h3><p className="text-sm leading-6 text-zinc-400">{preview.description}</p>{preview.collection === 'outfit' && <div className="rounded-xl border border-pink-400/20 bg-pink-400/5 p-3 text-xs leading-5 text-pink-100">赠送后自动写入所选女友衣柜；可立即生成换装立绘，并按配置处理视频。</div>}</div>
          </div> : <p className="text-sm text-zinc-500">创建商品后显示预览。</p>}
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto border-white/10 bg-[#101018] text-white">
          <DialogHeader><DialogTitle>{editingId ? '编辑商品' : '新建商品'}</DialogTitle></DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{COLLECTIONS.map((collection) => { const Icon = META[collection].icon; return <button type="button" key={collection} onClick={() => update('collection', collection)} className={`rounded-xl border p-3 text-left ${form.collection === collection ? 'border-fuchsia-400 bg-fuchsia-400/10' : 'border-white/10 bg-white/[.03]'}`}><Icon className="mb-2 h-5 w-5" /><span className="text-sm">{META[collection].label}</span></button>; })}</div>
              <div className="grid gap-3 md:grid-cols-2"><Field label="商品名称"><Input value={form.name} onChange={(e) => update('name', e.target.value)} /></Field><Field label="SKU（留空自动生成）"><Input value={form.sku} onChange={(e) => update('sku', e.target.value)} disabled={!!editingId} /></Field></div>
              <Field label="商品说明"><Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} /></Field>
              <div className="grid gap-3 md:grid-cols-3"><Field label="现金价格（美分）"><Input type="number" min={0} value={form.price_cents} onChange={(e) => update('price_cents', Number(e.target.value))} /></Field><Field label="积分价格"><Input type="number" min={0} value={form.price_credits} onChange={(e) => update('price_credits', Number(e.target.value))} /></Field><Field label="子分类"><Input value={form.category} onChange={(e) => update('category', e.target.value)} /></Field></div>
              <div className="grid gap-3 md:grid-cols-3"><Field label="稀有度"><Select value={form.rarity} onValueChange={(value) => update('rarity', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['common','rare','epic','legendary'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="排序"><Input type="number" value={form.sort_order} onChange={(e) => update('sort_order', Number(e.target.value))} /></Field><div className="flex items-end gap-4 pb-2"><Toggle label="上架" checked={form.active} onChange={(value) => update('active', value)} /><Toggle label="推荐" checked={form.featured} onChange={(value) => update('featured', value)} /></div></div>
              {form.collection === 'outfit' && <div className="space-y-4 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4"><h3 className="flex items-center gap-2 font-medium"><Shirt className="h-4 w-4" />换装生成</h3><Field label="穿搭提示词（仅描述服装，不覆盖女友脸型、发色和身材）"><Textarea value={form.wear_prompt} onChange={(e) => update('wear_prompt', e.target.value)} rows={3} /></Field><div className="flex flex-wrap gap-5"><Toggle label="赠送后自动生成立绘" checked={form.auto_generate_image} onChange={(value) => update('auto_generate_image', value)} /><Toggle label="生成/绑定换装视频" checked={form.auto_generate_video} onChange={(value) => update('auto_generate_video', value)} /></div></div>}
              {form.collection === 'prop' && <div className="space-y-3 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4"><Field label="特效类型"><Input value={form.effect_type} onChange={(e) => update('effect_type', e.target.value)} placeholder="intimacy_boost / animation / scene_unlock" /></Field><Field label="特效参数（JSON）"><Textarea value={JSON.stringify(form.effect_config, null, 2)} onChange={(e) => { try { update('effect_config', JSON.parse(e.target.value || '{}') as Record<string, unknown>); } catch { /* allow user to finish typing via effect type and asset fields */ } }} rows={4} /></Field></div>}
              {form.collection === 'membership' && <div className="grid gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 md:grid-cols-2"><Field label="会员等级"><Input value={form.membership_tier} onChange={(e) => update('membership_tier', e.target.value)} placeholder="pro / unlimited" /></Field><Field label="有效期（天）"><Input type="number" min={1} value={form.duration_days} onChange={(e) => update('duration_days', Number(e.target.value))} /></Field></div>}
              {form.collection === 'credits' && <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4"><Field label="到账积分数量"><Input type="number" min={1} value={form.token_amount} onChange={(e) => update('token_amount', Number(e.target.value))} /></Field></div>}
            </div>
            <div className="space-y-4">
              <MediaBox title="商品图片" icon={ImageIcon} value={form.image_url} kind="image" onPick={() => imageInput.current?.click()} />
              <MediaBox title="商品视频" icon={Film} value={form.video_url} kind="video" onPick={() => videoInput.current?.click()} />
              <MediaBox title="特效文件" icon={Sparkles} value={form.effect_asset_url} kind="file" onPick={() => effectInput.current?.click()} />
              <input ref={imageInput} hidden type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'image_url'); }} />
              <input ref={videoInput} hidden type="file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'video_url'); }} />
              <input ref={effectInput} hidden type="file" accept="image/*,video/*,.svga,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, 'effect_asset_url'); }} />
              {saving && <p className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="h-3 w-3 animate-spin" />{uploadTarget === 'image_url' ? '正在上传图片' : uploadTarget === 'video_url' ? '正在上传视频' : '正在上传特效'}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-white/10 pt-4"><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void save()} disabled={saving} className="bg-gradient-to-r from-pink-500 to-fuchsia-600">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存商品</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-xs text-zinc-400"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs text-zinc-300"><Switch checked={checked} onCheckedChange={onChange} />{label}</label>;
}

function MediaBox({ title, icon: Icon, value, kind, onPick }: { title: string; icon: typeof ImageIcon; value: string; kind: 'image' | 'video' | 'file'; onPick: () => void }) {
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25"><div className="flex aspect-video items-center justify-center overflow-hidden bg-black/30">{kind === 'image' && value ? <img src={value} alt={title} className="h-full w-full object-cover" /> : kind === 'video' && value ? <video src={value} controls className="h-full w-full object-contain" /> : <Icon className="h-9 w-9 text-zinc-700" />}</div><div className="space-y-2 p-3"><div className="flex items-center justify-between"><span className="text-sm">{title}</span><Button size="sm" variant="secondary" onClick={onPick}><Upload className="mr-1 h-3 w-3" />上传</Button></div><Input value={value} readOnly placeholder="上传后自动写入 URL" className="text-xs" /></div></div>;
}
