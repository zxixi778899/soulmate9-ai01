/**
 * Voice emotion presets for TTS.
 *
 * Each preset tunes pitch / speed and carries a natural-language instruction
 * that engines like Fish-Speech / CosyVoice can use for style conditioning.
 */

export const VOICE_EMOTIONS = {
  gentle: { label: '温柔', pitch: 1.0, speed: 0.9, instruction: 'speak gently and warmly' },
  playful: { label: '俏皮', pitch: 1.1, speed: 1.05, instruction: 'speak playfully with a smile' },
  shy: { label: '害羞', pitch: 1.05, speed: 0.85, instruction: 'speak shyly, soft and hesitant' },
  seductive: { label: '诱惑', pitch: 0.95, speed: 0.8, instruction: 'speak in a low seductive whisper' },
  excited: { label: '兴奋', pitch: 1.15, speed: 1.1, instruction: 'speak excitedly with high energy' },
  angry: { label: '生气', pitch: 0.9, speed: 1.1, instruction: 'speak with irritation' },
  sad: { label: '委屈', pitch: 0.95, speed: 0.85, instruction: 'speak sadly, almost crying' },
} as const;

export type VoiceEmotion = keyof typeof VOICE_EMOTIONS;

export function isVoiceEmotion(value: unknown): value is VoiceEmotion {
  return typeof value === 'string' && value in VOICE_EMOTIONS;
}
