'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Loader2, Globe,
} from 'lucide-react';

type SitePage = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_published: boolean;
  layout: string;
  created_at: string;
};

export default function AdminPages() {
  const router = useRouter();
  const [pages, setPages] = useState<SitePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editPage, setEditPage] = useState<SitePage | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', description: '' });

  const fetchPages = async () => {
    try {
      const res = await authedFetch('/api/admin/pages');
      const data = await res.json();
      setPages(data.pages || []);
    } catch (e) {
      toast.error('加载页面列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPages(); }, []);

  const handleSave = async () => {
    if (!form.title || !form.slug) { toast.error('请填写页面标题和别名'); return; }
    try {
      const res = await authedFetch('/api/admin/pages', {
        method: editPage ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPage ? { id: editPage.id, ...form } : form),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || '保存失败'); return; }
      toast.success(editPage ? '页面已更新' : '页面已创建');
      setShowDialog(false);
      setEditPage(null);
      setForm({ title: '', slug: '', description: '' });
      fetchPages();
    } catch (e) { toast.error('保存失败'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此页面？所有模块将一同删除。')) return;
    try {
      const res = await authedFetch('/api/admin/pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { toast.error('删除失败'); return; }
      toast.success('页面已删除');
      fetchPages();
    } catch (e) { toast.error('删除失败'); }
  };

  const togglePublish = async (page: SitePage) => {
    try {
      const res = await authedFetch('/api/admin/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: page.id, is_published: !page.is_published }),
      });
      if (!res.ok) { toast.error('操作失败'); return; }
      toast.success(page.is_published ? '已下架' : '已发布');
      fetchPages();
    } catch (e) { toast.error('操作失败'); }
  };

  if (loading) return (
    <div className="flex h-full items-center justify-center p-6">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">页面管理</h1>
          <p className="text-sm text-[#8B8BA3] mt-1">创建和管理站点页面及模块</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button
              onClick={() => { setEditPage(null); setForm({ title: '', slug: '', description: '' }); }}
            >
              <Plus className="h-4 w-4 mr-2" /> 新建页面
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editPage ? '编辑页面' : '新建页面'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">页面标题</label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：关于我们" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">URL 别名 (slug)</label>
                <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="例如：about-us" />
                <p className="text-xs text-[#8B8BA3] mt-1">访问地址: /page/about-us</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">描述</label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
                <Button onClick={handleSave}>保存</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {pages.length === 0 ? (
        <Card className="border-white/[0.05] bg-card/40">
          <CardContent className="p-12 text-center">
            <Globe className="h-12 w-12 mx-auto text-[#8B8BA3] mb-3" />
            <p className="text-[#8B8BA3]">暂无页面，点击「新建页面」开始创建</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pages.map(page => (
            <Card key={page.id} className="border-white/[0.05] bg-card/40 backdrop-blur-sm hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{page.title}</h3>
                      <Badge variant={page.is_published ? 'default' : 'outline'} className="text-[10px]">
                        {page.is_published ? '已发布' : '草稿'}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#8B8BA3]">/{page.slug}</p>
                    {page.description && (
                      <p className="text-xs text-[#8B8BA3] mt-1 line-clamp-1">{page.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => togglePublish(page)} title={page.is_published ? '下架' : '发布'}>
                      {page.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditPage(page);
                      setForm({ title: page.title, slug: page.slug, description: page.description || '' });
                      setShowDialog(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => router.push(`/admin/pages/${page.id}`)}
                      title="编辑模块"
                    >
                      <Globe className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(page.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}