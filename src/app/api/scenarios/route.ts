import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { getOrCreateScenario, updateScenarioState, endScenario } from '@/lib/scenario-engine';
import type { ScenarioState } from '@/lib/milestone-types';

export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const girlfriendId = searchParams.get('girlfriend_id');

  if (!girlfriendId) {
    return NextResponse.json(
      { error: 'girlfriend_id is required' },
      { status: 400 },
    );
  }

  try {
    // Fetch active scenarios for this girlfriend
    const { data, error } = await client
      .from('companion_scenarios')
      .select('*')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      logger.warn('scenarios GET: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to fetch scenarios' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      scenarios: data || [],
    });
  } catch (err) {
    logger.error('scenarios GET: exception', {
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

  const { girlfriend_id, title, description, relationship_type } = body as Record<string, unknown>;

  if (!girlfriend_id) {
    return NextResponse.json(
      { error: 'girlfriend_id is required' },
      { status: 400 },
    );
  }

  try {
    const scenario = await getOrCreateScenario(
      client,
      user.id,
      String(girlfriend_id),
      String(relationship_type || ''),
    );

    if (!scenario) {
      return NextResponse.json(
        { error: 'Failed to create or retrieve scenario' },
        { status: 500 },
      );
    }

    // If title/description provided, update the scenario
    if (title || description) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title) updates.title = String(title);
      if (description) updates.description = String(description);

      const { data: updated } = await client
        .from('companion_scenarios')
        .update(updates)
        .eq('id', scenario.id)
        .select()
        .maybeSingle();

      return NextResponse.json({
        scenario: updated || scenario,
      }, { status: 201 });
    }

    return NextResponse.json({ scenario }, { status: 201 });
  } catch (err) {
    logger.error('scenarios POST: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { scenario_id, action, ...stateUpdates } = body as Record<string, unknown>;

  if (!scenario_id) {
    return NextResponse.json(
      { error: 'scenario_id is required' },
      { status: 400 },
    );
  }

  try {
    if (action === 'end') {
      const success = await endScenario(client, String(scenario_id));
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to end scenario' },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true });
    }

    // Update scenario state
    if (stateUpdates.phase || stateUpdates.emotional_beat || stateUpdates.current_scene) {
      const scenario = await updateScenarioState(client, String(scenario_id), stateUpdates as Partial<ScenarioState>);
      if (!scenario) {
        return NextResponse.json(
          { error: 'Scenario not found or update failed' },
          { status: 404 },
        );
      }
      return NextResponse.json({ scenario });
    }

    // Generic update fallback
    const { data, error } = await client
      .from('companion_scenarios')
      .update({
        ...stateUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scenario_id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (error) {
      logger.warn('scenarios PUT: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to update scenario' },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Scenario not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ scenario: data });
  } catch (err) {
    logger.error('scenarios PUT: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get('scenario_id');

  if (!scenarioId) {
    return NextResponse.json(
      { error: 'scenario_id is required' },
      { status: 400 },
    );
  }

  try {
    const { error, count } = await client
      .from('companion_scenarios')
      .delete({ count: 'exact' })
      .eq('id', scenarioId)
      .eq('user_id', user.id);

    if (error) {
      logger.warn('scenarios DELETE: database error', { err: error.message });
      return NextResponse.json(
        { error: 'Failed to delete scenario' },
        { status: 500 },
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: 'Scenario not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('scenarios DELETE: exception', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}