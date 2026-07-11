'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { Loader2, Plus, Pencil, Trash2, Star, Search, Link2, RefreshCw } from 'lucide-react';
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
  base_girlfriend_id?: string | null;
};

type PublicGf = {
  id: string;
  name: string;
  age?: number;
  tags?: string[] | string | null;
  short_description?: string | null;
  personality?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
  review_status?: string;
  is_public?: boolean;
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
  base_girlfriend_id: '',
};

function tagsToString(tags: PublicGf['tags']): string {
  if (Array.isArray(tags)) return tags.map(String).join(', ');
  return String(tags || '');
}

export default function AdminFeaturedPage() {
  const [items, setItems] = useState<Featured[]>([]);
  const [pool, setPool] = useState<PublicGf[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolLoading, setPoolLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Featured | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [poolQ, setPoolQ] = useState('');

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

  const loadPool = async () => {
    setPoolLoading(true);
    try {
      // Real approved/public companions from admin girlfriends API
      const res = await authedFetch('/api/admin/girlfriends?limit=200');
      const data = await res.json().catch(() => ({}));
      let list = (data.girlfriends || data.items || []) as PublicGf[];
      if (!list.length) {
        // public catalog fallback
        const pub = await fetch('/api/v2/girlfriends/featured?limit=60').then((r) => r.json()).catch(() => ({}));
        list = (pub.girlfriends || pub.featured_girlfriends || []) as PublicGf[];
      }
      // Prefer approved/public
      list = list.filter((g) => {
        if (g.review_status && g.review_status !== 'approved' && g.is_public === false) return false;
        return Boolean(g.id && g.name);
      });
      setPool(list);
    } catch {
      toast.error('角色库加载失败');
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadPool();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) =>
      [it.name, it.subtitle, it.description].filter(Boolean).join(' ').toLowerCase().includes(s),
    );
  }, [items, q]);

  const poolFiltered = useMemo(() => {
    const s = poolQ.trim().toLowerCase();
    if (!s) return pool.slice(0, 40);
    return pool
      .filter((g) => [g.name, g.short_description, tagsToString(g.tags)].join(' ').toLowerCase().includes(s))
      .slice(0, 40);
  }, [pool, poolQ]);

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
      base_girlfriend_id: item.base_girlfriend_id || '',
    });
    setOpen(true);
  };

  const pickFromPool = (g: PublicGf) => {
    const avatar = g.portrait_url || g.avatar_url || '';
    setForm((f) => ({
      ...f,
      name: g.name || f.name,
      subtitle: g.short_description || f.subtitle,
      personality_tags: tagsToString(g.tags) || f.personality_tags,
      avatar_url: avatar || f.avatar_url,
      description: g.personality || g.short_description || f.description,
      base_girlfriend_id: g.id,
    }));
    toast.success(`已关联真实角色：${g.name}`);
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
        base_girlfriend_id: form.base_girlfriend_id || null,
      };
      if (!payload.name || !payload.avatar_url) {
        throw new Error('名称与头像必填（可从真实角色库一键填充）');
      }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500" /> 推荐 / 热门角色
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            从真实已审核角色库挑选，写入 featured_girlfriends（支持关联 base_girlfriend_id）
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { void load(); void loadPool(); }} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> 刷新
          </Button>
          <Button onClick={openCreate} className="gap-1.5 bg-[#2563EB]">
            <Plus className="h-4 w-4" /> 添加推荐
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索推荐角色…" className="pl-9" />
        </div>
        <Badge variant="secondary">{filtered.length} 条</Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            暂无推荐角色。点击「添加推荐」，从右侧真实角色库选择。
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const tags = Array.isArray(item.personality_tags)
              ? item.personality_tags
              : String(item.personality_tags || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
            return (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-[4/3] bg-slate-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.avatar_url} alt={item.name} className="h-full w-full object-cover" />
                  <div className="absolute top-2 left-2 flex gap-1">
                    {item.is_active === false ? (
                      <Badge className="bg-slate-700">已下架</Badge>
                    ) : (
                      <Badge className="bg-emerald-600">展示中</Badge>
                    )}
                    {item.base_girlfriend_id ? (
                      <Badge className="bg-blue-600 gap-1"><Link2 className="h-3 w-3" />已关联</Badge>
                    ) : null}
                  </div>
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#1E293B]">{item.name}</div>
                      <div className="text-xs text-slate-500 line-clamp-2">{item.subtitle}</div>
                    </div>
                    <div className="text-[10px] text-slate-400 shrink-0">#{item.sort_order ?? 0}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 4).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" /> 编辑
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600" onClick={() => void remove(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑推荐角色' : '添加推荐角色'}</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>副标题</Label>
                <Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>头像 URL *</Label>
                <Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>性格标签（逗号分隔）</Label>
                <Input value={form.personality_tags} onChange={(e) => setForm({ ...form, personality_tags: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>描述</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>开场白</Label>
                <Textarea rows={2} value={form.greeting_message} onChange={(e) => setForm({ ...form, greeting_message: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>排序</Label>
                  <Input value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>关联角色 ID</Label>
                  <Input value={form.base_girlfriend_id} onChange={(e) => setForm({ ...form, base_girlfriend_id: e.target.value })} placeholder="从右侧点选自动填充" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">启用展示</span>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">快捷聊天</span>
                <Switch checked={form.quick_chat_enabled} onCheckedChange={(v) => setForm({ ...form, quick_chat_enabled: v })} />
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-700">真实角色库</div>
                {poolLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Badge variant="secondary">{pool.length}</Badge>}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={poolQ} onChange={(e) => setPoolQ(e.target.value)} placeholder="搜索已有角色…" className="pl-8 h-9" />
              </div>
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {poolFiltered.map((g) => {
                  const img = g.portrait_url || g.avatar_url || '';
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => pickFromPool(g)}
                      className="w-full flex items-center gap-2 rounded-lg border bg-white p-2 text-left hover:border-blue-400 hover:shadow-sm transition"
                    >
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-slate-200 shrink-0">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{g.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{g.short_description || g.personality || g.id}</div>
                      </div>
                      <Plus className="h-4 w-4 text-blue-600 shrink-0" />
                    </button>
                  );
                })}
                {!poolLoading && poolFiltered.length === 0 && (
                  <p className="text-xs text-slate-500 py-6 text-center">没有匹配角色。请先在「女友管理」审核通过角色。</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving} className="bg-[#2563EB]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
