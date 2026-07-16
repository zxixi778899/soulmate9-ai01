import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { HEAT_ACHIEVEMENT_DEFS } from '@/lib/heat-achievements';
import { invalidateAchievements } from '@/lib/revalidate';

/**
 * GET  /api/admin/achievements — list DB achievements + seed catalog
 * POST /api/admin/achievements — body { action: 'seed_heat' } upsert heat path defs
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error('[admin/achievements] list failed', { err: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    achievements: data || [],
    seed_catalog: HEAT_ACHIEVEMENT_DEFS,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const rl = await checkRateLimitAsync(`admin-achievements-seed:${user!.id}`, {
    maxRequests: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action !== 'seed_heat') {
    return NextResponse.json(
      { error: "Unknown action. Use { action: 'seed_heat' }" },
      { status: 400 },
    );
  }

  let upserted = 0;
  const errors: string[] = [];

  for (const def of HEAT_ACHIEVEMENT_DEFS) {
    const row = {
      code: def.code,
      name: def.name,
      description: def.description,
      category: def.category,
      reward_tokens: def.reward_tokens,
      condition_type: def.condition_type,
      condition_value: def.condition_value,
      rarity: def.rarity || 'common',
      sort_order: def.sort_order,
      is_hidden: def.is_hidden ?? false,
    };

    const { error } = await supabase
      .from('achievements')
      .upsert(row, { onConflict: 'code' });

    if (error) {
      errors.push(`${def.code}: ${error.message}`);
      logger.error('[admin/achievements] upsert failed', {
        data: { code: def.code, err: error.message },
      });
    } else {
      upserted += 1;
    }
  }

  logger.info('[admin/achievements] seed_heat', {
    data: { upserted, attempted: HEAT_ACHIEVEMENT_DEFS.length },
  });

  invalidateAchievements();

  return NextResponse.json({
    ok: errors.length === 0,
    upserted,
    attempted: HEAT_ACHIEVEMENT_DEFS.length,
    errors,
  });
}
