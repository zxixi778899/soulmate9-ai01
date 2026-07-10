import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/admin/models — List all model configs + usage summary
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'configs';

  const supabase = getSupabaseClient();

  if (view === 'usage') {
    // Usage dashboard: period = 24h | 7d | 30d
    const period = searchParams.get('period') || '24h';
    const periodMs =
      period === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : period === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - periodMs).toISOString();

    let usageStats: unknown = null;
    let usageErr: unknown = 'not attempted';
    try {
      const result = await supabase.rpc('get_model_usage_stats', { p_since: since });
      usageStats = result.data;
      usageErr = result.error;
    } catch {
      usageStats = null;
      usageErr = 'rpc not found';
    }

    // Fallback: manual aggregation if RPC doesn't exist
    if (usageErr || !usageStats) {
      const { data: logs, error } = await supabase
        .from('ai_model_usage_logs')
        .select('model_id, provider, task_type, input_tokens, output_tokens, latency_ms, cost_usd, success, error_message, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) {
        logger.error('admin/models usage fetch failed', { error });
        return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
      }

      // Aggregate by model
      const byModel: Record<string, {
        model_id: string;
        provider: string;
        total_calls: number;
        success_calls: number;
        error_calls: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost_usd: number;
        avg_latency_ms: number;
        task_types: Record<string, number>;
      }> = {};

      for (const log of (logs || [])) {
        const key = log.model_id;
        if (!byModel[key]) {
          byModel[key] = {
            model_id: log.model_id,
            provider: log.provider,
            total_calls: 0,
            success_calls: 0,
            error_calls: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost_usd: 0,
            avg_latency_ms: 0,
            task_types: {},
          };
        }
        const m = byModel[key];
        m.total_calls++;
        if (log.success) m.success_calls++;
        else m.error_calls++;
        m.total_input_tokens += log.input_tokens || 0;
        m.total_output_tokens += log.output_tokens || 0;
        m.total_cost_usd += Number(log.cost_usd) || 0;
        m.avg_latency_ms += log.latency_ms || 0;
        m.task_types[log.task_type] = (m.task_types[log.task_type] || 0) + 1;
      }

      // Finalize averages
      const stats = Object.values(byModel).map(m => ({
        ...m,
        avg_latency_ms: m.total_calls > 0 ? Math.round(m.avg_latency_ms / m.total_calls) : 0,
        success_rate: m.total_calls > 0 ? Math.round((m.success_calls / m.total_calls) * 100) : 0,
      }));

      // Hourly breakdown for charts (last 24h)
      const hourly: Record<string, { hour: string; calls: number; cost: number; errors: number }> = {};
      for (const log of (logs || [])) {
        const h = new Date(log.created_at).toISOString().slice(0, 13) + ':00';
        if (!hourly[h]) hourly[h] = { hour: h, calls: 0, cost: 0, errors: 0 };
        hourly[h].calls++;
        hourly[h].cost += Number(log.cost_usd) || 0;
        if (!log.success) hourly[h].errors++;
      }

      // Totals
      const totals = {
        total_calls: stats.reduce((s, m) => s + m.total_calls, 0),
        total_cost_usd: stats.reduce((s, m) => s + m.total_cost_usd, 0),
        total_tokens: stats.reduce((s, m) => s + m.total_input_tokens + m.total_output_tokens, 0),
        avg_latency_ms: stats.length > 0
          ? Math.round(stats.reduce((s, m) => s + m.avg_latency_ms, 0) / stats.length)
          : 0,
        avg_success_rate: stats.length > 0
          ? Math.round(stats.reduce((s, m) => s + m.success_rate, 0) / stats.length)
          : 0,
      };

      return NextResponse.json({
        stats,
        hourly: Object.values(hourly).sort((a, b) => a.hour.localeCompare(b.hour)),
        totals,
        period,
        since,
      });
    }

    return NextResponse.json({ stats: usageStats, period, since });
  }

  // Default: return model configs
  const { data: configs, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .order('priority', { ascending: false });

  if (error) {
    logger.error('admin/models fetch failed', { error });
    return NextResponse.json({ error: 'Failed to fetch model configs' }, { status: 500 });
  }

  return NextResponse.json({ configs: configs || [] });
}

// POST /api/admin/models — Add a new model config
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    const { provider, model_id, display_name, task_type, api_base_url, api_key_env,
            temperature, max_tokens, cost_per_1k_input, cost_per_1k_output,
            priority, nsfw_capable, min_tier, notes } = body;

    if (!provider || !model_id || !display_name) {
      return NextResponse.json({ error: 'provider, model_id, and display_name are required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ai_model_configs')
      .insert({
        provider, model_id, display_name, task_type: task_type || 'chat',
        api_base_url, api_key_env, temperature: temperature ?? 0.85,
        max_tokens: max_tokens ?? 2048, cost_per_1k_input: cost_per_1k_input ?? 0,
        cost_per_1k_output: cost_per_1k_output ?? 0, priority: priority ?? 0,
        nsfw_capable: nsfw_capable ?? false, min_tier: min_tier || 'free', notes,
      })
      .select()
      .single();

    if (error) {
      logger.error('admin/models create failed', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/admin/models — Update a model config
export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ai_model_configs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('admin/models update failed', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/models — Remove a model config
export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('ai_model_configs')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('admin/models delete failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
