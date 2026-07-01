import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const girlfriendId = searchParams.get('girlfriend_id');

  if (!girlfriendId) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Get memories grouped by category
  const { data: memories, error } = await client
    .from('memories')
    .select('*')
    .eq('girlfriend_id', girlfriendId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by category
  const grouped: Record<string, typeof memories> = {};
  for (const m of memories || []) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  return NextResponse.json({ memories, grouped, total: memories?.length || 0 });
}

export async function DELETE(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { memory_id } = await request.json();
  if (!memory_id) {
    return NextResponse.json({ error: 'memory_id is required' }, { status: 400 });
  }

  const { error } = await client
    .from('memories')
    .delete()
    .eq('id', memory_id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}