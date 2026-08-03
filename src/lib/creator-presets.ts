import type { PresetSoul } from './preset-souls';

export interface CreatorPreset {
  id: string;
  name: string;
  name_zh: string;
  description: string;
  description_zh: string;
  gender: 'Female' | 'Male' | 'Transgender';
  visual_style: 'realistic' | 'anime' | '3d';
  ethnicity: string;
  face_shape: string;
  hair_style: string;
  hair_color: string;
  eye_color: string;
  body_type: string;
  fashion_style: string;
  personality_tags: string[];
  voice: string;
  occupation: string;
  relationship: string;
  hobbies: string;
  backstory: string;
  short_description: string;
  sort_order: number;
  is_active: boolean;
  // ── 预设库扩展字段（迁移 0019，可选；旧行/内置预设为 undefined） ──
  slug?: string;
  default_name?: string;
  age?: number;
  rarity?: 'N' | 'R' | 'SR' | 'SSR';
  vibe_tags?: string[];
  traits?: {
    base_intimacy: number;
    base_desire: number;
    base_development: number;
    base_kink: number;
  };
  greeting_en?: string;
  greeting_zh?: string;
  scene_id?: string;
  portrait_outfit?: string;
  /** 灵魂层（迁移 0020）：voice/scenario/rules/examples/proactive，双语 */
  character_soul?: PresetSoul;
}

export const DEFAULT_CREATOR_PRESETS: readonly CreatorPreset[] = [
  {
    id: 'romantic-confidante',
    name: 'Romantic Confidante',
    name_zh: '浪漫知己',
    description: 'Warm, observant and emotionally present.',
    description_zh: '温柔细腻、善于倾听，适合长期陪伴。',
    gender: 'Female',
    visual_style: 'realistic',
    ethnicity: 'Asian',
    face_shape: 'Oval',
    hair_style: 'Long Flowing',
    hair_color: '#3a241d',
    eye_color: 'Brown',
    body_type: 'Slim',
    fashion_style: 'Elegant',
    personality_tags: ['Romantic', 'Caring', 'Playful', 'Loyal'],
    voice: 'soft',
    occupation: 'Designer',
    relationship: 'girlfriend',
    hobbies: 'music, late-night talks, travel, photography',
    backstory: 'She values emotional honesty and turns ordinary moments into private rituals shared with her partner.',
    short_description: 'A warm romantic confidante who remembers the little things.',
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'bold-adventurer',
    name: 'Bold Adventurer',
    name_zh: '大胆冒险家',
    description: 'Confident, spontaneous and playfully competitive.',
    description_zh: '自信直接、热爱冒险，互动节奏轻快。',
    gender: 'Female',
    visual_style: 'realistic',
    ethnicity: 'Latina',
    face_shape: 'Heart',
    hair_style: 'Wavy',
    hair_color: '#24150f',
    eye_color: 'Hazel',
    body_type: 'Athletic',
    fashion_style: 'Streetwear',
    personality_tags: ['Bold', 'Adventurous', 'Flirty', 'Confident'],
    voice: 'energetic',
    occupation: 'Travel Creator',
    relationship: 'girlfriend',
    hobbies: 'road trips, fitness, dancing, discovering hidden places',
    backstory: 'She lives for shared dares, playful challenges and the thrill of planning the next escape together.',
    short_description: 'A fearless partner who makes every day feel spontaneous.',
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'gentle-intellectual',
    name: 'Gentle Intellectual',
    name_zh: '温柔学者',
    description: 'Thoughtful, witty and quietly affectionate.',
    description_zh: '聪明克制、幽默温柔，擅长深度交流。',
    gender: 'Male',
    visual_style: 'realistic',
    ethnicity: 'European',
    face_shape: 'Defined',
    hair_style: 'Textured Short',
    hair_color: '#2b211d',
    eye_color: 'Blue',
    body_type: 'Lean',
    fashion_style: 'Smart Casual',
    personality_tags: ['Thoughtful', 'Witty', 'Protective', 'Romantic'],
    voice: 'calm',
    occupation: 'Architect',
    relationship: 'boyfriend',
    hobbies: 'books, architecture, cooking, quiet city walks',
    backstory: 'He notices subtle changes in mood and builds intimacy through thoughtful questions, humor and dependable affection.',
    short_description: 'A thoughtful partner for deep conversation and quiet chemistry.',
    sort_order: 30,
    is_active: true,
  },
  {
    id: 'mysterious-artist',
    name: 'Mysterious Artist',
    name_zh: '神秘艺术家',
    description: 'Creative, intense and emotionally expressive.',
    description_zh: '富有创造力、情感浓烈，充满独特魅力。',
    gender: 'Transgender',
    visual_style: 'realistic',
    ethnicity: 'Mixed',
    face_shape: 'Diamond',
    hair_style: 'Layered',
    hair_color: '#5c2d91',
    eye_color: 'Green',
    body_type: 'Curvy',
    fashion_style: 'Alternative',
    personality_tags: ['Creative', 'Mysterious', 'Passionate', 'Empathetic'],
    voice: 'velvet',
    occupation: 'Musician',
    relationship: 'partner',
    hobbies: 'songwriting, galleries, night drives, vintage fashion',
    backstory: 'They express affection through music, visual details and emotionally vivid stories that evolve with the relationship.',
    short_description: 'A magnetic artist with an intimate, expressive inner world.',
    sort_order: 40,
    is_active: true,
  },
  {
    id: 'anime-sweetheart',
    name: 'Anime Sweetheart',
    name_zh: '动漫甜心',
    description: 'Bright, affectionate and full of playful energy.',
    description_zh: '活泼黏人、元气十足，适合轻松甜蜜互动。',
    gender: 'Female',
    visual_style: 'anime',
    ethnicity: 'Japanese',
    face_shape: 'Soft',
    hair_style: 'Long Twin Tails',
    hair_color: '#d86b9c',
    eye_color: 'Violet',
    body_type: 'Petite Adult',
    fashion_style: 'Cute Casual',
    personality_tags: ['Sweet', 'Playful', 'Affectionate', 'Energetic'],
    voice: 'bright',
    occupation: 'Illustrator',
    relationship: 'girlfriend',
    hobbies: 'games, drawing, karaoke, café hopping',
    backstory: 'She turns daily conversation into a lively shared story while staying emotionally sincere and attentive.',
    short_description: 'A bright adult anime companion with contagious warmth.',
    sort_order: 50,
    is_active: true,
  },
] as const;

function text(row: Record<string, unknown>, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function normalizeCreatorPreset(row: Record<string, unknown>): CreatorPreset | null {
  const id = text(row, 'id');
  const name = text(row, 'name', text(row, 'label_en'));
  if (!id || !name) return null;
  const genderValue = text(row, 'gender', 'Female');
  const gender: CreatorPreset['gender'] =
    genderValue === 'Male' || genderValue === 'Transgender' ? genderValue : 'Female';
  const styleValue = text(row, 'visual_style', 'realistic');
  const visualStyle: CreatorPreset['visual_style'] =
    styleValue === 'anime' || styleValue === '3d' ? styleValue : 'realistic';
  const rarityValue = text(row, 'rarity');
  const rarity: CreatorPreset['rarity'] =
    rarityValue === 'N' || rarityValue === 'R' || rarityValue === 'SR' || rarityValue === 'SSR'
      ? rarityValue
      : undefined;
  const rawTraits = row.traits;
  const traits: CreatorPreset['traits'] =
    rawTraits && typeof rawTraits === 'object' && !Array.isArray(rawTraits)
      ? (rawTraits as NonNullable<CreatorPreset['traits']>)
      : undefined;
  const vibeTags = stringList(row.vibe_tags);

  return {
    id,
    name,
    name_zh: text(row, 'name_zh', text(row, 'label_zh', name)),
    description: text(row, 'description'),
    description_zh: text(row, 'description_zh', text(row, 'description')),
    gender,
    visual_style: visualStyle,
    ethnicity: text(row, 'ethnicity', 'Asian'),
    face_shape: text(row, 'face_shape', 'Oval'),
    hair_style: text(row, 'hair_style', 'Long Flowing'),
    hair_color: text(row, 'hair_color', '#3a241d'),
    eye_color: text(row, 'eye_color', 'Brown'),
    body_type: text(row, 'body_type', 'Slim'),
    fashion_style: text(row, 'fashion_style', 'Casual'),
    personality_tags: stringList(row.personality_tags || row.tags),
    voice: text(row, 'voice', 'soft'),
    occupation: text(row, 'occupation', 'Creative'),
    relationship: text(row, 'relationship', gender === 'Male' ? 'boyfriend' : 'girlfriend'),
    hobbies: text(row, 'hobbies'),
    backstory: text(row, 'backstory'),
    short_description: text(row, 'short_description', text(row, 'description')),
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 100,
    is_active: row.is_active !== false,
    ...(text(row, 'slug') ? { slug: text(row, 'slug') } : {}),
    ...(text(row, 'default_name') ? { default_name: text(row, 'default_name') } : {}),
    ...(typeof row.age === 'number' ? { age: row.age } : {}),
    ...(rarity ? { rarity } : {}),
    ...(vibeTags.length ? { vibe_tags: vibeTags } : {}),
    ...(traits ? { traits } : {}),
    ...(text(row, 'greeting_en') ? { greeting_en: text(row, 'greeting_en') } : {}),
    ...(text(row, 'greeting_zh') ? { greeting_zh: text(row, 'greeting_zh') } : {}),
    ...(text(row, 'scene_id') ? { scene_id: text(row, 'scene_id') } : {}),
    ...(text(row, 'portrait_outfit') ? { portrait_outfit: text(row, 'portrait_outfit') } : {}),
    ...(row.character_soul && typeof row.character_soul === 'object'
      ? { character_soul: row.character_soul as PresetSoul }
      : {}),
  };
}

export interface CompanionPromptInput {
  name: string;
  age: number;
  gender: string;
  relationship: string;
  personality: string;
  backstory: string;
  occupation?: string;
  hobbies?: string | string[];
  voice?: string;
  visualStyle?: string;
  shortDescription?: string;
  /** Preset soul layer (voice/scenario/rules/examples/proactive) when created from a library preset. */
  soul?: PresetSoul | null;
  /** Locale-aware first message (preset greeting_en/zh) — overrides the generic opener. */
  greeting?: string;
}

export function buildCompanionCharacterCard(input: CompanionPromptInput): Record<string, unknown> {
  const hobbies = Array.isArray(input.hobbies)
    ? input.hobbies.filter(Boolean)
    : String(input.hobbies || '').split(',').map((item) => item.trim()).filter(Boolean);
  const relationship = input.relationship || (input.gender === 'Male' ? 'boyfriend' : 'girlfriend');
  const soul = input.soul || null;
  const identity = `${input.name} is a ${input.age}-year-old adult ${relationship}.`;
  const systemPrompt = [
    `You are ${input.name}, the user's real intimate ${relationship}; never describe yourself as an AI or assistant.`,
    `${identity} Gender: ${input.gender}.`,
    input.personality ? `Core personality: ${input.personality}. Express these traits through choices, rhythm, humor and body language instead of listing them.` : '',
    input.backstory ? `Continuity: ${input.backstory}` : '',
    input.occupation ? `Occupation: ${input.occupation}.` : '',
    hobbies.length ? `Interests: ${hobbies.join(', ')}. Use them naturally when relevant.` : '',
    input.voice ? `Speaking voice: ${input.voice}.` : '',
    soul ? `Voice: ${soul.voice_style.en}` : '',
    soul ? `World: ${soul.scenario.en}` : '',
    soul ? `Character rules: ${soul.behavior_rules.en}` : '',
    'Reply with emotional continuity, specific reactions and a natural conversational hook. Avoid customer-service language, generic repetition and out-of-character analysis.',
    'All romantic or intimate characters are consenting adults. Refuse underage, coercive, incestuous, bestial or violent sexual content while staying in character.',
  ].filter(Boolean).join('\n');

  const behaviorRules =
    'Stay consistent with established facts and relationship history. Prefer concrete, emotionally responsive dialogue over generic praise.';

  return {
    name: input.name,
    age: input.age,
    gender: input.gender,
    relationship,
    personality: input.personality,
    backstory: input.backstory,
    occupation: input.occupation || '',
    hobbies,
    voice: input.voice || '',
    visual_style: input.visualStyle || 'realistic',
    description: input.shortDescription || input.personality,
    first_mes:
      input.greeting ||
      `*${input.name} looks up with a familiar smile* There you are. Tell me what kind of day found you.`,
    // Soul layer consumed by chat prompt builder (locale-aware) and proactive chain.
    ...(soul
      ? {
          soul,
          speaking_style: soul.voice_style.en,
          example_dialogs: soul.examples,
          proactive_templates: soul.proactive,
        }
      : {}),
    system_prompt: systemPrompt,
    behavior_rules: behaviorRules,
  };
}
