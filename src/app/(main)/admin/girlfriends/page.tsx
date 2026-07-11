'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Loader2, Plus, Pencil, Trash2, Heart, ImageOff, Sparkles, CheckSquare, Square, Users, X, Search, Calendar, Upload, Film } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { uploadGirlfriendVideo, type VideoField } from '@/lib/admin-video-upload';
import Link from 'next/link';

type AccessStatus = 'open' | 'locked' | 'closed';
type RarityTier = 'N' | 'R' | 'SR' | 'SSR';

type GirlfriendData = {
  id: string;
  name: string;
  age: number;
  slug: string;
  personality: string;
  tags: string[];
  short_description: string;
  backstory: string;
  portrait_url: string | null;
  avatar_url: string | null;
  portrait_video_url?: string | null;
  avatar_video_url?: string | null;
  appearance: {
    hair: string;
    hair_color: string;
    eyes: string;
    body: string;
    style: string;
  } | null;
  appearance_hair?: string;
  appearance_hair_color?: string;
  appearance_eyes?: string;
  appearance_body?: string;
  appearance_style?: string;
  role?: string;
  is_public: boolean;
  review_status: string;
  created_at: string;
  user_id?: string;
  rarity?: RarityTier;
  access_status?: AccessStatus;
  unlock_price_tokens?: number;
  base_intimacy?: number;
  base_desire?: number;
  base_development?: number;
  base_kink?: number;
};

const defaultForm = {
  name: '',
  age: 18,
  slug: '',
  personality: '',
  tags: '',
  short_description: '',
  backstory: '',
  portrait_url: '',
  avatar_url: '',
  portrait_video_url: '',
  avatar_video_url: '',
  hair: '',
  hair_color: '',
  eyes: '',
  body: '',
  style: '',
  is_public: false,
  review_status: 'draft',
  rarity: 'R' as RarityTier,
  access_status: 'open' as AccessStatus,
  unlock_price_tokens: 0,
  base_intimacy: 10,
  base_desire: 20,
  base_development: 15,
  base_kink: 10,
};

const ACCESS_LABELS: Record<AccessStatus, string> = {
  open: '开放',
  locked: '锁定',
  closed: '关闭',
};

const statusTabs = ['all', 'draft', 'pending', 'approved', 'rejected'];

export default function AdminGirlfriendsPage() {
  const { user } = useAuth();
  const [girlfriends, setGirlfriends] = useState<GirlfriendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [publicFilter, setPublicFilter] = useState<'all' | 'public' | 'private'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [videoUploading, setVideoUploading] = useState<VideoField | null>(null);
  const pvRef = useRef<HTMLInputElement>(null);
  const avRef = useRef<HTMLInputElement>(null);

  const handleVideoFile = async (field: VideoField, file: File | undefined) => {
    if (!file) return;
    setVideoUploading(field);
    try {
      const result = await uploadGirlfriendVideo({
        file,
        field,
        // Bind only when editing existing row; new drafts just fill form URL
        girlfriendId: editingId || undefined,
      });
      setForm((prev) => ({ ...prev, [field]: result.url }));
      toast.success(
        editingId
          ? `视频已上传并写入角色（${field === 'portrait_video_url' ? '肖像' : '头像'}）`
          : '视频已上传，保存表单后生效',
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '视频上传失败');
    } finally {
      setVideoUploading(null);
    }
  };

  // Batch create state
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchLogs, setBatchLogs] = useState<string[]>([]);

  // New: 
  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [creator, setCreator] = useState<'all' | 'system' | 'user'>('all');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'name'>('created_at');

  const fetchGirlfriends = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (activeTab && activeTab !== 'all') params.set('status', activeTab);
      if (searchQ) params.set('q', searchQ);
      if (visibility !== 'all') params.set('visibility', visibility);
      if (creator !== 'all') params.set('creator', creator);
      params.set('sort', sortBy);
      const res = await authedFetch(`/api/admin/girlfriends?${params.toString()}`);
      const data = await res.json();
      if (data.girlfriends) setGirlfriends(data.girlfriends);
      else if (Array.isArray(data)) setGirlfriends(data);
      if (data.totalPages) setTotalPages(data.totalPages);
      else if (data.total) setTotalPages(Math.ceil(data.total / 20));
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to load girlfriends');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGirlfriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeTab, searchQ, visibility, creator, sortBy]);

  // 
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filteredGirlfriends = girlfriends.filter((g) => {
    // Tab filter
    if (activeTab !== 'all' && g.review_status !== activeTab) return false;
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = g.name?.toLowerCase().includes(q)
        || g.slug?.toLowerCase().includes(q)
        || g.user_id?.toLowerCase().includes(q);
      if (!match) return false;
    }
    // Public filter
    if (publicFilter === 'public' && !g.is_public) return false;
    if (publicFilter === 'private' && g.is_public) return false;
    // Date filter
    if (dateFrom && g.created_at && new Date(g.created_at) < new Date(dateFrom)) return false;
    if (dateTo && g.created_at && new Date(g.created_at) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (gf: GirlfriendData) => {
    setForm({
      name: gf.name,
      age: gf.age,
      slug: gf.slug,
      personality: gf.personality || '',
      tags: (gf.tags || []).join(', '),
      short_description: gf.short_description || '',
      backstory: gf.backstory || '',
      portrait_url: gf.portrait_url || '',
      avatar_url: gf.avatar_url || '',
      portrait_video_url: gf.portrait_video_url || '',
      avatar_video_url: gf.avatar_video_url || '',
      hair: gf.appearance?.hair || gf.appearance_hair || '',
      hair_color: gf.appearance?.hair_color || gf.appearance_hair_color || '',
      eyes: gf.appearance?.eyes || gf.appearance_eyes || '',
      body: gf.appearance?.body || gf.appearance_body || '',
      style: gf.appearance?.style || gf.appearance_style || '',
      is_public: gf.is_public,
      review_status: gf.review_status,
      rarity: (gf.rarity as RarityTier) || 'R',
      access_status: (gf.access_status as AccessStatus) || 'open',
      unlock_price_tokens: gf.unlock_price_tokens ?? 0,
      base_intimacy: gf.base_intimacy ?? 10,
      base_desire: gf.base_desire ?? 20,
      base_development: gf.base_development ?? 15,
      base_kink: gf.base_kink ?? 10,
    });
    setEditingId(gf.id);
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === girlfriends.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(girlfriends.map((g) => g.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const res = await authedFetch('/api/v2/admin/girlfriends/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error('Batch delete failed');
      toast.success(`Deleted ${selectedIds.size} girlfriends`);
      setSelectedIds(new Set());
      fetchGirlfriends();
    } catch (err) {
      toast.error('Batch delete failed');
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = !!editingId;
      const body: Record<string, unknown> = {
        name: form.name,
        age: form.age,
        slug: form.slug,
        personality: form.personality,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        short_description: form.short_description,
        backstory: form.backstory,
        portrait_url: form.portrait_url || null,
        avatar_url: form.avatar_url || null,
        portrait_video_url: form.portrait_video_url || null,
        avatar_video_url: form.avatar_video_url || null,
        appearance_hair: form.hair,
        appearance_hair_color: form.hair_color,
        appearance_eyes: form.eyes,
        appearance_body: form.body,
        appearance_style: form.style,
        appearance: {
          hair: form.hair,
          hair_color: form.hair_color,
          eyes: form.eyes,
          body: form.body,
          style: form.style,
        },
        is_public: form.is_public,
        review_status: form.review_status,
        rarity: form.rarity,
        access_status: form.access_status,
        unlock_price_tokens: form.unlock_price_tokens,
        base_intimacy: form.base_intimacy,
        base_desire: form.base_desire,
        base_development: form.base_development,
        base_kink: form.base_kink,
      };
      if (isEdit) body.id = editingId;

      const res = await authedFetch('/api/admin/girlfriends', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(isEdit ? '' : '');
      setDialogOpen(false);
      resetForm();
      fetchGirlfriends();
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to save girlfriend');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/admin/girlfriends?id=${deletingId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('');
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchGirlfriends();
    } catch (err) {
      logger.error(String(err));
      toast.error('');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchCreate = async () => {
    setBatchLoading(true);
    setBatchLogs([]);
    try {
      addLog(`Starting batch creation of ${batchCount} girlfriends...`);
      const res = await authedFetch('/api/v2/admin/girlfriends/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: batchCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        addLog(`Error: ${data.error}`);
        throw new Error(data.error || 'Batch create failed');
      }
      addLog(` Successfully created ${data.count} girlfriends:`);
      if (data.girlfriends) {
        data.girlfriends.forEach((gf: { name: string }) => {
          addLog(`  - ${gf.name}`);
        });
      }
      toast.success(` ${data.count} `);
      setBatchDialogOpen(false);
      fetchGirlfriends();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Batch create failed';
      addLog(` Failed: ${msg}`);
      toast.error(msg);
    } finally {
      setBatchLoading(false);
    }
  };

  const addLog = (msg: string) => {
    setBatchLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      approved: 'default',
      pending: 'secondary',
      draft: 'outline',
      rejected: 'destructive',
    };
    return variants[status] || 'outline';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold"></h1>
          <p className="text-sm text-[#8B8BA3] mt-1"> AI </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={handleBatchDelete} disabled={batchDeleting} className="gap-2">
              {batchDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
               ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => setBatchDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" />
            
          </Button>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
          <input
            type="text"
            placeholder="Search by name, slug or creator..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.06] border-none rounded-lg pl-9 pr-4 py-2 text-sm placeholder:text-[#8B8BA3]/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={publicFilter}
          onChange={(e) => setPublicFilter(e.target.value as 'all' | 'public' | 'private')}
          className="bg-white/[0.06] border-none rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-white/[0.06] border-none rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          title="Created after"
        />
        <span className="text-[#8B8BA3] text-xs">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-white/[0.06] border-none rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          title="Created before"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'bg-[#FF2D78]/10 text-[#FF2D78]'
                : 'text-[#8B8BA3] hover:bg-muted/20'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
            </div>
          ) : filteredGirlfriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
              <Heart className="h-12 w-12 mb-2 opacity-30" />
              <p></p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={girlfriends.length > 0 && selectedIds.size === girlfriends.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">头像</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">名称</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">稀有度</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">状态</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">基础值</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">审核</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">公开</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">创建</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGirlfriends.map((gf) => (
                    <tr key={gf.id} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${selectedIds.has(gf.id) ? 'bg-[#FF2D78]/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(gf.id)}
                          onChange={() => toggleSelect(gf.id)}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {gf.portrait_url ? (
                          <img
                            src={gf.portrait_url}
                            alt={gf.name}
                            className="h-10 w-10 rounded-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="h-10 w-10 rounded-full bg-[#FF2D78]/10 flex items-center justify-center text-[#FF2D78] text-sm font-semibold">' + gf.name.charAt(0) + '</div>';
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-[#FF2D78]/10 flex items-center justify-center text-[#FF2D78] text-sm font-semibold">
                            {gf.name.charAt(0)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        <div>{gf.name}</div>
                        <div className="text-[10px] text-[#8B8BA3]">{gf.age}岁 · {(gf.tags || []).slice(0, 2).join(', ')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] font-bold">
                          {gf.rarity || 'R'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={`text-[10px] ${
                            (gf.access_status || 'open') === 'open'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : (gf.access_status || '') === 'locked'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-zinc-500/20 text-zinc-400'
                          }`}
                        >
                          {ACCESS_LABELS[(gf.access_status as AccessStatus) || 'open']}
                          {(gf.access_status === 'locked' && (gf.unlock_price_tokens || 0) > 0)
                            ? ` · ${gf.unlock_price_tokens}t`
                            : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-[#8B8BA3] whitespace-nowrap">
                        欲{gf.base_desire ?? '—'} · 开{gf.base_development ?? '—'} · 变{gf.base_kink ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusBadge(gf.review_status)} className="text-[10px] capitalize">
                          {gf.review_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`h-2 w-2 rounded-full ${gf.is_public ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3]">
                        {new Date(gf.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditDialog(gf)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => openDeleteDialog(gf.id)}>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            
          </Button>
          <span className="text-sm text-[#8B8BA3]"> {page}  {totalPages} </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            
          </Button>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑女友' : '新建女友'}</DialogTitle>
            <DialogDescription>
              配置基础资料、稀有度、访问状态与初始数值
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-name">名称</Label>
                <Input id="gf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Astrid" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-age">年龄 (18+)</Label>
                <Input id="gf-age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: parseInt(e.target.value) || 18 })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-slug">Slug</Label>
                <Input id="gf-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-tags">标签</Label>
                <Input id="gf-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="cute, gentle, smart" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-personality">性格</Label>
              <Input id="gf-personality" value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder="自信、独立…" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-short-desc">简介</Label>
              <Input id="gf-short-desc" value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} placeholder="一句话描述" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-backstory">背景故事</Label>
              <Textarea id="gf-backstory" value={form.backstory} onChange={(e) => setForm({ ...form, backstory: e.target.value })} placeholder="背景…" />
            </div>

            {/* Access / Rarity / Base stats */}
            <div className="border-t border-border/20 pt-4 space-y-4">
              <p className="text-xs font-semibold text-[#8B8BA3] uppercase tracking-wider">开放状态 · 稀有度 · 基础值</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>访问状态</Label>
                  <Select
                    value={form.access_status}
                    onValueChange={(v) => setForm({ ...form, access_status: v as AccessStatus })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">开放 — 直接可用</SelectItem>
                      <SelectItem value="locked">锁定 — 模糊图+购买解锁</SelectItem>
                      <SelectItem value="closed">关闭 — 前端隐藏</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>稀有度</Label>
                  <Select
                    value={form.rarity}
                    onValueChange={(v) => setForm({ ...form, rarity: v as RarityTier })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['N', 'R', 'SR', 'SSR'] as RarityTier[]).map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>解锁代币价</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.unlock_price_tokens}
                    onChange={(e) => setForm({ ...form, unlock_price_tokens: parseInt(e.target.value) || 0 })}
                    disabled={form.access_status !== 'locked'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">基础亲密</Label>
                  <Input type="number" min={0} max={100} value={form.base_intimacy}
                    onChange={(e) => setForm({ ...form, base_intimacy: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">欲望值</Label>
                  <Input type="number" min={0} max={100} value={form.base_desire}
                    onChange={(e) => setForm({ ...form, base_desire: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">开发值</Label>
                  <Input type="number" min={0} max={100} value={form.base_development}
                    onChange={(e) => setForm({ ...form, base_development: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">变态值</Label>
                  <Input type="number" min={0} max={100} value={form.base_kink}
                    onChange={(e) => setForm({ ...form, base_kink: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              {form.access_status === 'locked' && (
                <p className="text-[11px] text-amber-400/90">
                  锁定：前端仍展示资料与信息，图片模糊并显示锁；用户购买/抽取后解锁清晰图与聊天。
                </p>
              )}
              {form.access_status === 'closed' && (
                <p className="text-[11px] text-zinc-400">关闭：公开目录不展示该角色。</p>
              )}
            </div>

            {/* Images + videos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-portrait">肖像 URL</Label>
                <Input id="gf-portrait" value={form.portrait_url} onChange={(e) => setForm({ ...form, portrait_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-avatar">头像 URL</Label>
                <Input id="gf-avatar" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-portrait-video">肖像视频（卡面/主视觉）</Label>
                <Input
                  id="gf-portrait-video"
                  value={form.portrait_video_url}
                  onChange={(e) => setForm({ ...form, portrait_video_url: e.target.value })}
                  placeholder="https://.../xxx.mp4"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={pvRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    className="hidden"
                    onChange={(e) => {
                      void handleVideoFile('portrait_video_url', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    disabled={!!videoUploading}
                    onClick={() => pvRef.current?.click()}
                  >
                    {videoUploading === 'portrait_video_url' ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-3.5 w-3.5" />
                    )}
                    上传肖像视频
                  </Button>
                  <Link
                    href="/admin/videos"
                    className="inline-flex h-8 items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                  >
                    <Film className="h-3.5 w-3.5" /> 视频管理
                  </Link>
                </div>
                <p className="text-[10px] text-muted-foreground">mp4/webm，建议竖版 9:16、&lt;5MB 循环静音短片</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-avatar-video">头像视频（可选）</Label>
                <Input
                  id="gf-avatar-video"
                  value={form.avatar_video_url}
                  onChange={(e) => setForm({ ...form, avatar_video_url: e.target.value })}
                  placeholder="https://.../xxx.mp4"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={avRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    className="hidden"
                    onChange={(e) => {
                      void handleVideoFile('avatar_video_url', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!!videoUploading}
                    onClick={() => avRef.current?.click()}
                  >
                    {videoUploading === 'avatar_video_url' ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-3.5 w-3.5" />
                    )}
                    上传头像视频
                  </Button>
                </div>
              </div>
            </div>
            {(form.portrait_video_url || form.avatar_video_url) && (
              <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
                <p className="mb-1 text-[11px] text-muted-foreground">视频预览</p>
                <video
                  key={form.portrait_video_url || form.avatar_video_url}
                  src={form.portrait_video_url || form.avatar_video_url}
                  poster={form.portrait_url || form.avatar_url || undefined}
                  className="mx-auto max-h-48 rounded-md object-cover"
                  muted
                  loop
                  playsInline
                  autoPlay
                  controls
                />
              </div>
            )}

            {/* Appearance */}
            <div className="border-t border-border/20 pt-4">
              <h4 className="text-sm font-medium mb-3"></h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gf-hair"></Label>
                  <Input id="gf-hair" value={form.hair} onChange={(e) => setForm({ ...form, hair: e.target.value })} placeholder="Long, short..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gf-hair-color"></Label>
                  <Input id="gf-hair-color" value={form.hair_color} onChange={(e) => setForm({ ...form, hair_color: e.target.value })} placeholder="Blonde, brown..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gf-eyes"></Label>
                  <Input id="gf-eyes" value={form.eyes} onChange={(e) => setForm({ ...form, eyes: e.target.value })} placeholder="Blue, green..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gf-body"></Label>
                  <Input id="gf-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Slim, athletic..." />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="gf-style"></Label>
                  <Input id="gf-style" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} placeholder="Casual, elegant..." />
                </div>
              </div>
            </div>

            {/* Status & Public */}
            <div className="grid grid-cols-2 gap-4 border-t border-border/20 pt-4">
              <div className="space-y-2">
                <Label htmlFor="gf-status"></Label>
                <Select value={form.review_status} onValueChange={(v) => setForm({ ...form, review_status: v })}>
                  <SelectTrigger id="gf-status">
                    <SelectValue placeholder="" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft"></SelectItem>
                    <SelectItem value="pending"></SelectItem>
                    <SelectItem value="approved"></SelectItem>
                    <SelectItem value="rejected"></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-8">
                <Switch checked={form.is_public} onCheckedChange={(v) => setForm({ ...form, is_public: v })} id="gf-public" />
                <Label htmlFor="gf-public"></Label>
              </div>
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

      {/* Batch Create Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={(open) => { if (!batchLoading) setBatchDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle></DialogTitle>
            <DialogDescription>
               AI 
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label></Label>
              <div className="flex gap-2">
                {[1, 3, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBatchCount(n)}
                    className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors border ${
                      batchCount === n
                        ? 'bg-primary text-[#FF2D78]-foreground border-primary'
                        : 'bg-white/[0.04] text-[#8B8BA3] border-white/[0.05] hover:border-primary/50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {batchLogs.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto bg-muted/20 rounded-lg p-3 border border-border/20">
                {batchLogs.map((log, i) => (
                  <p key={i} className="text-xs text-[#8B8BA3] font-mono leading-relaxed">
                    {log}
                  </p>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchDialogOpen(false); setBatchLogs([]); }} disabled={batchLoading}>
              
            </Button>
            <Button onClick={handleBatchCreate} disabled={batchLoading}>
              {batchLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {batchLoading ? '...' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}