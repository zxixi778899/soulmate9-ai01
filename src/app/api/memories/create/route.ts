import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { user, client, error: authError } = await getAuthUser(request);
    if (!user || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { girlfriend_id, content, type, category } = await request.json();

    if (!girlfriend_id || !content) {
      return NextResponse.json({ error: 'girlfriend_id and content are required' }, { status: 400 });
    }

    const memory = {
      user_id: user.id,
      girlfriend_id,
      content,
      type: type || 'chat',
      category: category || 'general',
    };

    const { data, error } = await client
      .from('memories')
      .insert(memory)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, memory: data });
  } catch (err) {
    logger.error('Memory create error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}