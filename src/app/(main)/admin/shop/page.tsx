'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  ShoppingBag,
  CheckSquare,
  Square,
  Upload,
  ImagePlus,
  RefreshCw,
  Search,
  Tags,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type Collection = 'outfit' | 'prop';
type TabKey = 'all' | Collection;

type ShopRow = {
  id: string;
  collection: Collection;
  name: string;
  description: string;
  price_cents: number;
  tier: string;
  category: string;
  image_url: string | null;
  intimacy_boost: number;
  active: boolean;
  emoji: string;
  sort_order: number;
  item_type: string;
  visual_type: string;
  is_gift: boolean;
  is_limited: boolean;
  created_at?: string;
};

type FormState = {
  collection: Collection;
  name: string;
  emoji: string;
  description: string;
  price_cents: number;
  tier: string;
  category: string;
  visual_type: string;
  sort_order: number;
  active: boolean;
  intimacy_boost: number;
  item_type: string;
  is_gift: boolean;
  is_limited: boolean;
};

const defaultForm: FormState = {
  collection: 'prop',
  name: '',
  emoji: '',
  description: '',
  price_cents: 0,
  tier: 'free',
  category: 'gift',
  visual_type: '',
  sort_order: 0,
  active: true,
  intimacy_boost: 0,
  item_type: 'intimacy_boost',
  is_gift: false,
  is_limited: false,
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'outfit', label: '服装' },
  { key: 'prop', label: '道具' },
];

const TIER_OPTIONS = ['free', 'pro', 'unlimited', 'premium'];

function money(cents: number): string {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function rowKey(item: ShopRow): string {
  return `${item.collection}:${item.id}`;
}

export default function AdminShopPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ShopRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [counts, setCounts] = useState<{ outfit: number; prop: number; all: number }>({
    outfit: 0,
    prop: 0,
    all: 0,
  });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkDescSuffix, setBulkDescSuffix] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShopRow | null>(null);
  const [deleting, setDeleting] = useState<ShopRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [batchText, setBatchText] = useState('');
  const [batchCollection, setBatchCollection] = useState<Collection>('prop');
  const [importOpen, setImportOpen] = useState(false);
  const batchFilesRef = useRef<HTMLInputElement>(null);
  const rowImageRef = useRef<HTMLInputElement>(null);
  const [imageTarget, setImageTarget] = useState<ShopRow | null>(null);

  const selectedKeys = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('collection', tab);
      if (search.trim()) qs.set('search', search.trim());
      if (categoryFilter && categoryFilter !== 'all') qs.set('category', categoryFilter);
      const res = await authedFetch(`/api/admin/shop?${qs.toString()}`);
      const data = await readResponseJson<{
        items?: ShopRow[];
        categories?: string[];
        counts?: { outfit: number; prop: number; all: number };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || '加载失败');
      setItems(Array.isArray(data.items) ? data.items : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      if (data.counts) setCounts(data.counts);
      setSelected({});
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '加载商城失败');
    } finally {
      setLoading(false);
    }
  }, [tab, search, categoryFilter]);

  useEffect(() => {
    if (!user) return;
    void fetchItems();
  }, [user, fetchItems]);

  const resetForm = () => {
    setForm({
      ...defaultForm,
      collection: tab === 'outfit' ? 'outfit' : 'prop',
      category: tab === 'outfit' ? 'everyday' : 'gift',
    });
    setEditing(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: ShopRow) => {
    setEditing(item);
    setForm({
      collection: item.collection,
      name: item.name || '',
      emoji: item.emoji || '',
      description: item.description || '',
      price_cents: Number(item.price_cents || 0),
      tier: item.tier || 'free',
      category: item.category || (item.collection === 'outfit' ? 'everyday' : 'gift'),
      visual_type: item.visual_type || '',
      sort_order: Number(item.sort_order || 0),
      active: item.active !== false,
      intimacy_boost: Number(item.intimacy_boost || 0),
      item_type: item.item_type || 'intimacy_boost',
      is_gift: !!item.is_gift,
      is_limited: !!item.is_limited,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('名称不能为空');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: editing?.id,
        collection: form.collection,
        name: form.name.trim(),
        emoji: form.emoji,
        description: form.description,
        price_cents: Number(form.price_cents) || 0,
        tier: form.tier,
        category: form.category.trim() || (form.collection === 'outfit' ? 'everyday' : 'gift'),
        visual_type: form.visual_type,
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
        intimacy_boost: Number(form.intimacy_boost) || 0,
        item_type: form.item_type,
        is_gift: form.is_gift,
        is_limited: form.is_limited,
      };
      const res = await authedFetch('/api/admin/shop', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success(editing ? '已更新' : '已创建');
      setDialogOpen(false);
      resetForm();
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await authedFetch(
        `/api/admin/shop?id=${encodeURIComponent(deleting.id)}&collection=${deleting.collection}`,
        { method: 'DELETE' },
      );
      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      setDeleteDialogOpen(false);
      setDeleting(null);
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleOne = (item: ShopRow) => {
    const k = rowKey(item);
    setSelected((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const toggleAllVisible = () => {
    const allOn = items.length > 0 && items.every((it) => selected[rowKey(it)]);
    if (allOn) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const it of items) next[rowKey(it)] = true;
    setSelected(next);
  };

  const selectedItems = useMemo(
    () => items.filter((it) => selected[rowKey(it)]),
    [items, selected],
  );

  const runBulkPatch = async () => {
    if (selectedItems.length === 0) {
      toast.error('请先勾选商品');
      return;
    }
    const patch: Record<string, unknown> = {};
    if (bulkPrice.trim() !== '') {
      const n = Number(bulkPrice);
      if (!Number.isFinite(n) || n < 0) {
        toast.error('价格无效（美分）');
        return;
      }
      patch.price_cents = Math.round(n);
    }
    if (bulkCategory.trim()) patch.category = bulkCategory.trim();
    if (Object.keys(patch).length === 0 && !bulkDescSuffix.trim()) {
      toast.error('请填写批量价格、分类或描述后缀');
      return;
    }
    setBatchBusy(true);
    try {
      const bodyItems = selectedItems.map((it) => {
        const row: Record<string, unknown> = {
          id: it.id,
          collection: it.collection,
          ...patch,
        };
        if (bulkDescSuffix.trim()) {
          row.description = `${it.description || ''}${bulkDescSuffix}`.trim();
        }
        return row;
      });
      const res = await authedFetch('/api/admin/shop', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: bodyItems }),
      });
      const data = await readResponseJson<{ error?: string; updated?: number }>(res);
      if (!res.ok) throw new Error(data.error || '批量更新失败');
      toast.success(`已更新 ${data.updated ?? selectedItems.length} 项`);
      setBulkPrice('');
      setBulkCategory('');
      setBulkDescSuffix('');
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '批量更新失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const runBulkDelete = async () => {
    if (selectedItems.length === 0) {
      toast.error('请先勾选商品');
      return;
    }
    if (!window.confirm(`确认删除选中的 ${selectedItems.length} 个商品？`)) return;
    setBatchBusy(true);
    try {
      const byCol: Record<Collection, string[]> = { outfit: [], prop: [] };
      for (const it of selectedItems) byCol[it.collection].push(it.id);
      for (const col of ['outfit', 'prop'] as Collection[]) {
        if (byCol[col].length === 0) continue;
        const res = await authedFetch(
          `/api/admin/shop?collection=${col}&ids=${encodeURIComponent(byCol[col].join(','))}`,
          { method: 'DELETE' },
        );
        const data = await readResponseJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error || '批量删除失败');
      }
      toast.success('已批量删除');
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '批量删除失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const parseBatchLines = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    return lines.map((line, idx) => {
      const parts = line.split('|').map((p) => p.trim());
      const [name, description = '', priceRaw = '0', category = '', tier = 'free'] = parts;
      if (!name) throw new Error(`第 ${idx + 1} 行缺少名称`);
      const price_cents = Math.round(Number(priceRaw) || 0);
      return {
        collection: batchCollection,
        name,
        description,
        price_cents,
        category: category || (batchCollection === 'outfit' ? 'everyday' : 'gift'),
        tier: tier || 'free',
        active: true,
        intimacy_boost: 0,
        emoji: '',
        item_type: 'intimacy_boost',
      };
    });
  };

  const handleBatchImport = async () => {
    let parsed: ReturnType<typeof parseBatchLines>;
    try {
      parsed = parseBatchLines(batchText);
    } catch (err) {
      toast.error(errorMessageFromUnknown(err));
      return;
    }
    if (parsed.length === 0) {
      toast.error('没有可导入的行');
      return;
    }
    setBatchBusy(true);
    try {
      const files = batchFilesRef.current?.files;
      const fd = new FormData();
      fd.append('items', JSON.stringify(parsed));
      if (files && files.length > 0) {
        Array.from(files).forEach((file, i) => {
          fd.append(`file_${i}`, file);
        });
      }
      const res = await authedFetch('/api/admin/shop', { method: 'POST', body: fd });
      const data = await readResponseJson<{ error?: string; created?: number }>(res);
      if (!res.ok) throw new Error(data.error || '批量导入失败');
      toast.success(`已导入 ${data.created ?? parsed.length} 项`);
      setImportOpen(false);
      setBatchText('');
      if (batchFilesRef.current) batchFilesRef.current.value = '';
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '批量导入失败');
    } finally {
      setBatchBusy(false);
    }
  };

  const uploadRowImage = async (file: File, item: ShopRow) => {
    setBatchBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', item.collection === 'outfit' ? 'outfit' : 'shop_item');
      fd.append('id', item.id);
      if (item.collection === 'outfit') fd.append('field', 'preview_url');
      else fd.append('field', 'image_url');
      const res = await authedFetch('/api/admin/images/upload', { method: 'POST', body: fd });
      const data = await readResponseJson<{ error?: string; url?: string }>(res);
      if (!res.ok) throw new Error(data.error || '图片上传失败');
      toast.success('图片已更新');
      await fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error(errorMessageFromUnknown(err) || '图片上传失败');
    } finally {
      setBatchBusy(false);
      setImageTarget(null);
      if (rowImageRef.current) rowImageRef.current.value = '';
    }
  };

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>(categories);
    for (const it of items) if (it.category) set.add(it.category);
    return Array.from(set).sort();
  }, [categories, items]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <ShoppingBag className="h-6 w-6 text-rose-400" />
            商城管理
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            服装 + 道具统一管理：批量改价、分类、导入、删改与配图
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchItems()} disabled={loading || batchBusy}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" />
            批量导入
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 h-4 w-4" />
            新建
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? 'default' : 'outline'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <Badge variant="secondary" className="ml-2">
              {t.key === 'all' ? counts.all : t.key === 'outfit' ? counts.outfit : counts.prop}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-9"
            placeholder="搜索名称 / 描述 / 分类"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fetchItems();
            }}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {uniqueCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={() => void fetchItems()} disabled={loading}>
          筛选
        </Button>
      </div>

      <Card className="border-white/10 bg-zinc-950/60">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            <Tags className="h-4 w-4 text-rose-300" />
            批量操作（已选 {selectedKeys.length}）
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={toggleAllVisible} disabled={items.length === 0}>
              {items.length > 0 && items.every((it) => selected[rowKey(it)]) ? (
                <CheckSquare className="mr-1 h-4 w-4" />
              ) : (
                <Square className="mr-1 h-4 w-4" />
              )}
              全选本页
            </Button>
            <Input
              className="w-36"
              placeholder="批量价格(美分)"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
            />
            <Input
              className="w-36"
              placeholder="批量分类"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
            <Input
              className="min-w-[180px] flex-1"
              placeholder="描述后缀（追加）"
              value={bulkDescSuffix}
              onChange={(e) => setBulkDescSuffix(e.target.value)}
            />
            <Button size="sm" onClick={() => void runBulkPatch()} disabled={batchBusy || selectedKeys.length === 0}>
              {batchBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              批量改价/分类
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void runBulkDelete()}
              disabled={batchBusy || selectedKeys.length === 0}
            >
              批量删除
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 py-16 text-center text-zinc-500">
          暂无商品，点击「新建」或「批量导入」
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const checked = !!selected[rowKey(item)];
            return (
              <Card key={rowKey(item)} className="relative overflow-hidden border-white/10 bg-zinc-950/70">
                <button
                  type="button"
                  className="absolute left-2 top-2 z-10 rounded-md bg-black/55 p-1 text-white"
                  onClick={() => toggleOne(item)}
                  aria-label="选择"
                >
                  {checked ? <CheckSquare className="h-4 w-4 text-rose-300" /> : <Square className="h-4 w-4" />}
                </button>
                <div className="aspect-[4/3] bg-zinc-900">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl text-zinc-600">
                      {item.emoji || '•'}
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-white">{item.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline">{item.collection === 'outfit' ? '服装' : '道具'}</Badge>
                        <Badge variant="secondary">{item.category || '未分类'}</Badge>
                        <Badge>{item.tier || 'free'}</Badge>
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold text-rose-300">{money(item.price_cents)}</div>
                  </div>
                  <p className="line-clamp-2 text-xs text-zinc-400">{item.description || '暂无说明'}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setImageTarget(item);
                        rowImageRef.current?.click();
                      }}
                      disabled={batchBusy}
                    >
                      <ImagePlus className="mr-1 h-3.5 w-3.5" />
                      配图
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setDeleting(item);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <input
        ref={rowImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && imageTarget) void uploadRowImage(file, imageTarget);
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑商品' : '新建商品'}</DialogTitle>
            <DialogDescription>服装写入 outfits，道具写入 shop_items。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>类型</Label>
              <Select
                value={form.collection}
                onValueChange={(v) => setForm((f) => ({ ...f, collection: v as Collection }))}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outfit">服装</SelectItem>
                  <SelectItem value="prop">道具</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>价格（美分）</Label>
                <Input
                  type="number"
                  value={form.price_cents}
                  onChange={(e) => setForm((f) => ({ ...f, price_cents: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>分类</Label>
                <Input
                  list="shop-cat-list"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
                <datalist id="shop-cat-list">
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>套餐层级</Label>
                <Select value={form.tier} onValueChange={(v) => setForm((f) => ({ ...f, tier: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Emoji</Label>
                <Input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>说明</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>亲密加成</Label>
                <Input
                  type="number"
                  value={form.intimacy_boost}
                  onChange={(e) => setForm((f) => ({ ...f, intimacy_boost: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            {form.collection === 'prop' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label>item_type</Label>
                  <Input
                    value={form.item_type}
                    onChange={(e) => setForm((f) => ({ ...f, item_type: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>visual_type</Label>
                  <Input
                    value={form.visual_type}
                    onChange={(e) => setForm((f) => ({ ...f, visual_type: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <span className="text-sm text-zinc-300">上架 / 启用</span>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
            {form.collection === 'outfit' && (
              <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                <span className="text-sm text-zinc-300">可作为礼物</span>
                <Switch checked={form.is_gift} onCheckedChange={(v) => setForm((f) => ({ ...f, is_gift: v }))} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <span className="text-sm text-zinc-300">限时</span>
              <Switch checked={form.is_limited} onCheckedChange={(v) => setForm((f) => ({ ...f, is_limited: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              将删除 {deleting?.name}（{deleting?.collection === 'outfit' ? '服装' : '道具'}）。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>批量导入</DialogTitle>
            <DialogDescription>
              每行一条：名称|说明|价格美分|分类|tier。可附带同序图片 file_0, file_1…
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>导入到</Label>
              <Select value={batchCollection} onValueChange={(v) => setBatchCollection(v as Collection)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prop">道具 shop_items</SelectItem>
                  <SelectItem value="outfit">服装 outfits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={8}
              placeholder={'玫瑰花|浪漫礼物|199|gift|free\n丝质睡裙|居家服装|499|lingerie|pro'}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            <div className="grid gap-1">
              <Label>可选：批量配图（顺序对应行）</Label>
              <Input ref={batchFilesRef} type="file" accept="image/*" multiple />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleBatchImport()} disabled={batchBusy}>
              {batchBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              开始导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
