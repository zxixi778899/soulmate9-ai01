import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-shot Telegram bot provisioning, run server-side because
 * api.telegram.org is not reachable from some client networks.
 *
 * GET /api/telegram/setup?code=<TELEGRAM_SETUP_CODE>
 *
 * Registers the webhook (with secret token), bot commands (zh/en) and the
 * public description. Safe to call repeatedly (idempotent).
 */

interface TgResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
}

async function tg(token: string, method: string, params: Record<string, unknown>): Promise<TgResponse> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return (await res.json().catch(() => ({ ok: false }))) as TgResponse;
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const setupCode = process.env.TELEGRAM_SETUP_CODE;
  if (!token || !setupCode) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (request.nextUrl.searchParams.get('code') !== setupCode) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const origin = request.nextUrl.origin; // e.g. https://ozmate.love
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  const results: Record<string, unknown> = {};

  // 1) Who am I (sanity + token validity)
  const me = await tg(token, 'getMe', {});
  results.me = me;

  // 2) Webhook
  const hook = await tg(token, 'setWebhook', {
    url: `${origin}/api/telegram/webhook`,
    ...(webhookSecret ? { secret_token: webhookSecret } : {}),
    allowed_updates: ['message', 'callback_query'],
    max_connections: 40,
  });
  results.setWebhook = hook;
  results.webhookInfo = await tg(token, 'getWebhookInfo', {});

  // 3) Commands (default + per-language)
  const commandsEn = [
    { command: 'chat', description: 'Chat with your companion' },
    { command: 'photo', description: 'Ask her for a new photo' },
    { command: 'girls', description: 'My companions' },
    { command: 'balance', description: 'Membership & credits' },
    { command: 'checkin', description: 'Daily check-in' },
    { command: 'lang', description: 'Language' },
    { command: 'help', description: 'Help' },
  ];
  const commandsZh = [
    { command: 'chat', description: '和她聊天' },
    { command: 'photo', description: '让她发张照片' },
    { command: 'girls', description: '我的伴侣' },
    { command: 'balance', description: '会员与积分' },
    { command: 'checkin', description: '每日签到' },
    { command: 'lang', description: '切换语言' },
    { command: 'help', description: '帮助' },
  ];
  results.setCommandsDefault = await tg(token, 'setMyCommands', { commands: commandsEn });
  results.setCommandsZh = await tg(token, 'setMyCommands', {
    commands: commandsZh,
    language_code: 'zh',
  });

  // 4) Profile texts shown before /start
  results.setDescription = await tg(token, 'setMyDescription', {
    description:
      'SoulMate AI — your companion, right in Telegram. Chat, photos, daily rewards.\n你的 AI 伴侣，直接在 Telegram 里聊天、要照片、领奖励。',
  });
  results.setShortDescription = await tg(token, 'setMyShortDescription', {
    short_description: 'Chat with your SoulMate AI companion 💕',
  });

  logger.info('[tg-setup] provisioning complete', {
    ok: Boolean(me.ok && hook.ok),
  });

  return NextResponse.json(results);
}
