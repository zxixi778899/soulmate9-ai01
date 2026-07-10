'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

type Featured = {
  id: string;
  name: string;
  subtitle?: string | null;
  personality_tags?: string[] | string;
  avatar_url: string;
  description?: string | null;
  greeting_message?: string | null;
  sort_order?: number;
  is_active?: boolean;
  quick_chat_enabled?: boolean;
  click_count?: number;
};

const empty = {
  name: '',
  subtitle: '',
  personality_tags: '',
  avatar_url: '',
  description: '',
  greeting_message: '',
  sort_order: '0',
  is_active: true,
  quick_chat_enabled: true,
};

export default function AdminFeaturedPage() {
  const [items, setItems] = useState<Featured[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Featured | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/featured');
      const data = await res.json();
      setItems(data.items || []);
      if (data.warning) toast.message('提示', { description: data.warning });
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (item: Featured) => {
    setEditing(item);
    const tags = Array.isArray(item.personality_tags)
      ? item.personality_tags.join(', ')
      : String(item.personality_tags || '');
    setForm({
      name: item.name,
      subtitle: item.subtitle || '',
      personality_tags: tags,
      avatar_url: item.avatar_url,
      description: item.description || '',
      greeting_message: item.greeting_message || '',
      sort_order: String(item.sort_order || 0),
      is_active: item.is_active !== false,
      quick_chat_enabled: item.quick_chat_enabled !== false,
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        subtitle: form.subtitle,
        personality_tags: form.personality_tags,
        avatar_url: form.avatar_url.trim(),
        description: form.description,
        greeting_message: form.greeting_message,
        sort_order: Number(form.sort_order),
        is_active: form.is_active,
        quick_chat_enabled: form.quick_chat_enabled,
      };
      const res = await authedFetch('/api/admin/featured', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success('已保存');
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除该推荐角色？')) return;
    const res = await authedFetch(`/api/admin/featured?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('已删除');
      void load();
    } else toast.error('删除失败');
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500" /> 推荐 / 热门角色
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            管理首页与卡池展示的推荐角色（featured_girlfriends）
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 bg-[#2563EB]">
          <Plus className="h-4 w-4" /> 添加推荐
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-2 border-[#E2E8F0]">
          <CardContent className="py-16 text-center text-[#94A3B8] text-sm">
            暂无推荐角色。请先确保数据库已迁移 featured_girlfriends 表，然后添加。
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="border-[#E2E8F0] overflow-hidden">
              <div className="aspect-[16/10] bg-[#F1F5F9] relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.avatar_url} alt={item.name} className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute top-2 right-2">
                  <Badge className="text-[10px]">{item.is_active ? '展示中' : '已隐藏'}</Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="font-semibold text-[#1E293B]">{item.name}</div>
                <div className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{item.subtitle || item.description}</div>
                <div className="text-[10px] text-[#94A3B8] mt-2">
                  排序 {item.sort_order ?? 0} · 点击 {item.click_count ?? 0}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => void remove(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑推荐' : '添加推荐角色'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>名称 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>副标题 / 一句话人设</Label>
              <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </div>
            <div>
              <Label>头像 / 立绘 URL *</Label>
              <Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>性格标签（逗号分隔）</Label>
              <Input value={form.personality_tags} onChange={(e) => setForm({ ...form, personality_tags: e.target.value })} placeholder="romantic, playful" />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>开场白</Label>
              <Textarea value={form.greeting_message} onChange={(e) => setForm({ ...form, greeting_message: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>排序（越小越靠前）</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>启用展示</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>允许快速聊天</Label>
              <Switch checked={form.quick_chat_enabled} onCheckedChange={(v) => setForm({ ...form, quick_chat_enabled: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving || !form.name || !form.avatar_url}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
