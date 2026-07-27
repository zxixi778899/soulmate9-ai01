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
  Loader2, RefreshCw, Plus, Trash2, Play, Zap, MessageSquare,
  ImageIcon, Mic, Video, Settings, GripVertical, CheckCircle2,
  XCircle, AlertTriangle,
} from 'lucide-react';

// --- Types ---

interface HubData {
  chat: { primary_model: string; primary_model_id: string; status: string; today_messages: number; endpoints_count: number; enabled_count: number };
  image: { endpoint: string; endpoint_label: string; status: string; today_images: number; routes_count: number; enabled_count: number };
  voice: { configured: boolean; profiles_count: number };
  video: { configured: boolean };
  llm_routes: LlmRoute[];
  image_health: ImageHealth[];
  circuit_breakers: Record<string, { open: boolean; failures: number }>;
}

interface LlmRoute {
  id: string; label: string; provider: string; model_id: string;
  enabled: boolean; priority: number; nsfw_capable: boolean;
  tiers: string[]; channel: string;
}

interface ImageHealth {
  id: string; provider: string; label: string; enabled: boolean;
  circuit_open: boolean; failures: number; configured: boolean;
}

// --- Helpers ---

const PROVIDER_COLORS: Record<string, string> = {
  runpod: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  runpod_dc2: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  fal: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  together: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  openrouter: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  openai: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  anthropic: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function StatusDot({ status }: { status: string }) {
  const color = status === 'healthy' ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

// --- Main Page ---

export default function AdminAiHubPage() {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [addDialog, setAddDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/ai-hub');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const postAction = async (body: Record<string, unknown>) => {
    try {
      const res = await authedFetch('/api/admin/ai-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      return json;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
      return null;
    }
  };

  const toggleEndpoint = async (routeId: string, type: 'llm' | 'image', enabled: boolean) => {
    const res = await postAction({ action: 'toggle_endpoint', route_id: routeId, type, enabled });
    if (res) { toast.success(enabled ? 'Enabled' : 'Disabled'); await load(); }
  };

  const testChat = async (routeId: string) => {
    setTesting(routeId);
    const res = await postAction({ action: 'test_chat', route_id: routeId });
    if (res) {
      if (res.success) toast.success(`OK (${res.latency_ms}ms): ${res.reply?.slice(0, 60) || ''}`);
      else toast.error(`Failed: ${res.error}`);
    }
    setTesting(null);
  };

  const resetCircuit = async (routeId: string) => {
    const res = await postAction({ action: 'reset_circuit', route_id: routeId });
    if (res) { toast.success('Circuit breaker reset'); await load(); }
  };

  const moveRoute = (routes: LlmRoute[], fromIdx: number, toIdx: number) => {
    const ids = routes.map((r) => r.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    postAction({ action: 'reorder_llm', ordered_ids: ids }).then((r) => { if (r) load(); });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!data) return null;

  const sortedLlm = [...data.llm_routes].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" /> AI Hub
          </h1>
          <p className="text-sm text-gray-400 mt-1">AI capabilities overview and quick management</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-[#16161f] border border-gray-800">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chat">Chat Models</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>

        {/* === Overview Tab === */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Chat Card */}
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-white">Chat Model</span>
                  </div>
                  <StatusDot status={data.chat.status} />
                </div>
                <p className="text-xs text-gray-400 truncate">{data.chat.primary_model}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Today: {data.chat.today_messages} msgs</span>
                  <span>{data.chat.enabled_count}/{data.chat.endpoints_count} active</span>
                </div>
                <a href="/admin/provider-routes" className="text-xs text-purple-400 hover:underline">Details</a>
              </CardContent>
            </Card>

            {/* Image Card */}
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-white">Image Engine</span>
                  </div>
                  <StatusDot status={data.image.status} />
                </div>
                <p className="text-xs text-gray-400 truncate">{data.image.endpoint_label}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Today: {data.image.today_images} imgs</span>
                  <span>{data.image.enabled_count}/{data.image.routes_count} active</span>
                </div>
                <a href="/admin/provider-routes" className="text-xs text-purple-400 hover:underline">Details</a>
              </CardContent>
            </Card>

            {/* Voice Card */}
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-white">Voice Synth</span>
                  </div>
                  <StatusDot status={data.voice.configured ? 'healthy' : 'off'} />
                </div>
                <p className="text-xs text-gray-400">
                  {data.voice.configured ? `${data.voice.profiles_count} voice profiles` : 'Not configured'}
                </p>
                <div className="text-xs text-gray-500">
                  {data.voice.configured ? 'ElevenLabs / TTS active' : 'Set ELEVENLABS_API_KEY'}
                </div>
                <a href="/admin/settings" className="text-xs text-purple-400 hover:underline">Details</a>
              </CardContent>
            </Card>

            {/* Video Card */}
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-pink-400" />
                    <span className="text-sm font-medium text-white">Video/Animation</span>
                  </div>
                  <StatusDot status={data.video.configured ? 'healthy' : 'off'} />
                </div>
                <p className="text-xs text-gray-400">
                  {data.video.configured ? 'Configured' : 'Not configured'}
                </p>
                <div className="text-xs text-gray-500">
                  {data.video.configured ? 'Runway / Kling active' : 'Set RUNWAY_API_KEY'}
                </div>
                <a href="/admin/settings" className="text-xs text-purple-400 hover:underline">Details</a>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === Chat Models Tab === */}
        <TabsContent value="chat" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">LLM endpoints sorted by priority (drag to reorder)</p>
            <Button size="sm" onClick={() => setAddDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Endpoint
            </Button>
          </div>

          {sortedLlm.map((route, idx) => (
            <Card key={route.id} className={`bg-[#16161f] border-gray-800 ${!route.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button className="text-gray-600 hover:text-gray-300 disabled:opacity-30" disabled={idx === 0}
                      onClick={() => moveRoute(sortedLlm, idx, idx - 1)}>
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{route.label}</span>
                      <Badge variant="outline" className={PROVIDER_COLORS[route.provider] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}>
                        {route.provider}
                      </Badge>
                      {route.tiers.map((t) => (
                        <Badge key={t} variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-xs">{t}</Badge>
                      ))}
                      {route.nsfw_capable && (
                        <Badge variant="outline" className="bg-pink-500/10 text-pink-400 border-pink-500/30 text-xs">NSFW</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="font-mono">{route.model_id}</span>
                      <span>Priority: {route.priority}</span>
                      <span>Channel: {route.channel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => testChat(route.id)} disabled={testing === route.id}>
                      {testing === route.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Switch checked={route.enabled} onCheckedChange={(v) => toggleEndpoint(route.id, 'llm', v)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* === Routes Tab === */}
        <TabsContent value="routes" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Image provider fallback chain and circuit breaker status</p>
            <Button variant="outline" size="sm" onClick={() => resetCircuit('all')}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset All Circuits
            </Button>
          </div>

          {/* Visual flow */}
          <Card className="bg-[#16161f] border-gray-800">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 flex-wrap">
                {data.image_health.filter((h) => h.enabled).sort((a, b) => a.id.localeCompare(b.id)).map((h, idx) => (
                  <div key={h.id} className="flex items-center gap-2">
                    {idx > 0 && <span className="text-gray-600 text-lg">&rarr;</span>}
                    <div className={`px-3 py-2 rounded-lg border text-xs ${
                      h.circuit_open ? 'border-red-500/40 bg-red-500/10' :
                      h.configured ? 'border-emerald-500/40 bg-emerald-500/10' :
                      'border-gray-700 bg-gray-800/50'
                    }`}>
                      <div className="font-medium text-white">{h.label}</div>
                      <div className="flex items-center gap-1 mt-1">
                        {h.circuit_open ? (
                          <span className="text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Open ({h.failures})</span>
                        ) : h.configured ? (
                          <span className="text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Ready</span>
                        ) : (
                          <span className="text-gray-500">Not configured</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Per-route circuit status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.image_health.map((h) => {
              const cb = data.circuit_breakers[h.id];
              return (
                <Card key={h.id} className="bg-[#16161f] border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white">{h.label}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={PROVIDER_COLORS[h.provider] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'}>
                            {h.provider}
                          </Badge>
                          {!h.enabled && <Badge variant="outline" className="bg-gray-600/20 text-gray-400 border-gray-600/30">Disabled</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cb?.open && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => resetCircuit(h.id)}>
                            Reset
                          </Button>
                        )}
                        <span className={`w-3 h-3 rounded-full ${cb?.open ? 'bg-red-400' : cb?.failures ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      </div>
                    </div>
                    {cb && (cb.failures > 0 || cb.open) && (
                      <p className="text-xs text-gray-500 mt-2">Failures: {cb.failures} | Circuit: {cb.open ? 'OPEN' : 'closed'}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* === Presets Tab === */}
        <TabsContent value="presets" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Quick access to scene presets and generation settings</p>
            <a href="/admin/presets">
              <Button variant="outline" size="sm">
                <Settings className="w-3.5 h-3.5 mr-1" /> Full Preset Manager
              </Button>
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-medium text-white">Scene Templates</h3>
                <p className="text-xs text-gray-500">Hot scene presets for pre-generation</p>
                <a href="/admin/presets" className="text-xs text-purple-400 hover:underline">Manage</a>
              </CardContent>
            </Card>
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-medium text-white">Character References</h3>
                <p className="text-xs text-gray-500">Reference image packs for consistency</p>
                <a href="/admin/presets" className="text-xs text-purple-400 hover:underline">Manage</a>
              </CardContent>
            </Card>
            <Card className="bg-[#16161f] border-gray-800">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-medium text-white">Voice Profiles</h3>
                <p className="text-xs text-gray-500">{data.voice.profiles_count} configured</p>
                <a href="/admin/presets" className="text-xs text-purple-400 hover:underline">Manage</a>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Endpoint Dialog */}
      <AddEndpointDialog open={addDialog} onClose={() => setAddDialog(false)} onSaved={() => { setAddDialog(false); load(); }} postAction={postAction} />
    </div>
  );
}

// --- Add Endpoint Dialog ---

function AddEndpointDialog({ open, onClose, onSaved, postAction }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  postAction: (body: Record<string, unknown>) => Promise<any>;
}) {
  const [form, setForm] = useState({
    id: '', label: '', provider: 'openrouter', model_id: '',
    api_base_url: '', api_key_env: '', nsfw_capable: false,
    channel: 'both', tiers: 'pro,unlimited',
  });

  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    if (!form.id || !form.label) { toast.error('ID and label are required'); return; }
    const res = await postAction({
      action: 'add_llm_route',
      route: {
        id: form.id,
        label: form.label,
        provider: form.provider,
        model_id: form.model_id,
        api_base_url: form.api_base_url || undefined,
        api_key_env: form.api_key_env || undefined,
        nsfw_capable: form.nsfw_capable,
        channel: form.channel,
        tiers: form.tiers.split(',').map((t) => t.trim()).filter(Boolean),
      },
    });
    if (res) { toast.success('Endpoint added'); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a25] border-gray-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Add LLM Endpoint</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">ID</Label>
              <Input value={form.id} onChange={(e) => update({ id: e.target.value })} placeholder="my-endpoint" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => update({ provider: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['runpod', 'together', 'openrouter', 'openai', 'anthropic'].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Label</Label>
            <Input value={form.label} onChange={(e) => update({ label: e.target.value })} placeholder="Display name" className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-400">Model ID</Label>
            <Input value={form.model_id} onChange={(e) => update({ model_id: e.target.value })} placeholder="model-name" className="bg-[#0f0f17] border-gray-700 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">API Base URL</Label>
              <Input value={form.api_base_url} onChange={(e) => update({ api_base_url: e.target.value })} placeholder="https://..." className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">API Key Env</Label>
              <Input value={form.api_key_env} onChange={(e) => update({ api_key_env: e.target.value })} placeholder="MY_API_KEY" className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Channel</Label>
              <Select value={form.channel} onValueChange={(v) => update({ channel: v })}>
                <SelectTrigger className="bg-[#0f0f17] border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sfw">SFW</SelectItem>
                  <SelectItem value="nsfw">NSFW</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Tiers (comma-sep)</Label>
              <Input value={form.tiers} onChange={(e) => update({ tiers: e.target.value })} className="bg-[#0f0f17] border-gray-700 text-sm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <Switch checked={form.nsfw_capable} onCheckedChange={(v) => update({ nsfw_capable: v })} />
            NSFW Capable
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!form.id || !form.label} className="bg-purple-600 hover:bg-purple-700">Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
