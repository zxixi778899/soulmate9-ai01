/**
 * Emotion detection — quick keyword path first, LLM fallback.
 * Saves ~1 LLM call per message (cost + 2-5s latency).
 */

const KEYWORD_MAP: { emotion: string; patterns: RegExp[] }[] = [
  { emotion: 'happy',    patterns: [/哈哈|开心|高兴|棒|喜欢|happy|love|great|awesome|😊|😄|🥰/i] },
  { emotion: 'sad',      patterns: [/难过|伤心|哭|累|sad|hurt|miss|miss you|😢|😭/i] },
  { emotion: 'romantic', patterns: [/想你|爱|亲|抱|浪漫|love you|kiss|hug|💋|❤️/i] },
  { emotion: 'playful',  patterns: [/哈哈|搞怪|好玩|funny|joke|哈哈|haha|😜|🤪/i] },
  { emotion: 'angry',    patterns: [/滚|烦|死|damn|hate|angry|🤬/i] },
  { emotion: 'anxious',  patterns: [/担心|怕|紧张|焦虑|worry|anxious|nervous|😰/i] },
];

const VALID = new Set(['happy', 'sad', 'romantic', 'playful', 'angry', 'neutral', 'anxious']);

export function quickEmotion(message: string): string | null {
  for (const { emotion, patterns } of KEYWORD_MAP) {
    for (const p of patterns) {
      if (p.test(message)) return emotion;
    }
  }
  return null;
}

export function normalizeEmotion(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return VALID.has(lower) ? lower : 'neutral';
}