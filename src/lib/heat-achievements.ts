/**
 * Heat / intimacy path achievement definitions.
 * Used as DB seed payload and empty-DB GET fallback.
 */

export interface HeatAchievementDef {
  code: string;
  name: string;
  description: string;
  category: string;
  condition_type: string;
  condition_value: number;
  reward_tokens: number;
  sort_order: number;
  rarity?: string;
  is_hidden?: boolean;
}

export const HEAT_ACHIEVEMENT_DEFS: HeatAchievementDef[] = [
  {
    code: 'first_spark',
    name: 'First Spark',
    description: 'Send your first flirty message',
    category: 'intimacy',
    condition_type: 'message_count',
    condition_value: 1,
    reward_tokens: 5,
    sort_order: 10,
    rarity: 'common',
  },
  {
    code: 'heat_seeker',
    name: 'Heat Seeker',
    description: 'Reach Heat intimacy (Lv3)',
    category: 'intimacy',
    condition_type: 'intimacy_level',
    condition_value: 3,
    reward_tokens: 20,
    sort_order: 20,
    rarity: 'rare',
  },
  {
    code: 'desire_unlocked',
    name: 'Desire Unlocked',
    description: 'Reach Desire intimacy (Lv4)',
    category: 'intimacy',
    condition_type: 'intimacy_level',
    condition_value: 4,
    reward_tokens: 40,
    sort_order: 30,
    rarity: 'rare',
  },
  {
    code: 'all_night',
    name: 'All Night',
    description: 'Send 50 messages in total',
    category: 'interaction',
    condition_type: 'message_count',
    condition_value: 50,
    reward_tokens: 30,
    sort_order: 40,
    rarity: 'epic',
  },
  {
    code: 'soul_fire',
    name: 'Soul Fire',
    description: 'Reach Soulmate intimacy',
    category: 'intimacy',
    condition_type: 'intimacy_level',
    condition_value: 6,
    reward_tokens: 100,
    sort_order: 50,
    rarity: 'legendary',
  },
  {
    code: 'gift_seduction',
    name: 'Gift of Seduction',
    description: 'Buy 3 gifts',
    category: 'consumption',
    condition_type: 'gift_purchases',
    condition_value: 3,
    reward_tokens: 25,
    sort_order: 60,
    rarity: 'rare',
  },
  {
    code: 'heat_messages',
    name: 'After Dark',
    description: 'Send 10 messages while Heat+ intimacy is active',
    category: 'intimacy',
    condition_type: 'nsfw_message_count',
    condition_value: 10,
    reward_tokens: 35,
    sort_order: 45,
    rarity: 'epic',
  },
];

export function heatAchievementsAsCatalogRows(): Array<Record<string, unknown>> {
  return HEAT_ACHIEVEMENT_DEFS.map((d) => ({
    id: `seed-${d.code}`,
    code: d.code,
    name: d.name,
    description: d.description,
    category: d.category,
    icon_url: null,
    reward_tokens: d.reward_tokens,
    reward_title: null,
    condition_type: d.condition_type,
    condition_value: d.condition_value,
    rarity: d.rarity || 'common',
    sort_order: d.sort_order,
    is_hidden: d.is_hidden ?? false,
    created_at: null,
  }));
}
