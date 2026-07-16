import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const search = searchParams.get('search') || '';
  const tier = searchParams.get('tier') || '';      // free / pro / unlimited
  const status = searchParams.get('status') || '';  // active / disabled
  const dateFrom = searchParams.get('date_from') || '';
  const dateTo = searchParams.get('date_to') || '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (tier) {
      query = query.eq('membership_tier', tier);
    }
    if (status === 'active') {
      query = query.eq('is_disabled', false);
    } else if (status === 'disabled') {
      query = query.eq('is_disabled', true);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59');
    }

    const { data, count, error: queryErr } = await query
      .order('created_at', { ascending: false })
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
    const ALLOWED_FIELDS = ['membership_tier', 'credits_remaining', 'is_disabled', 'display_name'] as const;
    const { userId, ...fields } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in fields) {
        updates[key] = fields[key];
      }
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (updateErr) throw updateErr;

    invalidateSettings();

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}