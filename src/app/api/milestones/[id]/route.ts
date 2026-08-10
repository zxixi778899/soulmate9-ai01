import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { data, error } = await client
      .from('companion_milestones')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('milestones/[id] GET: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch milestone' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Milestone not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ milestone: data });
  } catch (err) {
    logger.error('milestones/[id] GET: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const allowedFields = [
    'event_type', 'title', 'description', 'event_date', 'participants',
    'location', 'emotional_context', 'keywords', 'importance',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // Validate importance
  if (updates.importance !== undefined) {
    updates.importance = Math.max(1, Math.min(5, Number(updates.importance) || 3));
  }

  try {
    const { data, error } = await client
      .from('companion_milestones')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      logger.warn('milestones/[id] PUT: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to update milestone' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Milestone not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ milestone: data });
  } catch (err) {
    logger.error('milestones/[id] PUT: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { error, count } = await client
      .from('companion_milestones')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.warn('milestones/[id] DELETE: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to delete milestone' },
        { status: 500 },
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: 'Milestone not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('milestones/[id] DELETE: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}