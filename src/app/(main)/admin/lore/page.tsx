'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BookOpen, Plus, Pencil, Trash2, Loader2, AlertCircle, Check } from 'lucide-react';

interface LoreEntry {
  id: string;
  girlfriend_id: string;
  keys: string[];
  content: string;
  insertion_order: number;
  active: boolean;
  created_at: string;
}

interface Girlfriend {
  id: string;
  name: string;
}

export default function LorePage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [gfs, setGfs] = useState<Girlfriend[]>([]);
  const [selectedGf, setSelectedGf] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<LoreEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    girlfriend_id: '',
    keys: '',
    content: '',
    insertion_order: 0,
  });

  useEffect(() => {
    authedFetch('/api/girlfriends')
      .then(r => r.json())
      .then(d => setGfs(d.girlfriends || []))
      .catch(() => {});
  }, []);

  const fetchLore = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = selectedGf
        ? `/api/admin/lore?girlfriend_id=${selectedGf}&limit=50`
        : '/api/admin/lore?limit=50';
      const res = await authedFetch(url);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.lore || []);
      } else {
        setError(data.error || 'Failed to fetch lore');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedGf]);

  useEffect(() => {
    fetchLore();
  }, [fetchLore]);

  const openCreate = () => {
    setEditEntry(null);
    setForm({ girlfriend_id: selectedGf || '', keys: '', content: '', insertion_order: 0 });
    setShowModal(true);
  };

  const openEdit = (entry: LoreEntry) => {
    setEditEntry(entry);
    setForm({
      girlfriend_id: entry.girlfriend_id,
      keys: entry.keys.join(', '),
      content: entry.content,
      insertion_order: entry.insertion_order,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.keys || !form.content) return;
    setSaving(true);
    setError('');

    const payload = {
      girlfriend_id: form.girlfriend_id,
      keys: form.keys.split(',').map(k => k.trim()).filter(Boolean),
      content: form.content,
      insertion_order: form.insertion_order,
    };

    try {
      const res = editEntry
        ? await authedFetch(`/api/admin/lore/${editEntry.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await authedFetch('/api/admin/lore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const data = await res.json();
      if (res.ok) {
        setShowModal(false);
        fetchLore();
      } else {
        setError(data.error || 'Save failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteId(id);
    try {
      const res = await authedFetch(`/api/admin/lore/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchLore();
      } else {
        const data = await res.json();
        setError(data.error || 'Delete failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">World Lore</h1>
          <p className="text-sm text-[#8B8BA3]">Manage character world knowledge — keywords trigger context injection in chat</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedGf}
            onChange={e => setSelectedGf(e.target.value)}
            className="h-9 rounded-lg border border-white/[0.06] bg-background px-3 text-sm"
          >
            <option value="">All girlfriends</option>
            {gfs.map(gf => (
              <option key={gf.id} value={gf.id}>{gf.name}</option>
            ))}
          </select>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#8B8BA3]" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="bg-card/40 backdrop-blur-sm border-white/[0.05]">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-[#8B8BA3]/50" />
            <p className="text-[#8B8BA3] mb-4">No lore entries yet. Add keywords and content to build your character&apos;s world.</p>
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Create First Entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <Card key={entry.id} className="bg-card/40 backdrop-blur-sm border-white/[0.05]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {entry.keys.map((key, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{key}</Badge>
                      ))}
                    </div>
                    <p className="text-sm text-[#8B8BA3] line-clamp-3">{entry.content}</p>
                    <div className="flex items-center gap-3 text-xs text-[#8B8BA3]">
                      <span>Order: {entry.insertion_order}</span>
                      <span>Active: {entry.active ? '✅' : '❌'}</span>
                      <span>Created: {new Date(entry.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(entry)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleteId === entry.id}
                    >
                      {deleteId === entry.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Lore Entry' : 'Create Lore Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Girlfriend</label>
              <select
                value={form.girlfriend_id}
                onChange={e => setForm(f => ({ ...f, girlfriend_id: e.target.value }))}
                className="w-full h-9 rounded-lg border border-white/[0.06] bg-background px-3 text-sm"
              >
                <option value="">Select...</option>
                {gfs.map(gf => (
                  <option key={gf.id} value={gf.id}>{gf.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Keywords <span className="text-[#8B8BA3]">(comma separated)</span>
              </label>
              <Input
                value={form.keys}
                onChange={e => setForm(f => ({ ...f, keys: e.target.value }))}
                placeholder="vampire, castle, blood moon"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Content</label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Describe the world knowledge entry..."
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Insertion Order</label>
              <Input
                type="number"
                value={form.insertion_order}
                onChange={e => setForm(f => ({ ...f, insertion_order: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
              <p className="text-xs text-[#8B8BA3] mt-1">Lower numbers are inserted first into the chat context</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.keys || !form.content}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {editEntry ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}