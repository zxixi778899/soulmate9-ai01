'use client';

import { useState, useCallback, useMemo } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useImageCompressor } from '@/hooks/use-image-compressor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Image as ImageIcon, Trash2, Tag, Folder, Filter } from 'lucide-react';

interface PublicAsset {
  id: string;
  url: string;
  filename: string;
  size: number;
  category: string;
  tags: string[];
  uploadedAt: string;
  uploaded_by?: string;
}

export default function PublicAssetsAdminContent({ embedded = false }: { embedded?: boolean }) {
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    compressedSize: number;
    ratio: string;
  } | null>(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 20; // 每页显示数量
  
  const { compressMultipleImages } = useImageCompressor();

  // Load assets
  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/storage/assets');
      if (!res.ok) throw new Error('Failed to load assets');
      const data = await res.json();
      setAssets(data.assets || []);
      setCategories(data.categories || ['general', 'outfit', 'pose', 'scene', 'character']);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = async (assetId: string) => {
    if (!confirm('确定要删除这个资源吗？')) return;
    
    try {
      const res = await authedFetch(`/api/storage/assets?id=${assetId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('已删除');
      await loadAssets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // 压缩前显示预览
    setUploading(true);
    try {
      // 批量压缩图片
      const compressionResults = await compressMultipleImages(files, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,
        convertToWebP: true,
      });
      
      if (compressionResults.length === 0) {
        throw new Error('No valid images after compression');
      }

      // 计算压缩统计
      const totalOriginal = files.reduce((sum, f) => sum + f.size, 0);
      const totalCompressed = compressionResults.reduce((sum, r) => sum + r.compressedSize, 0);
      const ratio = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
      
      setCompressionStats({
        originalSize: totalOriginal,
        compressedSize: totalCompressed,
        ratio,
      });

      // 准备上传的表单数据（使用压缩后的文件）
      const formData = new FormData();
      compressionResults.forEach(result => {
        // 保留原始文件名但添加_compressed 后缀或转换为.webp
        const newName = result.file.name.replace(/\.[^.]+$/, '') + '.webp';
        const compressedFile = new File([result.compressedBlob], newName, {
          type: 'image/webp',
          lastModified: Date.now(),
        });
        formData.append('files', compressedFile);
      });
      
      formData.append('category', selectedCategory === 'all' ? 'general' : selectedCategory);
      formData.append('tags', 'public,preset');

      const res = await authedFetch('/api/storage/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const result = await res.json();
      
      toast.success(`已上传 ${result.count} 张图片 (压缩节省${ratio}%)`);
      setDialogOpen(false);
      setCompressionStats(null);
      // 重置页面到第一页
      setPage(1);
      await loadAssets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Filter assets
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      const matchesSearch = asset.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           asset.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [assets, selectedCategory, searchQuery]);
  
  // Paginate filtered assets
  const startIndex = (page - 1) * itemsPerPage;
  const paginatedAssets = filteredAssets.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
  const hasMorePages = page < totalPages;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">公共资源库</h2>
          <p className="text-sm text-gray-400 mt-1">
            {filteredAssets.length} 个资源 · 统一管理上传图片、模型和素材
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              上传资源
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">上传公共资源</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-400">选择分类</Label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-violet-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                  id="bulk-upload"
                />
                <label htmlFor="bulk-upload" className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-300 font-medium">
                    {uploading ? '压缩中...' : '点击或拖拽图片到这里'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG、WebP (最大 10MB)</p>
                  
                  {/* 压缩统计 */}
                  {compressionStats && (
                    <div className="mt-4 p-3 bg-green-500/10 border border-green-600/30 rounded-md">
                      <p className="text-xs text-green-300">
                        🎉 压缩完成!
                      </p>
                      <p className="text-xs text-green-200 mt-1">
                        {Math.round(compressionStats.originalSize / 1024)} KB → {Math.round(compressionStats.compressedSize / 1024)} KB
                      </p>
                      <p className="text-xs text-green-200">
                        节省空间：{compressionStats.ratio}%
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="搜索资源..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#0f0f17] border-gray-700"
              />
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">分类:</span>
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-md text-xs transition-all ${
                  selectedCategory === 'all' 
                    ? 'bg-violet-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                全部
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-md text-xs transition-all ${
                    selectedCategory === cat
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-2"></div>
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-20">
          <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">暂无资源</p>
          <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
            上传第一个资源
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedAssets.map(asset => (
            <Card key={asset.id} className="bg-[#16161f] border-gray-800 overflow-hidden group">
              <div className="aspect-square relative overflow-hidden bg-gray-900">
                <img
                  src={asset.url}
                  alt={asset.filename}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4 text-white" />
                  </a>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(asset.id)}
                    className="bg-red-500/80 hover:bg-red-600/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate" title={asset.filename}>
                      {asset.filename}
                    </p>
                    <p className="text-xs text-gray-400">{formatBytes(asset.size)}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {asset.category}
                  </Badge>
                </div>
                
                {asset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {asset.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                        <Tag className="w-2.5 h-2.5 mr-0.5" />
                        {tag}
                      </Badge>
                    ))}
                    {asset.tags.length > 3 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        +{asset.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(asset.uploadedAt).toLocaleDateString('zh-CN')}
                </p>
              </CardContent>
            </Card>
            ))}          
          </div>
        )}
      
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs"
            >
              ← 上一页
            </Button>
            <div className="text-sm text-gray-400">
              第 {page}/{totalPages} 页 · 共 {filteredAssets.length} 个资源
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={!hasMorePages}
              className="px-3 py-1 text-xs"
            >
              下一页 →
            </Button>
          </div>
        )}
      </div>
  );
}
