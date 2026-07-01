import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/nav_items?select=*&order=sort_order.asc`, { headers });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json();

  // Handle delete action
  if (body.action === 'delete') {
    await fetch(`${SUPABASE_URL}/rest/v1/nav_items?id=eq.${body.id}`, {
      method: 'DELETE',
      headers,
    });
    return NextResponse.json({ success: true });
  }

  // Handle reorder action
  if (body.action === 'reorder' && body.items) {
    for (const item of body.items) {
      await fetch(`${SUPABASE_URL}/rest/v1/nav_items?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ sort_order: item.sort_order }),
      });
    }
    return NextResponse.json({ success: true });
  }

  // Handle visibility toggle or update (has id → PATCH, no id → POST)
  if (body.id) {
    const { id, ...updateData } = body;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/nav_items?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(updateData),
    });
    const data = await res.json();
    return NextResponse.json(data);
  }

  // Create new item
  const res = await fetch(`${SUPABASE_URL}/rest/v1/nav_items`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/nav_items?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await fetch(`${SUPABASE_URL}/rest/v1/nav_items?id=eq.${id}`, {
    method: 'DELETE',
    headers,
  });
  return NextResponse.json({ success: true });
}