import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Telegram Login Widget verification + Supabase session issuance.
 *
 * The widget (telegram.org/js/telegram-widget.js) posts the authenticated
 * user object to our `onTelegramAuth` callback; we verify the signature per
 * https://core.telegram.org/widgets/login#checking-authorization and then
 * upsert a Supabase auth user, issuing a magic-link token_hash that the
 * client exchanges for a session via supabase.auth.verifyOtp (no email is
 * ever sent).
 */

interface TelegramAuthPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

function verifyTelegramHash(payload: TelegramAuthPayload, botToken: string): boolean {
  const entries: Array<[string, string]> = [];
  const push = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    entries.push([key, String(value)]);
  };
  push('id', payload.id);
  push('first_name', payload.first_name);
  push('last_name', payload.last_name);
  push('username', payload.username);
  push('photo_url', payload.photo_url);
  push('auth_date', payload.auth_date);

  const checkString = entries
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHash('sha256').update(botToken, 'utf8').digest();
  const digest = crypto.createHmac('sha256', secret).update(checkString, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(String(payload.hash), 'hex'));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: 'Telegram login is not configured' }, { status: 503 });
  }

  let payload: TelegramAuthPayload;
  try {
    payload = (await request.json()) as TelegramAuthPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload?.id || !payload?.hash || !payload?.auth_date) {
    return NextResponse.json({ error: 'Missing telegram auth fields' }, { status: 400 });
  }

  // Signature freshness: the widget issues fresh signatures on every login.
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(payload.auth_date)) > 86400) {
    return NextResponse.json({ error: 'Telegram auth is stale' }, { status: 403 });
  }

  if (!verifyTelegramHash(payload, botToken)) {
    return NextResponse.json({ error: 'Telegram signature verification failed' }, { status: 403 });
  }

  const email = `tg-${payload.id}@auth.ozmate.local`;
  const fullName =
    [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim() ||
    payload.username ||
    `user_${payload.id}`;

  try {
    const admin = getSupabaseClient().auth.admin;

    // Create the user on first login; ignore "already registered" errors.
    const created = await admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        telegram_id: String(payload.id),
        telegram_username: payload.username || '',
        full_name: fullName,
        avatar_url: payload.photo_url || '',
        provider: 'telegram',
      },
    });
    if (created.error && !/already/i.test(created.error.message)) {
      logger.error('[TelegramAuth] createUser failed', { data: created.error.message });
      return NextResponse.json({ error: 'account_error' }, { status: 500 });
    }

    // Generate a magic-link OTP without sending any email; the client
    // exchanges token_hash for a session via supabase.auth.verifyOtp.
    const link = await admin.generateLink({ type: 'magiclink', email });
    // auth-js exposes the hashed token as `hashed_token`; the browser passes it
    // straight to supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      logger.error('[TelegramAuth] generateLink failed', { data: link.error?.message });
      return NextResponse.json({ error: 'session_error' }, { status: 500 });
    }

    return NextResponse.json({ token_hash: tokenHash });
  } catch (err) {
    logger.error('[TelegramAuth] unexpected error', { data: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
