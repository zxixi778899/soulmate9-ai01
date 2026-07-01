import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const { data, error: queryErr } = await supabase
      .from('admin_ads')
      .select('*')
      .order('sort_order', { ascending: true });

    if (queryErr) throw queryErr;
    return NextResponse.json({ ads: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const body = await request.json();
    const { title, image_url, link_url, position, active, sort_order } = body;

    if (!title || !image_url) {
      return NextResponse.json({ error: 'title and image_url are required' }, { status: 400 });
    }

    const { data, error: insertErr } = await supabase
      .from('admin_ads')
      .insert({
        title,
        image_url,
        link_url: link_url || null,
        position: position || 'banner',
        active: active !== undefined ? active : true,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return NextResponse.json({ ad: data });
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('admin_ads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) throw updateErr;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error: deleteErr } = await supabase.from('admin_ads').delete().eq('id', id);
    if (deleteErr) throw deleteErr;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}