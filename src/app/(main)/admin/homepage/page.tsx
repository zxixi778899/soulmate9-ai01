'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Eye, EyeOff, GripVertical, ChevronDown, ChevronUp,
  Globe, Plus, Trash2, Save, Layers, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type SiteModule = {
  id: string;
  module_key: string;
  display_name: string;
  is_visible: boolean;
  sort_order: number;
  config: Record<string, unknown>;
  page_path: string;
  section_type: string;
  parent_id: string | null;
  updated_at: string;
};

const PAGE_LABELS: Record<string, string> = {
  '/': '🏠 落地页',
  '/gallery': '💃 女友展馆',
  '/chat': '💬 聊天室',
  '/create': '✨ 创建女友',
  '/pricing': '💰 定价页',
  '/profile': '👤 个人中心',
  '/shop': '🛍️ 商城',
  '/login': '🔑 登录页',
  '/register': '📝 注册页',
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  navigation: { label: '导航', color: 'bg-blue-500/10 text-blue-600' },
  component: { label: '组件', color: 'bg-emerald-500/10 text-emerald-600' },
  content: { label: '内容', color: 'bg-violet-500/10 text-violet-600' },
  form: { label: '表单', color: 'bg-amber-500/10 text-amber-600' },
};

export default function AdminSiteManagementPage() {
  const [modules, setModules] = useState<SiteModule[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [newModule, setNewModule] = useState({
    module_key: '', display_name: '', page_path: '/', section_type: 'component',
  });

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedPage === 'all'
        ? '/api/admin/homepage'
        : `/api/admin/homepage?page=${encodeURIComponent(selectedPage)}`;
      const res = await authedFetch(url);
      const data = await res.json();
      setModules(data.modules || []);
      if (data.pages) setPages(data.pages);
    } catch (err) {
      logger.error(String(err));
      toast.error('加载模块失败');
    } finally {
      setLoading(false);
    }
  }, [selectedPage]);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  const toggleVisibility = async (mod: SiteModule) => {
    setSavingId(mod.id);
    try {
      await authedFetch('/api/admin/homepage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, is_visible: !mod.is_visible }),
      });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_visible: !m.is_visible } : m));
      toast.success(`${mod.display_name} 已${!mod.is_visible ? '显示' : '隐藏'}`);
    } catch { toast.error('操作失败'); }
    finally { setSavingId(null); }
  };

  const moveModule = async (mod: SiteModule, direction: 'up' | 'down') => {
    const samePage = modules.filter(m => m.page_path === mod.page_path);
    const idx = samePage.findIndex(m => m.id === mod.id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === samePage.length - 1)) return;
    const swap = samePage[direction === 'up' ? idx - 1 : idx + 1];
    setSavingId(mod.id);
    try {
      await Promise.all([
        authedFetch('/api/admin/homepage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mod.id, sort_order: swap.sort_order }),
        }),
        authedFetch('/api/admin/homepage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: swap.id, sort_order: mod.sort_order }),
        }),
      ]);
      fetchModules();
    } catch { toast.error('排序失败'); }
    finally { setSavingId(null); }
  };

  const deleteModule = async (mod: SiteModule) => {
    if (!confirm(`确定删除「${mod.display_name}」？`)) return;
    setSavingId(mod.id);
    try {
      await authedFetch(`/api/admin/homepage?id=${mod.id}`, { method: 'DELETE' });
      setModules(prev => prev.filter(m => m.id !== mod.id));
      toast.success('模块已删除');
    } catch { toast.error('删除失败'); }
    finally { setSavingId(null); }
  };

  const addModule = async () => {
    if (!newModule.module_key || !newModule.display_name) {
      toast.error('请填写模块标识和显示名称'); return;
    }
    try {
      const res = await authedFetch('/api/admin/homepage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModule),
      });
      if (!res.ok) throw new Error('创建失败');
      toast.success('模块已添加');
      setAddDialog(false);
      setNewModule({ module_key: '', display_name: '', page_path: '/', section_type: 'component' });
      fetchModules();
    } catch (err) { toast.error(err instanceof Error ? err.message : '添加失败'); }
  };

  const updateConfig = async (mod: SiteModule, key: string, value: string) => {
    const cfg = { ...mod.config, [key]: value };
    setSavingId(mod.id);
    try {
      await authedFetch('/api/admin/homepage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, config: cfg }),
      });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, config: cfg } : m));
      toast.success('配置已保存');
    } catch { toast.error('保存失败'); }
    finally { setSavingId(null); }
  };

  const grouped = modules.reduce((acc, mod) => {
    const p = mod.page_path || '/';
    if (!acc[p]) acc[p] = [];
    acc[p].push(mod);
    return acc;
  }, {} as Record<string, SiteModule[]>);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" /></div>;
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Globe className="h-6 w-6 text-[#2563EB]" /> 全站管理
          </h1>
          <p className="text-sm text-[#64748B] mt-1">管理所有页面的模块显示、排序和配置</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedPage} onValueChange={setSelectedPage}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="选择页面" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📋 全部页面</SelectItem>
              {pages.map(p => <SelectItem key={p} value={p}>{PAGE_LABELS[p] || p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setAddDialog(true)} size="sm" className="gap-1.5 bg-[#2563EB] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4" /> 添加模块
          </Button>
        </div>
      </div>

      {Object.entries(grouped).map(([pagePath, pageModules]) => (
        <div key={pagePath} className="mb-8">
          <h2 className="text-lg font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#2563EB]" />
            {PAGE_LABELS[pagePath] || pagePath}
            <Badge variant="outline" className="text-[10px] font-mono">{pagePath}</Badge>
            <span className="text-xs text-[#94A3B8]">({pageModules.length} 个模块)</span>
          </h2>
          <div className="space-y-2">
            {pageModules.map((mod, idx) => {
              const typeInfo = TYPE_LABELS[mod.section_type] || { label: mod.section_type, color: 'bg-gray-500/10 text-gray-600' };
              return (
                <Card key={mod.id} className={`border-[#E2E8F0] bg-white ${!mod.is_visible ? 'opacity-50' : ''}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveModule(mod, 'up')} disabled={idx === 0}
                          className="p-0.5 text-[#94A3B8] hover:text-[#2563EB] disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <GripVertical className="h-3.5 w-3.5 text-[#CBD5E1]" />
                        <button onClick={() => moveModule(mod, 'down')} disabled={idx === pageModules.length - 1}
                          className="p-0.5 text-[#94A3B8] hover:text-[#2563EB] disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1E293B]">{mod.display_name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">{mod.module_key}</Badge>
                          <Badge className={`text-[10px] ${typeInfo.color}`}>{typeInfo.label}</Badge>
                          <Badge className={`text-[10px] ${mod.is_visible ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}>
                            {mod.is_visible ? '显示中' : '已隐藏'}
                          </Badge>
                          {mod.parent_id && <Badge className="text-[10px] bg-orange-500/10 text-orange-600"><Layers className="h-2.5 w-2.5 inline mr-0.5" />子模块</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2"
                          onClick={() => setEditingConfig(editingConfig === mod.id ? null : mod.id)}>配置</Button>
                        <Button variant={mod.is_visible ? 'outline' : 'default'} size="sm" className="h-7 text-xs px-2 gap-1"
                          onClick={() => toggleVisibility(mod)} disabled={savingId === mod.id}>
                          {mod.is_visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {mod.is_visible ? '隐藏' : '显示'}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteModule(mod)} disabled={savingId === mod.id}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    {editingConfig === mod.id && (
                      <div className="mt-3 pt-3 border-t border-[#E2E8F0] space-y-2">
                        <h4 className="text-xs font-medium text-[#64748B]">模块配置</h4>
                        {Object.entries(mod.config).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <Label className="text-xs text-[#64748B] w-28 shrink-0 font-mono">{key}</Label>
                            <Input className="flex-1 text-sm h-7" value={String(value)}
                              onChange={e => setModules(prev => prev.map(m => m.id === mod.id ? { ...m, config: { ...m.config, [key]: e.target.value } } : m))}
                              onBlur={() => updateConfig(mod, key, String(mod.config[key]))} />
                          </div>
                        ))}
                        {Object.keys(mod.config).length === 0 && <p className="text-xs text-[#94A3B8]">此模块暂无配置</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16"><Globe className="h-12 w-12 text-[#CBD5E1] mx-auto mb-3" /><p className="text-sm text-[#94A3B8]">暂无模块</p></div>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="sm:max-w-md bg-white border-[#E2E8F0]">
          <DialogHeader><DialogTitle className="text-[#1E293B]">添加新模块</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-[#64748B]">所属页面 *</Label>
              <Select value={newModule.page_path} onValueChange={v => setNewModule(p => ({ ...p, page_path: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAGE_LABELS).map(([path, label]) => <SelectItem key={path} value={path}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-[#64748B]">模块标识 *</Label>
                <Input className="mt-1 font-mono text-sm" placeholder="如: hero_banner"
                  value={newModule.module_key} onChange={e => setNewModule(p => ({ ...p, module_key: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-[#64748B]">显示名称 *</Label>
                <Input className="mt-1" placeholder="如: 英雄横幅"
                  value={newModule.display_name} onChange={e => setNewModule(p => ({ ...p, display_name: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-[#64748B]">模块类型</Label>
              <Select value={newModule.section_type} onValueChange={v => setNewModule(p => ({ ...p, section_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="navigation">导航</SelectItem>
                  <SelectItem value="component">组件</SelectItem>
                  <SelectItem value="content">内容</SelectItem>
                  <SelectItem value="form">表单</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>取消</Button>
            <Button onClick={addModule} className="gap-2 bg-[#2563EB] hover:bg-[#1d4ed8]"><Save className="h-4 w-4" /> 添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
