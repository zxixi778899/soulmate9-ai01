/**
 * SoulMate9 商城系统扩展 - 数据库表定义
 *
 * 新增表：
 * 1. user_tokens - 用户代币余额与消费记录
 * 2. token_packages - 代币套餐定价
 * 3. token_transactions - 代币消耗记录
 * 4. achievements - 成就定义
 * 5. user_achievements - 用户成就进度
 * 6. intimacy_level_unlocks - 亲密度等级解锁配置
 * 7. prize_pool - 大奖兑换池
 * 8. wardrobe_outfit_combinations - 装扮组合（多件衣服组合）
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  timestamp,
  varchar,
  boolean,
  integer,
  jsonb,
  text,
  numeric,
  date,
  index,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";

// ====== 代币系统 ======

/**
 * user_tokens - 用户代币余额
 * 实时更新用户的代币剩余数量、月度消费统计
 */
export const userTokens = pgTable(
  "user_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .unique(),
    balance_tokens: bigint("balance_tokens", { mode: "number" }).default(0).notNull(),
    lifetime_tokens_earned: bigint("lifetime_tokens_earned", { mode: "number" }).default(0).notNull(),
    lifetime_tokens_spent: bigint("lifetime_tokens_spent", { mode: "number" }).default(0).notNull(),
    monthly_tokens_spent: bigint("monthly_tokens_spent", { mode: "number" }).default(0).notNull(),
    monthly_spent_reset_date: date("monthly_spent_reset_date"),
    last_updated_at: timestamp("last_updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_tokens_user_id_idx").on(table.user_id),
  ]
);

/**
 * token_packages - 代币购买套餐
 * 定义不同的代币充值选项与折扣
 */
export const tokenPackages = pgTable(
  "token_packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 64 }).notNull(), // e.g., "100 Tokens"
    token_count: integer("token_count").notNull(),
    price_cents: integer("price_cents").notNull(), // 价格（美分）
    discount_percent: integer("discount_percent").default(0).notNull(),
    description: text("description"),
    is_featured: boolean("is_featured").default(false).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("token_packages_active_idx").on(table.is_active),
    index("token_packages_sort_idx").on(table.sort_order),
  ]
);

/**
 * token_transactions - 代币交易日志
 * 记录每笔代币的收入/消费（用于审计与排查）
 */
export const tokenTransactions = pgTable(
  "token_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    transaction_type: varchar("transaction_type", { length: 32 }).notNull(), // 'earn', 'spend', 'refund', 'gift'
    amount_tokens: bigint("amount_tokens", { mode: "number" }).notNull(),
    reason: varchar("reason", { length: 128 }).notNull(), // 'subscription_bonus', 'image_generation', 'outfit_purchase', etc.
    related_entity_type: varchar("related_entity_type", { length: 32 }), // 'outfit', 'image_generation', 'achievement', etc.
    related_entity_id: uuid("related_entity_id"),
    balance_after: bigint("balance_after", { mode: "number" }).notNull(),
    metadata: jsonb("metadata"), // 存储任意额外信息
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("token_transactions_user_id_idx").on(table.user_id),
    index("token_transactions_type_idx").on(table.transaction_type),
    index("token_transactions_created_at_idx").on(table.created_at),
  ]
);

// ====== 亲密度与解锁 ======

/**
 * intimacy_level_unlocks - 亲密度等级解锁配置
 * 定义每个亲密度等级解锁的功能与内容
 */
export const intimacyLevelUnlocks = pgTable(
  "intimacy_level_unlocks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    level: integer("level").notNull().unique(), // 1-6
    level_name: varchar("level_name", { length: 32 }).notNull(), // 'Stranger', 'Friend', 'Intimate'
    unlock_features: jsonb("unlock_features").notNull(), // ['nsfw_chat', 'advanced_avatar', 'language_preferences']
    reward_tokens: integer("reward_tokens").default(0).notNull(),
    requirement_score: integer("requirement_score").notNull(),
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intimacy_level_unlocks_level_idx").on(table.level),
  ]
);

// ====== 成就系统 ======

/**
 * achievements - 成就定义
 * 定义全部可能的成就、其触发条件、奖励等
 */
export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 64 }).notNull().unique(), // 'first_chat', 'message_100', 'collector_10'
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 32 }).notNull(), // 'interaction', 'collection', 'spending', 'social'
    icon_url: text("icon_url"),
    reward_tokens: integer("reward_tokens").default(0).notNull(),
    reward_title: varchar("reward_title", { length: 64 }), // e.g., "Chat Master"
    condition_type: varchar("condition_type", { length: 64 }).notNull(), // 'message_count', 'image_count', 'intimacy_level'
    condition_value: integer("condition_value").notNull(), // e.g., 100 (for message_count)
    rarity: varchar("rarity", { length: 32 }).default("common").notNull(), // 'common', 'rare', 'epic', 'legendary'
    sort_order: integer("sort_order").default(0).notNull(),
    is_hidden: boolean("is_hidden").default(false).notNull(), // 隐藏成就（达成前不显示）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("achievements_code_idx").on(table.code),
    index("achievements_category_idx").on(table.category),
  ]
);

/**
 * user_achievements - 用户成就进度
 * 记录用户已解锁的成就及其进度
 */
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    achievement_id: uuid("achievement_id").notNull(),
    progress_value: integer("progress_value").default(0).notNull(), // e.g., 45/100 for message_count
    unlocked: boolean("unlocked").default(false).notNull(),
    unlocked_at: timestamp("unlocked_at", { withTimezone: true }),
    reward_claimed: boolean("reward_claimed").default(false).notNull(),
    reward_claimed_at: timestamp("reward_claimed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_achievements_user_id_idx").on(table.user_id),
    index("user_achievements_achievement_id_idx").on(table.achievement_id),
    index("user_achievements_user_achievement_unique_idx").on(table.user_id, table.achievement_id),
  ]
);

// ====== 大奖系统 ======

/**
 * prize_pool - 用户大奖资格与中奖记录
 * 记录用户何时符合大奖条件，是否中奖，兑换状态等
 */
export const prizePool = pgTable(
  "prize_pool",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    month: date("month").notNull(), // 月份记录（用于月度大奖）
    tier: varchar("tier", { length: 32 }).notNull(), // 'gold' (iPhone), 'silver' (AirPods), 'bronze' (voucher)
    eligibility_reason: varchar("eligibility_reason", { length: 128 }).notNull(), // 'high_spending', 'subscription_annual', 'top100_intimacy'
    earned_tokens: bigint("earned_tokens", { mode: "number" }).default(0).notNull(),
    lifetime_spent_usd: numeric("lifetime_spent_usd", { precision: 10, scale: 2 }).default("0").notNull(),
    is_winner: boolean("is_winner").default(false).notNull(),
    won_at: timestamp("won_at", { withTimezone: true }),
    claim_status: varchar("claim_status", { length: 32 }), // 'pending', 'claimed', 'shipped', 'received'
    claimed_at: timestamp("claimed_at", { withTimezone: true }),
    shipping_address: jsonb("shipping_address"), // { street, city, state, zip, country, name }
    tracking_number: varchar("tracking_number", { length: 128 }),
    admin_notes: text("admin_notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("prize_pool_user_id_idx").on(table.user_id),
    index("prize_pool_month_idx").on(table.month),
    index("prize_pool_is_winner_idx").on(table.is_winner),
  ]
);

// ====== 装扮与换装 ======

/**
 * wardrobe_outfit_combinations - 装扮组合
 * 不仅有单个outfit，还可以组合成"完整Look"
 */
export const wardrobeOutfitCombinations = pgTable(
  "wardrobe_outfit_combinations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    girlfriend_id: uuid("girlfriend_id").notNull(),
    name: varchar("name", { length: 128 }).notNull(), // 'School Uniform', 'Beach Casual'
    description: text("description"),
    outfit_ids: jsonb("outfit_ids").notNull(), // [outfit_id1, outfit_id2, ...] 组合的所有outfit
    preview_image_url: text("preview_image_url"), // 完整装扮的预览图
    price_tokens: integer("price_tokens").notNull(), // 整个组合的价格（可能低于单件相加）
    tier: varchar("tier", { length: 20 }).default("common").notNull(),
    min_intimacy_level: integer("min_intimacy_level").default(1).notNull(),
    limited_until: timestamp("limited_until", { withTimezone: true }), // 限时装扮的截止时间
    category: varchar("category", { length: 32 }).notNull(), // 'casual', 'formal', 'seasonal', 'event'
    is_featured: boolean("is_featured").default(false).notNull(),
    sort_order: integer("sort_order").default(0).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("wardrobe_outfit_combinations_gf_idx").on(table.girlfriend_id),
    index("wardrobe_outfit_combinations_tier_idx").on(table.tier),
  ]
);

/**
 * user_purchased_combinations - 用户已购买的装扮组合
 */
export const userPurchasedCombinations = pgTable(
  "user_purchased_combinations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    girlfriend_id: uuid("girlfriend_id").notNull(),
    combination_id: uuid("combination_id").notNull(),
    is_equipped: boolean("is_equipped").default(false).notNull(),
    purchased_at: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_purchased_combinations_user_id_idx").on(table.user_id),
    index("user_purchased_combinations_gf_idx").on(table.girlfriend_id),
    index("user_purchased_combinations_unique_idx").on(table.user_id, table.girlfriend_id, table.combination_id),
  ]
);

// ====== 预设角色库 ======

/**
 * featured_girlfriends - 首页推荐预设角色
 * 用于首页展示8-10个热门角色，用户可直接进入聊天
 */
export const featuredGirlfriends = pgTable(
  "featured_girlfriends",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    base_girlfriend_id: uuid("base_girlfriend_id"), // 指向真实girlfriend表（如果是基于现有角色）
    name: varchar("name", { length: 64 }).notNull(),
    subtitle: varchar("subtitle", { length: 128 }), // 一句人设描述，如 "Mysterious night spirit"
    personality_tags: jsonb("personality_tags").notNull(), // ['mysterious', 'sweet', 'playful']
    avatar_url: text("avatar_url").notNull(),
    quick_chat_enabled: boolean("quick_chat_enabled").default(true).notNull(), // 是否允许未注册用户快速聊天
    description: text("description"),
    greeting_message: text("greeting_message"),
    sort_order: integer("sort_order").default(0).notNull(),
    click_count: integer("click_count").default(0).notNull(), // 统计热度
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("featured_girlfriends_sort_idx").on(table.sort_order),
    index("featured_girlfriends_active_idx").on(table.is_active),
  ]
);

/**
 * girlfriend_categories - 角色分类标签
 * 用于角色库的分类浏览（按性格、身材、气质等）
 */
export const girlfriendCategories = pgTable(
  "girlfriend_categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    girlfriend_id: uuid("girlfriend_id").notNull(),
    category_type: varchar("category_type", { length: 32 }).notNull(), // 'personality', 'body_type', 'vibe'
    category_value: varchar("category_value", { length: 64 }).notNull(), // 'gentle', 'sporty', 'ethereal'
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("girlfriend_categories_gf_idx").on(table.girlfriend_id),
    index("girlfriend_categories_type_idx").on(table.category_type),
    index("girlfriend_categories_value_idx").on(table.category_value),
  ]
);

