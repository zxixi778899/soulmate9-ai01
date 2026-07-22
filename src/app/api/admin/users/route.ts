import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings } from '@/lib/revalidate';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const VALID_TIERS = ['free', 'basic', 'pro', 'unlimited'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Client pointed at the `auth` schema (requires the service-role key).
 * Used for auth.users lookups (created_at, metadata, banned_until) and bans.
 */
function getAuthSchemaClient() {
  const url = process.env.COZE_SUPABASE_URL;
  const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    db: { schema: 'auth' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function displayNameFromMeta(
  meta: Record<string, unknown> | null | undefined,
  email: string | null,
): string {
  const m = meta || {};
  const candidate = [m.display_name, m.name, m.username, m.full_name, m.nickname].find(
    (v) => typeof v === 'string' && (v as string).trim().length > 0,
  );
  if (typeof candidate === 'string') return candidate.trim();
  if (email) return email.split('@')[0];
  return 'User';
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20') || 20), 100);
  const search = (searchParams.get('search') || '').trim();
  const tier = searchParams.get('tier') || '';
  const status = searchParams.get('status') || ''; // active / disabled (via auth banned_until)
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const authDb = getAuthSchemaClient();

    // profiles has no is_disabled column — ban state lives in auth.users.banned_until
    let bannedIds: string[] = [];
    if (authDb) {
      const { data: authRows } = await authDb
        .from('users')
        .select('id, banned_until');
      bannedIds = ((authRows as Array<{ id: string; banned_until: string | null }> | null) || [])
        .filter((r) => isBanned(r.banned_until))
        .map((r) => String(r.id));
    }

    let query = supabase.from('profiles').select('*', { count: 'exact' });

    if (search) {
      query = UUID_RE.test(search)
        ? query.or(`email.ilike.%${search}%,user_id.eq.${search}`)
        : query.ilike('email', `%${search}%`);
    }
    if (tier) {
      query = query.eq('membership_tier', tier);
    }
    if (status === 'disabled') {
      if (!bannedIds.length) {
        return NextResponse.json({ users: [], total: 0, page, limit, totalPages: 0 });
      }
      query = query.in('user_id', bannedIds);
    } else if (status === 'active' && bannedIds.length) {
      query = query.not('user_id', 'in', `(${bannedIds.join(',')})`);
    }
    // profiles has no created_at — date range applies to updated_at
    if (dateFrom) {
      query = query.gte('updated_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('updated_at', dateTo + 'T23:59:59');
    }

    const { data, count, error: queryErr } = await query
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (queryErr) throw queryErr;

    const rows = (data || []) as Array<Record<string, unknown>>;

    // Enrich with auth.users: signup date, display name, avatar, ban state
    const userIds = rows.map((r) => String(r.user_id || '')).filter(Boolean);
    const authInfo = new Map<string, Record<string, unknown>>();
    if (authDb && userIds.length) {
      const { data: authUsers } = await authDb
        .from('users')
        .select('id, email, created_at, last_sign_in_at, banned_until, raw_user_meta_data')
        .in('id', userIds);
      for (const u of (authUsers as Array<Record<string, unknown>> | null) || []) {
        authInfo.set(String(u.id), u);
      }
    }

    const bannedSet = new Set(bannedIds);
    const users = rows.map((p) => {
      const uid = String(p.user_id || '');
      const a = authInfo.get(uid) || {};
      const meta = (a.raw_user_meta_data || null) as Record<string, unknown> | null;
      const email = (p.email as string | null) || (a.email as string | null) || null;
      const credits = Number(p.credits_remaining || 0);
      return {
        id: p.id,
        user_id: uid,
        email,
        display_name: displayNameFromMeta(meta, email),
        avatar_url: (meta?.avatar_url as string) || (meta?.picture as string) || null,
        role: (p.role as string) || 'user',
        membership_tier: (p.membership_tier as string) || 'free',
        credits_remaining: credits,
        credits,
        creation_cards: p.creation_cards ?? 0,
        is_disabled: bannedSet.has(uid),
        created_at: (a.created_at as string) || (p.updated_at as string) || null,
        last_sign_in_at: (a.last_sign_in_at as string) || null,
        updated_at: p.updated_at,
      };
    });

    const total = count ?? users.length;
    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const body = await request.json();
    const ident = (body.userId || body.user_id || body.id) as string | undefined;

    if (!ident) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Resolve the profile row whether the caller passed the auth uid or profiles.id
    let row: Record<string, unknown> | null = null;
    const byAuth = await supabase.from('profiles').select('*').eq('user_id', ident).maybeSingle();
    row = (byAuth.data as Record<string, unknown> | null) || null;
    if (!row) {
      const byId = await supabase.from('profiles').select('*').eq('id', ident).maybeSingle();
      row = (byId.data as Record<string, unknown> | null) || null;
    }
    if (!row) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const authUid = String(row.user_id || ident);

    const updates: Record<string, unknown> = {};
    if (body.membership_tier !== undefined) {
      const tier = String(body.membership_tier);
      if (!VALID_TIERS.includes(tier)) {
        return NextResponse.json({ error: `Invalid membership tier: ${tier}` }, { status: 400 });
      }
      updates.membership_tier = tier;
    }
    const creditsRaw = body.credits_remaining ?? body.credits;
    if (creditsRaw !== undefined) {
      const n = Number(creditsRaw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'credits must be a non-negative number' }, { status: 400 });
      }
      updates.credits_remaining = Math.floor(n);
    }

    if (Object.keys(updates).length) {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', row.id as string);
      if (updateErr) throw updateErr;
    }

    const warnings: string[] = [];

    // Keep the legacy user_tokens mirror in sync so the shop balance matches
    if (updates.credits_remaining !== undefined) {
      const { error: mirrorErr } = await supabase.from('user_tokens').upsert(
        {
          user_id: authUid,
          balance_tokens: updates.credits_remaining,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (mirrorErr) {
        logger.error('admin users: user_tokens mirror sync failed', {
          userId: authUid,
          error: mirrorErr.message,
        });
        warnings.push(`token mirror sync failed: ${mirrorErr.message}`);
      }
    }

    // Password reset via Supabase Auth admin API (requires service-role key)
    const newPassword = typeof body.new_password === 'string' ? body.new_password.trim() : '';
    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'new_password must be at least 6 characters' },
          { status: 400 },
        );
      }
      const { error: pwErr } = await supabase.auth.admin.updateUserById(authUid, {
        password: newPassword,
      });
      if (pwErr) {
        logger.error('admin users: password reset failed', {
          userId: authUid,
          error: pwErr.message,
        });
        warnings.push(`password reset failed: ${pwErr.message}`);
      }
    }

    // Disable / enable via auth.users.banned_until (actually blocks login)
    if (typeof body.is_disabled === 'boolean') {
      const authDb = getAuthSchemaClient();
      if (authDb) {
        const { error: banErr } = await authDb
          .from('users')
          .update({ banned_until: body.is_disabled ? '2100-01-01T00:00:00.000Z' : null })
          .eq('id', authUid);
        if (banErr) {
          logger.error('admin users: ban toggle failed', {
            userId: authUid,
            error: banErr.message,
          });
          warnings.push(`ban toggle failed: ${banErr.message}`);
        }
      } else {
        warnings.push('service role key missing — cannot toggle user ban state');
      }
    }

    invalidateSettings();

    return NextResponse.json({ success: true, warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}