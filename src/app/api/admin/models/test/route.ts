import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { estimateTokens, estimateCost, logModelUsage } from '@/lib/model-usage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/models/test
 * Ping a model config with a short prompt and return latency + sample output + cost estimate.
 *
 * Body: { id?: string, provider?: string, model_id?: string, api_base_url?: string,
 *         api_key_env?: string, temperature?: number, max_tokens?: number,
 *         cost_per_1k_input?: number, cost_per_1k_output?: number,
 *         prompt?: string }
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    let {
      id,
      provider,
      model_id,
      api_base_url,
      api_key_env,
      temperature = 0.3,
      max_tokens = 64,
      cost_per_1k_input = 0,
      cost_per_1k_output = 0,
      prompt = 'Reply with exactly: OK',
    } = body as Record<string, unknown>;

    // Load from DB if id given
    if (id && typeof id === 'string') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('ai_model_configs')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: 'Model config not found' }, { status: 404 });
      }
      provider = data.provider;
      model_id = data.model_id;
      api_base_url = data.api_base_url;
      api_key_env = data.api_key_env;
      temperature = data.temperature ?? temperature;
      max_tokens = Math.min(Number(data.max_tokens) || 64, 256);
      cost_per_1k_input = data.cost_per_1k_input ?? 0;
      cost_per_1k_output = data.cost_per_1k_output ?? 0;
    }

    if (!provider || !model_id) {
      return NextResponse.json(
        { error: 'provider and model_id are required (or pass id)' },
        { status: 400 },
      );
    }

    const testPrompt = String(prompt || 'Reply with exactly: OK').slice(0, 500);
    const started = Date.now();
    let sample = '';
    let success = false;
    let errorMessage: string | null = null;

    try {
      sample = await callProvider({
        provider: String(provider),
        modelId: String(model_id),
        apiBaseUrl: api_base_url ? String(api_base_url) : null,
        apiKeyEnv: api_key_env ? String(api_key_env) : null,
        temperature: Number(temperature) || 0.3,
        maxTokens: Math.min(Number(max_tokens) || 64, 256),
        prompt: testPrompt,
      });
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      success = false;
    }

    const latencyMs = Date.now() - started;
    const inputTokens = estimateTokens(testPrompt);
    const outputTokens = estimateTokens(sample || '');
    const costUsd = estimateCost(
      inputTokens,
      outputTokens,
      Number(cost_per_1k_input) || 0,
      Number(cost_per_1k_output) || 0,
    );

    // Fire-and-forget usage log
    void logModelUsage({
      provider: String(provider),
      model_id: String(model_id),
      task_type: 'admin_test',
      user_id: adminCheck.user?.id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      cost_usd: costUsd,
      success,
      error_message: errorMessage || undefined,
    });

    return NextResponse.json({
      success,
      provider,
      model_id,
      latency_ms: latencyMs,
      sample: sample.slice(0, 500),
      error: errorMessage,
      tokens: { input: inputTokens, output: outputTokens },
      cost_usd: costUsd,
      estimated_cost_per_1k_msg_usd:
        ((Number(cost_per_1k_input) || 0) * 0.5 + (Number(cost_per_1k_output) || 0) * 0.5) / 1,
    });
  } catch (e) {
    logger.error('admin/models/test failed', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Test failed' },
      { status: 500 },
    );
  }
}

async function callProvider(opts: {
  provider: string;
  modelId: string;
  apiBaseUrl: string | null;
  apiKeyEnv: string | null;
  temperature: number;
  maxTokens: number;
  prompt: string;
}): Promise<string> {
  const p = opts.provider.toLowerCase();
  const keyName = opts.apiKeyEnv || guessKeyEnv(p);
  const apiKey = keyName ? process.env[keyName] || '' : '';
  const messages = [
    { role: 'system', content: 'You are a health-check probe. Be brief.' },
    { role: 'user', content: opts.prompt },
  ];

  if (p === 'runpod') {
    const base =
      opts.apiBaseUrl ||
      process.env.RUNPOD_VLLM_URL ||
      '';
    const key = apiKey || process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '';
    if (!base || !key) throw new Error('RunPod URL/API key not configured');
    const res = await fetch(`${base.replace(/\/$/, '')}/runsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        input: {
          messages,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
        },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`RunPod HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'FAILED') throw new Error(data.error || 'RunPod FAILED');
    const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
    if (Array.isArray(tokens)) return tokens.join('');
    return data?.choices?.[0]?.message?.content || data?.output || JSON.stringify(data).slice(0, 200);
  }

  // OpenAI-compatible: together, openai, anthropic-compat, coze gateway, custom
  const base =
    opts.apiBaseUrl ||
    (p === 'together'
      ? 'https://api.together.xyz/v1'
      : p === 'openai'
        ? 'https://api.openai.com/v1'
        : p === 'coze'
          ? process.env.COZE_LLM_BASE_URL || ''
          : '');
  if (!base) throw new Error(`api_base_url required for provider ${opts.provider}`);
  if (!apiKey && p !== 'local') throw new Error(`Missing API key env: ${keyName || '(none)'}`);

  const url = `${base.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.modelId,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function guessKeyEnv(provider: string): string {
  switch (provider) {
    case 'together':
      return 'TOGETHER_API_KEY';
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'runpod':
      return 'RUNPOD_VLLM_API_KEY';
    case 'coze':
      return 'COZE_API_KEY';
    default:
      return '';
  }
}
