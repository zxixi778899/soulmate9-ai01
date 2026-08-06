/**
 * Telegram ↔ Supabase session bridge.
 *
 * Resolves a Telegram user to a Supabase auth user (creating one on first
 * contact, mirroring /api/auth/telegram) and issues a short-lived access
 * token so the bot can call the site's own authenticated APIs
 * (chat/stream, generate-image, checkin…) with an `x-session` header.
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export interface Binding {
  telegram_id: number;
  user_id: string;
  current_girlfriend_id: string | null;
  locale: string;
  refresh_token: string | null;
  last_image_job: {
    job_id: string;
    girlfriend_id: string;
    endpoint_id?: string;
    status_msg_id?: number;
  } | null;
}

export interface BotSession {
  userId: string;
  accessToken: string;
  binding: Binding;
}

const TG_EMAIL = (tgId: number) => `tg-${tgId}@auth.ozmate.local`;

function adminClient() {
  return getSupabaseClient(); // service role
}

async function findBinding(tgId: number): Promise<Binding | null> {
  const { data } = await adminClient()
    .from('telegram_bindings')
    .select('*')
    .eq('telegram_id', tgId)
    .maybeSingle();
  return (data as Binding | null) || null;
}

async function upsertBinding(patch: Partial<Binding> & { telegram_id: number }) {
  const { error } = await adminClient()
    .from('telegram_bindings')
    .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'telegram_id' });
  if (error) logger.warn('[tg-bot] upsertBinding failed', { err: error.message });
}

/** Issue a fresh access token via magic-link token_hash → /auth/v1/verify. */
async function issueTokenViaMagicLink(email: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const link = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return null;
    const res = await fetch(`${url}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: tokenHash, type: 'magiclink' }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token) return null;
    return { access_token: data.access_token, refresh_token: data.refresh_token || '' };
  } catch {
    return null;
  }
}

/** Refresh an existing session; returns null when the refresh token is dead. */
async function refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !refreshToken) return null;
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
    };
    return data.access_token
      ? { access_token: data.access_token, refresh_token: data.refresh_token || refreshToken }
      : null;
  } catch {
    return null;
  }
}

async function findUserIdByTelegramMeta(tgId: number): Promise<string | null> {
  // Small user base: scan auth users for matching telegram_id metadata.
  const admin = adminClient().auth.admin;
  const perPage = 100;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    const hit = data.users.find(
      (u) => String(u.user_metadata?.telegram_id || '') === String(tgId),
    );
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Resolve a Telegram user to a full bot session (creating the auth user and
 * binding on first contact). Returns null only on hard infra errors.
 */
export async function resolveSession(
  tgId: number,
  profile: { first_name?: string; last_name?: string; username?: string; photo_url?: string },
): Promise<BotSession | null> {
  let binding = await findBinding(tgId);

  // 1) Binding exists → fast path.
  if (binding) {
    const token = binding.refresh_token
      ? await refreshToken(binding.refresh_token)
      : null;
    if (token) {
      if (token.refresh_token !== binding.refresh_token) {
        await upsertBinding({ telegram_id: tgId, refresh_token: token.refresh_token });
        binding = { ...binding, refresh_token: token.refresh_token };
      }
      return { userId: binding.user_id, accessToken: token.access_token, binding };
    }
    // Refresh failed / missing → re-issue via magic link.
    const email = TG_EMAIL(tgId);
    const fresh = await issueTokenViaMagicLink(email);
    if (fresh) {
      await upsertBinding({ telegram_id: tgId, refresh_token: fresh.refresh_token });
      return {
        userId: binding.user_id,
        accessToken: fresh.access_token,
        binding: { ...binding, refresh_token: fresh.refresh_token },
      };
    }
    return null;
  }

  // 2) No binding → find an existing web account (widget login) or create one.
  let userId = await findUserIdByTelegramMeta(tgId);
  const admin = adminClient().auth.admin;

  if (!userId) {
    const fullName =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
      profile.username ||
      `user_${tgId}`;
    const created = await admin.createUser({
      email: TG_EMAIL(tgId),
      email_confirm: true,
      user_metadata: {
        telegram_id: String(tgId),
        telegram_username: profile.username || '',
        full_name: fullName,
        avatar_url: profile.photo_url || '',
        provider: 'telegram',
      },
    });
    if (created.error || !created.data?.user) {
      logger.error('[tg-bot] createUser failed', { err: created.error?.message });
      return null;
    }
    userId = created.data.user.id;
  }

  await upsertBinding({ telegram_id: tgId, user_id: userId });

  const fresh = await issueTokenViaMagicLink(TG_EMAIL(tgId));
  if (!fresh) return null;
  await upsertBinding({ telegram_id: tgId, user_id: userId, refresh_token: fresh.refresh_token });

  binding = (await findBinding(tgId)) as Binding;
  return { userId, accessToken: fresh.access_token, binding };
}

export async function updateBinding(tgId: number, patch: Partial<Binding>) {
  await upsertBinding({ telegram_id: tgId, ...patch });
}
