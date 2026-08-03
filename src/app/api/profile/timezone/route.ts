import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Save user's timezone offset (minutes from UTC).
 * Detected client-side via new Date().getTimezoneOffset().
 * Example: UTC+8 → offset = -480, UTC-5 → offset = 300
 */
export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { timezone_offset } = body as { timezone_offset?: number };

    if (typeof timezone_offset !== 'number' || timezone_offset < -720 || timezone_offset > 840) {
      return NextResponse.json({ error: 'Invalid timezone_offset' }, { status: 400 });
    }

    const { error } = await client
      .from('profiles')
      .update({ timezone_offset })
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Get user's stored timezone offset.
 */
export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await client
      .from('profiles')
      .select('timezone_offset')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ timezone_offset: data?.timezone_offset ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
