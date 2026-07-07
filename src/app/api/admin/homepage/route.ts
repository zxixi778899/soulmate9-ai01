import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

// GET /api/admin/homepage — List all site modules (optionally filtered by page_path)
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  const { searchParams } = new URL(request.url);
  const pagePath = searchParams.get('page');

  const supabase = getSupabaseClient();
  let query = supabase
    .from('site_modules')
    .select('*')
    .order('page_path', { ascending: true })
    .order('sort_order', { ascending: true });

  if (pagePath) {
    query = query.eq('page_path', pagePath);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get unique pages for the filter
  const { data: allModules } = await supabase.from('site_modules').select('page_path');
  const pages = [...new Set((allModules || []).map(m => m.page_path))].sort();

  return NextResponse.json({ modules: data || [], pages });
}

// POST /api/admin/homepage — Create a new module
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    const { module_key, display_name, page_path, section_type, parent_id, config } = body;

    if (!module_key || !display_name) {
      return NextResponse.json({ error: 'module_key and display_name are required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Get max sort_order for the page
    const { data: maxSort } = await supabase
      .from('site_modules')
      .select('sort_order')
      .eq('page_path', page_path || '/')
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextSort = (maxSort?.[0]?.sort_order || 0) + 1;

    const { data, error } = await supabase
      .from('site_modules')
      .insert({
        module_key,
        display_name,
        page_path: page_path || '/',
        section_type: section_type || 'component',
        parent_id: parent_id || null,
        config: config || {},
        sort_order: nextSort,
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ module: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown' }, { status: 500 });
  }
}

// PATCH /api/admin/homepage — Update a module
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
      .from('site_modules')
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

// DELETE /api/admin/homepage — Delete a module
export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('site_modules')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
