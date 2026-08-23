export const APP_NAME = 'Oxmate AI';
export const APP_TAGLINE = 'Your AI girlfriend — intimate, uncensored, always yours';
export const APP_DESCRIPTION = 'Experience the future of AI companionship with Oxmate AI. Create your perfect AI girlfriend, chat raw and intimate, unlock Desire heat, and stay for the next message.';
export const APP_DOMAIN = 'oxmate-ai.com';
export const APP_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) ||
  'https://www.oxmate-ai.com';
export const SUPPORT_EMAIL = 'support@oxmate-ai.com';
export const PRIVACY_EMAIL = 'privacy@oxmate-ai.com';

/**
 * Membership tiers — unified Credits model for all GPU media (image / video / TTS).
 *
 * FREE: chat-only tier (20 msgs/day) + one-time 50-credit trial pack, 3 companions.
 *       No creation, no generation — official preset companions only.
 * PRO ($9.99/mo): 100 msgs/day, 1000 Credits/mo, 3 creations/mo, 10 companions, no video.
 * PREMIUM ($19.99/mo): 200 msgs/day, 2000 Credits/mo, 6 creations/mo, 20 companions, video unlocked.
 * UNLIMITED ($34.99/mo): fair-use unlimited chat, 3500 Credits/mo, 10 creations/mo, video.
 *
 * All media generation (image/TTS/NSFW/video) consumes Credits for every paid tier.
 * Prices tax-exclusive; customer pays tax at checkout.
 * Billing: monthly or yearly only. Yearly discounts: Pro 17%, Premium 17%, Unlimited 20%.
 */
export const MEMBERSHIP_TIERS = {
  free: {
    name: 'Free',
    price_cents: 0,
    yearly_price_cents: 0,
    messages_per_day: 20,
    memory_depth: 'shallow' as const,
    max_girlfriends: 3,
    outfit_access: 'basic' as const,
    context_window: 8192,
    monthly_credits: 0,
    starter_credits: 50, // one-time trial pack
    monthly_creations: 0, // chat-only tier — no companion creation
    video_gen: false, // video requires Premium+
    proactive_slots: 1, // night-only (good night message)
    quest_reward_multiplier: 1,
  },
  pro: {
    name: 'Pro',
    price_cents: 999,
    yearly_price_cents: 9999, // $99.99/yr = 17% off 12 x $9.99 ($8.33/mo equivalent)
    messages_per_day: 100,
    memory_depth: 'deep' as const,
    max_girlfriends: 10,
    outfit_access: 'premium' as const,
    context_window: 16384,
    monthly_credits: 1000, // gifted monthly credits for image/TTS usage
    starter_credits: 0,
    monthly_creations: 3,
    video_gen: false, // video requires Premium+
    proactive_slots: 4, // all time slots
    quest_reward_multiplier: 1.5,
  },
  premium: {
    name: 'Premium',
    price_cents: 1999,
    yearly_price_cents: 19999, // $199.99/yr = 17% off 12 x $19.99 ($16.66/mo equivalent)
    messages_per_day: 200,
    memory_depth: 'deep' as const,
    max_girlfriends: 20,
    outfit_access: 'all' as const,
    context_window: 24576,
    monthly_credits: 2000, // gifted monthly credits for image/TTS/video usage
    starter_credits: 0,
    monthly_creations: 6,
    video_gen: true, // video access via Credits
    proactive_slots: 4, // all time slots + priority queue
    quest_reward_multiplier: 1.75,
  },
  unlimited: {
    name: 'Unlimited',
    price_cents: 3499,
    yearly_price_cents: 29999, // $299.99/yr = 20% off 12 x $34.99 ($24.99/mo equivalent)
    messages_per_day: -1, // fair-use unlimited
    memory_depth: 'infinite' as const,
    max_girlfriends: -1,
    outfit_access: 'all' as const,
    context_window: 32768,
    monthly_credits: 3500, // gifted monthly credits for image/TTS/video usage
    starter_credits: 0,
    monthly_creations: 10,
    video_gen: true, // video access via Credits
    proactive_slots: 4, // all time slots + AI-personalized generation
    quest_reward_multiplier: 2,
  },
} as const;

/** Companion creation monthly quota by tier (legacy basic → pro). */
export function monthlyCreationLimit(tier: string): number {
  if (tier === 'unlimited' || tier === 'admin') return MEMBERSHIP_TIERS.unlimited.monthly_creations;
  if (tier === 'premium') return MEMBERSHIP_TIERS.premium.monthly_creations;
  if (tier === 'pro' || tier === 'basic') return MEMBERSHIP_TIERS.pro.monthly_creations;
  return 0;
}

/** Paid tiers that can generate video (credits still apply). */
export function canGenerateVideo(tier: string): boolean {
  return tier === 'premium' || tier === 'unlimited' || tier === 'admin';
}

/** Whether the tier may create companions / use generation surfaces at all. */
export function canAccessGeneration(tier: string): boolean {
  return tier !== 'free';
}

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
  // Legacy 'basic' users are grandfathered to the Pro limit
  // (same normalization as /api/membership).
  if (tier === 'pro' || tier === 'basic') {
    return MEMBERSHIP_TIERS.pro.max_girlfriends;
  }
  if (tier === 'premium') {
    return MEMBERSHIP_TIERS.premium.max_girlfriends;
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

/** Generation timeout configurations */
export const ENDPOINT_TIMEOUT_MS = 300000;        // 5 minutes for general endpoints
export const SDXL_TIMEOUT_MS = 300000;            // 5 minutes for SDXL generation
export const CLOUD_TIMEOUT_MS = 180000;           // 3 minutes for cloud fallback
export const IMAGE_CACHE_MINUTES = 7;             // 7 days TTL for image cache

export const STRIPE_PRICE_IDS = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
  unlimited: process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || '',
} as const;