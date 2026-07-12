/**
 * LLM Service — RunPod vLLM (self-hosted, uncensored)
 *
 * Recommended setup:
 *   - Base:  TheBloke/Lumimaid-13B-v1.0-Q5_K_M.gguf (or NeverSleep/Lumimaid-13B)
 *   - LoRA 1: KBlueLeaf/DPO-PII-13B (RP instructions, weight 0.7)
 *   - LoRA 2: NSFW-13B-LoRA (NSFW mode, weight 0.3)
 *   - Server: vLLM with --enable-lora + --lora-modules rp,nsfw
 *   - Quant: Q5_K_M, ctx 12288
 *
 * Generation params (recommended):
 *   temperature=0.7, top_p=0.9, repetition_penalty=1.05, max_tokens=1024
 *
 * Mistral-Instruct chat template (Lumimaid 13B is Mistral-based).
 */

import { logger } from '@/lib/logger';
import { injectLore, loraExtraBody, pickLore, type LoreMode } from '@/lib/lora-prompt';

const RP_BASE  = process.env.RUNPOD_VLLM_URL || '';
const RP_KEY   = process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '';
const LORA_NAME = process.env.RUNPOD_VLLM_LORA || 'rp'; // which LoRA to apply
const FETCH_TIMEOUT = 60000;

const DEFAULT_TEMPERATURE         = Number(process.env.LLM_TEMPERATURE || 0.7);
const DEFAULT_MAX_TOKENS          = Number(process.env.LLM_MAX_TOKENS || 1024);
const DEFAULT_TOP_P               = Number(process.env.LLM_TOP_P || 0.9);
const DEFAULT_REPETITION_PENALTY  = Number(process.env.LLM_REPETITION_PENALTY || 1.05);

function isConfigured() { return !!(RP_BASE && RP_KEY); }

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${RP_KEY}` };
}

function parseRunPodOutput(data: any): string {
  const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
  if (Array.isArray(tokens) && tokens.length > 0) return tokens.join('');
  const openai = data?.choices?.[0]?.message?.content;
  if (openai) return openai;
  return '';
}

/**
 * Mistral-Instruct chat template (compatible with Lumimaid 13B).
 * vLLM uses the model's built-in template automatically when this
 * matches chat_template=llama3 / mistral. We do NOT override it;
 * we only ensure the messages array is well-formed.
 */

interface GenOptions {
  prompt?: string;
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  repetitionPenalty?: number;
  loraName?: string;
  loraMode?: LoreMode;
}

function buildInput(opts: GenOptions) {
  const mode: LoreMode = opts.loraMode || 'default';
  const msgs = opts.messages ?? [];
  if (msgs.length === 0) {
    if (!opts.prompt) throw new Error('generateText: provide either messages or prompt');
    const arr: { role: string; content: string }[] = [];
    if (opts.systemPrompt) arr.push({ role: 'system', content: injectLore(opts.systemPrompt, mode) });
    arr.push({ role: 'user', content: opts.prompt });
    return arr;
  }
  // Inject LoRA trigger into existing system message (or prepend)
  if (msgs[0]?.role === 'system' && mode !== 'default') {
    return [{ ...msgs[0], content: injectLore(msgs[0].content, mode) }, ...msgs.slice(1)];
  }
  if (mode !== 'default') {
    return [{ role: 'system', content: injectLore('', mode) }, ...msgs];
  }
  return msgs;
}

async function postRunPod(input: Record<string, unknown>, signal: AbortSignal): Promise<any> {
  const res = await fetch(`${RP_BASE}/runsync`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) throw new Error(`LLM error (${res.status})`);
  const data = await res.json();
  if (data.status === 'FAILED') throw new Error(`LLM generation failed: ${data.error || ''}`);
  return data;
}

// ── Non-streaming ──


async function callTogetherChat(
  messages: { role: string; content: string }[],
  options: GenOptions,
): Promise<string> {
  const key = process.env.TOGETHER_API_KEY || '';
  if (!key) throw new Error('Together not configured');
  const model =
    process.env.TOGETHER_CHAT_MODEL ||
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      top_p: options.topP ?? DEFAULT_TOP_P,
    }),
    signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT, 45000)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Together HTTP ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Together returned empty');
  return String(content).trim();
}

export async function generateText(options: GenOptions): Promise<string> {
  const messages = buildInput(options);
  const mode: LoreMode = options.loraMode || 'default';
  const errors: string[] = [];

  if (isConfigured()) {
    try {
      const data = await postRunPod({
        input: {
          messages,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options.temperature ?? DEFAULT_TEMPERATURE,
          top_p: options.topP ?? DEFAULT_TOP_P,
          repetition_penalty: options.repetitionPenalty ?? DEFAULT_REPETITION_PENALTY,
          ...(options.loraName || (mode !== 'default' ? mode : LORA_NAME)
            ? { lora_name: options.loraName || (mode !== 'default' ? mode : LORA_NAME) }
            : {}),
        },
      }, AbortSignal.timeout(FETCH_TIMEOUT));
      const content = parseRunPodOutput(data);
      if (!content) throw new Error('LLM returned empty');
      return content.trim();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      logger.warn('[llm] runpod generate failed, trying Together', { err: errors[errors.length - 1] });
    }
  }

  if (process.env.TOGETHER_API_KEY) {
    try {
      return await callTogetherChat(messages as { role: string; content: string }[], options);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors[0] || 'LLM not configured');
}

function sseFromText(content: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}

`));
        ctrl.enqueue(encoder.encode('data: [DONE]

'));
        ctrl.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}

export async function streamText(options: GenOptions): Promise<Response> {
  const messages = buildInput(options);
  const mode: LoreMode = options.loraMode || 'default';
  const start = Date.now();
  logger.debug('[llm] streaming request', { data: { msgCount: messages.length, mode } });
  const errors: string[] = [];

  if (isConfigured()) {
    try {
      const data = await postRunPod({
        input: {
          messages,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature ?? DEFAULT_TEMPERATURE,
          top_p: options.topP ?? DEFAULT_TOP_P,
          repetition_penalty: options.repetitionPenalty ?? DEFAULT_REPETITION_PENALTY,
          ...(options.loraName || (mode !== 'default' ? mode : LORA_NAME)
            ? { lora_name: options.loraName || (mode !== 'default' ? mode : LORA_NAME) }
            : {}),
        },
      }, AbortSignal.timeout(FETCH_TIMEOUT));
      const content = parseRunPodOutput(data) || '...';
      logger.debug('[llm] response', { data: { ms: Date.now() - start, len: content.length, provider: 'runpod' } });
      return sseFromText(content);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      logger.warn('[llm] runpod stream failed, trying Together', { err: errors[errors.length - 1] });
    }
  }

  if (process.env.TOGETHER_API_KEY) {
    try {
      const content = await callTogetherChat(messages as { role: string; content: string }[], {
        ...options,
        maxTokens: options.maxTokens ?? 1024,
      });
      logger.debug('[llm] response', { data: { ms: Date.now() - start, len: content.length, provider: 'together' } });
      return sseFromText(content);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors[0] || 'LLM not configured');
}

// ── Compat wrappers ──

export async function streamTextSmart(options: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  loraMode?: LoreMode;
  loraName?: string;
  intimacyLevel?: number;
  nsfwOptIn?: boolean;
}): Promise<StreamingResult> {
  // Auto-pick LoRA mode from intimacy level if not explicit
  const mode: LoreMode =
    options.loraMode ??
    pickLore(options.intimacyLevel ?? 1, options.nsfwOptIn ?? false);

  const response = await streamText({
    messages: options.messages as any,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    loraMode: mode,
    loraName: options.loraName,
  });
  const provider = isConfigured() ? 'runpod' : (process.env.TOGETHER_API_KEY ? 'together' : 'unknown');
  const model =
    provider === 'together'
      ? (process.env.TOGETHER_CHAT_MODEL || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo')
      : (process.env.LLM_MODEL_NAME || 'lumimaid-13b');
  return { response, provider, model };
}

export async function generateTextSmart(options: GenOptions) {
  const content = await generateText(options);
  return { content, provider: 'runpod' };
}

export async function generateTextWithFallback(options: GenOptions) {
  try {
    const content = await generateText(options);
    return { content, provider: 'runpod', fallbacks: [] as string[] };
  } catch (err) {
    return {
      content: 'Sorry, I am unavailable. Try again shortly.',
      provider: 'error',
      fallbacks: [String(err)],
    };
  }
}

export function getLLMStatus() {
  return {
    configured: isConfigured() || !!process.env.TOGETHER_API_KEY,
    model: process.env.LLM_MODEL_NAME || 'lumimaid-13b',
    endpoint: RP_BASE,
    together: !!process.env.TOGETHER_API_KEY,
    lora: LORA_NAME,
    generation: {
      temperature: DEFAULT_TEMPERATURE,
      top_p: DEFAULT_TOP_P,
      max_tokens: DEFAULT_MAX_TOKENS,
      repetition_penalty: DEFAULT_REPETITION_PENALTY,
    },
  };
}