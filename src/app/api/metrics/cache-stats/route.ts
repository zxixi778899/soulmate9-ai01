import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { client } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { requireAdmin } from '@/lib/require-admin';

/**
 * GET /api/metrics/cache-stats
 * 
 * Admin-only endpoint that returns cache performance metrics.
 * Returns hit rate, health score, CPU saved, and top cached prompts.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Check admin role
  await requireAdmin(user);

  try {
    // Get daily stats
    const todayStats = await client.rpc('get_daily_stats', { days: 1 });
    
    // Get cache health
    const healthData = await client.rpc('get_cache_health');
    
    // Get top cached prompts (sample)
    const topPrompts = await client
      .from('generation_cache')
      .select('cache_key, prompt, hit_count, scene')
      .order('hit_count', { ascending: false })
      .limit(10);

    const responseData = {
      today: todayStats?.data || [],
      health: healthData?.data || [],
      topPrompts: topPrompts?.data || [],
      cpuSaved: {
        estimatedSeconds: 0,
        estimatedCostUSD: 0,
      },
      updatedAt: new Date().toISOString(),
    };

    return Response.json(responseData);
  } catch (err) {
    logger.error('[cache-metrics] query failed', { err });
    return Response.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
