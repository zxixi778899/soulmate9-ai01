'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowUp, ArrowDown, Plus, Trash2, GripVertical, Loader2, Image as ImageIcon,
} from 'lucide-react';

type PageModule = {
  id: string;
  page_id: string;
  module_type: string;
  title: string;
  content: string;
  image_url: string;
  button_text: string;
  button_url: string;
  sort_order: number;
  settings: Record<string, unknown>;
};

const MODULE_TYPES = [
  { value: 'hero', label: ' (Hero)', icon: '' },
  { value: 'text', label: '', icon: '' },
  { value: 'features', label: '', icon: '' },
  { value: 'cta', label: ' (CTA)', icon: '' },
  { value: 'gallery', label: '', icon: '' },
  { value: 'cards', label: '', icon: '' },
];

export default function PageEditor({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [page, setPage] = useState<Record<string, unknown> | null>(null);
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPage = async () => {
    try {
      const { id } = await params;
      const res = await authedFetch(`/api/admin/pages?slug=${id}`);
      if (!res.ok) { toast.error(''); router.push('/admin/pages'); return; }
      const data = await res.json();
      setPage(data);
      setModules(data.modules || []);
    } catch (e) {
      toast.error('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPage(); }, []);

  const moveModule = async (index: number, direction: 'up' | 'down') => {
    const newModules = [...modules];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newModules.length) return;
    [newModules[index], newModules[swapIdx]] = [newModules[swapIdx], newModules[index]];
    newModules.forEach((m, i) => m.sort_order = i);
    setModules(newModules);

    await authedFetch('/api/admin/pages/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', modules: newModules.map(m => ({ id: m.id, sort_order: m.sort_order })) }),
    });
  };

  const deleteModule = async (modId: string) => {
    if (!confirm('')) return;
    await authedFetch('/api/admin/pages/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: modId }),
    });
    setModules(modules.filter(m => m.id !== modId));
    toast.success('');
  };

  const addModule = async (type: string) => {
    const { id } = await params;
    const res = await authedFetch('/api/admin/pages/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: id,
        module_type: type,
        title: '',
        content: '',
        sort_order: modules.length,
      }),
    });
    if (!res.ok) { toast.error(''); return; }
    const mod = await res.json();
    setModules([...modules, mod]);
    toast.success('');
  };

  const updateModule = async (modId: string, field: string, value: string | number | boolean) => {
    setModules(modules.map(m => m.id === modId ? { ...m, [field]: value } : m));
    await authedFetch('/api/admin/pages/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: modId, [field]: value }),
    });
  };

  if (loading) return (
    <div className="flex h-full items-center justify-center p-6">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
    </div>
  );

  const moduleIcons: Record<string, string> = { hero: '', text: '', features: '', cta: '', gallery: '', cards: '' };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push('/admin/pages')} className="text-sm text-[#8B8BA3] hover:text-white mb-1">
             
          </button>
          <h1 className="text-2xl font-bold">{page?.title as string} - </h1>
          <p className="text-sm text-[#8B8BA3]">/{page?.slug as string}</p>
        </div>
        <div className="flex gap-2">
          <Select onValueChange={(v) => addModule(v)}>
            <SelectTrigger className="w-44">
              <Plus className="h-4 w-4 mr-2" /> 
            </SelectTrigger>
            <SelectContent>
              {MODULE_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {modules.length === 0 ? (
        <Card className="border-white/[0.05] bg-card/40">
          <CardContent className="p-12 text-center">
            <p className="text-[#8B8BA3] mb-4"></p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((mod, index) => (
            <Card key={mod.id} className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moveModule(index, 'up')}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === modules.length - 1} onClick={() => moveModule(index, 'down')}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {moduleIcons[mod.module_type] || ''} {MODULE_TYPES.find(t => t.value === mod.module_type)?.label || mod.module_type}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => deleteModule(mod.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      placeholder=""
                      value={mod.title}
                      onChange={e => updateModule(mod.id, 'title', e.target.value)}
                    />
                    <Textarea
                      placeholder={mod.module_type === 'hero' ? '...' : '...'}
                      value={mod.content}
                      onChange={e => updateModule(mod.id, 'content', e.target.value)}
                      rows={3}
                    />
                    {(mod.module_type === 'hero' || mod.module_type === 'cta' || mod.module_type === 'cards') && (
                      <div className="flex gap-2">
                        <Input
                          placeholder=""
                          value={mod.button_text}
                          onChange={e => updateModule(mod.id, 'button_text', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder=""
                          value={mod.button_url}
                          onChange={e => updateModule(mod.id, 'button_url', e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    )}
                    {(mod.module_type === 'hero' || mod.module_type === 'gallery' || mod.module_type === 'cards') && (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder=" URL"
                          value={mod.image_url}
                          onChange={e => updateModule(mod.id, 'image_url', e.target.value)}
                          className="flex-1"
                        />
                        {mod.image_url && (
                          <img src={mod.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}