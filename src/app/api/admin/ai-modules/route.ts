import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  createDefaultAiModules,
  loadAiModules,
  saveAiModules,
  invalidateAiModulesCache,
  resolveChatCall,
  resolveImageCall,
  type AiModulesConfig,
  type MembershipTier,
} from '@/lib/ai-modules';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';


function envPresent(name: string | null | undefined): boolean {
  if (!name) return false;
  return !!(process.env[name] && String(process.env[name]).length > 0);
}

function buildEnvStatus(config: AiModulesConfig) {
  const endpointEnvs = Array.from(
    new Set(
      config.endpoints
        .map((e) => e.api_key_env)
        .filter((x): x is string => !!x),
    ),
  );
  const keys: Record<string, boolean> = {};
  for (const k of endpointEnvs) keys[k] = envPresent(k);
  keys[config.image.runpod_api_key_env] = envPresent(config.image.runpod_api_key_env);
  keys[config.image.runpod_endpoint_env] = envPresent(config.image.runpod_endpoint_env);
  keys.RUNPOD_API_KEY = envPresent('RUNPOD_API_KEY');
  keys.RUNPOD_ENDPOINT_ID = envPresent('RUNPOD_ENDPOINT_ID');
  keys.RUNPOD_VLLM_URL = envPresent('RUNPOD_VLLM_URL');
  keys.RUNPOD_VLLM_API_KEY = envPresent('RUNPOD_VLLM_API_KEY');
  keys.TOGETHER_API_KEY = envPresent('TOGETHER_API_KEY');

  const chatReady = {
    free_sfw: !!config.endpoints.find((e) => e.id === config.chat.tiers.free.sfw_endpoint_id),
    pro_nsfw: !!(
      config.chat.tiers.pro.allow_nsfw &&
      config.endpoints.find((e) => e.id === config.chat.tiers.pro.nsfw_endpoint_id)
    ),
    together: keys.TOGETHER_API_KEY,
    runpod_vllm: keys.RUNPOD_VLLM_URL && (keys.RUNPOD_VLLM_API_KEY || keys.RUNPOD_API_KEY),
  };
  const imageReady =
    keys[config.image.runpod_api_key_env] || keys.RUNPOD_API_KEY
      ? keys[config.image.runpod_endpoint_env] || keys.RUNPOD_ENDPOINT_ID
      : false;

  return {
    keys,
    chatReady,
    imageReady: !!imageReady && config.image.enabled,
    warnings: [
      !keys.TOGETHER_API_KEY ? '缺少 TOGETHER_API_KEY：Free/Pro SFW 聊天可能失败' : null,
      !(keys.RUNPOD_VLLM_URL && (keys.RUNPOD_VLLM_API_KEY || keys.RUNPOD_API_KEY))
        ? '缺少 RUNPOD_VLLM_URL / API key：NSFW 自建 LLM 不可用'
        : null,
      !imageReady ? '缺少 RunPod 出图 Endpoint/Key：生图会 503' : null,
    ].filter(Boolean),
  };
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ai-modules
 *   ?preview=1&tier=pro&message=hi&intimacy=4&scene=chat_selfie
 *   ?usage=1&period=24h|7d|30d → usage stats from ai_model_usage_logs
 * Returns full module config + optional resolve preview / usage stats.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get('usage') === '1') {
      return NextResponse.json({ usage: await buildUsageStats(searchParams.get('period') || '24h') });
    }

    const config = await loadAiModules(); // Use default cache/file path, ignore unused param

        const payload: Record<string, unknown> = {
      config,
      scheme: {
        summary:
          'Chat: Free→8B SFW · Pro→70B SFW + Lumimaid NSFW · Unlimited→Noromaid. Image: FLUX scenes with token costs. Language: force reply locale.',
        channels: ['sfw', 'nsfw'],
        scenes: Object.keys(config.image.scenes),
      },
      env: buildEnvStatus(config),
    };

    if (searchParams.get('preview') === '1') {
      const tier = (searchParams.get('tier') || 'pro') as MembershipTier;
      const message = searchParams.get('message') || '';
      const intimacy = Number(searchParams.get('intimacy') || 4);
      const locale = searchParams.get('locale') || config.language.default_locale;
      const scene = (searchParams.get('scene') || 'chat_selfie') as keyof typeof config.image.scenes;

      payload.preview = {
        chat: resolveChatCall(config, {
          tier,
          message,
          intimacyLevel: intimacy,
          locale,
        }),
        image: resolveImageCall(config, { scene, tier }),
      };
    }

    return NextResponse.json(payload);
  } catch (e) {
    logger.error('admin/ai-modules GET', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Load failed' },
      { status: 500 },
    );
  }
}

interface UsageLogRow {
  model_id: string;
  provider: string;
  task_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | string | null;
  success: boolean;
  created_at: string;
}

/** Aggregate ai_model_usage_logs into per-model stats + hourly buckets + totals. */
async function buildUsageStats(period: string) {
  const periodMs =
    period === '30d'
      ? 30 * 24 * 60 * 60 * 1000
      : period === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - periodMs).toISOString();

  const supabase = getSupabaseClient();
  const { data: logs, error } = await supabase
    .from('ai_model_usage_logs')
    .select('model_id, provider, task_type, input_tokens, output_tokens, latency_ms, cost_usd, success, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    logger.error('admin/ai-modules usage fetch failed', { error });
    return { stats: [], hourly: [], totals: null, period, since, error: error.message };
  }

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

  for (const log of ((logs || []) as unknown as UsageLogRow[])) {
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

  const stats = Object.values(byModel)
    .map((m) => ({
      ...m,
      avg_latency_ms: m.total_calls > 0 ? Math.round(m.avg_latency_ms / m.total_calls) : 0,
      success_rate: m.total_calls > 0 ? Math.round((m.success_calls / m.total_calls) * 100) : 0,
    }))
    .sort((a, b) => b.total_calls - a.total_calls);

  const hourly: Record<string, { hour: string; calls: number; cost: number; errors: number }> = {};
  for (const log of ((logs || []) as unknown as UsageLogRow[])) {
    const h = new Date(log.created_at).toISOString().slice(0, 13) + ':00';
    if (!hourly[h]) hourly[h] = { hour: h, calls: 0, cost: 0, errors: 0 };
    hourly[h].calls++;
    hourly[h].cost += Number(log.cost_usd) || 0;
    if (!log.success) hourly[h].errors++;
  }

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

  return {
    stats,
    hourly: Object.values(hourly).sort((a, b) => a.hour.localeCompare(b.hour)),
    totals,
    period,
    since,
  };
}

/**
 * PATCH /api/admin/ai-modules
 * Body: partial AiModulesConfig or { config: AiModulesConfig, replace?: boolean }
 */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const current = await loadAiModules(); // Use default cache/file path

    let next: AiModulesConfig;
    if (body.replace && body.config) {
      next = body.config as AiModulesConfig;
    } else {
      const patch = (body.config || body) as Partial<AiModulesConfig>;
      next = mergeConfig(current, patch);
    }

    // Validate endpoint refs + NSFW capability
    const ids = new Set(next.endpoints.map((e) => e.id));
    const byId = new Map(next.endpoints.map((e) => [e.id, e]));
    if (!next.endpoints.length) {
      return NextResponse.json({ error: 'endpoints cannot be empty' }, { status: 400 });
    }
    if (!ids.has(next.chat.fallback_endpoint_id)) {
      return NextResponse.json(
        { error: `chat.fallback_endpoint_id not found: ${next.chat.fallback_endpoint_id}` },
        { status: 400 },
      );
    }
    for (const t of ['free', 'pro', 'unlimited'] as const) {
      const r = next.chat.tiers[t];
      if (!ids.has(r.sfw_endpoint_id)) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.sfw_endpoint_id not found: ${r.sfw_endpoint_id}` },
          { status: 400 },
        );
      }
      if (r.nsfw_endpoint_id) {
        if (!ids.has(r.nsfw_endpoint_id)) {
          return NextResponse.json(
            { error: `chat.tiers.${t}.nsfw_endpoint_id not found: ${r.nsfw_endpoint_id}` },
            { status: 400 },
          );
        }
        const nsfwEp = byId.get(r.nsfw_endpoint_id);
        if (r.allow_nsfw && nsfwEp && !nsfwEp.nsfw_capable) {
          return NextResponse.json(
            {
              error: `chat.tiers.${t}.nsfw_endpoint_id must be nsfw_capable: ${r.nsfw_endpoint_id}`,
            },
            { status: 400 },
          );
        }
      }
      if (r.allow_nsfw && !r.nsfw_endpoint_id) {
        return NextResponse.json(
          { error: `chat.tiers.${t}: allow_nsfw=true requires nsfw_endpoint_id` },
          { status: 400 },
        );
      }
      if (r.max_tokens < 64 || r.max_tokens > 8192) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.max_tokens out of range (64-8192)` },
          { status: 400 },
        );
      }
      if (r.context_messages < 2 || r.context_messages > 80) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.context_messages out of range (2-80)` },
          { status: 400 },
        );
      }
    }
    for (const [scene, sc] of Object.entries(next.image.scenes)) {
      if (sc.width < 256 || sc.height < 256 || sc.width > 2048 || sc.height > 2048) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: width/height must be 256-2048` },
          { status: 400 },
        );
      }
      if (sc.steps < 4 || sc.steps > 60) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: steps must be 4-60` },
          { status: 400 },
        );
      }
      if (sc.cfg < 1 || sc.cfg > 3.5) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: cfg must be 1.0-3.5 for FLUX` },
          { status: 400 },
        );
      }
    }

    const { source } = await saveAiModules(next); // Use default file path
    invalidateAiModulesCache();

    return NextResponse.json({ success: true, source, config: next, env: buildEnvStatus(next) });
  } catch (e) {
    logger.error('admin/ai-modules PATCH', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Save failed' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/ai-modules
 * Body: { action: 'reset' }
 * reset → factory defaults
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'reset';

    if (action === 'reset') {
      const defaults = createDefaultAiModules();
      const { source } = await saveAiModules(defaults); // Use default file path
      invalidateAiModulesCache();
      return NextResponse.json({ success: true, action: 'reset', source, config: defaults });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    logger.error('admin/ai-modules POST', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Action failed' },
      { status: 500 },
    );
  }
}

function mergeConfig(base: AiModulesConfig, patch: Partial<AiModulesConfig>): AiModulesConfig {
  const next = { ...base, ...patch } as AiModulesConfig;
  if (patch.endpoints) next.endpoints = patch.endpoints;
  if (patch.chat) {
    next.chat = {
      ...base.chat,
      ...patch.chat,
      tiers: {
        free: { ...base.chat.tiers.free, ...(patch.chat.tiers?.free || {}) },
        basic: { ...base.chat.tiers.basic, ...(patch.chat.tiers?.basic || {}) },
        pro: { ...base.chat.tiers.pro, ...(patch.chat.tiers?.pro || {}) },
        premium: { ...base.chat.tiers.premium, ...(patch.chat.tiers?.premium || {}) },
        unlimited: { ...base.chat.tiers.unlimited, ...(patch.chat.tiers?.unlimited || {}) },
      },
    };
  }
  if (patch.image) {
    next.image = {
      ...base.image,
      ...patch.image,
      scenes: {
        ...base.image.scenes,
        ...(patch.image.scenes || {}),
      },
    };
  }
  if (patch.language) {
    next.language = {
      ...base.language,
      ...patch.language,
      reply_instructions: {
        ...base.language.reply_instructions,
        ...(patch.language.reply_instructions || {}),
      },
    };
  }
  return next;
}
