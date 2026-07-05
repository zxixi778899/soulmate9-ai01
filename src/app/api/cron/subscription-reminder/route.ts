/**
 * Cron: 订阅到期提醒（提前 3 天）
 * 调用方：Vercel Cron / 外部 cron（每天 09:00 UTC）
 * 鉴权：CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest } from '@/lib/logger';
import { sendSubscriptionRenewalReminder } from '@/lib/email';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(req: NextRequest) {
  // 鉴权
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const log = loggerFromRequest(req);
  const supabase = getSupabaseClient();

  // 查找 3 天后到期的 active 订阅
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('user_id, plan_id, current_period_end')
    .eq('status', 'active')
    .gte('current_period_end', threeDaysFromNow.toISOString())
    .lt('current_period_end', fourDaysFromNow.toISOString());

  if (error) {
    log.error('cron-subscription-reminder: query failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  log.info('cron-subscription-reminder: candidates', { count: subs?.length ?? 0 });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subs || []) {
    // 去重：同一订阅只发一次（通过 metadata 或 user_meta 字段标记）
    const dedupeKey = `renewal_reminded_${sub.user_id}_${sub.plan_id}_${sub.current_period_end}`;
    const { data: existing } = await supabase
      .from('user_meta')
      .select('value')
      .eq('user_id', sub.user_id)
      .eq('key', dedupeKey)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    // 拿邮箱
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', sub.user_id)
      .single();

    if (!profile?.email) {
      skipped++;
      continue;
    }

    const result = await sendSubscriptionRenewalReminder({
      to: profile.email,
      userId: sub.user_id,
      planName: sub.plan_id,
      renewalDate: new Date(sub.current_period_end),
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://soulmate9.com'}/account/subscription`,
    });

    if (result.ok) {
      // 标记已发
      await supabase.from('user_meta').upsert({
        user_id: sub.user_id,
        key: dedupeKey,
        value: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
      sent++;
    } else {
      failed++;
    }
  }

  log.info('cron-subscription-reminder: done', { sent, skipped, failed });
  return NextResponse.json({ ok: true, sent, skipped, failed });
}
