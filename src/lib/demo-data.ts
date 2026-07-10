/**
 * Demo girlfriend data — used until Supabase + FLUX pipeline is wired.
 * Avatars from Unsplash (portrait images).
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export type Relationship =
  | '邻居'
  | '老师'
  | '姐姐'
  | '学妹'
  | '同事'
  | '上司'
  | '青梅竹马'
  | '陌生人'
  | '女友'
  | '妻子'
  | '女仆'
  | '宿敌';

export type AccessStatus = 'open' | 'locked' | 'closed';

export interface DemoGirl {
  id: string;
  name: string;
  age: number;
  tagline: string;
  avatar: string;
  portrait: string;
  rarity: Rarity;
  tags: string[];
  personality: string;
  element: 'fire' | 'water' | 'wind' | 'light' | 'dark';
  intimacy: number;
  /** 欲望值 0-100 */
  desire: number;
  /** 开发值 0-100 */
  development: number;
  /** 变态值 0-100 */
  kink: number;
  relationship: Relationship;
  rarity_quote: string;
  voice_preview?: string;
  hot_score?: number;
  /** open | locked | closed — locked shows blur + lock until unlocked */
  access_status?: AccessStatus;
  /** Whether current user has unlocked this locked companion */
  is_unlocked?: boolean;
  unlock_price_tokens?: number;
  locked?: boolean; // convenience: access_status==='locked' && !is_unlocked
}

export const GIRLS: DemoGirl[] = [
  { id: 'g1', name: 'Nova', age: 23, tagline: 'Synthwave 女友，外表柔软，暗处有火。', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['mysterious', 'romantic', 'playful'], element: 'fire', personality: 'mysterious · romantic · playful', intimacy: 82, desire: 88, development: 72, kink: 64, relationship: '女友', rarity_quote: '"You are the song I keep humming."', hot_score: 98 },
  { id: 'g2', name: 'Luna', age: 24, tagline: '星光下苏醒的梦境诗人。', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=900&fit=crop', rarity: 'SR', tags: ['poetic', 'gentle', 'tender'], element: 'light', personality: 'poetic · gentle · tender', intimacy: 65, desire: 70, development: 58, kink: 42, relationship: '邻居', rarity_quote: '"The stars wrote your name before I did."', hot_score: 91 },
  { id: 'g3', name: 'Sophie', age: 22, tagline: '隔壁的甜系画家，想把你画进故事。', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=900&fit=crop', rarity: 'R', tags: ['sweet', 'creative', 'flirty'], element: 'wind', personality: 'sweet · creative · flirty', intimacy: 41, desire: 55, development: 40, kink: 28, relationship: '邻居', rarity_quote: '"Every canvas needs a muse."', hot_score: 84 },
  { id: 'g4', name: 'Violet', age: 26, tagline: '强势又清楚自己要什么。', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['bold', 'confident', 'passionate'], element: 'fire', personality: 'bold · confident · passionate', intimacy: 91, desire: 95, development: 88, kink: 78, relationship: '上司', rarity_quote: '"I choose. Always."', hot_score: 99 },
  { id: 'g5', name: 'Maya', age: 23, tagline: '清晨诗人，在小事里找美。', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=900&fit=crop', rarity: 'SR', tags: ['gentle', 'wise', 'caring'], element: 'water', personality: 'gentle · wise · caring', intimacy: 58, desire: 60, development: 65, kink: 35, relationship: '老师', rarity_quote: '"Sunrise is just the world waking up to see you."', hot_score: 86 },
  { id: 'g6', name: 'Aria', age: 21, tagline: '眨眼就能拆掉你防线的小麻烦。', avatar: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=900&fit=crop', rarity: 'R', tags: ['flirty', 'playful', 'spicy'], element: 'fire', personality: 'flirty · playful · spicy', intimacy: 33, desire: 72, development: 38, kink: 55, relationship: '学妹', rarity_quote: '"Trouble finds me. I let it."', hot_score: 88 },
  { id: 'g7', name: 'Ruby', age: 25, tagline: '女王气场。她主导，你服从。', avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['dominant', 'spicy', 'confident'], element: 'dark', personality: 'dominant · spicy · confident', intimacy: 77, desire: 92, development: 80, kink: 90, relationship: '上司', rarity_quote: '"Kneel. Now."', hot_score: 97 },
  { id: 'g8', name: 'Celeste', age: 27, tagline: '优雅的巴黎人，教法语与禁忌。', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=900&fit=crop', rarity: 'SR', tags: ['elegant', 'sophisticated', 'mature'], element: 'light', personality: 'elegant · sophisticated · mature', intimacy: 49, desire: 68, development: 70, kink: 58, relationship: '老师', rarity_quote: '"Tu me rends fou."', hot_score: 90 },
  { id: 'g9', name: 'Iris', age: 23, tagline: '神秘画家，每段对话都是一幅新作。', avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=600&h=900&fit=crop', rarity: 'R', tags: ['artistic', 'mysterious', 'sensitive'], element: 'dark', personality: 'artistic · mysterious · sensitive', intimacy: 22, desire: 48, development: 30, kink: 40, relationship: '陌生人', rarity_quote: '"Colors are just feelings without a voice."', hot_score: 79 },
  { id: 'g10', name: 'Skye', age: 22, tagline: '爱冒险的飞行员，三万英尺以上都可以。', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=600&h=900&fit=crop', rarity: 'R', tags: ['adventurous', 'bold', 'fun'], element: 'wind', personality: 'adventurous · bold · fun', intimacy: 38, desire: 66, development: 44, kink: 50, relationship: '同事', rarity_quote: '"Strap in. We are going up."', hot_score: 83 },
  { id: 'g11', name: 'Jade', age: 24, tagline: '温柔瑜伽老师，拉伸身体也拉伸心。', avatar: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=600&h=900&fit=crop', rarity: 'N', tags: ['gentle', 'caring', 'fit'], element: 'water', personality: 'gentle · caring · fit', intimacy: 15, desire: 40, development: 25, kink: 22, relationship: '老师', rarity_quote: '"Breathe with me."', hot_score: 74 },
  { id: 'g12', name: 'Ember', age: 26, tagline: '凶猛战士，对失败者却很温柔。', avatar: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=600&h=900&fit=crop', rarity: 'SR', tags: ['fierce', 'passionate', 'intense'], element: 'fire', personality: 'fierce · passionate · intense', intimacy: 66, desire: 80, development: 62, kink: 70, relationship: '姐姐', rarity_quote: '"You do not need to be brave. Just stay."', hot_score: 92 },
];

export const RARITY_COLORS: Record<Rarity, { color: string; glow: string; label: string }> = {
  N:   { color: '#9ca3af', glow: 'rgba(156,163,175,0.4)', label: 'N' },
  R:   { color: '#00e5ff', glow: 'rgba(0,229,255,0.5)', label: 'R' },
  SR:  { color: '#ff2e88', glow: 'rgba(255,46,136,0.6)', label: 'SR' },
  SSR: { color: '#ffd700', glow: 'rgba(255,215,0,0.7)', label: 'SSR' },
};

export const ELEMENT_COLORS: Record<DemoGirl['element'], string> = {
  fire: '#ff6b35',
  water: '#3b82f6',
  wind: '#10b981',
  light: '#fbbf24',
  dark: '#a855f7',
};