import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

// GET /api/admin/homepage — List all homepage modules
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('homepage_modules')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ modules: data || [] });
}

// PATCH /api/admin/homepage — Update a module (toggle visibility, reorder, update config)
export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('homepage_modules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ module: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown' }, { status: 500 });
  }
}
