import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/lore/[id] - Update a lore entry
 * DELETE /api/admin/lore/[id] - Delete a lore entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard && guard.error) return guard.error;
  const client = guard.supabase;
  const user = guard.user;

  const { id } = await params;
  const body = await request.json();
  const { keys, content, insertion_order, active } = body;

  const updates: Record<string, any> = {};
  if (keys) updates.keys = keys;
  if (content !== undefined) updates.content = content;
  if (insertion_order !== undefined) updates.insertion_order = insertion_order;
  if (active !== undefined) updates.active = active;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('world_lore')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lore: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin(request);
  if ('error' in guard && guard.error) return guard.error;
  const client = guard.supabase;
  const user = guard.user;

  const { id } = await params;

  const { error } = await client
    .from('world_lore')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}