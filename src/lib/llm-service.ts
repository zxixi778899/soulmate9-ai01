import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from './analytics';
import { getCozeAccessToken } from '@/lib/coze-auth';

/**
 * LLM Service - dual-route with fallback chain
 *
 * Primary: Coze API (Doubao models)
 * Fallback: Claude 3.5 Haiku (Anthropic direct) -> Local Llama 3.1 8B (Ollama)
 */

const API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL || process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn';
const DEFAULT_MODEL = 'doubao-seed-2-0-pro-260215';

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

export async function generateStructured<T>(options: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
}): Promise<T> {
  const systemPrompt = options.systemPrompt
    ? `${options.systemPrompt}\n\nAlways respond with valid JSON only, no markdown.`
    : 'Always respond with valid JSON only, no markdown.';
  const text = await generateText({ ...options, systemPrompt });
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 200)}`);
  }
}
