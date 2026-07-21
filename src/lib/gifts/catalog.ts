/**
 * Live-room chat gifts + visual effect presets.
 * DB rows override these defaults when available.
 */

export type GiftEffectType =
  | 'svga'
  | 'float_emoji'
  | 'heart_rain'
  | 'sparkle'
  | 'rose_petals'
  | 'confetti'
  | 'fireworks'
  | 'rocket'
  | 'crown'
  | 'castle'
  | 'laser'
  | 'gold_shower'
  | 'combo_burst';

export type GiftEffectConfig = {
  duration_ms?: number;
  intensity?: number;
  colors?: string[];
  particle_count?: number;
  sound_url?: string;
  /** SVGA loops (default 1 for live gifts) */
  svga_loops?: number;
};

export type ChatGift = {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string;
  /** Gift icon image (Douyin banner / panel) */
  icon_url?: string | null;
  cost_tokens: number;
  intimacy_boost: number;
  effect_type: GiftEffectType;
  effect_config: GiftEffectConfig;
  /**
   * Full-screen effect asset:
   * - .svga (preferred, Douyin-style)
   * - gif / webm / png fallback
   */
  effect_asset_url?: string | null;
  sort_order: number;
  is_active: boolean;
};

export const GIFT_EFFECT_OPTIONS: Array<{
  value: GiftEffectType;
  label: string;
  desc: string;
}> = [
  { value: 'svga', label: 'SVGA 全屏特效', desc: '抖音直播间风格（需上传 .svga）' },
  { value: 'float_emoji', label: '浮动表情', desc: '大号 emoji 弹跳' },
  { value: 'heart_rain', label: '爱心雨', desc: '满屏飘落爱心' },
  { value: 'sparkle', label: '星光闪烁', desc: '金色/粉色粒子' },
  { value: 'rose_petals', label: '玫瑰花瓣', desc: '花瓣飘落' },
  { value: 'confetti', label: '彩纸庆祝', desc: '五彩纸屑爆炸' },
  { value: 'fireworks', label: '烟花', desc: '放射烟花' },
  { value: 'rocket', label: '火箭冲屏', desc: '自下而上冲天' },
  { value: 'crown', label: '皇冠加冕', desc: '金色光环 + 皇冠' },
  { value: 'castle', label: '城堡终极大招', desc: '全屏华丽特效' },
  { value: 'laser', label: '激光扫光', desc: '霓虹扫射' },
  { value: 'gold_shower', label: '金币雨', desc: '金色粒子雨' },
  { value: 'combo_burst', label: '连击爆发', desc: '连击数字 + 冲击波' },
];

export function isSvgaUrl(url?: string | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase().split('?')[0];
  return u.endsWith('.svga') || u.includes('/svga/') || u.includes('svga');
}

export const DEFAULT_CHAT_GIFTS: ChatGift[] = [
  {
    id: 'seed-rose',
    code: 'rose',
    name: 'Rose',
    description: 'Classic romance',
    emoji: '🌹',
    cost_tokens: 5,
    intimacy_boost: 3,
    effect_type: 'rose_petals',
    effect_config: { duration_ms: 2200, intensity: 0.7, colors: ['#ff2e88', '#ff6ba6', '#f43f5e'] },
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'seed-lollipop',
    code: 'lollipop',
    name: 'Lollipop',
    description: 'Playful sweet',
    emoji: '🍭',
    cost_tokens: 10,
    intimacy_boost: 4,
    effect_type: 'sparkle',
    effect_config: { duration_ms: 2000, intensity: 0.55, colors: ['#f472b6', '#a78bfa'] },
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'seed-chocolate',
    code: 'chocolate',
    name: 'Chocolate',
    description: 'Warm & thoughtful',
    emoji: '🍫',
    cost_tokens: 15,
    intimacy_boost: 5,
    effect_type: 'float_emoji',
    effect_config: { duration_ms: 2000, intensity: 0.5 },
    sort_order: 30,
    is_active: true,
  },
  {
    id: 'seed-perfume',
    code: 'perfume',
    name: 'Perfume',
    description: 'Luxury scent',
    emoji: '🧴',
    cost_tokens: 30,
    intimacy_boost: 8,
    effect_type: 'sparkle',
    effect_config: { duration_ms: 2400, intensity: 0.65, colors: ['#e9d5ff', '#fbcfe8'] },
    sort_order: 40,
    is_active: true,
  },
  {
    id: 'seed-necklace',
    code: 'necklace',
    name: 'Necklace',
    description: 'Elegant gift',
    emoji: '📿',
    cost_tokens: 50,
    intimacy_boost: 10,
    effect_type: 'gold_shower',
    effect_config: { duration_ms: 2600, intensity: 0.7, colors: ['#fbbf24', '#f59e0b'] },
    sort_order: 50,
    is_active: true,
  },
  {
    id: 'seed-teddy',
    code: 'teddy',
    name: 'Teddy',
    description: 'Hug-worthy',
    emoji: '🧸',
    cost_tokens: 60,
    intimacy_boost: 12,
    effect_type: 'heart_rain',
    effect_config: { duration_ms: 2600, intensity: 0.75, colors: ['#ff6ba6', '#ff2e88'] },
    sort_order: 60,
    is_active: true,
  },
  {
    id: 'seed-ring',
    code: 'ring',
    name: 'Promise Ring',
    description: 'Deep commitment',
    emoji: '💍',
    cost_tokens: 100,
    intimacy_boost: 15,
    effect_type: 'sparkle',
    effect_config: { duration_ms: 2800, intensity: 0.85, colors: ['#fde68a', '#fff'] },
    sort_order: 70,
    is_active: true,
  },
  {
    id: 'seed-crown',
    code: 'crown',
    name: 'Crown',
    description: 'Live-room showstopper',
    emoji: '👑',
    cost_tokens: 150,
    intimacy_boost: 25,
    effect_type: 'crown',
    effect_config: { duration_ms: 3000, intensity: 0.9, colors: ['#fbbf24', '#f59e0b', '#fff7ed'] },
    sort_order: 80,
    is_active: true,
  },
  {
    id: 'seed-rocket',
    code: 'rocket',
    name: 'Rocket',
    description: 'Full combo effect',
    emoji: '🚀',
    cost_tokens: 250,
    intimacy_boost: 40,
    effect_type: 'rocket',
    effect_config: { duration_ms: 3200, intensity: 1, colors: ['#38bdf8', '#a78bfa', '#ff2e88'] },
    sort_order: 90,
    is_active: true,
  },
  {
    id: 'seed-castle',
    code: 'castle',
    name: 'Castle',
    description: 'Ultimate live combo',
    emoji: '🏰',
    cost_tokens: 500,
    intimacy_boost: 60,
    effect_type: 'castle',
    effect_config: { duration_ms: 3600, intensity: 1, colors: ['#c026d3', '#ff2e88', '#fbbf24'] },
    sort_order: 100,
    is_active: true,
  },
];

export function isGiftEffectType(v: unknown): v is GiftEffectType {
  return GIFT_EFFECT_OPTIONS.some((o) => o.value === v);
}

export function normalizeGiftRow(row: Record<string, unknown>): ChatGift {
  const asset = (row.effect_asset_url as string) || null;
  let effectType: GiftEffectType = isGiftEffectType(row.effect_type)
    ? row.effect_type
    : 'float_emoji';
  // Auto-promote to svga when asset is .svga
  if (isSvgaUrl(asset)) effectType = 'svga';
  const cfgRaw = row.effect_config;
  const effect_config: GiftEffectConfig =
    cfgRaw && typeof cfgRaw === 'object' && !Array.isArray(cfgRaw)
      ? (cfgRaw as GiftEffectConfig)
      : {};
  return {
    id: String(row.id || row.code || ''),
    code: String(row.code || row.id || ''),
    name: String(row.name || 'Gift'),
    description: String(row.description || ''),
    emoji: String(row.emoji || '🎁').slice(0, 8) || '🎁',
    icon_url: (row.icon_url as string) || null,
    cost_tokens: Math.max(0, Math.round(Number(row.cost_tokens) || 0)),
    intimacy_boost: Math.max(0, Math.round(Number(row.intimacy_boost) || 0)),
    effect_type: effectType,
    effect_config,
    effect_asset_url: asset,
    sort_order: Math.round(Number(row.sort_order) || 0),
    is_active: row.is_active !== false,
  };
}

export function slugifyGiftCode(name: string): string {
  const base = String(name || 'gift')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return base || `gift_${Date.now().toString(36)}`;
}
