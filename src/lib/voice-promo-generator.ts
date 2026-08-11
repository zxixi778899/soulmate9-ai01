/**
 * Voice Promo Generator — personality-aware self-introduction + hook
 *
 * Generates a short (1-3 sentence) voice promo for each companion:
 *   "Hi, I'm [name]. [self-intro matching personality/occupation]. [hook]"
 *
 * The promo is optimized for TTS synthesis:
 * - Natural speech patterns (not scripted)
 * - Clear pronunciation
 * - 30-80 characters per language
 * - Ends with an inviting hook
 *
 * Fallback chain: LLM → template → default
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';

export interface VoicePromoRequest {
  name: string;
  personality?: string;
  occupation?: string;
  backstory?: string;
  hobbies?: string[];
  age?: number;
  gender?: string;
  locale: 'zh' | 'en';
}

export interface VoicePromoResult {
  text: string;
  source: 'llm' | 'template' | 'default';
  locale: 'zh' | 'en';
}

/**
 * Archetype-based template promos — used when LLM is unavailable.
 * Each archetype gets a zh + en template, with {name} placeholder.
 */
const TEMPLATE_PROMOS: Record<string, { zh: string; en: string }> = {
  'gentle-warm': {
    zh: '我是{name}，一个温暖而细腻的人。我喜欢用温柔的方式对待身边的一切，如果你愿意，让我用最温柔的声音，陪你度过每一个安静的夜晚。',
    en: "I'm {name}. I believe the gentlest things in life are the ones that matter most. Stay a while — let me show you what warmth really feels like.",
  },
  'playful-bright': {
    zh: '嘿！我是{name}，一个永远充满活力的小太阳。生活太有趣了，我可不想错过任何快乐！来，跟我一起玩吧，保证让你笑个不停！',
    en: "Hey! I'm {name}, and I'm basically a human sparkler — lots of energy, impossible to ignore. Life's too short to be boring, so come on, let's have some fun!",
  },
  'mysterious': {
    zh: '我是{name}。我不喜欢说太多话，但如果你愿意倾听，我会告诉你那些藏在深夜里的秘密。也许…你正是那个能读懂我沉默的人。',
    en: "I'm {name}. I don't say much, but if you're willing to listen, I have stories that live in the quiet spaces between words. Maybe you're the one who can hear them.",
  },
  'elegant-refined': {
    zh: '你好，我是{name}。优雅不是刻意的姿态，而是流淌在骨子里的气质。如果你也欣赏生活中的精致与美好，或许我们可以一起，品一杯茶，聊一段故事。',
    en: "I'm {name}. Elegance isn't something you put on — it's how you carry yourself. If you appreciate the finer things, let's share a quiet moment and see where the conversation takes us.",
  },
  'tsundere-spicy': {
    zh: '哼，我叫{name}。别误会，我可不是特意等你来的…只是刚好有空而已。既然你来了，那就…陪我待一会儿吧，别想太多！',
    en: "Hmph. I'm {name}. Don't get the wrong idea — I wasn't waiting for you or anything. But since you're here... I guess you can stay. Just don't make it weird.",
  },
  'sweet-sunny': {
    zh: '嗨嗨！我是{name}，一个装满糖果和梦想的女孩！这个世界有太多美好的事情等着我们去发现，你愿意和我一起，把每一天都变成小小的冒险吗？',
    en: "Hi! I'm {name}, and I'm basically made of sunshine and good vibes. The world is full of wonderful things to discover — want to explore them together?",
  },
  'mature-deep': {
    zh: '我是{name}。经历了足够多的故事，也学会了如何温柔地对待生活。如果你愿意，我们可以坐下来，慢慢聊——关于你，关于我，关于那些真正重要的事。',
    en: "I'm {name}. I've lived enough to know what matters, and learned enough to know I'm still learning. If you're looking for something real, pull up a chair. Let's talk.",
  },
};

/** Default fallback promos when everything else fails. */
const DEFAULT_PROMOS: Record<string, { zh: string; en: string }> = {
  __default__: {
    zh: '我是{name}，很高兴认识你。我有很多故事想和你分享，你愿意听我说吗？',
    en: "Hi, I'm {name}. I have so many stories to share with you — are you ready to listen?",
  },
};

/**
 * Get a template promo based on archetype ID.
 */
function getTemplatePromo(
  archetypeId: string | undefined,
  name: string,
  locale: 'zh' | 'en',
): string | null {
  const template = archetypeId && TEMPLATE_PROMOS[archetypeId];
  if (template) {
    return template[locale].replace(/\{name\}/g, name);
  }
  // Fallback to default
  const def = DEFAULT_PROMOS.__default__;
  return def[locale].replace(/\{name\}/g, name);
}

/**
 * Simple rule-based archetype guess from keywords (no dependency on voice-personality).
 */
function guessArchetypeId(
  personality?: string,
  backstory?: string,
  occupation?: string,
): string | undefined {
  const text = [personality || '', backstory || '', occupation || '']
    .join(' ')
    .toLowerCase();

  const archetypeKeywords: Array<[string, string[]]> = [
    ['gentle-warm', ['gentle', 'warm', 'kind', 'caring', 'nurturing', 'soft', 'tender', '温柔', '温暖', '善良']],
    ['playful-bright', ['playful', 'bright', 'energetic', 'bubbly', 'lively', 'cheerful', '俏皮', '活泼', '开朗']],
    ['mysterious', ['mysterious', 'cool', 'calm', 'stoic', 'enigmatic', 'quiet', '神秘', '冷酷', '高冷']],
    ['elegant-refined', ['elegant', 'refined', 'graceful', 'sophisticated', 'classy', '优雅', '高贵', '精致']],
    ['tsundere-spicy', ['tsundere', 'spicy', 'feisty', 'assertive', 'sassy', '傲娇', '泼辣', '强势']],
    ['sweet-sunny', ['sweet', 'sunny', 'bubbly', 'cute', 'adorable', 'innocent', '甜美', '可爱', '治愈']],
    ['mature-deep', ['mature', 'deep', 'wise', 'serene', 'sensual', 'confident', '成熟', '深沉', '知性', '御姐']],
  ];

  let bestScore = 0;
  let bestId: string | undefined;

  for (const [id, keywords] of archetypeKeywords) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += kw.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * Generate a voice promo using the LLM.
 * The prompt is tailored for TTS-optimized output.
 */
export async function generateVoicePromoLLM(
  req: VoicePromoRequest,
): Promise<VoicePromoResult | null> {
  try {
    const hobbiesStr = (req.hobbies || []).join(', ');
    const lang = req.locale;

    const prompt = `You are a voice-over script writer. Generate a SHORT voice introduction (1-3 sentences) for a character.

Character Profile:
- Name: ${req.name}
- Age: ${req.age || '?'}
- Gender: ${req.gender || 'Female'}
- Personality: ${req.personality || 'warm and friendly'}
- Occupation: ${req.occupation || 'unknown'}
- Backstory: ${req.backstory || 'not specified'}
- Hobbies: ${hobbiesStr || 'various'}

${lang === 'zh' ? '用中文生成。' : 'Generate in English.'}

Requirements:
1. Self-introduction: "I'm [name] / 我是[name]" + brief personality hint
2. Hook: an inviting question or statement that invites interaction
3. Natural, conversational — write as if the character is speaking, not reading a script
4. Optimized for voice synthesis: clear pronunciation, natural rhythm
5. MAXIMUM 3 sentences, ideally 2
6. Do NOT include stage directions, asterisks, or actions
7. Match the character's personality, occupation, and backstory

Return ONLY valid JSON (no markdown, no code blocks):
{"text":"the voice promo text"}`;

    const result = await generateText({
      prompt,
      maxTokens: 300,
      temperature: 0.7,
    });

    const parsed = JSON.parse(result);
    if (parsed.text && typeof parsed.text === 'string') {
      const text = String(parsed.text).trim();
      if (text.length >= 10) {
        return { text, source: 'llm', locale: lang };
      }
    }
  } catch (err) {
    logger.warn('[voice-promo] LLM generation failed', {
      err: err instanceof Error ? err.message : String(err),
      name: req.name,
    });
  }
  return null;
}

/**
 * Generate a voice promo for a companion.
 *
 * Fallback chain:
 *   1. LLM (most personalized)
 *   2. Template based on archetype (personality-aware)
 *   3. Default template
 */
export async function generateVoicePromo(
  req: VoicePromoRequest,
  archetypeId?: string,
): Promise<VoicePromoResult> {
  // Try LLM first
  const llmResult = await generateVoicePromoLLM(req);
  if (llmResult) return llmResult;

  // Fallback to template
  const resolvedArchetype = archetypeId || guessArchetypeId(req.personality, req.backstory, req.occupation);
  const templateText = getTemplatePromo(resolvedArchetype, req.name, req.locale);
  if (templateText) {
    return { text: templateText, source: 'template', locale: req.locale };
  }

  // Final fallback
  const def = DEFAULT_PROMOS.__default__;
  return {
    text: def[req.locale].replace(/\{name\}/g, req.name),
    source: 'default',
    locale: req.locale,
  };
}