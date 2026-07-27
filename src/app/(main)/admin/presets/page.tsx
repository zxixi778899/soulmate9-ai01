'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, Plus, Trash2, Play, Zap, ImageIcon,
  Mic, Settings, CheckCircle2, XCircle,
} from 'lucide-react';

// --- Types ---

interface SceneTemplate {
  id: string; name: string; prompt_template: string; category: string;
  tags: string[]; weight: number; negative_prompt: string;
  width: number; height: number; steps: number; cfg: number; enabled: boolean;
}

interface CharacterReference {
  id: string; image_url: string; character_name: string;
  companion_id: string | null; tags: string[]; notes: string;
}

interface GenPreset {
  id: string; name: string; checkpoint: string; lora_stack: any[];
  steps: number; cfg: number; sampler: string; scheduler: string;
  width: number; height: number; notes: string;
}

// --- Main Page ---

export default function AdminPresetsPage() {
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [references, setReferences] = useState<CharacterReference[]>([]);
  const [genPresets, setGenPresets] = useState<GenPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ type: 'template' | 'reference' | 'gen_preset'; item?: any } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/presets');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setTemplates(json.templates || []);
      setReferences(json.references || []);
      setGenPresets(json.gen_presets || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteItem = async (type: string, id: string) => {
    if (!confirm('Confirm delete?')) return;
    try {
      const res = await authedFetch(`/api/admin/presets?type=${type}&id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast.success('Deleted');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const toggleTemplate = async (id: string, enabled: boolean) => {
    try {
      const res = await authedFetch('/api/admin/presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'template', id, data: { enabled } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      toast.success(enabled ? 'Enabled' : 'Disabled');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  if (loading && !templates.length && !references.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-400" /> Preset Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">Scene templates, character references, and generation presets</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList className="bg-[#16161f] border border-gray-800">
          <TabsTrigger value="templates">Scene Templates</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="gen_presets">Gen Presets</TabsTrigger>
        </TabsList>

        {/* === Scene Templates Tab === */}
        <TabsContent value="templates" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{templates.length} templates</p>
            <Button size="sm" onClick={() => setDialog({ type: 'template' })}>
              <Plus className="w-4 h-4 mr-1" /> Add Template
            </Button>
          </div>

          {templates.map((t) => (
            <Card key={t.id} className={`bg-[#16161f] border-gray-800 ${!t.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{t.name || t.category}</span>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">{t.category}</Badge>
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/30 text-xs">W:{t.weight}</Badge>
                      {(t.tags || []).map((tag) => (
                        <Badge key={tag} variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">{tag}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.prompt_template}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      <span>{t.width}x{t.height}</span>
                      <span>Steps: {t.steps}</span>
                      <span>CFG: {t.cfg}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                      onClick={() => deleteItem('template', t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Switch checked={t.enabled} onCheckedChange={(v) => toggleTemplate(t.id, v)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {!templates.length && (
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No scene templates yet. Add one to get started.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === References Tab === */}
        <TabsContent value="references" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{references.length} reference images</p>
            <Button size="sm" onClick={() => setDialog({ type: 'reference' })}>
              <Plus className="w-4 h-4 mr-1" /> Add Reference
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {references.map((ref) => (
              <Card key={ref.id} className="bg-[#16161f] border-gray-800 overflow-hidden">
                <div className="aspect-square bg-gray-900 relative">
                  {ref.image_url ? (
                    <img src={ref.image_url} alt={ref.character_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-8 h-8 text-gray-700" />
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">{ref.character_name || 'Unnamed'}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300"
                      onClick={() => deleteItem('reference', ref.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {(ref.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ref.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {!references.length && (
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No character references yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === Gen Presets Tab === */}
        <TabsContent value="gen_presets" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{genPresets.length} generation presets</p>
            <Button size="sm" onClick={() => setDialog({ type: 'gen_preset' })}>
              <Plus className="w-4 h-4 mr-1" /> Add Preset
            </Button>
          </div>

          {genPresets.map((p) => (
            <Card key={p.id} className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {p.checkpoint && <span className="font-mono">{p.checkpoint}</span>}
                      <span>Steps: {p.steps}</span>
                      <span>CFG: {p.cfg}</span>
                      <span>{p.sampler}</span>
                      <span>{p.width}x{p.height}</span>
                    </div>
                    {(p.lora_stack || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.lora_stack.map((l: any, i: number) => (
                          <Badge key={i} variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-xs">
                            {typeof l === 'string' ? l : l.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300"
                    onClick={() => deleteItem('gen_preset', p.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {!genPresets.length && (
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No generation presets yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {dialog?.type === 'template' && (
        <TemplateDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      )}
      {dialog?.type === 'reference' && (
        <ReferenceDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      )}
      {dialog?.type === 'gen_preset' && (
        <GenPresetDialog onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      )}
    </div>
  );
}

// --- Template Dialog ---

function TemplateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', prompt_template: '', category: 'portrait', tags: '',
    weight: 50, negative_prompt: '', width: 704, height: 960, steps: 20, cfg: 2.5,
  });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.prompt_template || !form.category) { toast.error('Prompt and category required'); return; }
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'template',
          data: { ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('Template created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-white">Add Scene Template</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Name</Label>
              <Input value={form.name} onChange={(e) => update({ name: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Category</Label>
              <Select value={form.category} onValueChange={(v) => update({ category: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="selfie">Selfie</SelectItem>
                  <SelectItem value="outfit">Outfit</SelectItem>
                  <SelectItem value="scene">Scene</SelectItem>
                  <SelectItem value="nsfw">NSFW</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Prompt Template</Label>
            <textarea value={form.prompt_template} onChange={(e) => update({ prompt_template: e.target.value })}
              className="w-full min-h-[80px] rounded-md bg-[#0f0f17] border border-gray-700 px-3 py-2 text-sm text-white" placeholder="1girl, {character_desc}, {scene_desc}..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Negative Prompt</Label>
            <Input value={form.negative_prompt} onChange={(e) => update({ negative_prompt: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Width</Label>
              <Input type="number" value={form.width} onChange={(e) => update({ width: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Height</Label>
              <Input type="number" value={form.height} onChange={(e) => update({ height: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Steps</Label>
              <Input type="number" value={form.steps} onChange={(e) => update({ steps: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">CFG</Label>
              <Input type="number" step={0.1} value={form.cfg} onChange={(e) => update({ cfg: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Tags (comma-sep)</Label>
              <Input value={form.tags} onChange={(e) => update({ tags: e.target.value })} placeholder="hot, popular" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Weight</Label>
              <Input type="number" value={form.weight} onChange={(e) => update({ weight: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Reference Dialog ---

function ReferenceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ image_url: '', character_name: '', tags: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.image_url) { toast.error('Image URL required'); return; }
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reference',
          data: { ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('Reference added');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-md">
        <DialogHeader><DialogTitle className="text-white">Add Character Reference</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Image URL</Label>
            <Input value={form.image_url} onChange={(e) => update({ image_url: e.target.value })} placeholder="https://..." className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          {form.image_url && (
            <div className="aspect-video bg-gray-900 rounded-md overflow-hidden">
              <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Character Name</Label>
            <Input value={form.character_name} onChange={(e) => update({ character_name: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Tags (comma-sep)</Label>
            <Input value={form.tags} onChange={(e) => update({ tags: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Notes</Label>
            <Input value={form.notes} onChange={(e) => update({ notes: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Gen Preset Dialog ---

function GenPresetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', checkpoint: '', lora_stack: '', steps: 20, cfg: 2.5,
    sampler: 'euler_ancestral', scheduler: 'normal', width: 704, height: 960, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gen_preset',
          data: {
            ...form,
            lora_stack: form.lora_stack.split(',').map((l) => l.trim()).filter(Boolean).map((name) => ({ name, strength_model: 0.8 })),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('Preset created');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-lg">
        <DialogHeader><DialogTitle className="text-white">Add Generation Preset</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Name</Label>
              <Input value={form.name} onChange={(e) => update({ name: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Checkpoint</Label>
              <Input value={form.checkpoint} onChange={(e) => update({ checkpoint: e.target.value })} placeholder="ponyRealism_v6.safetensors" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">LoRA Stack (comma-sep names)</Label>
            <Input value={form.lora_stack} onChange={(e) => update({ lora_stack: e.target.value })} placeholder="lora1, lora2" className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Steps</Label>
              <Input type="number" value={form.steps} onChange={(e) => update({ steps: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">CFG</Label>
              <Input type="number" step={0.1} value={form.cfg} onChange={(e) => update({ cfg: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Width</Label>
              <Input type="number" value={form.width} onChange={(e) => update({ width: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Height</Label>
              <Input type="number" value={form.height} onChange={(e) => update({ height: +e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Sampler</Label>
              <Select value={form.sampler} onValueChange={(v) => update({ sampler: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="euler_ancestral">euler_ancestral</SelectItem>
                  <SelectItem value="euler">euler</SelectItem>
                  <SelectItem value="dpmpp_2m">dpmpp_2m</SelectItem>
                  <SelectItem value="dpmpp_2m_sde">dpmpp_2m_sde</SelectItem>
                  <SelectItem value="uni_pc">uni_pc</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Scheduler</Label>
              <Select value={form.scheduler} onValueChange={(v) => update({ scheduler: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">normal</SelectItem>
                  <SelectItem value="karras">karras</SelectItem>
                  <SelectItem value="exponential">exponential</SelectItem>
                  <SelectItem value="sgm_uniform">sgm_uniform</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Notes</Label>
            <Input value={form.notes} onChange={(e) => update({ notes: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
