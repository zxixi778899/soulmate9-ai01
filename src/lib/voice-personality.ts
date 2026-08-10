/**
 * Voice Personality — personality-aware voice assignment
 *
 * Instead of hash-based blind assignment, this module maps each companion's
 * personality/backstory to a voice archetype, then assigns a matching voice
 * from curated pools. The result is deterministic: same personality text
 * always produces the same voice.
 *
 * Archetypes:
 *   gentle-warm    — soft, nurturing, warm           (Jenny, Xiaoxiao)
 *   playful-bright — energetic, playful, youthful     (Aria, Xiaoyi)
 *   mysterious     — cool, measured, enigmatic        (Sara, Xiaohan)
 *   elegant-refined — smooth, sophisticated, poised   (Cora, Xiaochen)
 *   tsundere-spicy — sharp, assertive, fiery          (Michelle, Xiaoshuang)
 *   sweet-sunny    — bubbly, cheerful, sweet          (Elizabeth, Xiaomo)
 *   mature-deep    — low, calm, authoritative         (Sonia, Xiaochen-alloy)
 */

import { createHash } from 'crypto';

// ─── Archetype definitions ─────────────────────────────────────────────────────

export interface VoiceArchetype {
  id: string;
  label: string;
  /** Keywords that score toward this archetype (lowercased). */
  keywords: string[];
  /** Edge TTS voices — one per language for deterministic mapping. */
  edge_voices: { en: string; zh: string };
  /** Fish-Speech voice ID (if available). */
  fish_voice_id?: string;
  /** Default pitch offset for this archetype. */
  pitch: number;
  /** Default speed offset for this archetype. */
  speed: number;
  /** Description of the vocal quality. */
  quality: string;
}

export const VOICE_ARCHETYPES: VoiceArchetype[] = [
  {
    id: 'gentle-warm',
    label: 'Gentle & Warm',
    keywords: [
      'gentle', 'warm', 'kind', 'caring', 'nurturing', 'soft', 'sweet',
      'tender', 'compassionate', 'motherly', 'loving', 'affectionate',
      '温柔', '温暖', '善良', '体贴', '关怀', '柔和', '甜蜜',
    ],
    edge_voices: { en: 'en-US-JennyNeural', zh: 'zh-CN-XiaoxiaoNeural' },
    pitch: 1.0,
    speed: 0.9,
    quality: 'Soft, warm, and nurturing — like a gentle embrace',
  },
  {
    id: 'playful-bright',
    label: 'Playful & Bright',
    keywords: [
      'playful', 'bright', 'cheerful', 'energetic', 'bubbly', 'lively',
      'fun', 'youthful', 'spirited', 'vibrant', 'perky', 'bouncy',
      '俏皮', '活泼', '开朗', '阳光', '活力', '欢乐',
    ],
    edge_voices: { en: 'en-US-AriaNeural', zh: 'zh-CN-XiaoyiNeural' },
    pitch: 1.1,
    speed: 1.05,
    quality: 'Energetic and bright — like a burst of sunshine',
  },
  {
    id: 'mysterious',
    label: 'Mysterious & Cool',
    keywords: [
      'mysterious', 'cool', 'calm', 'stoic', 'enigmatic', 'aloo',
      'reserved', 'quiet', 'brooding', 'dark', 'introverted',
      '神秘', '冷酷', '冷静', '沉默', '内向', '孤僻', '高冷',
    ],
    edge_voices: { en: 'en-US-SaraNeural', zh: 'zh-CN-XiaohanNeural' },
    pitch: 0.95,
    speed: 0.9,
    quality: 'Cool and measured — like a quiet night breeze',
  },
  {
    id: 'elegant-refined',
    label: 'Elegant & Refined',
    keywords: [
      'elegant', 'refined', 'graceful', 'poised', 'sophisticated',
      'classy', 'polished', 'cultured', 'dignified', 'regal', 'noble',
      '优雅', '高贵', '精致', '端庄', '典雅', '气质',
    ],
    edge_voices: { en: 'en-US-CoraNeural', zh: 'zh-CN-XiaochenNeural' },
    pitch: 1.0,
    speed: 0.95,
    quality: 'Smooth and sophisticated — like fine silk',
  },
  {
    id: 'tsundere-spicy',
    label: 'Tsundere & Spicy',
    keywords: [
      'tsundere', 'spicy', 'feisty', 'assertive', 'sharp', 'proud',
      'sassy', 'fierce', 'hot-headed', 'stubborn', 'competitive',
      '傲娇', '辣', '泼辣', '强势', '骄傲', '倔强', '好胜',
    ],
    edge_voices: { en: 'en-US-MichelleNeural', zh: 'zh-CN-XiaoshuangNeural' },
    pitch: 1.05,
    speed: 1.05,
    quality: 'Sharp and assertive — with a hint of hidden warmth',
  },
  {
    id: 'sweet-sunny',
    label: 'Sweet & Sunny',
    keywords: [
      'sweet', 'sunny', 'bubbly', 'cheerful', 'happy', 'optimistic',
      'smiley', 'adorable', 'cute', 'innocent', 'naive', 'dreamy',
      '甜美', '可爱', '阳光', '乐观', '天真', '呆萌', '治愈',
    ],
    edge_voices: { en: 'en-US-ElizabethNeural', zh: 'zh-CN-XiaomoNeural' },
    pitch: 1.1,
    speed: 1.0,
    quality: 'Bubbly and adorable — like a warm hug on a sunny day',
  },
  {
    id: 'mature-deep',
    label: 'Mature & Deep',
    keywords: [
      'mature', 'deep', 'wise', 'serene', 'authoritative', 'veteran',
      'experienced', 'sultry', 'smoky', 'low', 'sensual', 'confident',
      '成熟', '深沉', '稳重', '知性', '御姐', '妩媚', '自信',
    ],
    edge_voices: { en: 'en-GB-SoniaNeural', zh: 'zh-TW-HsiaoChenNeural' },
    pitch: 0.9,
    speed: 0.85,
    quality: 'Low and confident — like a warm evening voice',
  },
];

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score a personality/backstory text against all archetypes.
 * Returns a sorted array of [archetype, score] pairs.
 */
export function scoreArchetypes(
  personality: string,
  backstory?: string,
  occupation?: string,
): Array<[VoiceArchetype, number]> {
  const text = [
    personality || '',
    backstory || '',
    occupation || '',
  ]
    .join(' ')
    .toLowerCase();

  // Tokenize into words and bigrams
  const words = text.split(/[^a-z一-鿿]+/).filter(Boolean);

  const scores: Array<[VoiceArchetype, number]> = VOICE_ARCHETYPES.map((arch) => {
    let score = 0;
    for (const kw of arch.keywords) {
      // Exact match in the text
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = text.match(new RegExp(escaped, 'gi'));
      if (matches) {
        score += matches.length * 2;
      }
      // Partial word containment
      for (const w of words) {
        if (w.includes(kw) || kw.includes(w)) {
          score += 0.5;
        }
      }
    }
    return [arch, score] as [VoiceArchetype, number];
  });

  return scores.sort((a, b) => b[1] - a[1]);
}

/**
 * Get the best-matching archetype for a companion.
 * Returns the archetype with highest score, falling back to a hash-based
 * default if no keywords match.
 */
export function getArchetypeForPersonality(
  personality: string,
  backstory?: string,
  occupation?: string,
): VoiceArchetype {
  const scored = scoreArchetypes(personality, backstory, occupation);
  if (scored.length > 0 && scored[0]![1] > 0) {
    return scored[0]![0];
  }

  // Fallback: hash-based selection for companions with no matching keywords
  const combined = [personality || '', backstory || '', occupation || ''].join('|');
  const hash = createHash('md5').update(combined || 'unknown').digest();
  const idx = hash[0]! % VOICE_ARCHETYPES.length;
  return VOICE_ARCHETYPES[idx]!;
}

/**
 * Assign a personality-aware voice profile for a companion.
 * Returns the edge_voice name and archetype metadata.
 */
export function assignVoiceByPersonality(
  companionId: string,
  personality: string,
  language: 'en' | 'zh' | 'auto' = 'auto',
  backstory?: string,
  occupation?: string,
): {
  edge_voice: string;
  archetype: VoiceArchetype;
  fish_voice_id?: string;
  pitch: number;
  speed: number;
} {
  const archetype = getArchetypeForPersonality(personality, backstory, occupation);

  // Determine language
  const lang: 'en' | 'zh' =
    language === 'auto'
      ? guessLanguage(personality, backstory, occupation)
      : language;

  const edge_voice = lang === 'zh' ? archetype.edge_voices.zh : archetype.edge_voices.en;

  return {
    edge_voice,
    archetype,
    fish_voice_id: archetype.fish_voice_id,
    pitch: archetype.pitch,
    speed: archetype.speed,
  };
}

/** Simple language guess: if text contains CJK characters, return 'zh'. */
function guessLanguage(...texts: (string | undefined)[]): 'en' | 'zh' {
  const combined = texts.filter(Boolean).join(' ');
  const cjkCount = (combined.match(/[一-鿿]/g) || []).length;
  return cjkCount > 3 ? 'zh' : 'en';
}

/**
 * Get all available Edge TTS voices for a language with their archetype labels.
 */
export function getArchetypeMap(language: 'en' | 'zh'): Array<{
  edge_voice: string;
  archetype_id: string;
  archetype_label: string;
  quality: string;
}> {
  return VOICE_ARCHETYPES.map((arch) => ({
    edge_voice: language === 'zh' ? arch.edge_voices.zh : arch.edge_voices.en,
    archetype_id: arch.id,
    archetype_label: arch.label,
    quality: arch.quality,
  }));
}