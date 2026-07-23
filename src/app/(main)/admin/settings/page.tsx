'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Settings, Globe } from 'lucide-react';
import { toast } from 'sonner';

type SiteSettings = {
  site_name: string;
  support_email: string;
  telegram_url: string;
  x_url: string;
  discord_url: string;
  footer_tagline: string;
  maintenance_mode: boolean;
  home_hot_limit: number;
  recharge_banner_title: string;
  recharge_banner_desc: string;
  achievement_banner_title: string;
  achievement_banner_desc: string;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState('');

  useEffect(() => {
    authedFetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setSource(data.source || '');
      })
      .catch(() => toast.error('加载设置失败'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setSettings(data.settings);
      toast.success('站点设置已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B] flex items-center gap-2">
            <Settings className="h-6 w-6 text-[#2563EB]" /> 站点设置
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            页脚链接、客服与首页广告文案 · 存储: {source || '—'}
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving} className="gap-1.5 bg-[#2563EB]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </div>

      <div className="space-y-4">
        <Card className="border-[#E2E8F0]">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1E293B]">
              <Globe className="h-4 w-4" /> 基础信息
            </div>
            <div>
              <Label>站点名称</Label>
              <Input value={settings.site_name} onChange={(e) => set('site_name', e.target.value)} />
            </div>
            <div>
              <Label>客服邮箱</Label>
              <Input value={settings.support_email} onChange={(e) => set('support_email', e.target.value)} />
            </div>
            <div>
              <Label>页脚标语</Label>
              <Textarea value={settings.footer_tagline} onChange={(e) => set('footer_tagline', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>维护模式</Label>
                <p className="text-[11px] text-[#94A3B8]">开启后前台可提示维护（需前台对接）</p>
              </div>
              <Switch checked={settings.maintenance_mode} onCheckedChange={(v) => set('maintenance_mode', v)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-5 space-y-4">
            <div className="text-sm font-semibold text-[#1E293B]">社交 / 客服链接</div>
            <div>
              <Label>Telegram 客服</Label>
              <Input value={settings.telegram_url} onChange={(e) => set('telegram_url', e.target.value)} placeholder="https://t.me/..." />
            </div>
            <div>
              <Label>X (Twitter) 主页</Label>
              <Input value={settings.x_url} onChange={(e) => set('x_url', e.target.value)} placeholder="https://x.com/..." />
            </div>
            <div>
              <Label>Discord</Label>
              <Input value={settings.discord_url} onChange={(e) => set('discord_url', e.target.value)} placeholder="可选" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0]">
          <CardContent className="p-5 space-y-4">
            <div className="text-sm font-semibold text-[#1E293B]">首页运营</div>
            <div>
              <Label>热门伴侣数量</Label>
              <Input
                type="number"
                value={settings.home_hot_limit}
                onChange={(e) => set('home_hot_limit', Number(e.target.value) || 12)}
              />
            </div>
            <div>
              <Label>充值广告标题</Label>
              <Input value={settings.recharge_banner_title} onChange={(e) => set('recharge_banner_title', e.target.value)} />
            </div>
            <div>
              <Label>充值广告描述</Label>
              <Input value={settings.recharge_banner_desc} onChange={(e) => set('recharge_banner_desc', e.target.value)} />
            </div>
            <div>
              <Label>成就广告标题</Label>
              <Input value={settings.achievement_banner_title} onChange={(e) => set('achievement_banner_title', e.target.value)} />
            </div>
            <div>
              <Label>成就广告描述</Label>
              <Input value={settings.achievement_banner_desc} onChange={(e) => set('achievement_banner_desc', e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
