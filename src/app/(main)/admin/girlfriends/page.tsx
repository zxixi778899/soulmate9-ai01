'use client';

import { useEffect, useState } from 'react';
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
import { Loader2, Plus, Pencil, Trash2, Heart, ImageOff, Sparkles, CheckSquare, Square, Users, X, Search, Calendar } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

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
  appearance: {
    hair: string;
    hair_color: string;
    eyes: string;
    body: string;
    style: string;
  } | null;
  role?: string;
  is_public: boolean;
  review_status: string;
  created_at: string;
  user_id?: string;
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
  hair: '',
  hair_color: '',
  eyes: '',
  body: '',
  style: '',
  is_public: false,
  review_status: 'draft',
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
      personality: gf.personality,
      tags: (gf.tags || []).join(', '),
      short_description: gf.short_description,
      backstory: gf.backstory,
      portrait_url: gf.portrait_url || '',
      avatar_url: gf.avatar_url || '',
      hair: gf.appearance?.hair || '',
      hair_color: gf.appearance?.hair_color || '',
      eyes: gf.appearance?.eyes || '',
      body: gf.appearance?.body || '',
      style: gf.appearance?.style || '',
      is_public: gf.is_public,
      review_status: gf.review_status,
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
        appearance: {
          hair: form.hair,
          hair_color: form.hair_color,
          eyes: form.eyes,
          body: form.body,
          style: form.style,
        },
        is_public: form.is_public,
        review_status: form.review_status,
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
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3"></th>
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
                      <td className="px-4 py-3 text-sm font-medium">{gf.name}</td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3]">{gf.role || '-'}</td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3]">{gf.age}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(gf.tags || []).slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[9px]">
                              {tag}
                            </Badge>
                          ))}
                          {(gf.tags || []).length > 3 && (
                            <span className="text-[9px] text-[#8B8BA3]">
                              +{gf.tags.length - 3}
                            </span>
                          )}
                        </div>
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
            <DialogTitle>{editingId ? '' : ''}</DialogTitle>
            <DialogDescription>
              {editingId ? '' : ' AI '}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-name"></Label>
                <Input id="gf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-age"></Label>
                <Input id="gf-age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: parseInt(e.target.value) || 18 })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-slug"></Label>
                <Input id="gf-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-tags"></Label>
                <Input id="gf-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="cute, gentle, smart" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-personality"></Label>
              <Input id="gf-personality" value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder="" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-short-desc"></Label>
              <Input id="gf-short-desc" value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} placeholder="" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gf-backstory"></Label>
              <Textarea id="gf-backstory" value={form.backstory} onChange={(e) => setForm({ ...form, backstory: e.target.value })} placeholder="..." />
            </div>

            {/* Images */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gf-portrait"> URL</Label>
                <Input id="gf-portrait" value={form.portrait_url} onChange={(e) => setForm({ ...form, portrait_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gf-avatar"> URL</Label>
                <Input id="gf-avatar" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>

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