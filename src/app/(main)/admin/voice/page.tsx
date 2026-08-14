'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Volume2, Plus, Trash2, Play, Loader2, RefreshCw, X, Save,
} from 'lucide-react';
import { VOICE_EMOTIONS, emotionLabel } from '@/lib/tts-emotion';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface VoiceProfile {
  id: string;
  companion_id: string;
  companion_name?: string;
  name: string;
  engine: string;
  language: string;
  pitch: number;
  speed: number;
  reference_audio_url?: string;
  voice_id?: string;
  emotion_presets?: string[];
}

interface Companion {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const emptyProfile = (): VoiceProfile => ({
  id: '',
  companion_id: '',
  name: '',
  engine: 'fish-speech',
  language: 'auto',
  pitch: 1.0,
  speed: 1.0,
  reference_audio_url: '',
  voice_id: '',
  emotion_presets: [],
});

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminVoicePage() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [ttsConfigured, setTtsConfigured] = useState(false);

  // Edit form state
  const [editing, setEditing] = useState<VoiceProfile | null>(null);

  /* ---------- data loading ---------- */

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/voice');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
        setTtsConfigured(data.tts?.configured ?? false);
      }
    } catch (e) {
      logger.error('Failed to fetch voice profiles', { err: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    authedFetch('/api/admin/girlfriends')
      .then((r) => r.json())
      .then((data) => {
        const items = data.items || data || [];
        setCompanions(items.map((g: Record<string, unknown>) => ({ id: String(g.id), name: String(g.name) })));
      })
      .catch(() => {});
  }, []);

  /* ---------- companion name lookup ---------- */

  const companionName = (id: string) => {
    const c = companions.find((c) => c.id === id);
    return c?.name || id.slice(0, 8);
  };

  /* ---------- CRUD ---------- */

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.companion_id) {
      toast.error('Please select a companion');
      return;
    }
    if (!editing.name.trim()) {
      toast.error('Voice name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        toast.success('Voice profile saved');
        setEditing(null);
        fetchProfiles();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Save failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (companionId: string) => {
    if (!confirm('Delete this voice profile?')) return;
    try {
      const res = await authedFetch(`/api/admin/voice?companion_id=${companionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Deleted');
        fetchProfiles();
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleTest = async (companionId: string) => {
    setTesting(companionId);
    setTestAudioUrl(null);
    try {
      const res = await authedFetch('/api/admin/voice', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companion_id: companionId,
          text: 'Hello, this is a test of my voice. How do I sound?',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestAudioUrl(data.audio_url || data.preview_url);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Synthesis failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setTesting(null);
    }
  };

  /* ---------- emotion toggle ---------- */

  const toggleEmotion = (emotion: string) => {
    if (!editing) return;
    const current = editing.emotion_presets || [];
    const next = current.includes(emotion)
      ? current.filter((e) => e !== emotion)
      : [...current, emotion];
    setEditing({ ...editing, emotion_presets: next });
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Volume2 className="h-6 w-6 text-purple-400" />
            Voice Management
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-block h-2 w-2 rounded-full ${ttsConfigured ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            <span className="text-xs text-slate-400">
              {ttsConfigured ? 'TTS Active' : 'TTS Not Configured'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchProfiles} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing(emptyProfile())}
            className="gap-1.5 bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Profile
          </Button>
        </div>
      </div>

      {/* Test audio player */}
      {testAudioUrl && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Play className="h-4 w-4 text-emerald-400 shrink-0" />
            <audio controls src={testAudioUrl} className="flex-1 h-8" />
            <Button variant="ghost" size="sm" onClick={() => setTestAudioUrl(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Profiles grid */}
      {profiles.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardContent className="p-12 text-center">
            <Volume2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No voice profiles configured</p>
            <Button
              size="sm"
              className="mt-4 bg-purple-600 hover:bg-purple-700"
              onClick={() => setEditing(emptyProfile())}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first profile
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {profiles.map((p) => (
            <Card key={p.id} className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-5 space-y-3">
                {/* Profile header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                    <p className="text-xs text-slate-400">
                      {companionName(p.companion_id)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge className="text-[10px] bg-purple-500/20 text-purple-300">
                      {p.engine}
                    </Badge>
                    <Badge className="text-[10px] bg-blue-500/20 text-blue-300">
                      {p.language}
                    </Badge>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Pitch:</span>{' '}
                    <span className="text-slate-200">{p.pitch?.toFixed(2) ?? '1.00'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Speed:</span>{' '}
                    <span className="text-slate-200">{p.speed?.toFixed(2) ?? '1.00'}</span>
                  </div>
                </div>

                {/* Emotion presets */}
                {p.emotion_presets && p.emotion_presets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.emotion_presets.map((em) => (
                      <Badge
                        key={em}
                        className="text-[10px] bg-amber-500/15 text-amber-300"
                      >
                        {emotionLabel(em, 'zh')}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Reference audio */}
                {p.reference_audio_url && (
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Reference audio</span>
                    <audio controls src={p.reference_audio_url} className="h-7 w-full" />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-white/[0.06]">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={testing === p.companion_id || !ttsConfigured}
                    onClick={() => handleTest(p.companion_id)}
                  >
                    {testing === p.companion_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {testing === p.companion_id ? 'Synthesizing...' : 'Test'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setEditing({ ...p })}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-red-400 hover:text-red-300"
                    onClick={() => handleDelete(p.companion_id)}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a28] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {editing.id ? 'Edit Profile' : 'Add Profile'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Companion selector */}
              <div>
                <Label className="text-xs text-slate-400">Companion</Label>
                <Select
                  value={editing.companion_id || '__none__'}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      companion_id: v === '__none__' ? '' : v,
                      id: v === '__none__' ? '' : `vp_${v}`,
                    })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select companion" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select companion</SelectItem>
                    {companions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Voice name */}
              <div>
                <Label className="text-xs text-slate-400">Voice Name</Label>
                <Input
                  className="mt-1"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Soft Female EN"
                />
              </div>

              {/* Engine + Language row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-400">Engine</Label>
                  <Select
                    value={editing.engine}
                    onValueChange={(v) => setEditing({ ...editing, engine: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fish-speech">fish-speech</SelectItem>
                      <SelectItem value="cosyvoice">cosyvoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-400">Language</Label>
                  <Select
                    value={editing.language}
                    onValueChange={(v) => setEditing({ ...editing, language: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="en">en</SelectItem>
                      <SelectItem value="zh">zh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pitch slider */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-400">Pitch</Label>
                  <span className="text-xs text-slate-300 font-mono">
                    {editing.pitch.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={editing.pitch}
                  onChange={(e) =>
                    setEditing({ ...editing, pitch: parseFloat(e.target.value) })
                  }
                  className="mt-1 w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0.80</span>
                  <span>1.30</span>
                </div>
              </div>

              {/* Speed slider */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-400">Speed</Label>
                  <span className="text-xs text-slate-300 font-mono">
                    {editing.speed.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={editing.speed}
                  onChange={(e) =>
                    setEditing({ ...editing, speed: parseFloat(e.target.value) })
                  }
                  className="mt-1 w-full accent-purple-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0.70</span>
                  <span>1.20</span>
                </div>
              </div>

              {/* Reference audio URL */}
              <div>
                <Label className="text-xs text-slate-400">Reference Audio URL</Label>
                <Input
                  className="mt-1 font-mono text-sm"
                  value={editing.reference_audio_url || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, reference_audio_url: e.target.value || undefined })
                  }
                  placeholder="https://..."
                />
              </div>

              {/* Voice ID */}
              <div>
                <Label className="text-xs text-slate-400">Voice ID (optional)</Label>
                <Input
                  className="mt-1 font-mono text-sm"
                  value={editing.voice_id || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, voice_id: e.target.value || undefined })
                  }
                  placeholder="e.g. alice_en"
                />
              </div>

              {/* Emotion presets */}
              <div>
                <Label className="text-xs text-slate-400 mb-2 block">Emotion Presets</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(VOICE_EMOTIONS).map((em) => {
                    const active = (editing.emotion_presets || []).includes(em);
                    return (
                      <button
                        key={em}
                        type="button"
                        onClick={() => toggleEmotion(em)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/[0.06] text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {emotionLabel(em, 'zh')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-white/[0.08]">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
