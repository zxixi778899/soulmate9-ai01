'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
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
import { Loader2, Plus, Pencil, Trash2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type ShopItem = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price_cents: number;
  tier: string;
  category: string;
  visual_type: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

const defaultForm = {
  name: '',
  emoji: '',
  description: '',
  price_cents: 0,
  tier: 'free',
  category: 'appearance',
  visual_type: '',
  sort_order: 0,
  active: true,
};

export default function AdminShopPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/shop');
      const data = await res.json();
      if (data.items) setItems(data.items);
      else if (Array.isArray(data)) setItems(data);
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: ShopItem) => {
    setForm({
      name: item.name,
      emoji: item.emoji,
      description: item.description,
      price_cents: item.price_cents,
      tier: item.tier,
      category: item.category,
      visual_type: item.visual_type,
      sort_order: item.sort_order,
      active: item.active,
    });
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = !!editingId;
      const body: Record<string, unknown> = { ...form };
      if (isEdit) body.id = editingId;

      const res = await authedFetch('/api/admin/shop', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(isEdit ? '' : '');
      setDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/admin/shop?id=${deletingId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('');
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchItems();
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getTierBadge = (tier: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      unlimited: 'default',
      pro: 'secondary',
      free: 'outline',
    };
    return variants[tier] || 'outline';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold"></h1>
          <p className="text-sm text-[#8B8BA3] mt-1"></p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          
        </Button>
      </div>

      <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
              <ShoppingBag className="h-12 w-12 mb-2 opacity-30" />
              <p></p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-1" />
                
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-2xl">{item.emoji || ''}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-sm">{formatPrice(item.price_cents)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getTierBadge(item.tier)} className="text-[10px] capitalize">
                          {item.tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3] capitalize">{item.category}</td>
                      <td className="px-4 py-3">
                        <div className={`h-2 w-2 rounded-full ${item.active ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => openDeleteDialog(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '' : ''}</DialogTitle>
            <DialogDescription>
              {editingId ? '' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop-name"></Label>
                <Input id="shop-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-emoji">Emoji</Label>
                <Input id="shop-emoji" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop-desc"></Label>
              <Textarea id="shop-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop-price"></Label>
                <Input id="shop-price" type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-sort"></Label>
                <Input id="shop-sort" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop-tier"></Label>
                <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                  <SelectTrigger id="shop-tier">
                    <SelectValue placeholder="" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free"></SelectItem>
                    <SelectItem value="pro"></SelectItem>
                    <SelectItem value="unlimited"></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-category"></Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="shop-category">
                    <SelectValue placeholder="" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="appearance"></SelectItem>
                    <SelectItem value="personality"></SelectItem>
                    <SelectItem value="interaction"></SelectItem>
                    <SelectItem value="special"></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop-visual"></Label>
              <Input id="shop-visual" value={form.visual_type} onChange={(e) => setForm({ ...form, visual_type: e.target.value })} placeholder="..." />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} id="shop-active" />
              <Label htmlFor="shop-active"></Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}></Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? '' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle></DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingId(null); }}></Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}