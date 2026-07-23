import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';
import { invalidateSettings } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export type SiteSettings = {
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

const DEFAULTS: SiteSettings = {
  site_name: 'SoulMate AI',
  support_email: 'support@soulmateai.shop',
  telegram_url: 'https://t.me/soulmateai_support',
  x_url: 'https://x.com/soulmateai',
  discord_url: '',
  footer_tagline: 'AI 伴侣养成 · 高 NSFW · 私密对话',
  maintenance_mode: false,
  home_hot_limit: 12,
  recharge_banner_title: '充值活动 · 首充双倍点券',
  recharge_banner_desc: '限时返利 · 解锁限定皮肤礼包',
  achievement_banner_title: '成就有礼 · 完成任务领奖励',
  achievement_banner_desc: '亲密里程碑 · 代币 / 装扮掉落',
};

function settingsPath() {
  return path.join(process.cwd(), 'data', 'site-settings.json');
}

async function loadSettings(): Promise<SiteSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(s: SiteSettings) {
  const dir = path.dirname(settingsPath());
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(s, null, 2), 'utf8');
}

export async function GET(request: NextRequest) {
  // Public-ish read for footer: admin not required for GET of non-sensitive fields
  // but keep admin-only for simplicity of this route; front uses env fallbacks.
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    // Prefer DB site_settings if exists
    const { data, error } = await admin.supabase
      .from('site_settings')
      .select('key, value');

    if (!error && data?.length) {
      const map: Record<string, unknown> = {};
      for (const row of data) map[row.key] = row.value;
      return NextResponse.json({ settings: { ...DEFAULTS, ...map }, source: 'db' });
    }

    const settings = await loadSettings();
    return NextResponse.json({ settings, source: 'file' });
  } catch {
    return NextResponse.json({ settings: DEFAULTS, source: 'default' });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const current = await loadSettings();
    const next: SiteSettings = { ...current };

    (Object.keys(DEFAULTS) as (keyof SiteSettings)[]).forEach((k) => {
      if (k in body) {
        // @ts-expect-error dynamic assign
        next[k] = body[k];
      }
    });

    // Try DB upsert first
    try {
      for (const [key, value] of Object.entries(next)) {
        await admin.supabase.from('site_settings').upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
      }
    } catch {
      /* table may not exist */
    }

    await saveSettings(next);
    invalidateSettings();
    return NextResponse.json({ success: true, settings: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
