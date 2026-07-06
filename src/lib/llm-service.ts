import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from './analytics';
import { getCozeAccessToken } from '@/lib/coze-auth';

/**
 * LLM Service - multi-provider with NSFW-aware routing
 *
 * Providers:
 *   1. Coze (Doubao) - SFW content, Chinese compliance
 *   2. Together AI (Llama 3.3) - SFW content, uncensored-lite
 *   3. RunPod vLLM (Noromaid/Lumimaid) - NSFW content, fully uncensored
 *   4. Claude Haiku - fallback
 *   5. Local Llama - last resort
 */

const API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL || process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn';
const DEFAULT_MODEL = 'doubao-seed-2-0-pro-260215';

// Together AI (OpenAI-compatible)
const TOGETHER_API_BASE = 'https://api.together.xyz/v1';
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || '';
const TOGETHER_SFW_MODEL = process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free';
const TOGETHER_FAST_MODEL = process.env.TOGETHER_FAST_MODEL || 'meta-llama/Llama-3.1-8B-Instruct-Turbo';

// RunPod vLLM (OpenAI-compatible, self-hosted NSFW models)
const RUNPOD_VLLM_BASE = process.env.RUNPOD_VLLM_URL || '';
const RUNPOD_VLLM_KEY = process.env.RUNPOD_VLLM_API_KEY || '';
const RUNPOD_NSFW_MODEL = process.env.RUNPOD_VLLM_MODEL || 'NeverSleep/Llama-3-Lumimaid-8B-v0.1';

export async function generateText(options: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { prompt, systemPrompt, model = DEFAULT_MODEL, temperature = 0.7, maxTokens = 1024 } = options;
  const accessToken = await getCozeAccessToken();
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ];
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`LLM API error (${res.status}): ${errText.slice(0, 300)}`);
  }
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content;
    if (content) return content;
  } catch {}
  let fullContent = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
        if (delta) fullContent += delta;
      } catch {}
    }
  }
  if (!fullContent) throw new Error('LLM returned empty content');
  return fullContent.trim();
}

/**
 * Dual-route fallback chain: Coze -> Claude Haiku -> Local Llama
 */
export async function generateTextWithFallback(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: 'chat' | 'emotion_detection' | 'metadata' | 'image_prompt';
}): Promise<{ content: string; provider: string; fallbacks: string[] }> {
  const fallbacks: string[] = [];
  try {
    const content = await generateText({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 1024,
    });
    return { content, provider: 'coze', fallbacks };
  } catch (err1) {
    fallbacks.push(`coze:${(err1 as Error).message.slice(0, 80)}`);
    logger.warn('[llm] primary failed, trying Claude fallback', { err: String(err1).slice(0, 200) });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const content = await callClaude({
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 1024,
      });
      capture('llm-router', AnalyticsEvents.LLM_FALLBACK_USED, { from: 'coze', to: 'claude', task_type: options.taskType });
      return { content, provider: 'claude', fallbacks };
    } catch (err2) {
      fallbacks.push(`claude:${(err2 as Error).message.slice(0, 80)}`);
      logger.warn('[llm] Claude fallback failed, trying local Llama', { err: String(err2).slice(0, 200) });
    }
  }
  const llamaBase = process.env.LOCAL_LLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const content = await callLlama({
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      temperature: options.temperature ?? 0.5,
      maxTokens: options.maxTokens ?? 512,
      baseUrl: llamaBase,
    });
    capture('llm-router', AnalyticsEvents.LLM_FALLBACK_USED, { from: 'claude', to: 'llama-local', task_type: options.taskType });
    return { content, provider: 'llama-local', fallbacks };
  } catch (err3) {
    fallbacks.push(`llama:${(err3 as Error).message.slice(0, 80)}`);
    throw new Error(`All LLM providers failed: ${fallbacks.join(' -> ')}`);
  }
}

async function callClaude(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.CLAUDE_FALLBACK_MODEL || 'claude-3-5-haiku-20241022';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      system: options.systemPrompt || 'You are a helpful assistant.',
      messages: [{ role: 'user', content: options.prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Claude API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.content?.[0]?.text;
  if (!text) throw new Error('Claude returned empty');
  return text.trim();
}

async function callLlama(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl: string;
}): Promise<string> {
  const model = process.env.LOCAL_LLAMA_MODEL || 'llama3.1:8b';
  const res = await fetch(`${options.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: options.prompt },
      ],
      options: {
        temperature: options.temperature ?? 0.5,
        num_predict: options.maxTokens ?? 512,
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Llama API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json?.message?.content;
  if (!content) throw new Error('Llama returned empty');
  return content.trim();
}

/**
 * Together AI - OpenAI-compatible API for uncensored SFW models
 * Uses Llama 3.3 70B (free tier) or 8B (fast tier)
 */
async function callTogetherAI(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  if (!TOGETHER_API_KEY) throw new Error('TOGETHER_API_KEY not configured');
  const model = options.model || TOGETHER_SFW_MODEL;
  const res = await fetch(`${TOGETHER_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOGETHER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.85,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: options.prompt },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Together AI error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Together AI returned empty content');
  return text.trim();
}

/**
 * RunPod vLLM - self-hosted NSFW model (Noromaid/Lumimaid)
 * OpenAI-compatible API, fully uncensored for NSFW roleplay
 */
async function callRunPodVLLM(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}): Promise<string> {
  if (!RUNPOD_VLLM_BASE) throw new Error('RUNPOD_VLLM_URL not configured');
  const res = await fetch(`${RUNPOD_VLLM_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(RUNPOD_VLLM_KEY ? { Authorization: `Bearer ${RUNPOD_VLLM_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: RUNPOD_NSFW_MODEL,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.9,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: options.prompt },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`RunPod vLLM error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('RunPod vLLM returned empty content');
  return text.trim();
}

/**
 * NSFW-aware text generation with multi-provider fallback.
 *
 * Routing logic:
 *   - isNsfw=true + RunPod configured → RunPod vLLM (Noromaid) → Together AI → Claude
 *   - isNsfw=false + Together configured → Together AI → Coze → Claude
 *   - Otherwise → existing Coze → Claude → Llama chain
 */
export async function generateTextSmart(options: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  isNsfw?: boolean;
  userTier?: 'free' | 'pro' | 'unlimited';
  taskType?: string;
}): Promise<{ content: string; provider: string }> {
  const { isNsfw = false, userTier = 'free' } = options;

  // NSFW route: RunPod vLLM → Together AI → Claude
  if (isNsfw && (userTier === 'pro' || userTier === 'unlimited')) {
    if (RUNPOD_VLLM_BASE) {
      try {
        const content = await callRunPodVLLM({
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
          temperature: options.temperature ?? 0.9,
          maxTokens: options.maxTokens ?? 1024,
        });
        return { content, provider: 'runpod-vllm' };
      } catch (err) {
        logger.warn('[llm] RunPod NSFW failed, trying Together AI', { err: String(err).slice(0, 100) });
      }
    }
    // Fallback to Together AI (mild NSFW tolerance)
    if (TOGETHER_API_KEY) {
      try {
        const content = await callTogetherAI({
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
          temperature: options.temperature ?? 0.9,
          maxTokens: options.maxTokens ?? 1024,
        });
        return { content, provider: 'together-nsfw-fallback' };
      } catch (err) {
        logger.warn('[llm] Together NSFW fallback failed', { err: String(err).slice(0, 100) });
      }
    }
  }

  // SFW route: Together AI (free users) → Coze (pro) → Claude → Llama
  if (TOGETHER_API_KEY && userTier === 'free') {
    try {
      const content = await callTogetherAI({
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        temperature: options.temperature ?? 0.85,
        maxTokens: options.maxTokens ?? 512,
        model: TOGETHER_FAST_MODEL,
      });
      return { content, provider: 'together-fast' };
    } catch (err) {
      logger.warn('[llm] Together fast failed, trying Coze', { err: String(err).slice(0, 100) });
    }
  }

  if (TOGETHER_API_KEY && userTier !== 'free') {
    try {
      const content = await callTogetherAI({
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        temperature: options.temperature ?? 0.85,
        maxTokens: options.maxTokens ?? 1024,
        model: TOGETHER_SFW_MODEL,
      });
      return { content, provider: 'together-pro' };
    } catch (err) {
      logger.warn('[llm] Together pro failed, trying Coze', { err: String(err).slice(0, 100) });
    }
  }

  // Final fallback: existing chain (Coze → Claude → Llama)
  const result = await generateTextWithFallback({
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    taskType: options.taskType as 'chat' | 'emotion_detection' | 'metadata' | 'image_prompt' | undefined,
  });
  return { content: result.content, provider: result.provider };
}

/**
 * Resolve streaming provider config based on NSFW + tier.
 * All providers use OpenAI-compatible /chat/completions with stream:true.
 */
export function resolveStreamProvider(options: {
  isNsfw?: boolean;
  userTier?: 'free' | 'pro' | 'unlimited';
}): { baseUrl: string; apiKey: string; model: string; provider: string } {
  const { isNsfw = false, userTier = 'free' } = options;

  // NSFW route: RunPod vLLM (fully uncensored)
  if (isNsfw && (userTier === 'pro' || userTier === 'unlimited') && RUNPOD_VLLM_BASE) {
    return {
      baseUrl: RUNPOD_VLLM_BASE,
      apiKey: RUNPOD_VLLM_KEY,
      model: RUNPOD_NSFW_MODEL,
      provider: 'runpod-vllm',
    };
  }

  // SFW route: Together AI for free/pro users
  if (TOGETHER_API_KEY) {
    if (userTier === 'free') {
      return {
        baseUrl: TOGETHER_API_BASE,
        apiKey: TOGETHER_API_KEY,
        model: TOGETHER_FAST_MODEL,
        provider: 'together-fast',
      };
    }
    return {
      baseUrl: TOGETHER_API_BASE,
      apiKey: TOGETHER_API_KEY,
      model: TOGETHER_SFW_MODEL,
      provider: 'together-pro',
    };
  }

  // Fallback: Coze (Doubao)
  return {
    baseUrl: API_BASE,
    apiKey: '', // Will be resolved at call time via getCozeAccessToken()
    model: userTier === 'free' ? 'doubao-seed-2-0-lite-260215' : DEFAULT_MODEL,
    provider: 'coze',
  };
}

/**
 * NSFW-aware streaming text generation.
 * Returns a fetch Response with SSE stream from the optimal provider.
 *
 * Usage in chat/stream/route.ts:
 *   const llmResponse = await streamTextSmart({ messages: llmMessages, isNsfw, userTier });
 *   // Then read llmResponse.body as SSE stream
 */
export async function streamTextSmart(options: {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  isNsfw?: boolean;
  userTier?: 'free' | 'pro' | 'unlimited';
}): Promise<{ response: Response; provider: string; model: string }> {
  const { messages, temperature = 0.85, maxTokens = 2048 } = options;
  const config = resolveStreamProvider(options);

  // Resolve API key for Coze (async token fetch)
  let apiKey = config.apiKey;
  if (config.provider === 'coze' && !apiKey) {
    apiKey = await getCozeAccessToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`[${config.provider}] Stream error (${res.status}): ${errText.slice(0, 200)}`);
  }

  return { response: res, provider: config.provider, model: config.model };
}
