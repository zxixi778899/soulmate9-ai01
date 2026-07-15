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
  date,
  index,
  uniqueIndex,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";

//   
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

//  extends auth.users 
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull()
      .unique(),
    username: varchar("username", { length: 64 }),
    avatar_url: text("avatar_url"),
    membership_tier: varchar("membership_tier", { length: 20 }).default("free").notNull(),
    role: varchar("role", { length: 20 }).default('user').notNull(),
    credits_remaining: integer("credits_remaining").default(50).notNull(),
    extra_girlfriend_slots: integer("extra_girlfriend_slots").default(0).notNull(),
    age_verified: boolean("age_verified").default(false).notNull(),
    age_verified_at: timestamp("age_verified_at", { withTimezone: true }),
    nsfw_enabled: boolean("nsfw_enabled").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("profiles_user_id_idx").on(table.user_id)]
);

//   
export const girlfriends = pgTable(
  "girlfriends",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    personality: text("personality"),
    backstory: text("backstory"),
    appearance_race: varchar("appearance_race", { length: 32 }),
    appearance_hair: varchar("appearance_hair", { length: 32 }),
    appearance_hair_color: varchar("appearance_hair_color", { length: 32 }),
    appearance_eyes: varchar("appearance_eyes", { length: 32 }),
    appearance_body: varchar("appearance_body", { length: 32 }),
    appearance_style: varchar("appearance_style", { length: 32 }),
    voice_id: varchar("voice_id", { length: 128 }),
    character_card: jsonb("character_card"),
    avatar_url: text("avatar_url"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("girlfriends_user_id_idx").on(table.user_id),
    index("girlfriends_created_at_idx").on(table.created_at),
  ]
);

//   
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    girlfriend_id: uuid("girlfriend_id")
      .notNull(),
    role: varchar("role", { length: 16 }).notNull().default("user"),
    content: text("content"),
    media_url: text("media_url"),
    media_type: varchar("media_type", { length: 16 }),
    is_proactive: boolean("is_proactive").default(false).notNull(),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_user_id_idx").on(table.user_id),
    index("chat_messages_girlfriend_id_idx").on(table.girlfriend_id),
    index("chat_messages_created_at_idx").on(table.created_at),
    index("chat_messages_gf_created_idx").on(table.girlfriend_id, table.created_at),
  ]
);

//   
export const intimacyScores = pgTable(
  "intimacy_scores",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    girlfriend_id: uuid("girlfriend_id")
      .notNull(),
    score: integer("score").default(0).notNull(),
    level: integer("level").default(1).notNull(),
    last_interacted_at: timestamp("last_interacted_at", { withTimezone: true }),
    daily_message_count: integer("daily_message_count").default(0).notNull(),
    daily_score_gained: integer("daily_score_gained").default(0).notNull(),
    last_daily_reset: date("last_daily_reset"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("intimacy_scores_user_id_idx").on(table.user_id),
    index("intimacy_scores_girlfriend_id_idx").on(table.girlfriend_id),
    index("intimacy_scores_user_gf_unique_idx").on(table.user_id, table.girlfriend_id),
  ]
);

//  / 
export const outfits = pgTable(
  "outfits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    price_cents: integer("price_cents").notNull().default(0),
    tier: varchar("tier", { length: 20 }).default("free").notNull(),
    preview_url: text("preview_url"),
    category: varchar("category", { length: 32 }).notNull(),
    intimacy_boost: integer("intimacy_boost").default(0).notNull(),
    is_gift: boolean("is_gift").default(false).notNull(),
    is_limited: boolean("is_limited").default(false).notNull(),
    stock_limit: integer("stock_limit"),
    stock_remaining: integer("stock_remaining"),
    comfyui_workflow: jsonb("comfyui_workflow"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outfits_category_idx").on(table.category),
    index("outfits_tier_idx").on(table.tier),
  ]
);

//   
export const shopItems = pgTable(
  "shop_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    price_cents: integer("price_cents").notNull(),
    image_url: text("image_url"),
    intimacy_boost: integer("intimacy_boost").default(0).notNull(),
    item_type: varchar("item_type", { length: 32 }).notNull().default("intimacy_boost"),
    effect_type: varchar("effect_type", { length: 32 }),
    effect_value: jsonb("effect_value"),
    is_limited: boolean("is_limited").default(false).notNull(),
    weekly_purchase_limit: integer("weekly_purchase_limit"),
    category: varchar("category", { length: 32 }).default("gift").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("shop_items_type_idx").on(table.item_type)]
);

/** Live-room chat gifts with per-gift visual FX (admin-managed) */
export const chatGifts = pgTable(
  "chat_gifts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    emoji: varchar("emoji", { length: 16 }).notNull().default("🎁"),
    icon_url: text("icon_url"),
    cost_tokens: integer("cost_tokens").notNull().default(1),
    intimacy_boost: integer("intimacy_boost").notNull().default(1),
    effect_type: varchar("effect_type", { length: 32 }).notNull().default("float_emoji"),
    effect_config: jsonb("effect_config").notNull().default({}),
    effect_asset_url: text("effect_asset_url"),
    sort_order: integer("sort_order").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("chat_gifts_active_sort_idx").on(table.is_active, table.sort_order)],
);

//   
export const wardrobe = pgTable(
  "wardrobe",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    girlfriend_id: uuid("girlfriend_id")
      .notNull(),
    outfit_id: uuid("outfit_id")
      .notNull(),
    is_equipped: boolean("is_equipped").default(false).notNull(),
    purchased_at: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("wardrobe_user_id_idx").on(table.user_id),
    index("wardrobe_girlfriend_id_idx").on(table.girlfriend_id),
    index("wardrobe_user_gf_unique_idx").on(table.user_id, table.girlfriend_id, table.outfit_id),
  ]
);

//   
export const userActiveItems = pgTable(
  "user_active_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    girlfriend_id: uuid("girlfriend_id")
      .notNull(),
    item_id: uuid("item_id")
      .notNull(),
    effect_type: varchar("effect_type", { length: 32 }).notNull(),
    effect_value: jsonb("effect_value"),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    used_at: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_active_items_user_id_idx").on(table.user_id),
    index("user_active_items_girlfriend_id_idx").on(table.girlfriend_id),
  ]
);

//   
export const cryptoPayments = pgTable(
  "crypto_payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    plan_id: varchar("plan_id", { length: 32 }).notNull(),
    amount_usd: integer("amount_usd").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USDT"),
    wallet_address: text("wallet_address").notNull(),
    tx_hash: varchar("tx_hash", { length: 255 }),
    amount_received: varchar("amount_received", { length: 50 }),
    status: varchar("status", { length: 32 }).notNull().default("awaiting_payment"),
    screenshot_url: text("screenshot_url"),
    admin_notes: text("admin_notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("crypto_payments_user_id_idx").on(table.user_id),
    index("crypto_payments_status_idx").on(table.status),
  ]
);

//   
export const proactiveMessageTemplates = pgTable(
  "proactive_message_templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    time_slot: varchar("time_slot", { length: 16 }).notNull(),
    template: text("template").notNull(),
    min_intimacy: integer("min_intimacy").default(0).notNull(),
    personality_tags: text("personality_tags"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("proactive_templates_slot_idx").on(table.time_slot)]
);

//   
export const proactiveMessageLog = pgTable(
  "proactive_message_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    girlfriend_id: uuid("girlfriend_id")
      .notNull(),
    message_id: uuid("message_id"),
    time_slot: varchar("time_slot", { length: 16 }).notNull(),
    replied: boolean("replied").default(false).notNull(),
    sent_at: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("proactive_log_user_gf_slot_idx").on(table.user_id, table.girlfriend_id, table.time_slot),
    index("proactive_log_sent_at_idx").on(table.sent_at),
  ]
);

//  Stripe  
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    stripe_subscription_id: varchar("stripe_subscription_id", { length: 255 }).unique(),
    stripe_customer_id: varchar("stripe_customer_id", { length: 255 }),
    stripe_price_id: varchar("stripe_price_id", { length: 255 }),
    unit_amount_cents: integer("unit_amount_cents"),
    currency: varchar("currency", { length: 8 }),
    billing_interval: varchar("billing_interval", { length: 16 }),
    billing_interval_count: integer("billing_interval_count"),
    plan_id: varchar("plan_id", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("incomplete"),
    current_period_end: timestamp("current_period_end", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.user_id),
    index("subscriptions_stripe_id_idx").on(table.stripe_subscription_id),
  ]
);

//   
export const purchaseHistory = pgTable(
  "purchase_history",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id")
      .notNull(),
    item_type: varchar("item_type", { length: 32 }).notNull(),
    item_id: uuid("item_id"),
    stripe_payment_intent_id: varchar("stripe_payment_intent_id", { length: 255 }),
    payment_event_id: varchar("payment_event_id", { length: 255 }),
    amount_cents: integer("amount_cents").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("completed"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("purchase_history_user_id_idx").on(table.user_id),
    index("purchase_history_stripe_id_idx").on(table.stripe_payment_intent_id),
    uniqueIndex("purchase_history_payment_event_idx").on(table.payment_event_id),
  ]
);

export const aiModelUsageLogs = pgTable(
  "ai_model_usage_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    provider: text("provider").notNull(),
    model_id: text("model_id").notNull(),
    task_type: text("task_type").notNull(),
    user_id: uuid("user_id"),
    girlfriend_id: uuid("girlfriend_id"),
    input_tokens: integer("input_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull().default(0),
    latency_ms: integer("latency_ms").notNull().default(0),
    cost_usd: numeric("cost_usd", { precision: 14, scale: 8 }).notNull().default("0"),
    success: boolean("success").notNull().default(true),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_model_usage_created_idx").on(table.created_at),
    index("ai_model_usage_model_created_idx").on(table.model_id, table.created_at),
    index("ai_model_usage_user_created_idx").on(table.user_id, table.created_at),
  ],
);
