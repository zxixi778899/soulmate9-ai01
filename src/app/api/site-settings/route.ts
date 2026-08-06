import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

const DEFAULTS = {
  site_name: 'SoulMate AI',
  support_email: 'support@oxmate-ai.com',
  telegram_url: 'https://t.me/oxmate_bot',
  x_url: 'https://x.com/ozmate',
  discord_url: '',
  footer_tagline: 'AI 伴侣养成 · 高 NSFW · 私密对话',
  maintenance_mode: false,
  shop_enabled: false,
  home_hot_limit: 12,
  recharge_banner_title: '充值活动 · 首充双倍积分',
  recharge_banner_desc: '限时优惠 · 仅限首次充值',
  achievement_banner_title: '成就有礼 · 完成任务领奖励',
  achievement_banner_desc: '亲密里程碑 · 代币 / 装扮掉落',
  announcement_enabled: false,
  announcement_text: '',
  announcement_link: '',
};

/**
 * Public site settings endpoint — no auth required.
 * Frontend components (Footer, homepage banners) read from here.
 */
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', Object.keys(DEFAULTS));

    if (!error && data?.length) {
      const map: Record<string, unknown> = {};
      for (const row of data) map[row.key] = row.value;
      return NextResponse.json({ settings: { ...DEFAULTS, ...map } });
    }

    return NextResponse.json({ settings: DEFAULTS });
  } catch {
    return NextResponse.json({ settings: DEFAULTS });
  }
}
