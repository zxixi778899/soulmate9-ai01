/**
 * Dynamic Portrait Animation Presets
 *
 * Pre-rendered looping animations (3-5s) stored in Supabase Storage.
 * Generated offline via ComfyUI AnimateDiff workflow on RunPod.
 * At runtime: zero GPU cost — just CDN-served mp4/webm loops.
 *
 * Storage path: portraits/{companion_id}/animations/{animation_id}.mp4
 */

export type AnimationCategory = 'idle' | 'expression' | 'action' | 'seasonal' | 'nsfw';

export interface AnimationPreset {
  id: string;
  label: string;
  category: AnimationCategory;
  /** ComfyUI AnimateDiff prompt template */
  prompt_template: string;
  /** Number of frames (at 8fps → 3s = 24 frames, 5s = 40 frames) */
  frames: number;
  fps: 8;
  /** Motion intensity 1-10 */
  motion_strength: number;
  /** Loop mode */
  loop: 'ping-pong' | 'cycle';
  tags: string[];
  /** Which companion categories this works for */
  categories: ('female' | 'male' | 'transgender' | 'anime')[];
}

export interface CompanionAnimation {
  id: string;
  companion_id: string;
  preset_id: string;
  video_url: string;
  thumbnail_url: string;
  duration_ms: number;
  format: 'mp4' | 'webm';
  status: 'generating' | 'ready' | 'failed';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Default Animation Presets
// ---------------------------------------------------------------------------

export const DEFAULT_ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'breathing_idle',
    label: 'Breathing Idle',
    category: 'idle',
    prompt_template:
      'subtle breathing motion, chest gently rising and falling, soft ambient lighting, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 24,
    fps: 8,
    motion_strength: 2,
    loop: 'cycle',
    tags: ['idle', 'breathing', 'subtle', 'loop'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'blink_smile',
    label: 'Blink & Smile',
    category: 'expression',
    prompt_template:
      'gentle eye blink followed by a slight warm smile, soft facial movement, natural expression change, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 16,
    fps: 8,
    motion_strength: 3,
    loop: 'ping-pong',
    tags: ['expression', 'blink', 'smile', 'face'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'hair_sway',
    label: 'Hair Sway',
    category: 'idle',
    prompt_template:
      'gentle hair movement swaying in a soft breeze, wind blowing through hair strands, subtle body stillness, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 32,
    fps: 8,
    motion_strength: 4,
    loop: 'cycle',
    tags: ['idle', 'hair', 'wind', 'ambient'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'wave_hello',
    label: 'Wave Hello',
    category: 'action',
    prompt_template:
      'friendly hand wave greeting, raising hand and waving hello, cheerful gesture, upper body movement, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 32,
    fps: 8,
    motion_strength: 6,
    loop: 'ping-pong',
    tags: ['action', 'greeting', 'wave', 'hand'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'giggle',
    label: 'Giggle',
    category: 'expression',
    prompt_template:
      'light laughing motion, shoulders shaking gently, head tilting slightly with amusement, joyful expression, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 24,
    fps: 8,
    motion_strength: 5,
    loop: 'ping-pong',
    tags: ['expression', 'laugh', 'giggle', 'reaction'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'look_away_shy',
    label: 'Look Away (Shy)',
    category: 'expression',
    prompt_template:
      'turning head away shyly, slight blush, coy glance to the side, timid body language, gentle head rotation, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 24,
    fps: 8,
    motion_strength: 4,
    loop: 'ping-pong',
    tags: ['expression', 'shy', 'head-turn', 'reaction'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'stretch_morning',
    label: 'Morning Stretch',
    category: 'action',
    prompt_template:
      'stretching arms upward, morning wake-up stretch, arms raised above head, body extending, relaxed sleepy movement, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 40,
    fps: 8,
    motion_strength: 7,
    loop: 'ping-pong',
    tags: ['action', 'stretch', 'morning', 'full-body'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
  {
    id: 'wink_flirt',
    label: 'Wink (Flirt)',
    category: 'expression',
    prompt_template:
      'playful eye wink, finger touching lips, flirty expression, cheeky gesture, subtle head tilt, loopable animation, smooth motion, {name}, {hair_color} hair, {eye_color} eyes',
    frames: 16,
    fps: 8,
    motion_strength: 3,
    loop: 'ping-pong',
    tags: ['expression', 'wink', 'flirt', 'playful'],
    categories: ['female', 'male', 'transgender', 'anime'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all presets applicable to a given companion category.
 * @param category - e.g. 'female', 'male', 'transgender', 'anime'
 */
export function getPresetsForCategory(category: string): AnimationPreset[] {
  return DEFAULT_ANIMATION_PRESETS.filter((p) =>
    p.categories.includes(category as AnimationPreset['categories'][number]),
  );
}

/**
 * Build a concrete AnimateDiff prompt from a preset template + companion attrs.
 * Replaces {name}, {hair_color}, {eye_color} placeholders.
 */
export function buildAnimationPrompt(
  preset: AnimationPreset,
  companion: { name: string; hair_color?: string; eye_color?: string },
): string {
  return preset.prompt_template
    .replace(/\{name\}/g, companion.name || 'beautiful person')
    .replace(/\{hair_color\}/g, companion.hair_color || 'dark')
    .replace(/\{eye_color\}/g, companion.eye_color || 'brown');
}

/**
 * Look up a preset by ID. Returns undefined if not found.
 */
export function getPresetById(id: string): AnimationPreset | undefined {
  return DEFAULT_ANIMATION_PRESETS.find((p) => p.id === id);
}
