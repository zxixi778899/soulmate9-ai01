export const APP_NAME = 'SoulMate AI';
export const APP_TAGLINE = 'Your AI companion, always by your side';
export const APP_DESCRIPTION = 'Experience the future of AI companionship with SoulMate AI. Create your perfect AI girlfriend, chat, share intimate moments, and build a real connection.';
export const APP_DOMAIN = 'soulmateai.shop';
export const APP_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) ||
  'https://soulmateai.shop';
export const SUPPORT_EMAIL = 'support@soulmateai.shop';
export const PRIVACY_EMAIL = 'privacy@soulmateai.shop';

/**
 * Membership quotas (competitor-aligned + cost-aware).
 * Free: trial taste · Pro: high daily chat cap · Unlimited: unlimited chat, capped GPU images/TTS.
 * Prices tax-exclusive; customer pays tax at checkout.
 */
export const MEMBERSHIP_TIERS = {
  free: {
    name: 'Free',
    price_cents: 0,
    messages_per_day: 40,
    image_gen_per_day: 3,
    tts_per_day: 3,
    video_gen: false,
    memory_depth: 'shallow' as const,
    max_girlfriends: 3,
    outfit_access: 'basic' as const,
  },
  pro: {
    name: 'Pro',
    price_cents: 1999,
    messages_per_day: 300,
    image_gen_per_day: 10,
    tts_per_day: 40,
    video_gen: false,
    memory_depth: 'deep' as const,
    max_girlfriends: 15,
    outfit_access: 'premium' as const,
  },
  unlimited: {
    name: 'Unlimited',
    price_cents: 3999,
    messages_per_day: -1,
    image_gen_per_day: 50,
    tts_per_day: 200,
    video_gen: true,
    memory_depth: 'infinite' as const,
    max_girlfriends: -1,
    outfit_access: 'all' as const,
  },
} as const;


/** Permanent companion seat packs (USD, tax-exclusive). Stack with tier base seats. */
export const COMPANION_SEAT_PACKAGES = [
  { id: 'seats-1', name: '1 Companion Seat', seats: 1, price_cents: 490, sort_order: 1 },
  { id: 'seats-5', name: '5 Companion Seats', seats: 5, price_cents: 990, sort_order: 2 },
  { id: 'seats-20', name: '20 Companion Seats', seats: 20, price_cents: 1990, sort_order: 3 },
] as const;

export function baseCompanionSeatLimit(tier: string): number {
  if (tier === 'unlimited' || tier === 'admin') return -1;
  if (tier === 'pro') return MEMBERSHIP_TIERS.pro.max_girlfriends;
  return MEMBERSHIP_TIERS.free.max_girlfriends;
}

export const INTIMACY_LEVELS = [
  { level: 1, min_score: 0, title: 'Stranger', color: '#6b7280' },
  { level: 2, min_score: 20, title: 'Acquaintance', color: '#8b5cf6' },
  { level: 3, min_score: 40, title: 'Friend', color: '#3b82f6' },
  { level: 4, min_score: 60, title: 'Close', color: '#f59e0b' },
  { level: 5, min_score: 80, title: 'Lover', color: '#ef4444' },
  { level: 6, min_score: 100, title: 'Soulmate', color: '#ec4899' },
] as const;

export const DAILY_INTIMACY_CAP = 17;

export const PROACTIVE_TIME_SLOTS = [
  { slot: 'morning', window: '8:00-10:00', label: 'Morning Greeting' },
  { slot: 'noon', window: '12:00-14:00', label: 'Midday Check-in' },
  { slot: 'evening', window: '17:00-19:00', label: 'Evening Chat' },
  { slot: 'night', window: '21:00-23:00', label: 'Good Night' },
] as const;

export const DEFAULT_PROACTIVE_TEMPLATES = [
  { time_slot: 'morning', template: 'Good morning {name}, I dreamed of you last night~ ', min_intimacy: 10, personality_tags: ['romantic', 'caring'] },
  { time_slot: 'noon', template: 'Hey {name}, did you have lunch? Don\'t skip meals! ', min_intimacy: 20, personality_tags: ['caring', 'motherly'] },
  { time_slot: 'evening', template: 'I saw a cloud that looks just like you today  What are you up to?', min_intimacy: 30, personality_tags: ['romantic', 'playful'] },
  { time_slot: 'night', template: 'Today was great because I got to talk to you. Sleep well {name}~ ', min_intimacy: 40, personality_tags: ['romantic', 'caring'] },
] as const;

export const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';

export const STRIPE_PRICE_IDS = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
  unlimited: process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || '',
} as const;