import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const { data, count, error: queryErr } = await supabase
      .from('profiles')
      .select('id, user_id, display_name, membership_tier, credits_remaining, created_at', { count: 'exact' })
      .order('credits_remaining', { ascending: false })
      .range(from, to);

    if (queryErr) throw queryErr;

    return NextResponse.json({
      users: data || [],
      total: count ?? 0,
      page,
      limit,
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
    const { userId, credits_remaining, operation } = body;

    if (!userId || credits_remaining === undefined) {
      return NextResponse.json({ error: 'userId and credits_remaining are required' }, { status: 400 });
    }

    if (operation === 'add') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_remaining')
        .eq('id', userId)
        .single();

      const current = profile?.credits_remaining || 0;
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ credits_remaining: current + credits_remaining })
        .eq('id', userId);

      if (updateErr) throw updateErr;
    } else {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ credits_remaining })
        .eq('id', userId);

      if (updateErr) throw updateErr;
    }

    invalidateSettings();

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}