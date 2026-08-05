import { generateText } from '@/lib/llm-service';

/**
 * Proactive outreach messages must read like the companion herself typed them:
 * language follows the conversation, tone scales with intimacy, and the
 * personality / persona / relationship flavor the chat prompt uses.
 */

function intimacyGuide(level: number, zh: boolean): string {
  const zhGuides = [
    '',
    '培养期：刚认识不久，语气温柔有分寸，轻轻问候，别太粘人，不开亲密玩笑。',
    '暧昧期：有点黏人、有点撩，会试探他在不在忙、想不想你，点到为止。',
    '热恋期：关系已经很亲密，直接表达想念和依恋，称呼亲昵自然。',
    '极品女友：深爱中，撒娇、占有欲、直白表达爱意，不扭捏。',
    '极品母狗：完全属于他，粘人直白，想念和情绪都不掩饰。',
  ];
  const enGuides = [
    '',
    'Cultivation: you barely know each other — warm, polite, light check-in; not clingy, no intimate jokes.',
    'Flirting: a little clingy, a little teasing; test whether he misses you, hint but never push.',
    'Passionate: already intimate — say you miss him directly, natural pet names, open affection.',
    'Ultimate Partner: deeply in love — playful possessiveness, direct affection, no coyness.',
    'Ultimate Devotion: completely his — clingy, candid, zero filter on how much you want him.',
  ];
  const list = zh ? zhGuides : enGuides;
  return list[Math.max(1, Math.min(5, level))] || list[1];
}

/** Does the generated text actually match the required language? */
function localeMatch(text: string, zh: boolean): boolean {
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (zh) return han >= 4 && latin <= Math.max(2, Math.floor(han * 0.3));
  return han === 0 && latin >= 6;
}

/** Locale-safe last resort when both LLM output and character fallback fail. */
const GENERIC_FALLBACK = {
  zh: [
    '在忙吗？突然有点想你了…',
    '今天过得怎么样？跟我说说嘛。',
    '刚看到个好玩的事，第一个想讲给你听。',
  ],
  en: [
    'Hey you… I was just thinking about you.',
    'How is your day going? Tell me something.',
    'Something funny just happened and you are the first person I wanted to tell.',
  ],
};

function cleanOutput(raw: string): string {
  return String(raw || '')
    .replace(/^['"“”`]+|['"“”`]+$/g, '')
    .replace(/^(proactive message|message|her|她)[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateContextualProactiveMessage(input: {
  name: string;
  personality?: string;
  intimacyLevel: number;
  locale: string;
  history: Array<{ role: string; content: string }>;
  fallback: string;
  /** Character-specific speaking voice (preset soul) — overrides generic tone */
  voiceStyle?: string;
  /** Character-specific setting/scenario (preset soul) */
  scenario?: string;
}): Promise<string> {
  const zh = String(input.locale || '').toLowerCase().startsWith('zh');
  const pool = GENERIC_FALLBACK[zh ? 'zh' : 'en'];
  const fallbackSafe =
    input.fallback && localeMatch(input.fallback, zh)
      ? input.fallback
      : pool[Math.abs(input.name.length + input.intimacyLevel) % pool.length];

  if (!input.history || input.history.length === 0) return fallbackSafe;

  const history = input.history
    .slice(-8)
    .map((item) => `${item.role === 'user' ? (zh ? '他' : 'him') : (zh ? '她' : 'her')}: ${item.content}`)
    .join('\n');
  const guide = intimacyGuide(input.intimacyLevel, zh);
  const personality = String(input.personality || '').trim();

  const systemPrompt = zh
    ? `你是${input.name}本人，正在主动给在乎的他发一条聊天消息。` +
      '必须全程使用简体中文，禁止英文句子。像真人女生随手发微信一样自然口语，' +
      '完全贴合你的性格、人设和当前关系阶段。只输出消息本身。'
    : `You ARE ${input.name}, texting the man you care about first. ` +
      'Reply in natural English only (zero Chinese characters). Sound like a real woman casually texting — ' +
      'fully in character for your personality, persona and current relationship stage. Output only the message.';

  const prompt = zh
    ? `她的性格：${personality || '温柔、有点粘人'}` +
      (input.voiceStyle ? `\n她的说话方式：${input.voiceStyle}` : '') +
      (input.scenario ? `\n她的背景设定：${input.scenario}` : '') +
      `\n亲密等级：${input.intimacyLevel}/5 —— ${guide}` +
      `\n最近聊天记录（只作语境参考，禁止复述其中原话）：\n${history}` +
      '\n\n现在她主动发一条消息给他。要求：' +
      '\n1) 简体中文，禁止英文；' +
      '\n2) 符合她的性格与说话方式，不要千人一面的客套话；' +
      '\n3) 语气贴合上面的亲密等级与关系阶段；' +
      '\n4) 最多自然地带出一个聊天记录里提过的细节；' +
      '\n5) 6-40个字，不要标题、引号、解释、表情刷屏。'
    : `Her personality: ${personality || 'warm, a little clingy'}` +
      (input.voiceStyle ? `\nHer voice: ${input.voiceStyle}` : '') +
      (input.scenario ? `\nHer setting: ${input.scenario}` : '') +
      `\nIntimacy: ${input.intimacyLevel}/5 — ${guide}` +
      `\nRecent chat history (context only, never quote it):\n${history}` +
      '\n\nNow she texts him first. Requirements:' +
      '\n1) English only, zero Chinese characters;' +
      '\n2) true to her personality and voice — no generic filler;' +
      '\n3) tone matches the intimacy level and relationship stage above;' +
      '\n4) at most one remembered detail from the history, woven in naturally;' +
      '\n5) 8-35 words, no heading, no quotes, no explanation.';

  const lockSuffix = zh
    ? '\n\n[语言锁] 再次强调：这条消息必须是纯简体中文，出现任何英文单词都算失败。'
    : '\n\n[LANGUAGE LOCK] Reminder: English only. Any Chinese character means failure.';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = cleanOutput(
        await generateText({
          systemPrompt,
          prompt: attempt === 0 ? prompt : prompt + lockSuffix,
          temperature: 0.9,
          maxTokens: 140,
        }),
      );
      const lengthOk = zh
        ? content.length >= 4 && content.length <= 120
        : content.length >= 8 && content.length <= 240;
      if (lengthOk && localeMatch(content, zh)) return content;
    } catch {
      // try again, then fall through to the locale-safe fallback
    }
  }
  return fallbackSafe;
}

export function dailyProactiveTarget(seed: string): 1 | 2 {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return Math.abs(hash) % 2 === 0 ? 1 : 2;
}
