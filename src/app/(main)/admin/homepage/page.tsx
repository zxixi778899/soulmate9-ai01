'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, EyeOff, GripVertical, Save, ChevronDown, ChevronUp, Home } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type HomepageModule = {
  id: string;
  module_key: string;
  display_name: string;
  is_visible: boolean;
  sort_order: number;
  config: Record<string, unknown>;
  updated_at: string;
};

const MODULE_ICONS: Record<string, string> = {
  hero: '🎬', social_proof: '📊', how_it_works: '📋', features: '⚡',
  character_gallery: '💃', pricing: '💰', faq: '❓', final_cta: '🚀', footer: '📎',
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  hero: '落地页顶部英雄区域，包含角色展示和视差背景',
  social_proof: '用户数据、评分等社会证明信息',
  how_it_works: '三步使用流程说明',
  features: '功能特性展示网格',
  character_gallery: '角色画廊横向滚动卡片',
  pricing: '三档定价卡片（Free/Pro/Unlimited）',
  faq: '常见问题手风琴',
  final_cta: '底部行动号召区域',
  footer: '页脚链接和版权信息',
};

export default function AdminHomepagePage() {
  const [modules, setModules] = useState<HomepageModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/homepage');
      const data = await res.json();
      setModules(data.modules || []);
    } catch (err) {
      logger.error(String(err));
      toast.error('加载模块失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModules(); }, [fetchModules]);

  const toggleVisibility = async (mod: HomepageModule) => {
    setSavingId(mod.id);
    try {
      await authedFetch('/api/admin/homepage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, is_visible: !mod.is_visible }),
      });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_visible: !m.is_visible } : m));
      toast.success(`${mod.display_name} 已${!mod.is_visible ? '显示' : '隐藏'}`);
    } catch { toast.error('操作失败'); }
    finally { setSavingId(null); }
  };

  const moveModule = async (mod: HomepageModule, direction: 'up' | 'down') => {
    const idx = modules.findIndex(m => m.id === mod.id);
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === modules.length - 1)) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const swapMod = modules[swapIdx];

    setSavingId(mod.id);
    try {
      await Promise.all([
        authedFetch('/api/admin/homepage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mod.id, sort_order: swapMod.sort_order }),
        }),
        authedFetch('/api/admin/homepage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: swapMod.id, sort_order: mod.sort_order }),
        }),
      ]);
      const newModules = [...modules];
      [newModules[idx], newModules[swapIdx]] = [newModules[swapIdx], newModules[idx]];
      setModules(newModules);
    } catch { toast.error('排序失败'); }
    finally { setSavingId(null); }
  };

  const updateConfig = async (mod: HomepageModule, key: string, value: string) => {
    const newConfig = { ...mod.config, [key]: value };
    setSavingId(mod.id);
    try {
      await authedFetch('/api/admin/homepage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, config: newConfig }),
      });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, config: newConfig } : m));
      toast.success('配置已保存');
    } catch { toast.error('保存失败'); }
    finally { setSavingId(null); }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
          <Home className="h-6 w-6 text-[#2563EB]" />
          主页模块管理
        </h1>
        <p className="text-sm text-[#64748B] mt-1">控制落地页各模块的显示、排序和配置</p>
      </div>

      <div className="space-y-3">
        {modules.map((mod, idx) => (
          <Card key={mod.id} className={`border-[#E2E8F0] bg-white transition-all ${!mod.is_visible ? 'opacity-50' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Sort controls */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveModule(mod, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded text-[#94A3B8] hover:text-[#2563EB] disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <GripVertical className="h-4 w-4 text-[#CBD5E1]" />
                  <button
                    onClick={() => moveModule(mod, 'down')}
                    disabled={idx === modules.length - 1}
                    className="p-1 rounded text-[#94A3B8] hover:text-[#2563EB] disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Module icon + info */}
                <div className="text-2xl">{MODULE_ICONS[mod.module_key] || '📦'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#1E293B]">{mod.display_name}</h3>
                    <Badge variant="outline" className="text-[10px] font-mono">{mod.module_key}</Badge>
                    <Badge className={`text-[10px] ${mod.is_visible ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}>
                      {mod.is_visible ? '显示中' : '已隐藏'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-0.5">{MODULE_DESCRIPTIONS[mod.module_key] || ''}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingConfig(editingConfig === mod.id ? null : mod.id)}
                    className="text-xs"
                  >
                    配置
                  </Button>
                  <Button
                    variant={mod.is_visible ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => toggleVisibility(mod)}
                    disabled={savingId === mod.id}
                    className="text-xs gap-1"
                  >
                    {savingId === mod.id ? <Loader2 className="h-3 w-3 animate-spin" /> :
                      mod.is_visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {mod.is_visible ? '隐藏' : '显示'}
                  </Button>
                </div>
              </div>

              {/* Config editor */}
              {editingConfig === mod.id && (
                <div className="mt-4 pt-4 border-t border-[#E2E8F0]">
                  <h4 className="text-xs font-medium text-[#64748B] mb-3">模块配置 (JSON)</h4>
                  <div className="space-y-3">
                    {Object.entries(mod.config).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-3">
                        <Label className="text-xs text-[#64748B] w-32 shrink-0 font-mono">{key}</Label>
                        <Input
                          className="flex-1 text-sm h-8"
                          value={String(value)}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            setModules(prev => prev.map(m =>
                              m.id === mod.id ? { ...m, config: { ...m.config, [key]: newVal } } : m
                            ));
                          }}
                          onBlur={() => updateConfig(mod, key, String(mod.config[key]))}
                        />
                      </div>
                    ))}
                    {Object.keys(mod.config).length === 0 && (
                      <p className="text-xs text-[#94A3B8]">此模块暂无可配置项</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
