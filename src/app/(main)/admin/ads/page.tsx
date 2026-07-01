'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Loader2, Plus, Pencil, Trash2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';

type AdData = {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
  active: boolean;
  sort_order: number;
  created_at: string;
};

const defaultForm = {
  title: '',
  image_url: '',
  link_url: '',
  position: 'banner',
  active: true,
  sort_order: 0,
};

export default function AdminAdsPage() {
  const { user } = useAuth();
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/ads');
      const data = await res.json();
      if (data.ads) setAds(data.ads);
      else if (Array.isArray(data)) setAds(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load ads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAds();
  }, []);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (ad: AdData) => {
    setForm({
      title: ad.title,
      image_url: ad.image_url,
      link_url: ad.link_url,
      position: ad.position,
      active: ad.active,
      sort_order: ad.sort_order,
    });
    setEditingId(ad.id);
    setDialogOpen(true);
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isEdit = !!editingId;
      const url = isEdit ? '/api/admin/ads' : '/api/admin/ads';
      const method = isEdit ? 'PATCH' : 'POST';

      const body: Record<string, unknown> = { ...form };
      if (isEdit) body.id = editingId;

      const res = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save ad');

      toast.success(isEdit ? 'Ad updated' : 'Ad created');
      setDialogOpen(false);
      resetForm();
      fetchAds();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save ad');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/admin/ads?id=${deletingId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete ad');
      toast.success('Ad deleted');
      setDeleteDialogOpen(false);
      setDeletingId(null);
      fetchAds();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete ad');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: AdData) => {
    try {
      const res = await authedFetch('/api/admin/ads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ad.id, active: !ad.active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      toast.success(ad.active ? 'Ad deactivated' : 'Ad activated');
      fetchAds();
    } catch (err) {
      console.error(err);
      toast.error('Failed to toggle ad');
    }
  };

  const getPositionBadge = (position: string) => {
    const colors: Record<string, string> = {
      banner: 'bg-blue-500/10 text-blue-500',
      sidebar: 'bg-violet-500/10 text-violet-500',
      popup: 'bg-amber-500/10 text-amber-500',
    };
    return colors[position] || 'bg-muted/20 text-[#8B8BA3]';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ad Management</h1>
          <p className="text-sm text-[#8B8BA3] mt-1">Create and manage advertisements</p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Ad
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
        </div>
      ) : ads.length === 0 ? (
        <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
            <ImageOff className="h-12 w-12 mb-2 opacity-30" />
            <p>No ads yet</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first ad
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((ad) => (
            <Card key={ad.id} className="border-white/[0.05] bg-card/40 backdrop-blur-sm overflow-hidden">
              {/* Image Preview */}
              <div className="relative h-40 bg-muted/20 flex items-center justify-center overflow-hidden">
                {ad.image_url ? (
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <ImageOff className="h-10 w-10 text-[#8B8BA3]/30" />
                )}
                <div className="absolute top-2 right-2">
                  <Badge
                    variant={ad.active ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {ad.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm truncate">{ad.title}</h3>
                  <p className="text-xs text-[#8B8BA3] truncate mt-0.5">{ad.link_url}</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getPositionBadge(ad.position)}`}>
                    {ad.position}
                  </span>
                  <span className="text-[10px] text-[#8B8BA3]">
                    Order: {ad.sort_order}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={ad.active}
                      onCheckedChange={() => toggleActive(ad)}
                      className="scale-75"
                    />
                    <span className="text-[10px] text-[#8B8BA3]">Active</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEditDialog(ad)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openDeleteDialog(ad.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Ad' : 'Add New Ad'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the advertisement details' : 'Fill in the details to create a new advertisement'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ad-title">Title</Label>
              <Input
                id="ad-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ad title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad-image">Image URL</Label>
              <Input
                id="ad-image"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ad-link">Link URL</Label>
              <Input
                id="ad-link"
                value={form.link_url}
                onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                placeholder="https://example.com/landing"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ad-position">Position</Label>
                <Select
                  value={form.position}
                  onValueChange={(v) => setForm({ ...form, position: v })}
                >
                  <SelectTrigger id="ad-position">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="sidebar">Sidebar</SelectItem>
                    <SelectItem value="popup">Popup</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ad-sort">Sort Order</Label>
                <Input
                  id="ad-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
                id="ad-active"
              />
              <Label htmlFor="ad-active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Ad</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this ad? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletingId(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}