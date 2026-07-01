import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/lore?girlfriend_id=xxx&page=1&limit=20
 * POST /api/admin/lore - Create new lore entry
 */
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const { searchParams } = new URL(request.url);
  const girlfriend_id = searchParams.get('girlfriend_id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('world_lore')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('insertion_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (girlfriend_id) {
    query = query.eq('girlfriend_id', girlfriend_id);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lore: data || [], total: count || 0, page, limit });
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const body = await request.json();
  const { girlfriend_id, keys, content, insertion_order } = body;

  if (!girlfriend_id || !keys?.length || !content) {
    return NextResponse.json({ error: 'girlfriend_id, keys[], and content are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('world_lore')
    .insert({
      user_id: user.id,
      girlfriend_id,
      keys,
      content,
      insertion_order: insertion_order || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lore: data }, { status: 201 });
}