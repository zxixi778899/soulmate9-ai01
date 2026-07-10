'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Coins, Star } from 'lucide-react';
import { toast } from 'sonner';

type TokenPkg = {
  id: string;
  name: string;
  token_count: number;
  price_cents: number;
  discount_percent?: number;
  description?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
  bonus_tokens?: number;
};

const emptyForm = {
  name: '',
  token_count: '100',
  price_cents: '499',
  discount_percent: '0',
  description: '',
  is_featured: false,
  is_active: true,
  sort_order: '0',
};

export default function AdminTokensPage() {
  const [packages, setPackages] = useState<TokenPkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TokenPkg | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/tokens');
      const data = await res.json();
      setPackages(data.packages || []);
      setSource(data.source || '');
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: TokenPkg) => {
    setEditing(p);
    setForm({
      name: p.name,
      token_count: String(p.token_count),
      price_cents: String(p.price_cents),
      discount_percent: String(p.discount_percent || 0),
      description: p.description || '',
      is_featured: Boolean(p.is_featured),
      is_active: p.is_active !== false,
      sort_order: String(p.sort_order || 0),
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        token_count: Number(form.token_count),
        price_cents: Number(form.price_cents),
        discount_percent: Number(form.discount_percent),
        description: form.description,
        is_featured: form.is_featured,
        is_active: form.is_active,
        sort_order: Number(form.sort_order),
      };
      const res = await authedFetch('/api/admin/tokens', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success(editing ? '已更新' : '已创建');
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: TokenPkg) => {
    const res = await authedFetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    });
    if (res.ok) {
      toast.success(p.is_active ? '已下架' : '已上架');
      void load();
    } else toast.error('操作失败');
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Coins className="h-6 w-6 text-amber-500" /> 代币套餐
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            管理 Stripe 充值档位 · 数据源: {source || '—'}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-[#2563EB]">
          <Plus className="h-4 w-4" /> 新建套餐
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((p) => (
            <Card key={p.id} className="border-[#E2E8F0] bg-white">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-[#1E293B] flex items-center gap-1.5">
                      {p.name}
                      {p.is_featured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                    </div>
                    <div className="text-xs text-[#94A3B8] mt-0.5 font-mono">{p.id}</div>
                  </div>
                  <Badge variant={p.is_active ? 'default' : 'outline'} className="text-[10px]">
                    {p.is_active ? '上架' : '下架'}
                  </Badge>
                </div>
                <div className="text-3xl font-bold text-amber-600">{p.token_count}</div>
                <div className="text-xs text-[#64748B] mb-2">tokens</div>
                <div className="text-lg font-semibold text-[#1E293B]">
                  ${(p.price_cents / 100).toFixed(2)}
                  {!!p.discount_percent && (
                    <span className="ml-2 text-xs text-emerald-600">-{p.discount_percent}%</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-[#94A3B8] mt-2 line-clamp-2">{p.description}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleActive(p)}>
                    {p.is_active ? '下架' : '上架'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑套餐' : '新建套餐'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>代币数量</Label>
                <Input type="number" value={form.token_count} onChange={(e) => setForm({ ...form, token_count: e.target.value })} />
              </div>
              <div>
                <Label>价格（美分）</Label>
                <Input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>折扣 %</Label>
                <Input type="number" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} />
              </div>
              <div>
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>描述</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>推荐标签</Label>
              <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>上架</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving || !form.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
