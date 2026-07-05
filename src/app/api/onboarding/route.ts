/**
 * Onboarding APIDB-backed
 *
 * GET   /api/onboarding         onboarding 
 * POST  /api/onboarding         step / preferences
 * POST  /api/onboarding/complete  
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest } from '@/lib/logger';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { authedFetch } from '@/lib/supabase';

async function getUserId(_req: NextRequest): Promise<string | null> {
  try {
    const res = await authedFetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_onboarding')
    .select('current_step, completed, skipped, preferences, completed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const log = loggerFromRequest(req);
    log.error('onboarding GET failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 
  if (!data) {
    return NextResponse.json({
      current_step: 0,
      completed: false,
      skipped: false,
      preferences: {},
    });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const log = loggerFromRequest(req);
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.current_step === 'number') updates.current_step = body.current_step;
    if (typeof body.preferences === 'object') updates.preferences = body.preferences;
    if (typeof body.skipped === 'boolean') updates.skipped = body.skipped;

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('user_onboarding')
      .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' });

    if (error) {
      log.error('onboarding POST failed', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('onboarding POST parse error', { err: String(e) });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
