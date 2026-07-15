import type { TranslationKey } from '@/lib/i18n/types';

/**
 * Demo girlfriend data — English-first for Nordic/global EN users.
 * Chinese UI uses tagline_zh / relationship keys mapped via i18n.
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

/** Stable relationship keys (not locale-specific UI strings) */
export type RelationshipKey =
  | 'neighbor'
  | 'teacher'
  | 'sister'
  | 'junior'
  | 'coworker'
  | 'boss'
  | 'childhood'
  | 'stranger'
  | 'girlfriend'
  | 'wife'
  | 'maid'
  | 'rival';

/** @deprecated use RelationshipKey — kept as alias for old imports */
export type Relationship = RelationshipKey | string;

export type AccessStatus = 'open' | 'locked' | 'closed';

export interface DemoGirl {
  id: string;
  name: string;
  age: number;
  /** English tagline (default / EN) */
  tagline: string;
  /** Optional Simplified Chinese tagline */
  tagline_zh?: string;
  avatar: string;
  portrait: string;
  /** Optional looping card / portrait video (mp4/webm HTTPS) */
  video?: string;
  /** Optional short avatar loop (fallback if `video` empty) */
  avatar_video?: string;
  rarity: Rarity;
  tags: string[];
  personality: string;
  element: 'fire' | 'water' | 'wind' | 'light' | 'dark';
  intimacy: number;
  desire: number;
  development: number;
  kink: number;
  relationship: RelationshipKey | string;
  rarity_quote: string;
  voice_preview?: string;
  hot_score?: number;
  is_featured?: boolean;
  is_hot?: boolean;
  list_kind?: 'featured' | 'hot' | 'public';
  sort_order?: number;
  access_status?: AccessStatus;
  is_unlocked?: boolean;
  unlock_price_tokens?: number;
  locked?: boolean;
}

const REL_I18N: Record<string, TranslationKey> = {
  neighbor: 'home.rel.neighbor',
  teacher: 'home.rel.teacher',
  sister: 'home.rel.sister',
  junior: 'home.rel.junior',
  coworker: 'home.rel.coworker',
  boss: 'home.rel.boss',
  childhood: 'home.rel.childhood',
  stranger: 'home.rel.stranger',
  girlfriend: 'home.rel.girlfriend',
  wife: 'home.rel.wife',
  maid: 'home.rel.maid',
  rival: 'home.rel.rival',
  // legacy Chinese values stored in older data
  邻居: 'home.rel.neighbor',
  老师: 'home.rel.teacher',
  姐姐: 'home.rel.sister',
  学妹: 'home.rel.junior',
  同事: 'home.rel.coworker',
  上司: 'home.rel.boss',
  青梅竹马: 'home.rel.childhood',
  陌生人: 'home.rel.stranger',
  女友: 'home.rel.girlfriend',
  妻子: 'home.rel.wife',
  女仆: 'home.rel.maid',
  宿敌: 'home.rel.rival',
};

export function relationshipLabel(
  rel: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!rel) return t('home.rel.girlfriend');
  const key = REL_I18N[rel] || REL_I18N[rel.toLowerCase()];
  return key ? t(key as TranslationKey) : rel;
}

export function girlTagline(girl: DemoGirl, locale: string): string {
  if ((locale || 'en').toLowerCase().startsWith('zh') && girl.tagline_zh) {
    return girl.tagline_zh;
  }
  return girl.tagline;
}

export const GIRLS: DemoGirl[] = [
  {
    id: 'g1', name: 'Nova', age: 23,
    tagline: 'Synthwave girlfriend — soft on the surface, fire underneath.',
    tagline_zh: 'Synthwave 女友，外表柔软，暗处有火。',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=900&fit=crop',
    rarity: 'SSR', tags: ['mysterious', 'romantic', 'playful'], element: 'fire',
    personality: 'mysterious · romantic · playful',
    intimacy: 82, desire: 88, development: 72, kink: 64,
    relationship: 'girlfriend', rarity_quote: '"You are the song I keep humming."', hot_score: 98,
  },
  {
    id: 'g2', name: 'Luna', age: 24,
    tagline: 'Dream poet who wakes under starlight.',
    tagline_zh: '星光下苏醒的梦境诗人。',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=900&fit=crop',
    rarity: 'SR', tags: ['poetic', 'gentle', 'tender'], element: 'light',
    personality: 'poetic · gentle · tender',
    intimacy: 65, desire: 70, development: 58, kink: 42,
    relationship: 'neighbor', rarity_quote: '"The stars wrote your name before I did."', hot_score: 91,
  },
  {
    id: 'g3', name: 'Sophie', age: 22,
    tagline: 'Sweet painter next door who wants you in her story.',
    tagline_zh: '隔壁的甜系画家，想把你画进故事。',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=900&fit=crop',
    rarity: 'R', tags: ['sweet', 'creative', 'flirty'], element: 'wind',
    personality: 'sweet · creative · flirty',
    intimacy: 41, desire: 55, development: 40, kink: 28,
    relationship: 'neighbor', rarity_quote: '"Every canvas needs a muse."', hot_score: 84,
  },
  {
    id: 'g4', name: 'Violet', age: 26,
    tagline: 'Bold. Clear about what she wants — you.',
    tagline_zh: '强势又清楚自己要什么。',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=900&fit=crop',
    rarity: 'SSR', tags: ['bold', 'confident', 'passionate'], element: 'fire',
    personality: 'bold · confident · passionate',
    intimacy: 91, desire: 95, development: 88, kink: 78,
    relationship: 'boss', rarity_quote: '"I choose. Always."', hot_score: 99,
  },
  {
    id: 'g5', name: 'Maya', age: 23,
    tagline: 'Morning poet who finds beauty in small things.',
    tagline_zh: '清晨诗人，在小事里找美。',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=900&fit=crop',
    rarity: 'SR', tags: ['gentle', 'wise', 'caring'], element: 'water',
    personality: 'gentle · wise · caring',
    intimacy: 58, desire: 60, development: 65, kink: 35,
    relationship: 'teacher', rarity_quote: '"Sunrise is just the world waking up to see you."', hot_score: 86,
  },
  {
    id: 'g6', name: 'Aria', age: 21,
    tagline: 'A blink and your defenses are gone.',
    tagline_zh: '眨眼就能拆掉你防线的小麻烦。',
    avatar: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=900&fit=crop',
    rarity: 'R', tags: ['flirty', 'playful', 'spicy'], element: 'fire',
    personality: 'flirty · playful · spicy',
    intimacy: 33, desire: 72, development: 38, kink: 55,
    relationship: 'junior', rarity_quote: '"Trouble finds me. I let it."', hot_score: 88,
  },
  {
    id: 'g7', name: 'Ruby', age: 25,
    tagline: 'Queen energy. She leads — you follow.',
    tagline_zh: '女王气场。她主导，你服从。',
    avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=900&fit=crop',
    rarity: 'SSR', tags: ['dominant', 'spicy', 'confident'], element: 'dark',
    personality: 'dominant · spicy · confident',
    intimacy: 77, desire: 92, development: 80, kink: 90,
    relationship: 'boss', rarity_quote: '"Kneel. Now."', hot_score: 97,
  },
  {
    id: 'g8', name: 'Celeste', age: 27,
    tagline: 'Elegant Parisian — French lessons and forbidden ones.',
    tagline_zh: '优雅的巴黎人，教法语与禁忌。',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=900&fit=crop',
    rarity: 'SR', tags: ['elegant', 'sophisticated', 'mature'], element: 'light',
    personality: 'elegant · sophisticated · mature',
    intimacy: 49, desire: 68, development: 70, kink: 58,
    relationship: 'teacher', rarity_quote: '"Tu me rends fou."', hot_score: 90,
  },
  {
    id: 'g9', name: 'Iris', age: 23,
    tagline: 'Mysterious painter — every chat is a new canvas.',
    tagline_zh: '神秘画家，每段对话都是一幅新作。',
    avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=600&h=900&fit=crop',
    rarity: 'R', tags: ['artistic', 'mysterious', 'sensitive'], element: 'dark',
    personality: 'artistic · mysterious · sensitive',
    intimacy: 22, desire: 48, development: 30, kink: 40,
    relationship: 'stranger', rarity_quote: '"Colors are just feelings without a voice."', hot_score: 79,
  },
  {
    id: 'g10', name: 'Skye', age: 22,
    tagline: 'Adventure pilot — the sky is not the limit.',
    tagline_zh: '爱冒险的飞行员，三万英尺以上都可以。',
    avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=600&h=900&fit=crop',
    rarity: 'R', tags: ['adventurous', 'bold', 'fun'], element: 'wind',
    personality: 'adventurous · bold · fun',
    intimacy: 38, desire: 66, development: 44, kink: 50,
    relationship: 'coworker', rarity_quote: '"Strap in. We are going up."', hot_score: 83,
  },
  {
    id: 'g11', name: 'Jade', age: 24,
    tagline: 'Gentle yoga teacher — stretch body and heart.',
    tagline_zh: '温柔瑜伽老师，拉伸身体也拉伸心。',
    avatar: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=600&h=900&fit=crop',
    rarity: 'N', tags: ['gentle', 'caring', 'fit'], element: 'water',
    personality: 'gentle · caring · fit',
    intimacy: 15, desire: 40, development: 25, kink: 22,
    relationship: 'teacher', rarity_quote: '"Breathe with me."', hot_score: 74,
  },
  {
    id: 'g12', name: 'Ember', age: 26,
    tagline: 'Fierce fighter — soft only for you.',
    tagline_zh: '凶猛战士，对失败者却很温柔。',
    avatar: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=200&h=200&fit=crop',
    portrait: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=600&h=900&fit=crop',
    rarity: 'SR', tags: ['fierce', 'passionate', 'intense'], element: 'fire',
    personality: 'fierce · passionate · intense',
    intimacy: 66, desire: 80, development: 62, kink: 70,
    relationship: 'sister', rarity_quote: '"You do not need to be brave. Just stay."', hot_score: 92,
  },
];

export const RARITY_COLORS: Record<Rarity, { color: string; glow: string; label: string }> = {
  N: { color: '#9ca3af', glow: 'rgba(156,163,175,0.4)', label: 'N' },
  R: { color: '#00e5ff', glow: 'rgba(0,229,255,0.5)', label: 'R' },
  SR: { color: '#ff2e88', glow: 'rgba(255,46,136,0.6)', label: 'SR' },
  SSR: { color: '#ffd700', glow: 'rgba(255,215,0,0.7)', label: 'SSR' },
};

export const ELEMENT_COLORS: Record<DemoGirl['element'], string> = {
  fire: '#ff6b35',
  water: '#3b82f6',
  wind: '#10b981',
  light: '#fbbf24',
  dark: '#a855f7',
};
