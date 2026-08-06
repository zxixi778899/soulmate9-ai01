/**
 * Telegram bot command / callback handlers.
 *
 * The bot reuses the site's own authenticated APIs (chat/stream,
 * chat/generate-image, checkin, friends…) via an `x-session` header, so all
 * business rules (tier limits, credits, access control, memory extraction)
 * stay in one place.
 */

import { TelegramApi, type InlineKeyboard, type TgUser } from './api';
import { STR, TIER_NAMES, type BotLocale } from './i18n';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import type { Binding, BotSession } from './session';
import { updateBinding } from './session';

export interface BotCtx {
  api: TelegramApi;
  chatId: number;
  from: TgUser;
  session: BotSession;
  baseUrl: string; // origin of this deployment, e.g. https://ozmate.love
  locale: BotLocale;
}

const SITE_URL = 'https://oxmate.shop';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function resolveLocale(bindingLocale: string | null | undefined, languageCode?: string): BotLocale {
  if (bindingLocale === 'zh' || bindingLocale === 'en') return bindingLocale;
  const lc = (languageCode || '').toLowerCase();
  return lc.startsWith('zh') ? 'zh' : 'en';
}

// ─── Internal API helper ─────────────────────────────────────────────────────

async function internalFetch(
  ctx: BotCtx,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: Record<string, any> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const res = await fetch(new URL(path, ctx.baseUrl).toString(), {
      method: init.method || (init.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        'x-session': ctx.session.accessToken,
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    return { status: res.status, data };
  } catch (err) {
    logger.warn('[tg-bot] internalFetch failed', {
      path,
      err: err instanceof Error ? err.message : String(err),
    });
    return { status: 0, data: {} };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Menus ───────────────────────────────────────────────────────────────────

export function mainMenu(ctx: BotCtx): InlineKeyboard {
  const L = ctx.locale;
  return [
    [
      { text: STR.btnChat[L], callback_data: 'm:chat' },
      { text: STR.btnPhoto[L], callback_data: 'm:photo' },
    ],
    [
      { text: STR.btnGirls[L], callback_data: 'm:girls' },
      { text: STR.btnBalance[L], callback_data: 'm:bal' },
    ],
    [
      { text: STR.btnCheckin[L], callback_data: 'm:checkin' },
      { text: STR.btnLang[L], callback_data: 'm:lang' },
    ],
    [{ text: STR.btnWeb[L], url: SITE_URL }],
  ];
}

// ─── Companion resolution ────────────────────────────────────────────────────

interface CompanionLite {
  id: string;
  name: string;
  image_url?: string | null;
  portrait_url?: string | null;
  avatar_url?: string | null;
}

export async function listCompanions(ctx: BotCtx): Promise<CompanionLite[]> {
  const { status, data } = await internalFetch(ctx, '/api/girlfriends');
  if (status !== 200 || !Array.isArray(data.girlfriends)) return [];
  return (data.girlfriends as CompanionLite[]).filter((g) => g?.id);
}

/**
 * Pick the companion for this conversation:
 * 1. saved current (if still accessible)  2. first of user's list
 * 3. auto-add a featured public companion (new users get matched instantly).
 */
export async function ensureCompanion(ctx: BotCtx): Promise<CompanionLite | null> {
  let list = await listCompanions(ctx);
  const currentId = ctx.session.binding.current_girlfriend_id;

  if (currentId) {
    const current = list.find((g) => g.id === currentId);
    if (current) return current;
  }
  if (list.length > 0) {
    if (list[0].id !== currentId) {
      await updateBinding(ctx.from.id, { current_girlfriend_id: list[0].id });
      ctx.session.binding.current_girlfriend_id = list[0].id;
    }
    return list[0];
  }

  // New user → match with a featured public companion.
  const matched = await autoMatchCompanion(ctx);
  if (!matched) return null;
  list = await listCompanions(ctx);
  const found = list.find((g) => g.id === matched.id) || matched;
  await updateBinding(ctx.from.id, { current_girlfriend_id: found.id });
  ctx.session.binding.current_girlfriend_id = found.id;
  return found;
}

async function autoMatchCompanion(ctx: BotCtx): Promise<CompanionLite | null> {
  try {
    const admin = getSupabaseClient();
    const { data } = await admin
      .from('girlfriends')
      .select('id, name, portrait_url, avatar_url, is_featured, hot_score')
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .neq('is_active', false)
      .order('is_featured', { ascending: false })
      .order('hot_score', { ascending: false })
      .limit(1);
    const pick = data?.[0] as CompanionLite | undefined;
    if (!pick?.id) return null;
    const add = await internalFetch(ctx, '/api/friends', {
      method: 'POST',
      body: { girlfriend_id: pick.id },
    });
    if (add.status >= 400) {
      logger.warn('[tg-bot] auto-match add friend failed', {
        status: add.status,
        err: add.data?.error,
      });
      return null;
    }
    return pick;
  } catch (err) {
    logger.warn('[tg-bot] autoMatchCompanion failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * Chat via /api/chat/stream (SSE). The site route enforces tier limits,
 * credits, moderation, memory extraction etc. — the bot only transports.
 */
export async function handleChat(
  ctx: BotCtx,
  text: string,
  media?: { dataUrl: string; type: 'image' | 'audio' },
) {
  const L = ctx.locale;
  const companion = await ensureCompanion(ctx);
  if (!companion) {
    await ctx.api.sendMessage(ctx.chatId, STR.error[L]);
    return;
  }

  await ctx.api.sendChatAction(ctx.chatId, 'typing');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  let reply = '';
  let status = 0;
  let errBody: Record<string, any> = {};

  try {
    const res = await fetch(new URL('/api/chat/stream', ctx.baseUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session': ctx.session.accessToken,
      },
      body: JSON.stringify({
        message: text || '[media]',
        girlfriend_id: companion.id,
        locale: L,
        ...(media ? { media_url: media.dataUrl, media_type: media.type } : {}),
      }),
      signal: ctrl.signal,
    });
    status = res.status;

    if (status !== 200) {
      errBody = (await res.json().catch(() => ({}))) as Record<string, any>;
    } else if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as { content?: string; replace?: string };
            if (typeof parsed.replace === 'string' && parsed.replace) reply = parsed.replace;
            else if (typeof parsed.content === 'string' && parsed.content) acc += parsed.content;
          } catch {
            /* skip */
          }
        }
      }
      if (!reply) reply = acc;
    }
  } catch (err) {
    logger.warn('[tg-bot] chat stream failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  if (status !== 200) {
    const msg = errBody.localized_error || errBody.error || STR.typingFail[L];
    const kb: InlineKeyboard | undefined =
      errBody.code === 'daily_message_limit'
        ? [[{ text: STR.btnUpgrade[L], url: `${SITE_URL}/pricing` }]]
        : errBody.code === 'insufficient_credits'
          ? [[{ text: STR.btnTopup[L], url: `${SITE_URL}/pricing` }]]
          : undefined;
    await ctx.api.sendMessage(ctx.chatId, String(msg), { reply_markup: kb });
    return;
  }

  if (!reply) {
    await ctx.api.sendMessage(ctx.chatId, STR.typingFail[L]);
    return;
  }
  await ctx.api.sendLongMessage(ctx.chatId, reply);
}

// ─── Photo generation ────────────────────────────────────────────────────────

export async function handlePhoto(ctx: BotCtx, userRequest: string) {
  const L = ctx.locale;
  const companion = await ensureCompanion(ctx);
  if (!companion) {
    await ctx.api.sendMessage(ctx.chatId, STR.error[L]);
    return;
  }

  await ctx.api.sendChatAction(ctx.chatId, 'upload_photo');
  const statusMsg = await ctx.api.sendMessage(ctx.chatId, STR.photoGenerating[L]);
  const statusMsgId = (statusMsg.result as { message_id?: number } | undefined)?.message_id;

  const { status, data } = await internalFetch(ctx, '/api/chat/generate-image', {
    method: 'POST',
    body: { girlfriend_id: companion.id, user_request: userRequest || undefined },
  });

  if (status !== 200) {
    await removeStatusMessage(ctx, statusMsgId);
    const kb: InlineKeyboard | undefined =
      data.code === 'insufficient_credits'
        ? [[{ text: STR.btnTopup[L], url: `${SITE_URL}/pricing` }]]
        : undefined;
    await ctx.api.sendMessage(ctx.chatId, String(data.error || STR.photoFailed[L]), {
      reply_markup: kb,
    });
    return;
  }

  if (data.image_url) {
    await removeStatusMessage(ctx, statusMsgId);
    await ctx.api.sendPhoto(ctx.chatId, String(data.image_url));
    return;
  }

  if (data.job_id) {
    const job = {
      job_id: String(data.job_id),
      girlfriend_id: companion.id,
      endpoint_id: data.endpoint_id ? String(data.endpoint_id) : undefined,
      status_msg_id: statusMsgId,
    };
    const done = await pollImageJob(ctx, job, 3);
    if (done) return;
    await updateBinding(ctx.from.id, { last_image_job: job });
    if (statusMsgId) {
      await ctx.api.editMessageText(ctx.chatId, statusMsgId, STR.photoPending[L], [
        [{ text: STR.btnCheckStatus[L], callback_data: 'imgck' }],
      ]);
    }
    return;
  }

  await removeStatusMessage(ctx, statusMsgId);
  await ctx.api.sendMessage(ctx.chatId, STR.photoFailed[L]);
}

async function removeStatusMessage(ctx: BotCtx, messageId?: number) {
  if (!messageId) return;
  await ctx.api.call('deleteMessage', { chat_id: ctx.chatId, message_id: messageId }, 8_000);
}

interface ImageJob {
  job_id: string;
  girlfriend_id: string;
  endpoint_id?: string;
  status_msg_id?: number;
}

/** Poll /api/runpod/status up to `rounds` times (each round blocks ≤8s server-side). */
async function pollImageJob(ctx: BotCtx, job: ImageJob, rounds: number): Promise<boolean> {
  for (let i = 0; i < rounds; i += 1) {
    const qs = new URLSearchParams({ job_id: job.job_id, scene: 'chat_selfie' });
    if (job.girlfriend_id) qs.set('girlfriend_id', job.girlfriend_id);
    if (job.endpoint_id) qs.set('endpoint_id', job.endpoint_id);
    const { status, data } = await internalFetch(ctx, `/api/runpod/status?${qs.toString()}`);
    if (status === 200 && data.status === 'COMPLETED' && Array.isArray(data.images) && data.images.length) {
      await removeStatusMessage(ctx, job.status_msg_id);
      await ctx.api.sendChatAction(ctx.chatId, 'upload_photo');
      await ctx.api.sendPhoto(ctx.chatId, String(data.images[0]));
      return true;
    }
    if (status >= 400) break;
    if (i < rounds - 1) await sleep(4_000);
  }
  return false;
}

export async function handleImageCheck(ctx: BotCtx) {
  const L = ctx.locale;
  const job = ctx.session.binding.last_image_job;
  if (!job?.job_id) {
    await ctx.api.sendMessage(ctx.chatId, STR.photoFailed[L]);
    return;
  }
  const fullJob: ImageJob = { ...job };
  const done = await pollImageJob(ctx, fullJob, 3);
  if (!done) {
    await ctx.api.sendMessage(ctx.chatId, STR.photoPending[L], {
      reply_markup: [[{ text: STR.btnCheckStatus[L], callback_data: 'imgck' }]],
    });
  }
}

// ─── Companions list ─────────────────────────────────────────────────────────

export async function handleGirls(ctx: BotCtx) {
  const L = ctx.locale;
  const list = await listCompanions(ctx);
  if (list.length === 0) {
    await ctx.api.sendMessage(ctx.chatId, STR.girlsEmpty[L]);
    const matched = await ensureCompanion(ctx);
    if (matched) {
      await ctx.api.sendMessage(ctx.chatId, STR.switched[L](matched.name));
    }
    return;
  }
  const currentId = ctx.session.binding.current_girlfriend_id;
  const rows: InlineKeyboard = [];
  for (const g of list.slice(0, 20)) {
    rows.push([
      {
        text: `${g.id === currentId ? '✅ ' : ''}${g.name}`,
        callback_data: `gf:${g.id}`,
      },
    ]);
  }
  rows.push([{ text: STR.btnWeb[L], url: `${SITE_URL}/explore` }]);
  await ctx.api.sendMessage(ctx.chatId, STR.girlsTitle[L], { reply_markup: rows });
}

export async function handleSwitch(ctx: BotCtx, girlfriendId: string) {
  const L = ctx.locale;
  const list = await listCompanions(ctx);
  const target = list.find((g) => g.id === girlfriendId);
  if (!target) {
    await ctx.api.sendMessage(ctx.chatId, STR.error[L]);
    return;
  }
  await updateBinding(ctx.from.id, { current_girlfriend_id: target.id });
  ctx.session.binding.current_girlfriend_id = target.id;
  await ctx.api.sendMessage(ctx.chatId, STR.switched[L](target.name));
}

// ─── Balance / check-in / language ───────────────────────────────────────────

export async function handleBalance(ctx: BotCtx) {
  const L = ctx.locale;
  try {
    const admin = getSupabaseClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('membership_tier, credits_remaining, checkin_streak')
      .eq('user_id', ctx.session.userId)
      .maybeSingle();

    const tier = String(profile?.membership_tier || 'free').toLowerCase();
    const credits = Number(profile?.credits_remaining ?? 0);
    const streak = Number(profile?.checkin_streak ?? 0);

    const TIER_LIMITS: Record<string, number> = { free: 40, pro: 300, unlimited: -1 };
    const limit = TIER_LIMITS[tier] ?? 40;

    let usedToday = 0;
    if (limit > 0) {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await admin
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', ctx.session.userId)
        .eq('role', 'user')
        .gte('created_at', today);
      usedToday = count || 0;
    }

    const tierName = TIER_NAMES[tier]?.[L] || TIER_NAMES.free[L];
    const lines =
      L === 'zh'
        ? [
            `👤 ${tierName}`,
            `💎 积分余额：${credits}`,
            limit > 0
              ? `💬 今日消息：${usedToday}/${limit}`
              : '💬 今日消息：不限',
            `🔥 连续签到：${streak} 天`,
          ]
        : [
            `👤 ${tierName}`,
            `💎 Credits: ${credits}`,
            limit > 0
              ? `💬 Messages today: ${usedToday}/${limit}`
              : '💬 Messages today: unlimited',
            `🔥 Check-in streak: ${streak} day(s)`,
          ];

    await ctx.api.sendMessage(ctx.chatId, lines.join('\n'), {
      reply_markup: [
        [
          { text: STR.btnUpgrade[L], url: `${SITE_URL}/pricing` },
          { text: STR.btnTopup[L], url: `${SITE_URL}/pricing` },
        ],
        [{ text: STR.btnCheckin[L], callback_data: 'm:checkin' }],
      ],
    });
  } catch (err) {
    logger.warn('[tg-bot] balance failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    await ctx.api.sendMessage(ctx.chatId, STR.error[L]);
  }
}

export async function handleCheckin(ctx: BotCtx) {
  const L = ctx.locale;
  const { status, data } = await internalFetch(ctx, '/api/checkin', { method: 'POST', body: {} });
  if (status === 409) {
    await ctx.api.sendMessage(ctx.chatId, STR.checkinDone[L]);
    return;
  }
  if (status !== 200) {
    await ctx.api.sendMessage(ctx.chatId, STR.error[L]);
    return;
  }
  const reward = Number(data.reward ?? data.credits ?? 10);
  const streak = Number(data.streak ?? data.checkin_streak ?? 1);
  const balance = Number(data.credits_remaining ?? data.balance ?? 0);
  await ctx.api.sendMessage(ctx.chatId, STR.checkinOk[L](reward, streak, balance));
}

export async function handleLangMenu(ctx: BotCtx) {
  await ctx.api.sendMessage(ctx.chatId, STR.langTitle[ctx.locale], {
    reply_markup: [
      [
        { text: '🇨🇳 中文', callback_data: 'lang:zh' },
        { text: '🇬🇧 English', callback_data: 'lang:en' },
      ],
    ],
  });
}

export async function handleLangSet(ctx: BotCtx, locale: BotLocale) {
  await updateBinding(ctx.from.id, { locale });
  ctx.locale = locale;
  await ctx.api.sendMessage(ctx.chatId, STR.langSet[locale]);
}

// ─── Media helpers ───────────────────────────────────────────────────────────

const MAX_MEDIA_BYTES = 1_700_000; // keep data URL under the 2.5MB chat/stream cap

export async function downloadAsDataUrl(
  api: TelegramApi,
  fileId: string,
  mime: string,
): Promise<string | null> {
  const url = await api.getFileUrl(fileId);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA_BYTES) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
