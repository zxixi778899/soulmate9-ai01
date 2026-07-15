'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Loader2, Menu,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

type NavItem = {
  id: string;
  label: string;
  url: string;
  sort_order: number;
  parent_id: string | null;
  is_visible: boolean;
};

export default function AdminNavigation() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<NavItem | null>(null);
  const [form, setForm] = useState({ label: '', url: '', parent_id: '' });

  const fetchItems = async () => {
    try {
      const res = await authedFetch('/api/admin/navigation');
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      toast.error('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleSave = async () => {
    if (!form.label || !form.url) { toast.error(''); return; }
    try {
      const body: Record<string, unknown> = editItem ? { id: editItem.id, ...form } : form;
      if (body.parent_id === '') body.parent_id = null;
      const res = await authedFetch('/api/admin/navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error(''); return; }
      toast.success(editItem ? '' : '');
      setShowDialog(false);
      setEditItem(null);
      setForm({ label: '', url: '', parent_id: '' });
      fetchItems();
    } catch (e) { toast.error(''); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('')) return;
    await authedFetch('/api/admin/navigation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    toast.success('');
    fetchItems();
  };

  const moveItem = async (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    [newItems[index], newItems[swapIdx]] = [newItems[swapIdx], newItems[index]];
    newItems.forEach((m, i) => m.sort_order = i);
    setItems(newItems);
    await authedFetch('/api/admin/navigation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', items: newItems.map(m => ({ id: m.id, sort_order: m.sort_order })) }),
    });
  };

  const toggleVisibility = async (item: NavItem) => {
    await authedFetch('/api/admin/navigation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_visible: !item.is_visible }),
    });
    fetchItems();
  };

  if (loading) return (
    <>
    <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
      导航配置已与 <Link className="underline font-medium" href="/admin/pages">页面/导航</Link> 合并入口（侧栏仅保留一处）。本页仍可直接编辑导航项。
    </div>

    <div className="flex h-full items-center justify-center p-6">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold"></h1>
          <p className="text-sm text-[#8B8BA3] mt-1"></p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditItem(null); setForm({ label: '', url: '', parent_id: '' }); }}>
              <Plus className="h-4 w-4 mr-2" /> 
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editItem ? '' : ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block"></label>
                <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block"></label>
                <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="/" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block"></label>
                <Select value={form.parent_id} onValueChange={v => setForm({ ...form, parent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=""></SelectItem>
                    {items.filter(i => !i.parent_id).map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDialog(false)}></Button>
                <Button onClick={handleSave}></Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="border-white/[0.05] bg-card/40">
          <CardContent className="p-12 text-center">
            <Menu className="h-12 w-12 mx-auto text-[#8B8BA3] mb-3" />
            <p className="text-[#8B8BA3]"></p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-white/[0.05] bg-card/40">
          <CardHeader><CardTitle></CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className={`flex items-center justify-between rounded-lg border border-border/20 p-3 ${!item.is_visible ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === 0} onClick={() => moveItem(index, 'up')}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === items.length - 1} onClick={() => moveItem(index, 'down')}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-[#8B8BA3]">{item.url}</p>
                    </div>
                    {item.parent_id && <Badge variant="outline" className="text-[10px]"></Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => toggleVisibility(item)}>
                      {item.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditItem(item);
                      setForm({ label: item.label, url: item.url, parent_id: item.parent_id || '' });
                      setShowDialog(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}
