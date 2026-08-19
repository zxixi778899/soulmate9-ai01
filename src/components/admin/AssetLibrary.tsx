'use client';

/**
 * 资产图书馆 - 四大分类系统（服装/动作/场景/广告）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, Search, Shirt, Activity, Map, Sparkles, 
  Plus, ExternalLink, Grid, List, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AssetLibraryCategoryId, AssetLibraryCategoryRole } from '@/lib/asset-library-categories';
import { 
  ASSET_LIBRARY_CATEGORIES,
  LIBRARY_QUICK_ACTIONS 
} from '@/lib/asset-library-categories';

type Asset = {
  id?: string | null;
  url?: string;
  preview_url?: string;
  name?: string;
  created_at?: string;
  girlfriend_id?: string | null;
  kind?: string;
  storage_key?: string;
  meta?: { 
    asset_role?: string;
    library_role?: AssetLibraryCategoryRole;
    library_category?: AssetLibraryCategoryId;
    folder_id?: string;
  } | null;
};

export default function AssetLibrary() {
  const [activeCategory, setActiveCategory] = useState<AssetLibraryCategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssetLibraryCategoryRole | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  
  // 新文件夹模态框
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderCategory, setNewFolderCategory] = useState<AssetLibraryCategoryId>('outfit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const assetRes = await authedFetch('/api/admin/comfy?view=assets&limit=500');
      
      const assetData = await readResponseJson<{ assets?: Asset[]; error?: string }>(assetRes);
      
      if (!assetRes.ok) throw new Error(assetData.error || '加载资产失败');
      
      setAssets(assetData.assets || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // 分类筛选
      if (activeCategory !== 'all') {
        const assetCat = asset.meta?.library_category;
        if (assetCat !== activeCategory) return false;
      }
      
      // 角色类型筛选
      if (roleFilter !== 'all') {
        const assetRole = asset.meta?.library_role;
        if (assetRole !== roleFilter) return false;
      }
      
      // 搜索筛选
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          (asset.name || '').toLowerCase().includes(s) ||
          (asset.id || '').toLowerCase().includes(s)
        );
      }
      
      return true;
    });
  }, [assets, activeCategory, roleFilter, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('请输入文件夹名称');
      return;
    }
    
    try {
      const res = await authedFetch('/api/admin/assets/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName,
          category: newFolderCategory,
          description: `来自${ASSET_LIBRARY_CATEGORIES.find(c => c.id === newFolderCategory)?.label}的文件夹`,
        }),
      });
      
      const data = await readResponseJson<{ error?: string; folder?: any }>(res);
      if (!res.ok) throw new Error(data.error || '创建失败');
      
      toast.success('文件夹创建成功');
      setShowFolderModal(false);
      setNewFolderName('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    }
  };

  const getCategoryIcon = (categoryId: AssetLibraryCategoryId) => {
    const iconMap = {
      outfit: Shirt,
      action: Activity,
      scene: Map,
      advertising: Sparkles,
    };
    const Icon = iconMap[categoryId];
    return Icon || Sparkles;
  };

  const getCategoryColor = (categoryId: AssetLibraryCategoryId) => {
    const colorMap = {
      outfit: 'bg-violet-500',
      action: 'bg-emerald-500',
      scene: 'bg-cyan-500',
      advertising: 'bg-amber-500',
    };
    return colorMap[categoryId];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
            <Sparkles className="h-8 w-8 text-violet-600" />
            公共资产库
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            管理服装、动作、场景和广告素材资源库，快速调用换装/换动作/换场景功能
          </p>
        </div>

        {/* Category Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveCategory('all')}
            className={cn(
              'gap-2',
              activeCategory === 'all' && 'bg-gradient-to-r from-violet-600 to-fuchsia-600'
            )}
          >
            <Grid className="h-4 w-4" />
            全部资产
          </Button>
          
          {ASSET_LIBRARY_CATEGORIES.map((category) => {
            const Icon = getCategoryIcon(category.id);
            const isActive = activeCategory === category.id;
            return (
              <Button
                key={category.id}
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'gap-2 transition-all',
                  isActive && getCategoryColor(category.id).replace('bg-', 'from-').replace('-500', '-700') + ' to-' + getCategoryColor(category.id).replace('bg-', '')
                )}
              >
                <Icon className="h-4 w-4" />
                {category.label}
              </Button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索资产..."
                className="w-64 pl-9"
              />
            </div>
            
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as AssetLibraryCategoryRole | 'all')}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">所有类型</option>
              {activeCategory !== 'all' &&
                ASSET_LIBRARY_CATEGORIES.find(c => c.id === activeCategory)?.roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
            </select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFolderModal(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              新建文件夹
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">{filteredAssets.length} 项资产</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'px-3 py-1.5 text-sm',
                  viewMode === 'grid' ? 'bg-violet-50 text-violet-600' : 'hover:bg-slate-50'
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'px-3 py-1.5 text-sm',
                  viewMode === 'list' ? 'bg-violet-50 text-violet-600' : 'hover:bg-slate-50'
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white">
            <Loader2 className="mr-3 h-5 w-5 animate-spin text-violet-600" />
            <span className="text-slate-600">加载中...</span>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id || asset.url}
                    className={cn(
                      'group relative cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md',
                      selected.has(String(asset.id || asset.url))
                        ? 'border-violet-500 ring-2 ring-violet-200'
                        : 'border-slate-200'
                    )}
                    onClick={() => toggle(String(asset.id || asset.url))}
                  >
                    {/* Checkbox */}
                    <div className="absolute left-2 top-2 z-10">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                          selected.has(String(asset.id || asset.url))
                            ? 'border-violet-600 bg-violet-600'
                            : 'border-slate-300 hover:border-slate-400'
                        )}
                      >
                        {selected.has(String(asset.id || asset.url)) && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="aspect-[2/3] bg-slate-100">
                      {asset.url ? (
                        <img
                          src={asset.url}
                          alt={asset.name || 'Asset'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          无预览
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="mb-2 truncate text-xs font-medium text-slate-900">
                        {asset.name || asset.id}
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {asset.meta?.library_category && (
                          <Badge
                            variant="secondary"
                            className="text-[9px]"
                          >
                            {ASSET_LIBRARY_CATEGORIES.find(c => c.id === asset.meta!.library_category)?.label}
                          </Badge>
                        )}
                        {asset.meta?.library_role && (
                          <Badge variant="outline" className="text-[9px]">
                            {asset.meta.library_role}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="hidden group-hover:flex absolute inset-x-0 bottom-0">
                      {asset.meta?.library_category && (
                        <div className="flex gap-1 p-2 backdrop-blur-sm bg-black/50">
                          {LIBRARY_QUICK_ACTIONS[asset.meta.library_category as keyof typeof LIBRARY_QUICK_ACTIONS]?.label && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-6 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.info(`应用 ${LIBRARY_QUICK_ACTIONS[asset.meta!.library_category as keyof typeof LIBRARY_QUICK_ACTIONS].label}`);
                              }}
                            >
                              {LIBRARY_QUICK_ACTIONS[asset.meta.library_category as keyof typeof LIBRARY_QUICK_ACTIONS].label}
                            </Button>
                          )}
                          <a
                            href={asset.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-white hover:bg-white/30"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id || asset.url}
                    className={cn(
                      'group flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md',
                      selected.has(String(asset.id || asset.url))
                        ? 'border-violet-500'
                        : 'border-slate-200'
                    )}
                    onClick={() => toggle(String(asset.id || asset.url))}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                        selected.has(String(asset.id || asset.url))
                          ? 'border-violet-600 bg-violet-600'
                          : 'border-slate-300'
                      )}
                    >
                      {selected.has(String(asset.id || asset.url)) && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Thumbnail */}
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          无预览
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {asset.name || asset.id}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {asset.meta?.library_category && (
                          <Badge variant="secondary" className="text-[10px]">
                            {ASSET_LIBRARY_CATEGORIES.find(c => c.id === asset.meta!.library_category)?.label}
                          </Badge>
                        )}
                        {asset.meta?.library_role && (
                          <Badge variant="outline" className="text-[10px]">
                            {asset.meta.library_role}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Links */}
                    <div className="flex items-center gap-2">
                      {asset.url && (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-violet-600"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredAssets.length === 0 && (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center">
                <Search className="mb-3 h-12 w-12 text-slate-300" />
                <h3 className="text-base font-semibold text-slate-900">暂无资产</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {activeCategory === 'all' 
                    ? '切换分类或创建新文件夹以添加资产' 
                    : `此分类下暂无资产`}
                </p>
              </div>
            )}
          </>
        )}

        {/* Create Folder Modal */}
        {showFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">新建文件夹</h3>
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    文件夹名称
                  </label>
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="例如：夏季服装系列"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    所属分类
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSET_LIBRARY_CATEGORIES.map((category) => {
                      const Icon = getCategoryIcon(category.id);
                      return (
                        <button
                          key={category.id}
                          onClick={() => setNewFolderCategory(category.id)}
                          className={cn(
                            'flex flex-col items-center gap-2 rounded-lg border p-3 transition-all',
                            newFolderCategory === category.id
                              ? cn('border-violet-500 bg-violet-50', getCategoryColor(category.id).replace('bg-', 'ring-').replace('-500', '-200'))
                              : 'border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <Icon className={cn(
                            'h-6 w-6',
                            newFolderCategory === category.id ? 'text-violet-600' : 'text-slate-500'
                          )} />
                          <span className="text-xs font-medium text-slate-700">
                            {category.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowFolderModal(false)}
                  >
                    取消
                  </Button>
                  <Button onClick={createFolder}>
                    创建文件夹
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
