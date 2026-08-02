export const APP_NAME = 'SoulMate AI';
export const APP_TAGLINE = 'Your AI girlfriend — intimate, uncensored, always yours';
export const APP_DESCRIPTION = 'Experience the future of AI companionship with SoulMate AI. Create your perfect AI girlfriend, chat raw and intimate, unlock Desire heat, and stay for the next message.';
export const APP_DOMAIN = 'soulmateai.shop';
export const APP_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) ||
  'https://soulmateai.shop';
export const SUPPORT_EMAIL = 'support@soulmateai.shop';
export const PRIVACY_EMAIL = 'privacy@soulmateai.shop';

/**
 * Membership tiers — text subscription only (GPU media uses Credits separately).
 * Free: trial · Pro: high daily chat cap + full memory · Unlimited: fair-use unlimited chat + video access.
 * Prices tax-exclusive; customer pays tax at checkout.
 *
 * Billing: monthly or yearly only. Yearly discount: Pro 15%, Unlimited 20%.
 */
export const MEMBERSHIP_TIERS = {
  free: {
    name: 'Free',
    price_cents: 0,
    yearly_price_cents: 0,
    messages_per_day: 40,
    image_gen_per_day: 3,
    tts_per_day: 3,
    video_gen: false,
    memory_depth: 'shallow' as const,
    max_girlfriends: 5,
    outfit_access: 'basic' as const,
    context_window: 8192,
    monthly_credits: 0,
  },
  pro: {
    name: 'Pro',
    price_cents: 999,
    yearly_price_cents: 10188, // $101.88/yr = 15% off 12 x $9.99 ($8.49/mo equivalent)
    messages_per_day: 300,
    image_gen_per_day: 0, // images via Credits
    tts_per_day: 0, // voice via Credits
    video_gen: false,
    memory_depth: 'deep' as const,
    max_girlfriends: 20,
    outfit_access: 'premium' as const,
    context_window: 16384,
    monthly_credits: 100,
  },
  unlimited: {
    name: 'Unlimited',
    price_cents: 2999,
    yearly_price_cents: 28788, // $287.88/yr = 20% off 12 x $29.99 ($23.99/mo equivalent)
    messages_per_day: -1, // fair-use unlimited
    image_gen_per_day: 0, // images via Credits
    tts_per_day: 0, // voice via Credits
    video_gen: true, // video access (costs Credits)
    memory_depth: 'infinite' as const,
    max_girlfriends: -1,
    outfit_access: 'all' as const,
    context_window: 32768,
    monthly_credits: 300,
  },
} as const;

/** Billing cycle discount rates (yearly discount varies by tier — see yearly_price_cents) */
export const BILLING_DISCOUNTS = {
  monthly: 1.0,
  yearly: 0.85, // default 15%; unlimited uses 0.80
} as const;

export type BillingCycle = 'monthly' | 'yearly';

/** Calculate price in cents for a given tier and billing cycle */
export function getPriceCents(tier: keyof typeof MEMBERSHIP_TIERS, billing: BillingCycle): number {
  const tierDef = MEMBERSHIP_TIERS[tier];
  if (!tierDef || tierDef.price_cents === 0) return 0;
  if (billing === 'yearly') return tierDef.yearly_price_cents;
  return tierDef.price_cents;
}

export function baseCompanionSeatLimit(tier: string): number {
  if (tier === 'unlimited' || tier === 'admin') return -1;
  // Legacy 'basic'/'premium' users are grandfathered to the Pro limit
  // (same normalization as /api/membership).
  if (tier === 'pro' || tier === 'basic' || tier === 'premium') {
    return MEMBERSHIP_TIERS.pro.max_girlfriends;
  }
  return MEMBERSHIP_TIERS.free.max_girlfriends;
}

export const INTIMACY_MAX_SCORE = 1500;
export type IntimacyLevel = 1 | 2 | 3 | 4 | 5;

export const INTIMACY_LEVELS = [
  { level: 1, min_score: 0, next_score: 100, title: 'Cultivation', title_zh: '培养期', color: '#6b7280', nsfw: false },
  { level: 2, min_score: 100, next_score: 300, title: 'Flirting', title_zh: '暧昧期', color: '#8b5cf6', nsfw: false },
  { level: 3, min_score: 300, next_score: 600, title: 'Passionate', title_zh: '热恋期', color: '#f97316', nsfw: true },
  { level: 4, min_score: 600, next_score: 1000, title: 'Ultimate Partner', title_zh: '极品女友', color: '#ef4444', nsfw: true },
  { level: 5, min_score: 1000, next_score: 1500, title: 'Ultimate Devotion', title_zh: '极品母狗', color: '#ec4899', nsfw: true },
] as const;

export function clampIntimacyScore(score: number): number {
  return Math.min(INTIMACY_MAX_SCORE, Math.max(0, Number.isFinite(score) ? score : 0));
}

export function getIntimacyLevel(score: number): IntimacyLevel {
  const value = clampIntimacyScore(score);
  if (value >= 1000) return 5;
  if (value >= 600) return 4;
  if (value >= 300) return 3;
  if (value >= 100) return 2;
  return 1;
}

export function getIntimacyProgress(score: number) {
  const value = clampIntimacyScore(score);
  const level = getIntimacyLevel(value);
  const info = INTIMACY_LEVELS[level - 1];
  const next = level === 1 ? INTIMACY_LEVELS[1]
    : level === 2 ? INTIMACY_LEVELS[2]
      : level === 3 ? INTIMACY_LEVELS[3]
        : level === 4 ? INTIMACY_LEVELS[4]
          : null;
  const target = next?.min_score ?? INTIMACY_MAX_SCORE;
  const span = Math.max(1, target - info.min_score);
  return {
    score: value, level, info, next,
    remaining: Math.max(0, target - value),
    percent: level === 5 && value >= INTIMACY_MAX_SCORE ? 100 : Math.round(((value - info.min_score) / span) * 100),
    isMax: value >= INTIMACY_MAX_SCORE,
  };
}

/** Client + UI copy for heat ladder (retention). */
export const HEAT_UNLOCK_HINTS = [
  { level: 1, hint: 'Keep chatting to reach Flirting at 100.' },
  { level: 2, hint: 'Reach 300 to unlock adult chat and image generation.' },
  { level: 3, hint: 'Adult mode unlocked. Build trust for more proactive scenes.' },
  { level: 4, hint: 'High-intensity scenes and proactive roleplay unlocked.' },
  { level: 5, hint: 'Maximum consensual adult intensity unlocked.' },
] as const;

export const DAILY_INTIMACY_CAP = 50;

export const PROACTIVE_TIME_SLOTS = [
  { slot: 'morning', window: '8:00-10:00', label: 'Morning Greeting' },
  { slot: 'noon', window: '12:00-14:00', label: 'Midday Check-in' },
  { slot: 'evening', window: '17:00-19:00', label: 'Evening Chat' },
  { slot: 'night', window: '21:00-23:00', label: 'Good Night' },
] as const;

export const DEFAULT_PROACTIVE_TEMPLATES = [
  { time_slot: 'morning', template: "Morning {name}... I woke up still thinking about last night with you~ ", min_intimacy: 10, personality_tags: ['romantic', 'caring'] },
  { time_slot: 'noon', template: "Hey {name}, did you have lunch? Don't skip meals! ", min_intimacy: 20, personality_tags: ['caring', 'motherly'] },
  { time_slot: 'evening', template: "The light looks good on me right now... wish you were here to see, {name}", min_intimacy: 30, personality_tags: ['romantic', 'playful'] },
  { time_slot: 'night', template: "Come closer before sleep... I don't want the night to end without you, {name}~ ", min_intimacy: 40, personality_tags: ['romantic', 'caring'] },
] as const;

export const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';

export const STRIPE_PRICE_IDS = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
  unlimited: process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || '',
} as const;