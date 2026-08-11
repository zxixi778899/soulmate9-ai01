﻿import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';

/**
 * 开场白生成�?- LLM 驱动的个性化问候生�? *
 * 支持�? * - 基于伴侣档案的个性化生成
 * - 亲密值感知（1-5级，影响语气�? * - 可选引用最近的共享回忆
 * - Fallback 链（LLM �?规则 �?模板�? */

export interface GreetingGenRequest {
  name: string;
  age?: number;
  gender?: 'Male' | 'Female';
  personality?: string;
  occupation?: string;
  hobbies?: string[];
  appearance?: {
    race?: string;
    hair?: string;
    hair_color?: string;
    eyes?: string;
    body?: string;
    style?: string;
  };
  backstory?: string;
  intimacy_level?: number; // 1-5
  last_milestone?: string; // 可选：最近的共享回忆文本
  locale?: 'zh' | 'en';
}

export interface GeneratedGreeting {
  text_zh: string;
  text_en: string;
  source: 'llm' | 'vibe' | 'rule' | 'fallback';
  generated_at: string;
}

/**
 * 获取亲密值对应的语气描述
 */
function getIntimacyTone(level: number): { zh: string; en: string } {
  if (level <= 2) {
    return {
      zh: '矜持、保留、带有距离感',
      en: 'reserved, keeping distance, somewhat formal',
    };
  }
  if (level <= 3) {
    return {
      zh: '亲密、自然、友好互动',
      en: 'friendly, natural, warm interaction',
    };
  }
  if (level <= 4) {
    return {
      zh: '非常亲密、充满感情、撒娇',
      en: 'very intimate, affectionate, playful',
    };
  }
  return {
    zh: '极度亲密、直接、充满爱意',
    en: 'deeply intimate, direct, full of love',
  };
}

/**
 * 构建外观描述文本
 */
function buildAppearanceDesc(
  appearance?: GreetingGenRequest['appearance']
): { zh: string; en: string } {
  if (!appearance) return { zh: '', en: '' };

  const partsDe = [
    appearance.hair_color && appearance.hair
      ? `${appearance.hair_color} ${appearance.hair}`
      : '',
    appearance.eyes ? `${appearance.eyes} eyes` : '',
    appearance.body ? `${appearance.body} build` : '',
    appearance.style ? `${appearance.style} style` : '',
  ].filter(Boolean);

  const partsZh = [
    appearance.hair_color && appearance.hair
      ? `${appearance.hair_color}�?{appearance.hair}`
      : '',
    appearance.eyes ? `${appearance.eyes}眼睛` : '',
    appearance.body ? `${appearance.body}身材` : '',
    appearance.style ? `${appearance.style}风格` : '',
  ].filter(Boolean);

  return {
    en: partsDe.join(', '),
    zh: partsZh.join('、'),
  };
}

/**
 * LLM 生成个性化开场白
 *
 * 使用伴侣的完整档案生成符合角色特征的对白
 */
export async function generateGreetingLLM(
  req: GreetingGenRequest
): Promise<GeneratedGreeting | null> {
  try {
    const intimacyTone = getIntimacyTone(req.intimacy_level || 1);
    const appearanceDesc = buildAppearanceDesc(req.appearance);
    const hobbiesStr = (req.hobbies || []).join(', ');
    const lastMilestoneHint = req.last_milestone
      ? `\nRecent shared memory: ${req.last_milestone}`
      : '';

    const prompt = `You are a character development specialist. Generate a personalized opening line (greeting) for a companion character based on their profile.

Character Profile:
- Name: ${req.name}
- Age: ${req.age || '?'}
- Gender: ${req.gender || 'Female'}
- Personality: ${req.personality || 'warm'}
- Occupation: ${req.occupation || 'unknown'}
- Hobbies: ${hobbiesStr || 'various'}
- Appearance: ${appearanceDesc.en || 'not specified'}
- Backstory: ${req.backstory || 'not specified'}
- Intimacy Level: ${req.intimacy_level || 1}/5 (${intimacyTone.en})${lastMilestoneHint}

Generate opening lines (one Chinese, one English) that:
1. Feel natural and conversational (NOT scripted or robotic)
2. Reflect the character's personality, occupation, and interests
3. Match the intimacy level tone (${intimacyTone.en})
4. Are about 1-2 sentences each
5. Include personal touches when relevant

Return ONLY valid JSON (no markdown, no code blocks):
{"text_zh":"Chinese greeting (1-2 sentences)","text_en":"English greeting (1-2 sentences)"}`;

    const result = await generateText({
      prompt,
      maxTokens: 300,
      temperature: 0.7,

    });

    const parsed = JSON.parse(result);
    if (parsed.text_zh && parsed.text_en) {
      return {
        text_zh: String(parsed.text_zh).trim(),
        text_en: String(parsed.text_en).trim(),
        source: 'llm',
        generated_at: new Date().toISOString(),
      };
    }
  } catch (err) {
    logger.warn('greeting LLM generation failed', {
      err: err instanceof Error ? err.message : String(err),
      name: req.name,
    });
  }
  return null;
}

/**
 * 构建诊断信息（用于日志记录）
 */
export function buildGreetingDiagnostics(req: GreetingGenRequest): string {
  return `[Greeting] name=${req.name}, intimacy=${req.intimacy_level || 1}, personality=${req.personality || '?'}, has_milestone=${!!req.last_milestone}`;
}
