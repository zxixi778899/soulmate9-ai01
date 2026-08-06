import { NextRequest, NextResponse } from 'next/server';
import { TelegramApi, type TgCallbackQuery, type TgMessage, type TgUpdate } from '@/lib/telegram-bot/api';
import { resolveSession } from '@/lib/telegram-bot/session';
import {
  downloadAsDataUrl,
  ensureCompanion,
  handleBalance,
  handleChat,
  handleCheckin,
  handleGirls,
  handleImageCheck,
  handleLangMenu,
  handleLangSet,
  handlePhoto,
  handleSwitch,
  mainMenu,
  resolveLocale,
  type BotCtx,
} from '@/lib/telegram-bot/handlers';
import { STR } from '@/lib/telegram-bot/i18n';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WEB_URL = 'https://www.oxmate-ai.com';

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 });
  }

  // Reject forged updates. Telegram echoes this header on every webhook call
  // when configured via setWebhook(secret_token=…).
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const gotSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (expectedSecret && gotSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await dispatch(update, token, request.nextUrl.origin);
  } catch (err) {
    logger.error('[tg-webhook] dispatch failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Always 200 — otherwise Telegram retries the same update repeatedly.
  return NextResponse.json({ ok: true });
}

async function dispatch(update: TgUpdate, token: string, baseUrl: string) {
  const api = new TelegramApi(token);

  if (update.callback_query) {
    await handleCallback(api, update.callback_query, baseUrl);
    return;
  }

  const msg = update.message;
  if (!msg?.from || msg.from.is_bot) return;

  // Groups: only answer explicit commands, everything else is ignored.
  if (msg.chat.type !== 'private') {
    if (msg.text?.startsWith('/')) {
      await api.sendMessage(msg.chat.id, STR.notInGroup.zh);
    }
    return;
  }

  const session = await resolveSession(msg.from.id, {
    first_name: msg.from.first_name,
    last_name: msg.from.last_name,
    username: msg.from.username,
  });
  if (!session) {
    await api.sendMessage(msg.chat.id, STR.error.zh);
    return;
  }

  const locale = resolveLocale(session.binding.locale, msg.from.language_code);
  const ctx: BotCtx = {
    api,
    chatId: msg.chat.id,
    from: msg.from,
    session,
    baseUrl,
    locale,
  };

  await handleMessage(ctx, msg);
}

async function handleMessage(ctx: BotCtx, msg: TgMessage) {
  const L = ctx.locale;
  const text = (msg.text || '').trim();

  if (text.startsWith('/')) {
    const [rawCmd, ...rest] = text.split(/\s+/);
    const cmd = (rawCmd || '').split('@')[0].toLowerCase();
    const arg = rest.join(' ').trim();

    switch (cmd) {
      case '/start':
      case '/help': {
        const hadCompanion = Boolean(ctx.session.binding.current_girlfriend_id);
        const companion = await ensureCompanion(ctx);
        const name = ctx.from.first_name || 'friend';
        if (!hadCompanion && companion) {
          await sendWelcomeWithPortrait(
            ctx,
            name,
            companion.name,
            companion.portrait_url || companion.avatar_url || companion.image_url || null,
          );
        } else if (cmd === '/start') {
          await ctx.api.sendMessage(ctx.chatId, STR.welcomeBack[L](name), {
            reply_markup: mainMenu(ctx),
          });
        }
        if (cmd === '/help') {
          await ctx.api.sendMessage(ctx.chatId, helpText(L), { reply_markup: mainMenu(ctx) });
        }
        return;
      }
      case '/chat': {
        const companion = await ensureCompanion(ctx);
        if (companion) {
          await ctx.api.sendMessage(ctx.chatId, STR.chatHint[L](companion.name));
        }
        return;
      }
      case '/girls':
        await handleGirls(ctx);
        return;
      case '/photo':
        await handlePhoto(ctx, arg || 'a lovely sweet selfie of you');
        return;
      case '/balance':
        await handleBalance(ctx);
        return;
      case '/checkin':
        await handleCheckin(ctx);
        return;
      case '/lang':
        await handleLangMenu(ctx);
        return;
      default:
        await ctx.api.sendMessage(ctx.chatId, helpText(L), { reply_markup: mainMenu(ctx) });
        return;
    }
  }

  // Photo message → forward to the companion as media chat.
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    const dataUrl = await downloadAsDataUrl(ctx.api, largest.file_id, 'image/jpeg');
    if (dataUrl) {
      await handleChat(ctx, msg.caption || '', { dataUrl, type: 'image' });
    } else {
      await handleChat(ctx, msg.caption || '[Photo]');
    }
    return;
  }

  // Voice note → treat as heard audio.
  const voice = msg.voice || msg.audio;
  if (voice) {
    const dataUrl = await downloadAsDataUrl(
      ctx.api,
      voice.file_id,
      voice.mime_type || 'audio/ogg',
    );
    if (dataUrl) {
      await handleChat(ctx, '[Voice message]', { dataUrl, type: 'audio' });
    } else {
      await handleChat(ctx, '[Voice message]');
    }
    return;
  }

  if (text) {
    await handleChat(ctx, text);
    return;
  }

  // Stickers / unsupported media: acknowledge lightly.
  await handleChat(ctx, '[Sticker]');
}

async function sendWelcomeWithPortrait(
  ctx: BotCtx,
  name: string,
  companionName: string,
  portraitUrl: string | null,
) {
  const L = ctx.locale;
  const welcome = STR.welcomeNew[L](name, companionName) + STR.accountNote[L];
  if (portraitUrl && /^https?:\/\//i.test(portraitUrl)) {
    const sent = await ctx.api.sendPhoto(ctx.chatId, portraitUrl, welcome, mainMenu(ctx));
    if (sent.ok) return;
  }
  await ctx.api.sendMessage(ctx.chatId, welcome, { reply_markup: mainMenu(ctx) });
}

function helpText(locale: 'zh' | 'en'): string {
  return locale === 'zh'
    ? '命令列表：\n' +
        '/chat — 和当前伴侣聊天\n' +
        '/photo [场景] — 让她发一张新照片\n' +
        '/girls — 查看/切换伴侣\n' +
        '/balance — 会员与积分\n' +
        '/checkin — 每日签到领积分\n' +
        '/lang — 切换语言\n' +
        '/help — 显示此帮助\n\n' +
        `网页版：${WEB_URL}`
    : 'Commands:\n' +
        '/chat — chat with your companion\n' +
        '/photo [scene] — ask her for a new photo\n' +
        '/girls — view / switch companions\n' +
        '/balance — membership & credits\n' +
        '/checkin — daily check-in credits\n' +
        '/lang — switch language\n' +
        '/help — show this help\n\n' +
        `Web: ${WEB_URL}`;
}

async function handleCallback(api: TelegramApi, cb: TgCallbackQuery, baseUrl: string) {
  void api.answerCallbackQuery(cb.id);

  const chatId = cb.message?.chat?.id || cb.from.id;
  const data = cb.data || '';

  // Language switch needs no session round-trip beyond binding update.
  const session = await resolveSession(cb.from.id, {
    first_name: cb.from.first_name,
    last_name: cb.from.last_name,
    username: cb.from.username,
  });
  if (!session) return;

  const locale = resolveLocale(session.binding.locale, cb.from.language_code);
  const ctx: BotCtx = {
    api,
    chatId,
    from: cb.from,
    session,
    baseUrl,
    locale,
  };

  if (data === 'lang:zh' || data === 'lang:en') {
    await handleLangSet(ctx, data === 'lang:zh' ? 'zh' : 'en');
    return;
  }

  if (data.startsWith('gf:')) {
    await handleSwitch(ctx, data.slice(3));
    return;
  }

  switch (data) {
    case 'm:chat': {
      const companion = await ensureCompanion(ctx);
      if (companion) {
        await api.sendMessage(chatId, STR.chatHint[ctx.locale](companion.name));
      }
      return;
    }
    case 'm:photo':
      await handlePhoto(ctx, 'a lovely sweet selfie of you');
      return;
    case 'm:girls':
      await handleGirls(ctx);
      return;
    case 'm:bal':
      await handleBalance(ctx);
      return;
    case 'm:checkin':
      await handleCheckin(ctx);
      return;
    case 'm:lang':
      await handleLangMenu(ctx);
      return;
    case 'imgck':
      await handleImageCheck(ctx);
      return;
    default:
      return;
  }
}
