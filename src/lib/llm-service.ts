/**
 * LLM Service — RunPod vLLM (self-hosted, uncensored)
 *
 * Endpoint: t3epwpytfgadr5 (Lumimaid 8B)
 * Response time: ~2-5s per request
 */

import { logger } from '@/lib/logger';

const RP_BASE = process.env.RUNPOD_VLLM_URL || '';
const RP_KEY = process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '';
const FETCH_TIMEOUT = 60000; // 60s — Lumimaid cold start can be 20-30s

function isConfigured(): boolean {
  return !!(RP_BASE && RP_KEY);
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${RP_KEY}` };
}

function parseRunPodOutput(data: any): string {
  const tokens = data?.output?.[0]?.choices?.[0]?.tokens;
  if (Array.isArray(tokens) && tokens.length > 0) return tokens.join('');
  const openai = data?.choices?.[0]?.message?.content;
  if (openai) return openai;
  return '';
}

// ── Non-streaming (for emotion detection, meta generation, etc.) ──

export async function generateText(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { prompt, systemPrompt, temperature = 0.85, maxTokens = 1024 } = options;
  if (!isConfigured()) throw new Error('LLM not configured');

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${RP_BASE}/runsync`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input: { messages, max_tokens: maxTokens, temperature } }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) throw new Error(`LLM error (${res.status})`);
  const data = await res.json();
  if (data.status === 'FAILED') throw new Error('LLM generation failed');

  const content = parseRunPodOutput(data);
  if (!content) throw new Error('LLM returned empty');
  return content.trim();
}

// ── Streaming (for chat) — uses /runsync then emits as SSE ──

export async function streamText(options: {
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<Response> {
  const { messages, temperature = 0.85, maxTokens = 2048 } = options;

  if (!isConfigured()) throw new Error('LLM not configured');

  logger.debug('[llm] streaming request', { data: { msgCount: messages.length } });
  const start = Date.now();

  const res = await fetch(`${RP_BASE}/runsync`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input: { messages, max_tokens: maxTokens, temperature } }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) throw new Error(`LLM error (${res.status})`);

  const data = await res.json();
  if (data.status === 'FAILED') throw new Error('LLM generation failed');

  const content = parseRunPodOutput(data) || '...';
  logger.debug('[llm] response received', { data: { ms: Date.now() - start, len: content.length } });

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
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

// ── Compat wrappers ──

export interface StreamingResult {
  response: Response;
  provider: string;
  model: string;
}

export async function streamTextSmart(options: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
}): Promise<StreamingResult> {
  const response = await streamText({
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
  return { response, provider: 'runpod', model: 'lumimaid-8b' };
}

export async function generateTextSmart(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; provider: string }> {
  const content = await generateText(options);
  return { content, provider: 'runpod' };
}

export async function generateTextWithFallback(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ content: string; provider: string; fallbacks: string[] }> {
  try {
    const content = await generateText(options);
    return { content, provider: 'runpod', fallbacks: [] };
  } catch (err) {
    return { content: 'Sorry, I am unavailable. Try again shortly.', provider: 'error', fallbacks: [String(err)] };
  }
}

export function getLLMStatus() {
  return { configured: isConfigured(), model: 'lumimaid-8b', endpoint: RP_BASE };
}