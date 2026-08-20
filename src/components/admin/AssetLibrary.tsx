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
  Plus, ExternalLink, Grid, List, X, Trash2
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

const canDelete = (asset: Asset): boolean => {
  // Only allow deletion of assets managed by admin
  return Boolean(asset.id || asset.storage_key);
};

export default function AssetLibrary() {
  const [activeCategory, setActiveCategory] = useState<AssetLibraryCategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssetLibraryCategoryRole | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
  
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

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    const successful = [];
    const failed = [];
    
    for (const file of Array.from(files)) {
      try {
        if (file.size > 12 * 1024 * 1024) {
          throw new Error(`文件 ${file.name} 超过 12MB`);
        }
        if (!/^image\//.test(file.type)) {
          throw new Error(`文件 ${file.name} 不是图片格式`);
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'asset-library');
        
        const uploadRes = await authedFetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await readResponseJson<{ url?: string; error?: string }>(uploadRes);
        
        if (!uploadRes.ok || !uploadData.url) {
          throw new Error(uploadData.error || '上传失败');
        }
        
        // 注册到资产库
        const registerRes = await authedFetch('/api/admin/comfy?action=register_asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: uploadData.url,
            kind: 'asset-library',
            name: file.name,
            library_category: activeCategory === 'all' ? 'outfit' : activeCategory,
          }),
        });
        const registerData = await readResponseJson<{ asset?: any; error?: string }>(registerRes);
        
        if (!registerRes.ok) {
          throw new Error(registerData.error || '注册失败');
        }
        
        successful.push(file.name);
      } catch (e) {
        failed.push({ name: file.name, error: e instanceof Error ? e.message : '未知错误' });
      }
    }
    
    setUploading(false);
    if (successful.length > 0) {
      toast.success(`成功上传 ${successful.length} 个文件`);
      if (failed.length > 0) {
        toast.warning(`有 ${failed.length} 个文件上传失败`);
      }
    } else if (failed.length > 0) {
      toast.error(`所有文件上传失败`);
    }
    
    await load();
    if (fileInputRef) fileInputRef.value = '';
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selected.size} 个资产吗？此操作不可恢复。`)) return;
    
    let deleted = 0;
    let failed = 0;
    const deleteDelay = 500; // 500ms 延迟，避免触发限流
    
    for (const id of selected) {
      try {
        const res = await authedFetch(`/api/admin/assets?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const data = await readResponseJson<{ success?: boolean; error?: string }>(res);
        
        if (!res.ok) {
          // Check if it's a rate limit error
          if (res.status === 429) {
            toast.error('操作过于频繁，请稍后再试');
            throw new Error('Rate limit exceeded');
          }
          throw new Error(data.error || '删除失败');
        }
        deleted++;
        // 每个删除操作之间添加延迟
        await new Promise(resolve => setTimeout(resolve, deleteDelay));
      } catch (e) {
        console.error(`Failed to delete ${id}:`, e);
        failed++;
        // 发生错误时也稍微延迟
        await new Promise(resolve => setTimeout(resolve, deleteDelay));
      }
    }
    
    setShowDeleteConfirm(false);
    setSelected(new Set());
    
    if (deleted > 0) {
      toast.success(`成功删除 ${deleted} 个资产`);
      if (failed > 0) {
        toast.warning(`有 ${failed} 个资产删除失败`);
      }
    } else if (failed > 0) {
      toast.error(`所有资产删除失败`);
    }
    
    await load();
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
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
            <Sparkles className="h-8 w-8 text-violet-400" />
            公共资产库
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            管理服装、动作、场景和广告素材资源库，快速调用换装/换动作/换场景功能
          </p>
        </div>

        {/* Category Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setActiveCategory('all')}
            className={cn(
              'gap-2 border-white/10 bg-white/5 text-slate-100',
              activeCategory === 'all' && 'bg-gradient-to-r from-rose-600 to-fuchsia-600 border-rose-500/50'
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
                  'gap-2 border-white/10 bg-white/5 text-slate-100 transition-all',
                  isActive && 'bg-gradient-to-r from-rose-500 to-fuchsia-500 border-rose-400/50'
                )}
              >
                <Icon className="h-4 w-4" />
                {category.label}
              </Button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={(ref) => setFileInputRef(ref)}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleUploadFiles(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef?.click()}
              disabled={uploading}
              className="gap-2 border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              上传资产
            </Button>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索资产..."
                className="w-64 pl-9 border-white/10 bg-black/30 text-slate-100"
              />
            </div>
            
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as AssetLibraryCategoryRole | 'all')}
              className="h-9 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-100"
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
              className="gap-2 border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
            >
              <Plus className="h-4 w-4" />
              新建文件夹
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {selected.size > 0 ? `${selected.size} 项已选中` : `${filteredAssets.length} 项资产`}
            </span>
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-rose-600 hover:bg-rose-500 border-rose-500/50"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                删除选中 ({selected.size})
              </Button>
            )}
            <div className="flex rounded-lg border border-white/10 overflow-hidden bg-white/[0.03]">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'px-3 py-1.5 text-sm text-slate-300',
                  viewMode === 'grid' ? 'bg-rose-500/20 text-rose-100' : 'hover:bg-white/5'
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'px-3 py-1.5 text-sm text-slate-300',
                  viewMode === 'list' ? 'bg-rose-500/20 text-rose-100' : 'hover:bg-white/5'
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02]">
            <Loader2 className="mr-3 h-5 w-5 animate-spin text-violet-400" />
            <span className="text-slate-400">加载中...</span>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id || asset.url}
                    className={cn(
                      'group relative cursor-pointer overflow-hidden rounded-xl border bg-white/[0.03] shadow-sm transition-all hover:shadow-md',
                      selected.has(String(asset.id || asset.url))
                        ? 'border-violet-500 ring-2 ring-violet-500/30'
                        : 'border-white/10 hover:border-violet-400/40 hover:bg-violet-500/5'
                    )}
                    onClick={() => toggle(String(asset.id || asset.url))}
                  >
                    {/* Checkbox */}
                    <div className="absolute left-2 top-2 z-10">
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                          selected.has(String(asset.id || asset.url))
                            ? 'border-violet-500 bg-violet-600'
                            : 'border-white/30 hover:border-violet-400'
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
                    <div className="aspect-[2/3] bg-black/40">
                      {asset.url ? (
                        <img
                          src={asset.url}
                          alt={asset.name || 'Asset'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-600">
                          无预览
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 border-t border-white/5">
                      <div className="mb-2 truncate text-xs font-medium text-white">
                        {asset.name || asset.id}
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {asset.meta?.library_category && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] bg-violet-500/20 text-violet-100"
                          >
                            {ASSET_LIBRARY_CATEGORIES.find(c => c.id === asset.meta!.library_category)?.label}
                          </Badge>
                        )}
                        {asset.meta?.library_role && (
                          <Badge variant="outline" className="text-[9px] border-white/10 text-slate-300">
                            {asset.meta.library_role}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="hidden group-hover:flex absolute inset-x-0 bottom-0">
                      {asset.meta?.library_category && (
                        <div className="flex gap-1 p-2 backdrop-blur-sm bg-black/60">
                          {LIBRARY_QUICK_ACTIONS[asset.meta.library_category as keyof typeof LIBRARY_QUICK_ACTIONS]?.label && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-6 text-xs bg-white/10 text-white hover:bg-white/20 border border-white/10"
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
                          {canDelete(asset) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const assetId = asset.id || asset.storage_key;
                                if (assetId) {
                                  setSelected((prev) => {
                                    const n = new Set(prev);
                                    n.add(String(assetId));
                                    return n;
                                  });
                                  toast.info('已选中该资产');
                                }
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded bg-rose-500/80 text-white hover:bg-rose-500"
                              title="删除"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
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
                      'group flex items-center gap-4 rounded-xl border bg-white/[0.03] p-4 shadow-sm transition-all hover:shadow-md',
                      selected.has(String(asset.id || asset.url))
                        ? 'border-violet-500 ring-2 ring-violet-500/30'
                        : 'border-white/10 hover:border-violet-400/40 hover:bg-violet-500/5'
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
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-black/40">
                      {asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-600">
                          无预览
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <div className="font-medium text-white">
                        {asset.name || asset.id}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {asset.meta?.library_category && (
                          <Badge variant="secondary" className="text-[10px] bg-violet-500/20 text-violet-100">
                            {ASSET_LIBRARY_CATEGORIES.find(c => c.id === asset.meta!.library_category)?.label}
                          </Badge>
                        )}
                        {asset.meta?.library_role && (
                          <Badge variant="outline" className="text-[10px] border-white/10 text-slate-300">
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
                          className="text-slate-400 hover:text-violet-400"
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
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-center">
                <Search className="mb-3 h-12 w-12 text-slate-600" />
                <h3 className="text-base font-semibold text-slate-200">暂无资产</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {activeCategory === 'all' 
                    ? '切换分类或创建新文件夹以添加资产' 
                    : `此分类下暂无资产`}
                </p>
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#12121c] p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">确认删除</h3>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4">
                  <p className="text-sm text-rose-200">
                    你确定要删除选中的 <span className="font-bold text-rose-100">{selected.size}</span> 个资产吗？
                    此操作不可恢复！
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/5"
                  >
                    取消
                  </Button>
                  <Button 
                    onClick={handleDeleteSelected} 
                    className="bg-rose-600 hover:bg-rose-500 border-rose-500/50"
                  >
                    确认删除
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Folder Modal */}
        {showFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#12121c] p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">新建文件夹</h3>
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">
                    文件夹名称
                  </label>
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="例如：夏季服装系列"
                    className="border-white/10 bg-black/30 text-slate-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">
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
                              ? cn('border-violet-500 bg-violet-500/20 ring-2 ring-violet-500/30')
                              : 'border-white/10 bg-white/[0.03] hover:border-violet-400/40 hover:bg-white/5'
                          )}
                        >
                          <Icon className={cn(
                            'h-6 w-6',
                            newFolderCategory === category.id ? 'text-violet-400' : 'text-slate-400'
                          )} />
                          <span className="text-xs font-medium text-slate-200">
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
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/5"
                  >
                    取消
                  </Button>
                  <Button onClick={createFolder} className="bg-rose-600 hover:bg-rose-500 border-rose-500/50">
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
