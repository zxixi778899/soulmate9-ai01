import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const { data, error: queryErr } = await supabase
      .from('shop_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (queryErr) throw queryErr;
    return NextResponse.json({ items: data || [] });
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
    const { name, emoji, description, price_cents, tier, category, visual_type, effect_value, sort_order } = body;

    if (!name || !description) {
      return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
    }

    const { data, error: insertErr } = await supabase
      .from('shop_items')
      .insert({
        name,
        emoji: emoji || '🎁',
        description,
        price_cents: price_cents || 0,
        tier: tier || 'free',
        category: category || 'gift',
        visual_type: visual_type || null,
        effect_value: effect_value || {},
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return NextResponse.json({ item: data });
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

    const { error: updateErr } = await supabase.from('shop_items').update(updates).eq('id', id);
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
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error: deleteErr } = await supabase.from('shop_items').delete().eq('id', id);
    if (deleteErr) throw deleteErr;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}