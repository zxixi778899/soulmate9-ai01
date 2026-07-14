/**
 * Multi-provider chat invocation driven by resolved ModelEndpoint.
 */
import type { ModelEndpoint } from './types';
import { logger } from '@/lib/logger';
import { estimateTokens, estimateCost, logModelUsage } from '@/lib/model-usage';
import { sanitizeAssistantReply } from '@/lib/chat-reply-sanitize';

export interface InvokeChatOptions {
  endpoint: ModelEndpoint;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  girlfriendId?: string;
  taskType?: string;
}

export interface InvokeChatResult {
  content: string;
  provider: string;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

function resolveApiKey(endpoint: ModelEndpoint): string {
  const envName = endpoint.api_key_env || guessKeyEnv(endpoint.provider);
  const primary = envName ? process.env[envName] || '' : '';
  if (primary) return primary;
  // Common aliases so mislabeled env still works
  if (endpoint.provider === 'together') return process.env.TOGETHER_API_KEY || '';
  if (endpoint.provider === 'runpod') {
    return (
      process.env.RUNPOD_VLLM_API_KEY ||
      process.env.RUNPOD_API_KEY ||
      process.env.RUNPOD_COMFYUI_API_KEY ||
      ''
    );
  }
  if (endpoint.provider === 'openai') return process.env.OPENAI_API_KEY || '';
  return '';
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

/**
 * Non-streaming completion for any configured endpoint.
 */
export async function invokeChat(opts: InvokeChatOptions): Promise<InvokeChatResult> {
  const ep = opts.endpoint;
  const temperature = opts.temperature ?? ep.temperature;
  const maxTokens = opts.maxTokens ?? ep.max_tokens;
  const started = Date.now();
  let content = '';
  let success = true;
  let errorMessage: string | undefined;

  try {
    if (ep.provider === 'runpod') {
      content = await callRunPodVllm(ep, opts.messages, temperature, maxTokens);
    } else {
      content = await callOpenAiCompatible(ep, opts.messages, temperature, maxTokens);
    }
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('[ai-modules/invoke] failed', { provider: ep.provider, model: ep.model_id, errorMessage });
    throw err;
  } finally {
    const latency_ms = Date.now() - started;
    const input_tokens = estimateTokens(opts.messages.map((m) => m.content).join('\n'));
    const output_tokens = estimateTokens(content);
    const cost_usd = estimateCost(
      input_tokens,
      output_tokens,
      ep.cost_per_1k_input,
      ep.cost_per_1k_output,
    );
    void logModelUsage({
      provider: ep.provider,
      model_id: ep.model_id,
      task_type: opts.taskType || 'chat',
      user_id: opts.userId,
      girlfriend_id: opts.girlfriendId,
      input_tokens,
      output_tokens,
      latency_ms,
      cost_usd,
      success,
      error_message: errorMessage,
    });
  }

  const latency_ms = Date.now() - started;
  const input_tokens = estimateTokens(opts.messages.map((m) => m.content).join('\n'));
  const output_tokens = estimateTokens(content);
  const cost_usd = estimateCost(
    input_tokens,
    output_tokens,
    ep.cost_per_1k_input,
    ep.cost_per_1k_output,
  );

  return {
    content: sanitizeAssistantReply(content),
    provider: ep.provider,
    model: ep.model_id,
    latency_ms,
    input_tokens,
    output_tokens,
    cost_usd,
  };
}

/**
 * Streaming wrapper: call non-stream then emit SSE chunks (compatible with chat UI).
 */
export async function invokeChatAsSseStream(opts: InvokeChatOptions): Promise<{
  response: Response;
  provider: string;
  model: string;
  meta: InvokeChatResult | null;
}> {
  try {
    const result = await invokeChat(opts);
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: result.content } }] })}\n\n`,
            ),
          );
          ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
          ctrl.close();
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Model-Provider': result.provider,
          'X-Model-Id': result.model,
          'X-Model-Endpoint': opts.endpoint.id,
        },
      },
    );
    return { response, provider: result.provider, model: result.model, meta: result };
  } catch (err) {
    logger.warn('[ai-modules/invoke] primary failed, falling back to llm-service', {
      endpoint: opts.endpoint.id,
      provider: opts.endpoint.provider,
      err: err instanceof Error ? err.message : String(err),
    });
    try {
      const { streamTextSmart } = await import('@/lib/llm-service');
      const fallback = await streamTextSmart({
        messages: opts.messages,
        temperature: opts.temperature ?? opts.endpoint.temperature,
        maxTokens: opts.maxTokens ?? opts.endpoint.max_tokens,
      });
      return {
        response: fallback.response,
        provider: fallback.provider,
        model: fallback.model || opts.endpoint.model_id,
        meta: null,
      };
    } catch (fallbackErr) {
      logger.error('[ai-modules/invoke] all chat providers failed', {
        primary: err instanceof Error ? err.message : String(err),
        fallback: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
      const soft =
        "I'm right here, baby... my connection just hiccuped. Send that again and I'll answer you properly~";
      const encoder = new TextEncoder();
      const response = new Response(
        new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: soft } }] })}

`,
              ),
            );
            ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
            ctrl.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Model-Provider': 'soft-fallback',
            'X-Model-Id': 'offline-soft',
          },
        },
      );
      return {
        response,
        provider: 'soft-fallback',
        model: 'offline-soft',
        meta: null,
      };
    }
  }
}


async function callRunPodVllm(
  ep: ModelEndpoint,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const base = (ep.api_base_url || process.env.RUNPOD_VLLM_URL || '').replace(/\/$/, '');
  const key =
    resolveApiKey(ep) || process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '';
  if (!base || !key) throw new Error('RunPod vLLM not configured (RUNPOD_VLLM_URL / API key)');

  const res = await fetch(`${base}/runsync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: { messages, max_tokens: maxTokens, temperature },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'FAILED') throw new Error(data.error || 'RunPod FAILED');
  // IN_QUEUE / IN_PROGRESS without output = worker still cold; treat as empty fail for fallback.
  if (data.status && data.status !== 'COMPLETED' && !data.output) {
    throw new Error(`RunPod status ${data.status} (no output yet)`);
  }
  const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
  if (Array.isArray(tokens)) return tokens.join('').trim();
  const openai = data?.choices?.[0]?.message?.content;
  if (openai) return String(openai).trim();
  throw new Error('RunPod returned empty content');
}

async function callOpenAiCompatible(
  ep: ModelEndpoint,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const base =
    (ep.api_base_url ||
      (ep.provider === 'together' ? 'https://api.together.xyz/v1' : '') ||
      (ep.provider === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/$/, '');
  const key = resolveApiKey(ep);
  if (!base) throw new Error(`api_base_url missing for ${ep.id}`);
  if (!key) throw new Error(`API key env missing: ${ep.api_key_env || ep.provider}`);

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: ep.model_id,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${ep.provider} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${ep.provider} empty content`);
  return String(content).trim();
}
