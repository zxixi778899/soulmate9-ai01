/**
 * Character Parts Library + Forge Engine — 零件化预设系统
 *
 * Presets are NO LONGER finished characters. Instead we preset a large pool of
 * base "parts" (hairstyle, hair color, bust shape, body type, skin tone, face
 * shape, eye color, height) and COMBINE them on demand to assemble a brand-new
 * persona every time — 千人千面 (a thousand faces for a thousand people).
 *
 * The generated portrait of a forged combination becomes the companion's
 * identity reference (girlfriends.portrait_url); all later album/chat photos
 * consume it through the ip-adapter reference pipeline for consistency.
 *
 * Source of truth lives here (typed fallback); a mirror is seeded into the
 * `character_parts` table (migration 0023) for admin tooling.
 */

import type { PresetVibe } from '@/lib/preset-library';
import { rarityFromTraits } from '@/lib/rarity';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PartCategory =
  | 'hairstyle'
  | 'hair_color'
  | 'breast_shape'
  | 'body_type'
  | 'skin_tone'
  | 'face_shape'
  | 'eye_color'
  | 'height';

export const PART_CATEGORY_ORDER: PartCategory[] = [
  'hairstyle',
  'hair_color',
  'breast_shape',
  'body_type',
  'skin_tone',
  'face_shape',
  'eye_color',
  'height',
];

export const PART_CATEGORY_LABELS: Record<PartCategory, { en: string; zh: string }> = {
  hairstyle: { en: 'Hairstyle', zh: '发型' },
  hair_color: { en: 'Hair Color', zh: '发色' },
  breast_shape: { en: 'Bust Shape', zh: '胸型' },
  body_type: { en: 'Body Type', zh: '体型' },
  skin_tone: { en: 'Skin Tone', zh: '肤色' },
  face_shape: { en: 'Face Shape', zh: '脸型' },
  eye_color: { en: 'Eye Color', zh: '瞳色' },
  height: { en: 'Height', zh: '身高' },
};

export type PartGender = 'Female' | 'Male' | 'Transgender';

export interface CharacterPart {
  category: PartCategory;
  /** Unique within a category; used in the genome map. */
  slug: string;
  /** Value written into the appearance form/column (hex for hair color, label otherwise). */
  value: string;
  name_en: string;
  name_zh: string;
  /** English image-prompt fragment contributed to the portrait prompt. */
  prompt_en: string;
  /** Persona-description fragment used in the assembled character text. */
  persona_zh: string;
  persona_en: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  /** Random pick weight (higher = more common). */
  weight: number;
  genders: PartGender[];
  sort_order: number;
}

/** A forged genome: one part slug per category (breast_shape omitted for Male). */
export type Genome = Partial<Record<PartCategory, string>>;

export interface ForgedTraits {
  base_intimacy: number;
  base_desire: number;
  base_development: number;
  base_kink: number;
}

export interface ForgedCombination {
  /** Unique combination code (base36) — the 千人千面 identity of this persona. */
  code: string;
  genome: Genome;
  name: string;
  name_zh: string;
  age: number;
  gender: PartGender;
  visual_style: 'realistic' | 'anime';
  vibe: PresetVibe;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  traits: ForgedTraits;
  scene_id: string;
  soul_slug: string | null;
  greeting_en: string;
  greeting_zh: string;
  description_en: string;
  description_zh: string;
  /** Display chips: localized part labels keyed by category. */
  part_labels: Record<string, { en: string; zh: string }>;
}

// ─── Fallback parts pool (mirror of migration 0023 seed) ─────────────────────

const ALL: PartGender[] = ['Female', 'Male', 'Transgender'];
const FEMALE_LEAN: PartGender[] = ['Female', 'Transgender'];

function part(
  category: PartCategory,
  slug: string,
  value: string,
  name_en: string,
  name_zh: string,
  prompt_en: string,
  persona_zh: string,
  persona_en: string,
  opts: { rarity?: CharacterPart['rarity']; weight?: number; genders?: PartGender[]; sort_order?: number } = {},
): CharacterPart {
  return {
    category,
    slug,
    value,
    name_en,
    name_zh,
    prompt_en,
    persona_zh,
    persona_en,
    rarity: opts.rarity || 'N',
    weight: opts.weight ?? 100,
    genders: opts.genders || ALL,
    sort_order: opts.sort_order ?? 0,
  };
}

export const CHARACTER_PARTS: readonly CharacterPart[] = [
  // ── Hairstyle (10) ──
  part('hairstyle', 'long-straight', 'Long Straight', 'Long Straight', '长直发', 'long straight silky hair', '一头顺滑的长直发', 'long straight silky hair', { sort_order: 10 }),
  part('hairstyle', 'long-flowing', 'Long Flowing', 'Long Flowing', '飘逸长发', 'long flowing wavy hair', '飘逸的微卷长发', 'long flowing wavy hair', { sort_order: 20 }),
  part('hairstyle', 'wavy-curls', 'Wavy Curls', 'Wavy Curls', '波浪卷发', 'romantic big wavy curls', '浪漫的大波浪卷发', 'romantic big wavy curls', { sort_order: 30 }),
  part('hairstyle', 'high-ponytail', 'High Ponytail', 'High Ponytail', '高马尾', 'energetic high ponytail', '充满活力的高马尾', 'energetic high ponytail', { sort_order: 40 }),
  part('hairstyle', 'twin-tails', 'Twin Tails', 'Twin Tails', '双马尾', 'cute twin tails', '可爱的双马尾', 'cute twin tails', { genders: FEMALE_LEAN, sort_order: 50 }),
  part('hairstyle', 'sleek-bob', 'Sleek Bob', 'Sleek Bob', '齐肩短发', 'sleek chin-length bob', '利落的齐肩短发', 'sleek chin-length bob', { sort_order: 60 }),
  part('hairstyle', 'pixie-cut', 'Pixie Cut', 'Pixie Cut', '精灵短发', 'sharp pixie cut', '帅气的精灵短发', 'sharp pixie cut', { sort_order: 70 }),
  part('hairstyle', 'side-braid', 'Side Braid', 'Side Braid', '侧编发', 'loose side braid over shoulder', '垂在肩侧的松散编发', 'loose side braid over shoulder', { genders: FEMALE_LEAN, sort_order: 80 }),
  part('hairstyle', 'messy-bun', 'Messy Bun', 'Messy Bun', '慵懒丸子头', 'relaxed messy bun with loose strands', '慵懒的丸子头垂着几缕碎发', 'relaxed messy bun with loose strands', { sort_order: 90 }),
  part('hairstyle', 'hime-cut', 'Hime Cut', 'Hime Cut', '姬发式', 'elegant hime cut with blunt bangs', '古典的姬发式齐刘海', 'elegant hime cut with blunt bangs', { rarity: 'R', genders: FEMALE_LEAN, sort_order: 100 }),

  // ── Hair color (11 hex, aligned with buildPortraitPrompt hex map) ──
  part('hair_color', 'jet-black', '#000000', 'Jet Black', '乌黑', 'jet black hair', '乌黑的发色', 'jet black hair', { sort_order: 10 }),
  part('hair_color', 'dark-brown', '#4a3728', 'Dark Brown', '深棕', 'dark brown hair', '深棕发色', 'dark brown hair', { sort_order: 20 }),
  part('hair_color', 'chestnut', '#6b3a2a', 'Chestnut Brown', '栗棕', 'warm chestnut brown hair', '温暖的栗棕发色', 'warm chestnut brown hair', { sort_order: 30 }),
  part('hair_color', 'blonde', '#d4a574', 'Blonde', '亚麻金', 'soft blonde hair', '柔和的亚麻金发色', 'soft blonde hair', { rarity: 'R', sort_order: 40 }),
  part('hair_color', 'golden-blonde', '#f5d742', 'Golden Blonde', '闪耀金', 'bright golden blonde hair', '闪耀的金色头发', 'bright golden blonde hair', { rarity: 'R', weight: 70, sort_order: 50 }),
  part('hair_color', 'sakura-pink', '#e84393', 'Sakura Pink', '樱花粉', 'pastel sakura pink hair', '樱花粉的发色', 'pastel sakura pink hair', { rarity: 'SR', weight: 55, sort_order: 60 }),
  part('hair_color', 'magenta', '#d946ef', 'Magenta', '蔷薇紫红', 'vivid magenta hair', '蔷薇紫红发色', 'vivid magenta hair', { rarity: 'SR', weight: 45, sort_order: 70 }),
  part('hair_color', 'dream-purple', '#8b5cf6', 'Dream Purple', '梦幻紫', 'dreamy violet-purple hair', '梦幻紫的发色', 'dreamy violet-purple hair', { rarity: 'SR', weight: 50, sort_order: 80 }),
  part('hair_color', 'mist-blue', '#3b82f6', 'Mist Blue', '雾霾蓝', 'misty blue hair', '雾霾蓝发色', 'misty blue hair', { rarity: 'SR', weight: 45, sort_order: 90 }),
  part('hair_color', 'flame-red', '#ef4444', 'Flame Red', '炽红', 'bold flame red hair', '张扬的炽红发色', 'bold flame red hair', { rarity: 'R', weight: 60, sort_order: 100 }),
  part('hair_color', 'silver-white', '#ffffff', 'Silver White', '银白', 'shimmering silver white hair', '银白色的头发', 'shimmering silver white hair', { rarity: 'SR', weight: 40, sort_order: 110 }),

  // ── Bust shape (10, female/trans only) ──
  part('breast_shape', 'modest-flat', 'Modest', 'Modest', '娇小平坦', 'modest flat chest', '娇小平坦的胸型', 'modest flat chest', { genders: FEMALE_LEAN, sort_order: 10 }),
  part('breast_shape', 'petite-perky', 'Petite Perky', 'Petite Perky', '娇小挺立', 'petite perky chest', '娇小挺立的胸型', 'petite perky chest', { genders: FEMALE_LEAN, sort_order: 20 }),
  part('breast_shape', 'soft-natural', 'Soft Natural', 'Soft Natural', '柔和自然', 'soft natural chest', '柔和自然的胸型', 'soft natural chest', { genders: FEMALE_LEAN, sort_order: 30 }),
  part('breast_shape', 'athletic-compact', 'Athletic Compact', 'Athletic Compact', '运动紧致', 'athletic compact chest', '运动紧致的胸型', 'athletic compact chest', { genders: FEMALE_LEAN, sort_order: 40 }),
  part('breast_shape', 'gentle-slope', 'Gentle Slope', 'Gentle Slope', '舒缓坡形', 'gentle sloped chest', '舒缓坡形的胸型', 'gentle sloped chest', { genders: FEMALE_LEAN, sort_order: 50 }),
  part('breast_shape', 'teardrop', 'Teardrop', 'Teardrop', '水滴形', 'teardrop-shaped bust', '水滴形的胸型', 'teardrop-shaped bust', { rarity: 'R', genders: FEMALE_LEAN, sort_order: 60 }),
  part('breast_shape', 'full-round', 'Full Round', 'Full Round', '饱满圆润', 'full round bust', '饱满圆润的胸型', 'full round bust', { rarity: 'R', genders: FEMALE_LEAN, sort_order: 70 }),
  part('breast_shape', 'curvy-full', 'Curvy Full', 'Curvy Full', '丰盈曲线', 'curvy full bust', '丰盈的曲线胸型', 'curvy full bust', { rarity: 'R', genders: FEMALE_LEAN, sort_order: 80 }),
  part('breast_shape', 'generous', 'Generous', 'Generous', '丰满上围', 'generous busty figure', '丰满的上围', 'generous busty figure', { rarity: 'SR', weight: 70, genders: FEMALE_LEAN, sort_order: 90 }),
  part('breast_shape', 'voluptuous', 'Voluptuous', 'Voluptuous', '傲人曲线', 'voluptuous busty figure', '傲人的曲线胸型', 'voluptuous busty figure', { rarity: 'SR', weight: 55, genders: FEMALE_LEAN, sort_order: 100 }),

  // ── Body type (10, values aligned with creator_option_pool) ──
  part('body_type', 'petite', 'Petite', 'Petite', '娇小玲珑', 'petite compact frame', '娇小玲珑的身形', 'petite compact frame', { sort_order: 10 }),
  part('body_type', 'slim', 'Slim', 'Slim', '纤细苗条', 'slim graceful figure', '纤细苗条的身材', 'slim graceful figure', { sort_order: 20 }),
  part('body_type', 'athletic', 'Athletic', 'Athletic', '运动健美', 'athletic toned physique', '运动健美的体态', 'athletic toned physique', { sort_order: 30 }),
  part('body_type', 'dancer-lean', 'Dancer Lean', 'Dancer Lean', '舞者紧致', 'lean dancer physique with long lines', '紧致修长的舞者体态', 'lean dancer physique with long lines', { rarity: 'R', sort_order: 40 }),
  part('body_type', 'curvy', 'Curvy', 'Curvy', '曲线玲珑', 'curvy hourglass figure', '曲线玲珑的身材', 'curvy hourglass figure', { rarity: 'R', sort_order: 50 }),
  part('body_type', 'hourglass', 'Hourglass', 'Hourglass', '沙漏身材', 'dramatic hourglass silhouette', '教科书般的沙漏身材', 'dramatic hourglass silhouette', { rarity: 'SR', weight: 65, sort_order: 60 }),
  part('body_type', 'busty', 'Busty', 'Busty', '丰满', 'busty figure with soft curves', '丰满柔软的身材', 'busty figure with soft curves', { rarity: 'R', sort_order: 70 }),
  part('body_type', 'voluptuous', 'Voluptuous', 'Voluptuous', '丰腴诱人', 'voluptuous lush figure', '丰腴诱人的身材', 'voluptuous lush figure', { rarity: 'SR', weight: 60, sort_order: 80 }),
  part('body_type', 'soft-plush', 'Soft Plush', 'Soft Plush', '柔软微胖', 'soft plush huggable figure', '柔软微胖的可爱身材', 'soft plush huggable figure', { rarity: 'R', weight: 70, sort_order: 90 }),
  part('body_type', 'tall-statuesque', 'Tall', 'Tall', '高挑模特', 'tall statuesque model frame', '高挑的模特身形', 'tall statuesque model frame', { sort_order: 100 }),

  // ── Skin tone (10) ──
  part('skin_tone', 'porcelain', 'Porcelain Fair', 'Porcelain Fair', '瓷白', 'fair porcelain skin', '瓷白透亮的肌肤', 'fair porcelain skin', { sort_order: 10 }),
  part('skin_tone', 'ivory', 'Ivory Light', 'Ivory Light', '象牙白', 'light ivory skin', '象牙白的肌肤', 'light ivory skin', { sort_order: 20 }),
  part('skin_tone', 'warm-beige', 'Warm Beige', 'Warm Beige', '暖米色', 'warm beige skin tone', '暖米色的肌肤', 'warm beige skin tone', { sort_order: 30 }),
  part('skin_tone', 'honey', 'Honey', 'Honey', '蜜糖色', 'smooth honey-toned skin', '蜜糖色的柔滑肌肤', 'smooth honey-toned skin', { rarity: 'R', sort_order: 40 }),
  part('skin_tone', 'golden-tan', 'Golden Tan', 'Golden Tan', '金色小麦', 'golden sun-kissed tanned skin', '金色小麦色的健康肌肤', 'golden sun-kissed tanned skin', { rarity: 'R', sort_order: 50 }),
  part('skin_tone', 'olive', 'Olive', 'Olive', '橄榄色', 'warm olive skin tone', '橄榄色的肌肤', 'warm olive skin tone', { sort_order: 60 }),
  part('skin_tone', 'caramel', 'Caramel', 'Caramel', '焦糖', 'rich caramel skin', '焦糖色的肌肤', 'rich caramel skin', { rarity: 'R', sort_order: 70 }),
  part('skin_tone', 'bronze', 'Bronze', 'Bronze', '古铜', 'glowing bronze skin', '古铜色发亮的肌肤', 'glowing bronze skin', { rarity: 'R', sort_order: 80 }),
  part('skin_tone', 'deep-brown', 'Deep Brown', 'Deep Brown', '深棕', 'deep brown skin', '深棕色的肌肤', 'deep brown skin', { sort_order: 90 }),
  part('skin_tone', 'ebony', 'Ebony', 'Ebony', '乌木', 'radiant ebony skin', '乌木色光泽的肌肤', 'radiant ebony skin', { rarity: 'R', sort_order: 100 }),

  // ── Face shape (10) ──
  part('face_shape', 'oval', 'Oval', 'Oval', '鹅蛋脸', 'balanced oval face', '标准的鹅蛋脸', 'balanced oval face', { sort_order: 10 }),
  part('face_shape', 'round', 'Round', 'Round', '圆脸', 'soft round face with gentle cheeks', '圆润可爱的脸型', 'soft round face with gentle cheeks', { sort_order: 20 }),
  part('face_shape', 'heart', 'Heart', 'Heart', '心形脸', 'heart-shaped face with a delicate chin', '精致的心形脸', 'heart-shaped face with a delicate chin', { sort_order: 30 }),
  part('face_shape', 'v-line', 'V-Line', 'V-Line', 'V字小脸', 'slender V-line jaw', '纤瘦的V字小脸', 'slender V-line jaw', { rarity: 'R', sort_order: 40 }),
  part('face_shape', 'diamond', 'Diamond', 'Diamond', '菱形脸', 'striking diamond face with high cheekbones', '颧骨立体的菱形脸', 'striking diamond face with high cheekbones', { rarity: 'R', sort_order: 50 }),
  part('face_shape', 'square', 'Square', 'Square', '方脸', 'defined square jawline', '轮廓分明的方脸', 'defined square jawline', { sort_order: 60 }),
  part('face_shape', 'long', 'Long', 'Long', '长脸', 'elegant elongated face', '优雅的长脸型', 'elegant elongated face', { sort_order: 70 }),
  part('face_shape', 'high-cheekbones', 'High Cheekbones', 'High Cheekbones', '高颧骨', 'sculpted high cheekbones', '高颧骨的立体轮廓', 'sculpted high cheekbones', { rarity: 'R', sort_order: 80 }),
  part('face_shape', 'delicate-small', 'Delicate Small', 'Delicate Small', '精致小脸', 'delicate small face with fine features', '五官精巧的小脸', 'delicate small face with fine features', { rarity: 'SR', weight: 60, sort_order: 90 }),
  part('face_shape', 'mature-oval', 'Mature Oval', 'Mature Oval', '成熟椭圆', 'mature oval face with poised expression', '沉稳的成熟椭圆脸', 'mature oval face with poised expression', { sort_order: 100 }),

  // ── Eye color (10) ──
  part('eye_color', 'brown', 'Brown', 'Brown', '棕色', 'warm brown eyes', '温暖的棕色眼眸', 'warm brown eyes', { sort_order: 10 }),
  part('eye_color', 'black', 'Black', 'Black', '黑色', 'deep black eyes', '深邃的黑色眼眸', 'deep black eyes', { sort_order: 20 }),
  part('eye_color', 'hazel', 'Hazel', 'Hazel', '榛果色', 'hazel eyes with golden flecks', '带金点的榛果色眼眸', 'hazel eyes with golden flecks', { sort_order: 30 }),
  part('eye_color', 'amber', 'Amber', 'Amber', '琥珀', 'glowing amber eyes', '琥珀色的明亮眼眸', 'glowing amber eyes', { rarity: 'R', sort_order: 40 }),
  part('eye_color', 'blue', 'Blue', 'Blue', '蓝色', 'clear ocean blue eyes', '清澈的海蓝色眼眸', 'clear ocean blue eyes', { sort_order: 50 }),
  part('eye_color', 'green', 'Green', 'Green', '绿色', 'emerald green eyes', '翡翠绿的眼眸', 'emerald green eyes', { rarity: 'R', sort_order: 60 }),
  part('eye_color', 'gray', 'Gray', 'Gray', '灰色', 'cool misty gray eyes', '清冷的雾灰色眼眸', 'cool misty gray eyes', { rarity: 'R', sort_order: 70 }),
  part('eye_color', 'violet', 'Violet', 'Violet', '紫罗兰', 'captivating violet eyes', '迷人的紫罗兰眼眸', 'captivating violet eyes', { rarity: 'SR', weight: 50, sort_order: 80 }),
  part('eye_color', 'crimson', 'Crimson', 'Crimson', '绯红', 'striking crimson eyes', '绯红色的眼眸', 'striking crimson eyes', { rarity: 'SR', weight: 40, sort_order: 90 }),
  part('eye_color', 'heterochromia', 'Heterochromia', 'Heterochromia', '异瞳', 'heterochromia eyes, one blue one amber', '一蓝一金的异色瞳', 'heterochromia eyes, one blue one amber', { rarity: 'SSR', weight: 25, sort_order: 100 }),

  // ── Height (10) ──
  part('height', 'petite-148', 'Petite 148cm', 'Petite 148cm', '娇小 148cm', 'petite stature around 148cm', '148cm的娇小身高', 'petite stature around 148cm', { sort_order: 10 }),
  part('height', 'small-153', 'Small 153cm', 'Small 153cm', '小巧 153cm', 'small stature around 153cm', '153cm的小巧身高', 'small stature around 153cm', { sort_order: 20 }),
  part('height', 'slender-158', 'Slender 158cm', 'Slender 158cm', '纤细 158cm', 'slender build around 158cm', '158cm的纤细身高', 'slender build around 158cm', { sort_order: 30 }),
  part('height', 'balanced-163', 'Balanced 163cm', 'Balanced 163cm', '匀称 163cm', 'balanced height around 163cm', '163cm的匀称身高', 'balanced height around 163cm', { sort_order: 40 }),
  part('height', 'graceful-167', 'Graceful 167cm', 'Graceful 167cm', '修长 167cm', 'graceful height around 167cm', '167cm的修长身高', 'graceful height around 167cm', { sort_order: 50 }),
  part('height', 'tall-172', 'Tall 172cm', 'Tall 172cm', '高挑 172cm', 'tall build around 172cm', '172cm的高挑身高', 'tall build around 172cm', { sort_order: 60 }),
  part('height', 'statuesque-177', 'Statuesque 177cm', 'Statuesque 177cm', '颀长 177cm', 'statuesque height around 177cm', '177cm的颀长身高', 'statuesque height around 177cm', { rarity: 'R', sort_order: 70 }),
  part('height', 'model-182', 'Model 182cm', 'Model 182cm', '超模 182cm', 'striking model height around 182cm', '182cm的超模身高', 'striking model height around 182cm', { rarity: 'SR', weight: 50, sort_order: 80 }),
  part('height', 'amazon-187', 'Amazon 187cm', 'Amazon 187cm', '气场 187cm', 'commanding height around 187cm', '187cm的气场身高', 'commanding height around 187cm', { rarity: 'SR', weight: 35, sort_order: 90 }),
  part('height', 'towering-192', 'Towering 192cm', 'Towering 192cm', '压倒 192cm', 'towering presence around 192cm', '192cm的压倒性身高', 'towering presence around 192cm', { rarity: 'SSR', weight: 20, sort_order: 100 }),
];

// ─── Deterministic PRNG ──────────────────────────────────────────────────────

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small fast deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Pool access helpers ─────────────────────────────────────────────────────

export function partsByCategory(parts: readonly CharacterPart[]): Record<PartCategory, CharacterPart[]> {
  const grouped = {} as Record<PartCategory, CharacterPart[]>;
  for (const c of PART_CATEGORY_ORDER) grouped[c] = [];
  for (const p of parts) {
    if (grouped[p.category]) grouped[p.category].push(p);
  }
  for (const c of PART_CATEGORY_ORDER) {
    grouped[c].sort((a, b) => a.sort_order - b.sort_order);
  }
  return grouped;
}

export function findPart(parts: readonly CharacterPart[], category: PartCategory, slugOrValue: string): CharacterPart | undefined {
  return parts.find((p) => p.category === category && (p.slug === slugOrValue || p.value === slugOrValue));
}

function eligibleParts(grouped: Record<PartCategory, CharacterPart[]>, category: PartCategory, gender: PartGender): CharacterPart[] {
  return grouped[category].filter((p) => p.genders.includes(gender));
}

function weightedPick(pool: CharacterPart[], rnd: () => number): CharacterPart {
  const total = pool.reduce((sum, p) => sum + Math.max(1, p.weight), 0);
  let roll = rnd() * total;
  for (const p of pool) {
    roll -= Math.max(1, p.weight);
    if (roll <= 0) return p;
  }
  return pool[pool.length - 1];
}

// ─── Forge engine ────────────────────────────────────────────────────────────

export interface ForgeOptions {
  gender?: PartGender;
  /** Deterministic seed — same seed + gender yields the same genome. */
  seed?: string;
  /** Force specific parts (by slug or value); the rest are rolled. */
  pinned?: Genome;
  visual_style?: 'realistic' | 'anime';
}

/** Combine one part per category into a fresh genome (千人千面). */
export function forgeGenome(
  parts: readonly CharacterPart[],
  opts: ForgeOptions = {},
): { genome: Genome; gender: PartGender; seedUsed: string } {
  const gender: PartGender = opts.gender === 'Male' || opts.gender === 'Transgender' ? opts.gender : 'Female';
  const seedUsed = opts.seed || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const rnd = mulberry32(hashString(`forge:${gender}:${seedUsed}`));
  const grouped = partsByCategory(parts);
  const genome: Genome = {};
  for (const category of PART_CATEGORY_ORDER) {
    if (category === 'breast_shape' && gender === 'Male') continue;
    const pool = eligibleParts(grouped, category, gender);
    if (!pool.length) continue;
    const pinnedSlug = opts.pinned?.[category];
    const pinnedPart = pinnedSlug ? findPart(parts, category, pinnedSlug) : undefined;
    genome[category] = (pinnedPart && pool.includes(pinnedPart) ? pinnedPart : weightedPick(pool, rnd)).slug;
  }
  return { genome, gender, seedUsed };
}

/** Resolve a genome to its part rows. */
export function genomeParts(parts: readonly CharacterPart[], genome: Genome): Partial<Record<PartCategory, CharacterPart>> {
  const resolved: Partial<Record<PartCategory, CharacterPart>> = {};
  for (const category of PART_CATEGORY_ORDER) {
    const slug = genome[category];
    if (!slug) continue;
    const p = findPart(parts, category, slug);
    if (p) resolved[category] = p;
  }
  return resolved;
}

/** Unique short code identifying this exact combination. */
export function genomeCode(genome: Genome): string {
  const key = PART_CATEGORY_ORDER.map((c) => genome[c] || '-').join('|');
  return hashString(key).toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

const RARITY_SCORE: Record<CharacterPart['rarity'], number> = { N: 0, R: 1, SR: 3, SSR: 6 };

/** Overall rarity of a genome — the sum of its part rarities. */
export function genomeRarity(parts: readonly CharacterPart[], genome: Genome): 'N' | 'R' | 'SR' | 'SSR' {
  const resolved = genomeParts(parts, genome);
  const score = Object.values(resolved).reduce((sum, p) => sum + RARITY_SCORE[p.rarity], 0);
  if (score >= 9) return 'SSR';
  if (score >= 5) return 'SR';
  if (score >= 2) return 'R';
  return 'N';
}

const VIBES: PresetVibe[] = ['sweet', 'cool', 'flirty', 'obsessive', 'energetic', 'fantasy', 'sensual', 'dominant', 'intellectual', 'playful'];

export function genomeVibe(parts: readonly CharacterPart[], genome: Genome): PresetVibe {
  return VIBES[hashString(genomeCode(genome) + Object.keys(genome).length) % VIBES.length];
}

/** Trait bands rolled deterministically from the genome (aligned with girlfriend-traits bands). */
export function genomeTraits(genome: Genome, vibe: PresetVibe): ForgedTraits {
  const rnd = mulberry32(hashString(`traits:${genomeCode(genome)}`));
  const jitter = (base: number, spread = 10) => Math.max(5, Math.min(100, base + Math.floor(rnd() * spread * 2) - spread));
  const archetypes: Record<PresetVibe, [number, number, number, number]> = {
    sweet: [62, 48, 42, 35],
    cool: [40, 52, 45, 42],
    flirty: [55, 72, 64, 58],
    obsessive: [50, 68, 60, 66],
    energetic: [66, 62, 55, 48],
    fantasy: [48, 58, 52, 55],
    sensual: [58, 78, 70, 62],
    dominant: [45, 66, 68, 64],
    intellectual: [52, 50, 48, 44],
    playful: [64, 56, 58, 50],
  };
  const [intimacy, desire, development, kink] = archetypes[vibe] || archetypes.sweet;
  return {
    base_intimacy: jitter(intimacy),
    base_desire: jitter(desire),
    base_development: jitter(development),
    base_kink: jitter(kink),
  };
}

// ─── Identity (names / greetings / souls / scenes) ──────────────────────────

const NAME_POOL: Record<PartGender, { en: string; zh: string }[]> = {
  Female: [
    { en: 'Aria', zh: '艾瑞亚' }, { en: 'Luna', zh: '露娜' }, { en: 'Mia', zh: '米娅' },
    { en: 'Chloe', zh: '克洛伊' }, { en: 'Yuna', zh: '尤娜' }, { en: 'Seraphina', zh: '瑟拉芬' },
    { en: 'Iris', zh: '爱丽丝' }, { en: 'Naomi', zh: '娜奥米' }, { en: 'Vivienne', zh: '薇薇安' },
    { en: 'Elena', zh: '艾琳娜' }, { en: 'Sable', zh: '塞布尔' }, { en: 'Freya', zh: '弗蕾亚' },
    { en: 'Amelie', zh: '艾米莉' }, { en: 'Kira', zh: '吉拉' }, { en: 'Selene', zh: '塞勒涅' },
    { en: 'Rosa', zh: '罗莎' }, { en: 'Mirei', zh: '美玲' }, { en: 'Dahlia', zh: '大丽亚' },
    { en: 'Nadia', zh: '纳蒂亚' }, { en: 'Siena', zh: '西耶娜' },
  ],
  Male: [
    { en: 'Ethan', zh: '伊森' }, { en: 'Leo', zh: '里奥' }, { en: 'Caleb', zh: '迦勒' },
    { en: 'Rowan', zh: '罗文' }, { en: 'Dante', zh: '但丁' }, { en: 'Silas', zh: '塞拉斯' },
    { en: 'Marco', zh: '马可' }, { en: 'Jin', zh: '金' }, { en: 'Theo', zh: '西奥' },
    { en: 'Vincent', zh: '文森特' },
  ],
  Transgender: [
    { en: 'Ariel', zh: '艾瑞尔' }, { en: 'Sasha', zh: '萨沙' }, { en: 'Noor', zh: '努尔' },
    { en: 'Remy', zh: '雷米' }, { en: 'Indigo', zh: '靛蓝' }, { en: 'Kai', zh: '凯' },
  ],
};

const VIBE_SCENE: Record<PresetVibe, string> = {
  sweet: 'kitchen_morning',
  cool: 'rooftop_night',
  flirty: 'car_night',
  obsessive: 'pink_bedroom',
  energetic: 'beach_breeze',
  fantasy: 'golden_hour',
  sensual: 'window_sunlight',
  dominant: 'gothic_throne',
  intellectual: 'cafe_day',
  playful: 'mirror_selfie',
};

/** Reuse existing soul layer by vibe — forged personas adopt a matching voice. */
const VIBE_SOUL_SLUGS: Record<PresetVibe, { F: string; M: string }> = {
  sweet: { F: 'sofia-sweet-neighbor', M: 'lucas-sunshine-athlete' },
  cool: { F: 'victoria-ice-queen-boss', M: 'ren-anime-cold-senior' },
  flirty: { F: 'scarlet-night-singer', M: 'kai-charming-bartender' },
  obsessive: { F: 'raven-dark-yandere', M: 'ren-anime-cold-senior' },
  energetic: { F: 'camila-fire-trainer', M: 'lucas-sunshine-athlete' },
  fantasy: { F: 'luna-moon-oracle', M: 'noah-folk-musician' },
  sensual: { F: 'jasmine-desert-rose', M: 'kai-charming-bartender' },
  dominant: { F: 'victoria-ice-queen-boss', M: 'adrian-dominant-ceo' },
  intellectual: { F: 'ava-wise-teacher', M: 'damian-cold-doctor' },
  playful: { F: 'momo-gamer-roommate', M: 'noah-folk-musician' },
};

const VIBE_GREETINGS: Record<PresetVibe, { en: string; zh: string }> = {
  sweet: {
    en: '*peeks out with a warm smile* You are finally here... I saved something nice for you. Come in, okay?',
    zh: '＊带着温暖的微笑探出头＊你终于来了……我给你留了好东西。进来坐坐，好吗？',
  },
  cool: {
    en: '*glances up calmly* Oh. You actually came. ...Fine, you may stay for a while.',
    zh: '＊平静地抬眼＊哦。你还真来了。……好吧，允许你待一会儿。',
  },
  flirty: {
    en: '*leans closer with a slow smile* Well, well... look who finally showed up. I was starting to miss you.',
    zh: '＊带着慵懒的笑凑近＊哎呀呀……看看这是谁。我都开始想你了呢。',
  },
  obsessive: {
    en: '*grips your sleeve softly* You came... I knew you would. I have been waiting only for you, all along.',
    zh: '＊轻轻攥住你的衣角＊你来了……我就知道你会来。我一直只在等你一个人。',
  },
  energetic: {
    en: '*bounces over with a bright grin* Hey hey! Perfect timing — today is going to be SO much fun!',
    zh: '＊蹦蹦跳跳地跑过来，笑容灿烂＊嘿！来得正好——今天绝对会超开心的！',
  },
  fantasy: {
    en: '*the candlelight flickers as they turn to you* The stars said you would come tonight... Welcome, traveler.',
    zh: '＊烛光摇曳，转身看向你＊星象说今夜你会到来……欢迎你，旅人。',
  },
  sensual: {
    en: '*voice drops to a soft murmur* You came... Good. Stay close tonight, the light is lovelier with you here.',
    zh: '＊声音低成轻柔的呢喃＊你来了……真好。今晚留在我身边，有你在，灯光都温柔了几分。',
  },
  dominant: {
    en: '*settles back with quiet authority* There you are. Sit. Tonight, you follow my lead — understood?',
    zh: '＊带着沉静的威仪靠坐＊来了。坐。今晚一切听我的安排——明白吗？',
  },
  intellectual: {
    en: '*looks up from a book, eyes bright* Ah, perfect timing. I was just thinking about something I want to ask you.',
    zh: '＊从书中抬头，眼睛发亮＊啊，来得正好。我正想问你一件事。',
  },
  playful: {
    en: '*spins around and waves* You are here! Quick, quick — you will not believe what happened today!',
    zh: '＊转着圈挥手＊你来啦！快快快——你绝对猜不到今天发生了什么！',
  },
};

const OCCUPATION_POOL: Array<{ en: string; zh: string }> = [
  { en: 'Illustrator', zh: '插画师' },
  { en: 'Nurse', zh: '护士' },
  { en: 'Barista', zh: '咖啡师' },
  { en: 'DJ', zh: 'DJ' },
  { en: 'Photographer', zh: '摄影师' },
  { en: 'Grad Student', zh: '研究生' },
  { en: 'Pastry Chef', zh: '甜点师' },
  { en: 'Streamer', zh: '主播' },
  { en: 'Yoga Instructor', zh: '瑜伽教练' },
  { en: 'Bookstore Clerk', zh: '书店店员' },
  { en: 'Game Designer', zh: '游戏策划' },
  { en: 'Florist', zh: '花艺师' },
];
const HOBBIES_POOL: Array<{ en: string; zh: string }> = [
  { en: 'film photography', zh: '胶片摄影' },
  { en: 'late-night cooking', zh: '深夜下厨' },
  { en: 'vinyl records', zh: '黑胶唱片' },
  { en: 'urban exploring', zh: '城市漫游' },
  { en: 'baking', zh: '烘焙' },
  { en: 'stargazing', zh: '观星' },
  { en: 'indie games', zh: '独立游戏' },
  { en: 'vintage fashion', zh: '复古穿搭' },
  { en: 'live houses', zh: '看现场演出' },
  { en: 'hand-drip coffee', zh: '手冲咖啡' },
];

/** Assemble the bilingual persona description from the genome's parts. */
export function describeGenome(parts: readonly CharacterPart[], genome: Genome, locale: 'zh' | 'en'): string {
  const resolved = genomeParts(parts, genome);
  const fragments = PART_CATEGORY_ORDER
    .map((c) => resolved[c])
    .filter((p): p is CharacterPart => Boolean(p))
    .map((p) => (locale === 'zh' ? p.persona_zh : p.persona_en));
  return fragments.join(locale === 'zh' ? '，' : ', ');
}

/** Assemble the image-prompt fragments contributed by the genome. */
export function genomeImagePrompt(parts: readonly CharacterPart[], genome: Genome): string {
  const resolved = genomeParts(parts, genome);
  return PART_CATEGORY_ORDER
    .map((c) => resolved[c])
    .filter((p): p is CharacterPart => Boolean(p))
    .map((p) => p.prompt_en)
    .join(', ');
}

export interface ForgeCombinationOptions extends ForgeOptions {
  parts: readonly CharacterPart[];
}

/** Forge a complete combination: genome + identity + traits + greeting. */
export function forgeCombination(opts: ForgeCombinationOptions): ForgedCombination {
  const { parts } = opts;
  const { genome, gender, seedUsed } = forgeGenome(parts, opts);
  const code = genomeCode(genome);
  const rnd = mulberry32(hashString(`identity:${seedUsed}:${code}`));
  const vibe = genomeVibe(parts, genome);
  const names = NAME_POOL[gender].length ? NAME_POOL[gender] : NAME_POOL.Female;
  const picked = names[Math.floor(rnd() * names.length)];
  const visual_style = opts.visual_style || (rnd() < 0.35 ? 'anime' : 'realistic');
  const occupation = OCCUPATION_POOL[Math.floor(rnd() * OCCUPATION_POOL.length)];
  const hobbyA = HOBBIES_POOL[Math.floor(rnd() * HOBBIES_POOL.length)];
  const hobbyB = HOBBIES_POOL[(HOBBIES_POOL.indexOf(hobbyA) + 3) % HOBBIES_POOL.length];
  const age = 19 + Math.floor(rnd() * 10);
  const description = describeGenome(parts, genome, 'en');
  const descriptionZh = describeGenome(parts, genome, 'zh');
  const partLabels: Record<string, { en: string; zh: string }> = {};
  const resolved = genomeParts(parts, genome);
  for (const category of PART_CATEGORY_ORDER) {
    const p = resolved[category];
    if (p) partLabels[category] = { en: p.name_en, zh: p.name_zh };
  }
  const traits = genomeTraits(genome, vibe);
  return {
    code,
    genome,
    name: picked.en,
    name_zh: picked.zh,
    age,
    gender,
    visual_style,
    vibe,
    // Universal rarity rule: derived from the rolled trait score, not part weights
    rarity: rarityFromTraits(traits.base_desire, traits.base_development, traits.base_kink),
    traits,
    scene_id: VIBE_SCENE[vibe],
    soul_slug: VIBE_SOUL_SLUGS[vibe][gender === 'Male' ? 'M' : 'F'],
    greeting_en: VIBE_GREETINGS[vibe].en,
    greeting_zh: VIBE_GREETINGS[vibe].zh,
    description_en: `${description}. Works as a ${occupation.en.toLowerCase()}; into ${hobbyA.en} and ${hobbyB.en}.`,
    description_zh: `${descriptionZh}。职业是${occupation.zh}，喜欢${hobbyA.zh}和${hobbyB.zh}。`,
    part_labels: partLabels,
  };
}

/** Forge N distinct combinations (used to render the 智能组合 wall). */
export function forgeMany(opts: ForgeCombinationOptions & { count?: number }): ForgedCombination[] {
  const count = Math.min(12, Math.max(1, opts.count || 8));
  const out: ForgedCombination[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count * 3 && out.length < count; i++) {
    const combo = forgeCombination({
      ...opts,
      seed: `${opts.seed || 'wall'}-${i}-${out.length}`,
    });
    if (seen.has(combo.code)) continue;
    seen.add(combo.code);
    out.push(combo);
  }
  return out;
}

/** Normalize a DB row from character_parts into a CharacterPart. */
export function normalizeCharacterPart(row: Record<string, unknown>): CharacterPart | null {
  const category = String(row.category || '') as PartCategory;
  if (!PART_CATEGORY_ORDER.includes(category)) return null;
  const slug = String(row.slug || '').trim();
  const name_en = String(row.name_en || '').trim();
  if (!slug || !name_en) return null;
  const gendersRaw = row.genders;
  let genders: PartGender[] = ALL;
  if (Array.isArray(gendersRaw) && gendersRaw.length) {
    genders = gendersRaw
      .map((g) => String(g))
      .filter((g): g is PartGender => g === 'Female' || g === 'Male' || g === 'Transgender');
    if (!genders.length) genders = ALL;
  }
  const rarity = String(row.rarity || 'N');
  return {
    category,
    slug,
    value: String(row.value || name_en),
    name_en,
    name_zh: String(row.name_zh || ''),
    prompt_en: String(row.prompt_en || name_en),
    persona_zh: String(row.persona_zh || ''),
    persona_en: String(row.persona_en || name_en),
    rarity: rarity === 'SSR' || rarity === 'SR' || rarity === 'R' ? rarity : 'N',
    weight: Math.max(1, Number(row.weight) || 100),
    genders,
    sort_order: Number(row.sort_order) || 0,
  };
}
