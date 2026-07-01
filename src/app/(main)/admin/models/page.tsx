'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Settings, Save } from 'lucide-react';
import { toast } from 'sonner';

type ModelSetting = {
  key: string;
  label: string;
  type: 'select' | 'text' | 'number';
  value: string;
  options?: { label: string; value: string }[];
};

export default function AdminModelsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ModelSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/models');
      const data = await res.json();
      // Expect data.settings or data to be an array of {key, label, type, value, options?}
      if (data.settings) setSettings(data.settings);
      else if (Array.isArray(data)) setSettings(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load model settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSetting = (key: string, newValue: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value: newValue } : s))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = settings.map((s) => ({
        key: s.key,
        value: s.value,
      }));

      const res = await authedFetch('/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Settings saved successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Model & Settings</h1>
          <p className="text-sm text-[#8B8BA3] mt-1">Configure AI models and system settings</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-[#FF2D78]" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings.length === 0 ? (
            <p className="text-sm text-[#8B8BA3] text-center py-8">No settings available</p>
          ) : (
            <div className="space-y-6">
              {settings.map((setting) => (
                <div key={setting.key} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                  <div>
                    <Label htmlFor={`setting-${setting.key}`} className="text-sm font-medium">
                      {setting.label || setting.key}
                    </Label>
                    <p className="text-[10px] text-[#8B8BA3] mt-0.5">{setting.key}</p>
                  </div>
                  <div className="sm:col-span-2">
                    {setting.type === 'select' && setting.options ? (
                      <Select
                        value={setting.value}
                        onValueChange={(v) => updateSetting(setting.key, v)}
                      >
                        <SelectTrigger id={`setting-${setting.key}`} className="w-full sm:max-w-sm">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {setting.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`setting-${setting.key}`}
                        type={setting.type === 'number' ? 'number' : 'text'}
                        value={setting.value}
                        onChange={(e) => updateSetting(setting.key, e.target.value)}
                        className="w-full sm:max-w-sm"
                      />
                    )}
                    {!setting.options && setting.type === 'select' && (
                      <Input
                        id={`setting-${setting.key}`}
                        value={setting.value}
                        onChange={(e) => updateSetting(setting.key, e.target.value)}
                        className="w-full sm:max-w-sm"
                        placeholder="Enter value..."
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}