import { generateText } from '@/lib/llm-service';

export async function generateContextualProactiveMessage(input: {
  name: string;
  personality?: string;
  intimacyLevel: number;
  locale: string;
  history: Array<{ role: string; content: string }>;
  fallback: string;
}): Promise<string> {
  if (input.history.length === 0) return input.fallback;
  const language = input.locale === 'zh' ? 'Simplified Chinese' : 'English';
  const history = input.history.slice(-8).map((item) => `${item.role}: ${item.content}`).join('\n');
  try {
    const content = await generateText({
      prompt: `Write one natural proactive chat message from ${input.name}, an adult AI companion. Use ${language}. Intimacy level is ${input.intimacyLevel}/5. Personality: ${input.personality || 'warm'}. Continue naturally from the private conversation history without quoting it. Mention at most one remembered detail. Output only the message, 8-35 words, no heading.\n\nHistory:\n${history}`,
      temperature: 0.85,
      maxTokens: 120,
    });
    const cleaned = content.replace(/^['"“”]|['"“”]$/g, '').replace(/\s+/g, ' ').trim();
    return cleaned.length >= 4 && cleaned.length <= 240 ? cleaned : input.fallback;
  } catch {
    return input.fallback;
  }
}

export function dailyProactiveTarget(seed: string): 1 | 2 {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return Math.abs(hash) % 2 === 0 ? 1 : 2;
}
