import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateTokens } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

const FALLBACK = [
  { id: 'tokens-100', name: 'Starter', token_count: 100, price_cents: 499, bonus_tokens: 0, is_active: true, sort_order: 1, is_featured: false },
  { id: 'tokens-500', name: 'Popular', token_count: 500, price_cents: 1999, bonus_tokens: 50, is_active: true, sort_order: 2, is_featured: true },
  { id: 'tokens-1000', name: 'Best Value', token_count: 1000, price_cents: 3499, bonus_tokens: 200, is_active: true, sort_order: 3, is_featured: false },
];

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const { data, error } = await supabase
      .from('token_packages')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      // Table may not exist yet
      return NextResponse.json({ packages: FALLBACK, source: 'fallback', warning: error.message });
    }
    return NextResponse.json({
      packages: data?.length ? data : FALLBACK,
      source: data?.length ? 'db' : 'fallback',
    });
  } catch (e) {
    return NextResponse.json({ packages: FALLBACK, source: 'fallback', error: String(e) });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const body = await request.json();
    const {
      name, token_count, price_cents, discount_percent, description,
      is_featured, is_active, sort_order, bonus_tokens,
    } = body;

    if (!name || !token_count || price_cents == null) {
      return NextResponse.json({ error: 'name, token_count, price_cents required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('token_packages')
      .insert({
        name,
        token_count: Number(token_count),
        price_cents: Number(price_cents),
        discount_percent: Number(discount_percent || 0),
        description: description || null,
        is_featured: Boolean(is_featured),
        is_active: is_active !== false,
        sort_order: Number(sort_order || 0),
        // bonus may not be in schema — store in description if needed
      })
      .select()
      .single();

    if (error) throw error;
    invalidateTokens();
    return NextResponse.json({ package: data, bonus_tokens });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const allowed = [
      'name', 'token_count', 'price_cents', 'discount_percent', 'description',
      'is_featured', 'is_active', 'sort_order',
    ] as const;
    const updates: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in fields) updates[k] = fields[k];
    }

    const { error } = await supabase.from('token_packages').update(updates).eq('id', id);
    if (error) throw error;
    invalidateTokens();
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Soft-delete preferred
    const { error } = await supabase
      .from('token_packages')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
    invalidateTokens();
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
