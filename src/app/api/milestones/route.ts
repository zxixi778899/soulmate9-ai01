import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const girlfriendId = searchParams.get('girlfriend_id');
  const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  if (!girlfriendId) {
    return NextResponse.json(
      { error: 'girlfriend_id is required' },
      { status: 400 },
    );
  }

  try {
    const { data, error, count } = await client
      .from('companion_milestones')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.warn('milestones GET: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch milestones' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      milestones: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    logger.error('milestones GET: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    girlfriend_id,
    event_type,
    title,
    description,
    event_date,
    participants,
    location,
    emotional_context,
    keywords,
    importance,
  } = body as Record<string, unknown>;

  if (!girlfriend_id || !event_type || !title) {
    return NextResponse.json(
      { error: 'girlfriend_id, event_type, and title are required' },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await client
      .from('companion_milestones')
      .insert({
        user_id: user.id,
        girlfriend_id: String(girlfriend_id),
        event_type: String(event_type),
        title: String(title),
        description: description ? String(description) : undefined,
        event_date: event_date ? String(event_date).slice(0, 10) : undefined,
        participants: Array.isArray(participants) ? participants.map(String) : [],
        location: location ? String(location) : undefined,
        emotional_context: emotional_context ? String(emotional_context) : undefined,
        keywords: Array.isArray(keywords) ? keywords.map(String) : [],
        importance: Math.max(1, Math.min(5, Number(importance) || 3)),
      })
      .select()
      .single();

    if (error) {
      logger.warn('milestones POST: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to create milestone' },
        { status: 500 },
      );
    }

    logger.debug('milestones POST: created', { id: data?.id });
    return NextResponse.json({ milestone: data }, { status: 201 });
  } catch (err) {
    logger.error('milestones POST: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}