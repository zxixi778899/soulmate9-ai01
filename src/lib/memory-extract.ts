/**
 * Memory extraction — uses LLM with structured output.
 * Replaces weak regex extraction in chat/stream/route.ts.
 */

import { generateText } from '@/lib/llm-service';

export interface ExtractedMemory {
  content: string;
  type: 'interest' | 'event' | 'fact' | 'emotion' | 'preference' | 'intent' | 'physical' | 'social';
  category: 'interest' | 'daily' | 'career' | 'social' | 'emotional' | 'future' | 'health' | 'work' | 'family';
}

const EXTRACT_PROMPT = `Extract memorable facts, preferences, and context from this chat between an AI girlfriend and her user.

Return ONLY a JSON array. Each item: { "content": "<one sentence>", "type": "<type>", "category": "<category>" }.

Types: interest, event, fact, emotion, preference, intent, physical, social
Categories: interest, daily, career, social, emotional, future, health, work, family

Only extract things that:
- Are about the user (their job, hobbies, family, preferences, plans, health)
- Would be useful to remember in future conversations
- Are stated as facts, not transient chat

Return [] if nothing memorable.

Messages:
"""%s"""`;

const BATCH_SIZE = 6; // last N messages

export async function extractMemoriesLLM(
  messages: { role: string; content: string }[],
): Promise<ExtractedMemory[]> {
  if (messages.length === 0) return [];
  const last = messages.slice(-BATCH_SIZE);
  const flat = last.map((m) => `[${m.role}] ${m.content}`).join('\n');
  const prompt = EXTRACT_PROMPT.replace('%s', flat);
  try {
    const text = await generateText({ prompt, temperature: 0.3, maxTokens: 512 });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return extractMemoriesFallback(last.find((m) => m.role === 'user')?.content || '');
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return extractMemoriesFallback(last.find((m) => m.role === 'user')?.content || '');
    const extracted = arr
      .filter((m: any) => m && typeof m.content === 'string' && m.content.length > 4)
      .map((m: any) => ({
        content: String(m.content).slice(0, 500),
        type: VALID_TYPES.has(m.type) ? m.type : 'fact',
        category: VALID_CATEGORIES.has(m.category) ? m.category : 'daily',
      })) as ExtractedMemory[];
    return extracted.length
      ? extracted
      : extractMemoriesFallback(last.find((m) => m.role === 'user')?.content || '');
  } catch {
    return extractMemoriesFallback(last.find((m) => m.role === 'user')?.content || '');
  }
}

const VALID_TYPES = new Set(['interest', 'event', 'fact', 'emotion', 'preference', 'intent', 'physical', 'social']);
const VALID_CATEGORIES = new Set(['interest', 'daily', 'career', 'social', 'emotional', 'future', 'health', 'work', 'family']);

/** Deterministic fallback so memory works even when the extractor LLM is unavailable. */
export function extractMemoriesFallback(message: string): ExtractedMemory[] {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (text.length < 4 || text.length > 500) return [];
  const rules: Array<{ re: RegExp; type: ExtractedMemory['type']; category: ExtractedMemory['category'] }> = [
    { re: /(?:我叫|我的名字是|call me|my name is)\s*[^，。,.!?]{1,40}/i, type: 'fact', category: 'social' },
    { re: /(?:我喜欢|我爱|我最喜欢|i like|i love|my favorite)\s*[^。.!?]{1,100}/i, type: 'preference', category: 'interest' },
    { re: /(?:我不喜欢|我讨厌|i dislike|i hate)\s*[^。.!?]{1,100}/i, type: 'preference', category: 'interest' },
    { re: /(?:我在|我是|我的工作是|i work as|my job is|i am a)\s*[^，。,.!?]{2,80}/i, type: 'fact', category: 'work' },
    { re: /(?:我要|我计划|我打算|i plan to|i will|i want to)\s*[^。.!?]{2,120}/i, type: 'intent', category: 'future' },
    { re: /(?:我今天|我昨天|我明天|today i|yesterday i|tomorrow i)\s*[^。.!?]{2,120}/i, type: 'event', category: 'daily' },
  ];
  for (const rule of rules) {
    const content = text.match(rule.re)?.[0]?.trim();
    if (content) return [{ content: content.slice(0, 500), type: rule.type, category: rule.category }];
  }
  return [];
}
