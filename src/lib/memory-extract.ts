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
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m: any) => m && typeof m.content === 'string' && m.content.length > 4)
      .map((m: any) => ({
        content: String(m.content).slice(0, 500),
        type: VALID_TYPES.has(m.type) ? m.type : 'fact',
        category: VALID_CATEGORIES.has(m.category) ? m.category : 'daily',
      })) as ExtractedMemory[];
  } catch {
    return [];
  }
}

const VALID_TYPES = new Set(['interest', 'event', 'fact', 'emotion', 'preference', 'intent', 'physical', 'social']);
const VALID_CATEGORIES = new Set(['interest', 'daily', 'career', 'social', 'emotional', 'future', 'health', 'work', 'family']);