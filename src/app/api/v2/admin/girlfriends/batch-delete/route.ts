import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getAuthUser(req);
    if (!user || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
    }

    const { error } = await client
      .from('girlfriends')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) {
      console.error('[batch-delete] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[batch-delete] Deleted ${ids.length} girlfriends for user ${user.id}`);
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error('[batch-delete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete girlfriends' }, { status: 500 });
  }
}
