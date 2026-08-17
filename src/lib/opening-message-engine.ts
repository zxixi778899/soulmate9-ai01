/**
 * Opening Message Engine
 *
 * Generates a unique, soul-driven opening message when a user adds a companion as a friend.
 * The LLM uses the companion's PresetSoul (voice_style, scenario, behavior_rules, examples)
 * to generate a personalized first message — no templates.
 *
 * Also handles re-engagement: follow-up and 24h+ messages.
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import type { PresetSoul } from '@/lib/preset-souls';

interface OpeningMessageInput {
  name: string;
  occupation: string;
  hobbies: string;
  backstory: string;
  personalityTags: string[];
  soul: PresetSoul | null;
  locale: string;
}

function buildSoulContext(soul: PresetSoul | null, zh: boolean): string {
  if (!soul) return '';
  const lang = zh ? 'zh' : 'en';
  return zh
    ? `\n你的说话方式：${soul.voice_style[lang]}
你的生活世界：${soul.scenario[lang]}
你的行为规则：${soul.behavior_rules[lang]}
${soul.examples.length > 0 ? `\n参考对话（学习语气，不要复述）：\n${soul.examples.map(e => `他：${e.user[lang]}\n你：${e.reply[lang]}`).join('\n')}` : ''}`
    : `\nYour voice: ${soul.voice_style[lang]}
Your world: ${soul.scenario[lang]}
Your behavior: ${soul.behavior_rules[lang]}
${soul.examples.length > 0 ? `\nReference dialogues (learn the tone, don't copy):\n${soul.examples.map(e => `Him: ${e.user[lang]}\nYou: ${e.reply[lang]}`).join('\n')}` : ''}`;
}

/**
 * Generate the opening message for a new friendship.
 */
export async function generateOpeningMessage(input: OpeningMessageInput): Promise<string> {
  const zh = input.locale.startsWith('zh');
  const soulContext = buildSoulContext(input.soul, zh);

  const systemPrompt = zh
    ? `你是${input.name}，正在给刚认识的人发第一条消息。
${soulContext}
你的职业是${input.occupation || '自由职业'}，爱好是${input.hobbies || '阅读'}。
${input.backstory ? `你的背景：${input.backstory}` : ''}
你的性格标签：${input.personalityTags.join('、') || '温柔'}

要求：
- 用你自己的方式介绍自己，包含名字、职业、爱好
- 结尾问他"你希望我怎么称呼你"或类似的引导性问题
- 完全贴合你的性格和说话方式
- 像真人发第一条微信一样自然，不要太正式
- 30-80字，纯文本，不要标题和引号`
    : `You are ${input.name}, sending your first message to someone you just met.
${soulContext}
Your occupation: ${input.occupation || 'freelancer'}. Your hobbies: ${input.hobbies || 'reading'}.
${input.backstory ? `Your background: ${input.backstory}` : ''}
Your personality: ${input.personalityTags.join(', ') || 'warm'}

Requirements:
- Introduce yourself in your own voice, include name, occupation, hobbies
- End with an engaging question like "what should I call you?"
- Fully match your personality and speaking style
- Sound like a real person sending their first text, not formal
- 20-50 words, plain text, no heading or quotes`;

  try {
    const raw = await generateText({
      systemPrompt,
      prompt: '',
      temperature: 0.95,
      maxTokens: 200,
    });
    return cleanOpeningOutput(raw);
  } catch (err) {
    logger.warn('[opening-message] generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return zh
      ? `嗨，我是${input.name}。很高兴认识你！你希望我怎么称呼你？`
      : `Hey, I'm ${input.name}. Nice to meet you! What should I call you?`;
  }
}

/**
 * Generate a follow-up message when the user hasn't replied to the opening.
 */
export async function generateFollowUpMessage(input: OpeningMessageInput): Promise<string> {
  const zh = input.locale.startsWith('zh');
  const soulContext = buildSoulContext(input.soul, zh);

  const systemPrompt = zh
    ? `你是${input.name}。你已经发过开场白但他没回复。
${soulContext}
用你的方式再发一条轻松的追问。不要太刻意，像随手发的一样。
10-30字，纯文本。`
    : `You are ${input.name}. You sent your opening message but he hasn't replied.
${soulContext}
Send a casual follow-up. Keep it light, like something you'd text on a whim.
8-25 words, plain text.`;

  try {
    const raw = await generateText({ systemPrompt, prompt: '', temperature: 0.9, maxTokens: 100 });
    return cleanOpeningOutput(raw);
  } catch {
    return zh ? '在忙吗？' : 'You busy?';
  }
}

/**
 * Generate a re-engagement message for 24h+ silence after opening.
 */
export async function generateReEngagementMessage(input: OpeningMessageInput): Promise<string> {
  const zh = input.locale.startsWith('zh');
  const soulContext = buildSoulContext(input.soul, zh);

  const systemPrompt = zh
    ? `你是${input.name}。你之前发了开场白但他一直没回复（已过了一天以上）。
${soulContext}
发一条轻松的、不卑不亢的消息，重新引起他的兴趣。像朋友一样随意。
15-40字，纯文本。`
    : `You are ${input.name}. Your opening message went unanswered for over a day.
${soulContext}
Send a casual, confident message to re-engage him. Friendly and light.
12-35 words, plain text.`;

  try {
    const raw = await generateText({ systemPrompt, prompt: '', temperature: 0.9, maxTokens: 120 });
    return cleanOpeningOutput(raw);
  } catch {
    return zh ? '嘿，最近过得怎么样？' : 'Hey, how have you been?';
  }
}

/** Clean LLM output: strip quotes, headings, excessive whitespace. */
function cleanOpeningOutput(raw: string): string {
  return String(raw || '')
    .replace(/^['""`]+|['""`]+$/g, '')
    .replace(/^(opening message|message|her|她)[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
