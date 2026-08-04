-- 0026 Achievement Expansion (gamification v2)
-- Expands the achievement catalog to ~80 tiered achievements designed to
-- nudge users toward subscription upgrades and credit purchases.
-- Also backfills repo-only DDL that was previously applied by hand.

-- ── Repo integrity: objects that already exist in production ──
ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS notified BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS daily_quest_claims (
  user_id UUID NOT NULL,
  quest_code TEXT NOT NULL,
  quest_date DATE NOT NULL,
  reward_credits INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_code, quest_date)
);

-- ── Achievement catalog upsert (idempotent on code) ──
INSERT INTO achievements (code, name, description, category, reward_tokens, condition_type, condition_value, rarity, sort_order, is_hidden) VALUES
  -- INTERACTION: messages / companions chatted / check-in streaks
  ('first_chat',   'First Words',          'Send your first message',                 'interaction', 5,   'message_count', 1,     'common',    100, false),
  ('chat_10',      'Warming Up',           'Send 10 messages',                        'interaction', 5,   'message_count', 10,    'common',    101, false),
  ('chat_50',      'Chatty Sweetheart',    'Send 50 messages',                        'interaction', 10,  'message_count', 50,    'common',    102, false),
  ('chat_100',     'Getting to Know You',  'Send 100 messages',                       'interaction', 20,  'message_count', 100,   'common',    103, false),
  ('chat_500',     'Deep Conversations',   'Send 500 messages',                       'interaction', 40,  'message_count', 500,   'rare',      104, false),
  ('chat_1000',    'Can''t Stop Talking',  'Send 1,000 messages',                     'interaction', 50,  'message_count', 1000,  'rare',      105, false),
  ('chat_5000',    'Endless Conversations','Send 5,000 messages',                     'interaction', 100, 'message_count', 5000,  'epic',      106, false),
  ('chat_10000',   'Soulbound Chatter',    'Send 10,000 messages',                    'interaction', 300, 'message_count', 10000, 'legendary', 107, false),
  ('partners_2',   'Two Timing',           'Chat with 2 different companions',        'interaction', 10,  'distinct_chat_partners', 2,  'common',    110, false),
  ('partners_3',   'Full House',           'Chat with 3 different companions',        'interaction', 25,  'distinct_chat_partners', 3,  'rare',      111, false),
  ('partners_5',   'Heart Collector',      'Chat with 5 different companions',        'interaction', 80,  'distinct_chat_partners', 5,  'epic',      112, false),
  ('partners_10',  'Grand Harem',          'Chat with 10 different companions',       'interaction', 200, 'distinct_chat_partners', 10, 'legendary', 113, false),
  ('streak_3',     'Three-Day Bond',       'Check in 3 days in a row',                'interaction', 15,  'checkin_streak', 3,   'common',    120, false),
  ('streak_7',     'Seven-Day Devotion',   'Check in 7 days in a row',                'interaction', 40,  'checkin_streak', 7,   'epic',      121, false),
  ('streak_14',    'Fortnight Flame',      'Check in 14 days in a row',               'interaction', 80,  'checkin_streak', 14,  'epic',      122, false),
  ('streak_30',    'Monthly Devotee',      'Check in 30 days in a row',               'interaction', 200, 'checkin_streak', 30,  'legendary', 123, false),
  ('streak_100',   'Century of Love',      'Check in 100 days in a row',              'interaction', 500, 'checkin_streak', 100, 'legendary', 124, false),
  ('checkins_7',   'Week of Presence',     'Check in 7 days total',                   'interaction', 15,  'total_checkins', 7,   'common',    130, false),
  ('checkins_30',  'Regular Visitor',      'Check in 30 days total',                  'interaction', 40,  'total_checkins', 30,  'rare',      131, false),
  ('checkins_100', 'Century Check',        'Check in 100 days total',                 'interaction', 120, 'total_checkins', 100,  'epic',      132, false),
  ('checkins_365', 'Year of Devotion',     'Check in 365 days total',                 'interaction', 500, 'total_checkins', 365,  'legendary', 133, false),

  -- CONSUMPTION: images / videos / gifts / credit spend (drives top-ups)
  ('first_image',  'First Snapshot',       'Generate your first AI image',            'consumption', 10,  'image_count', 1,     'common',    200, false),
  ('image_50',     'Aspiring Photographer','Generate 50 AI images',                   'consumption', 30,  'image_count', 50,    'rare',      201, false),
  ('image_100',    'Shutterbug',           'Generate 100 AI images',                  'consumption', 50,  'image_count', 100,   'rare',      202, false),
  ('image_200',    'Master Photographer',  'Generate 200 AI images',                  'consumption', 80,  'image_count', 200,   'epic',      203, false),
  ('image_500',    'Gallery Owner',        'Generate 500 AI images',                  'consumption', 150, 'image_count', 500,   'epic',      204, false),
  ('image_1000',   'Muse Immortal',        'Generate 1,000 AI images',                'consumption', 400, 'image_count', 1000,  'legendary', 205, false),
  ('video_1',      'Director''s Debut',    'Generate your first AI video',            'consumption', 30,  'video_count', 1,     'rare',      210, false),
  ('video_5',      'Short Film Maker',     'Generate 5 AI videos',                    'consumption', 80,  'video_count', 5,     'epic',      211, false),
  ('video_20',     'Film Studio',          'Generate 20 AI videos',                   'consumption', 200, 'video_count', 20,    'legendary', 212, false),
  ('video_50',     'Cinema Legend',        'Generate 50 AI videos',                   'consumption', 500, 'video_count', 50,    'legendary', 213, false),
  ('first_gift',   'Romantic Heart',       'Buy your first gift',                     'consumption', 5,   'gift_purchases', 1,   'common',    220, false),
  ('gift_5',       'Thoughtful Lover',     'Buy 5 gifts',                             'consumption', 15,  'gift_purchases', 5,   'common',    221, false),
  ('gift_20',      'Generous Sweetheart',  'Buy 20 gifts',                            'consumption', 40,  'gift_purchases', 20,  'rare',      222, false),
  ('gift_50',      'Gift Enthusiast',      'Buy 50 gifts',                            'consumption', 40,  'gift_purchases', 50,  'rare',      223, false),
  ('gift_100',     'Grand Romantic',       'Buy 100 gifts',                           'consumption', 100, 'gift_purchases', 100, 'epic',      224, false),
  ('gift_300',     'Treasure Vault',       'Buy 300 gifts',                           'consumption', 300, 'gift_purchases', 300, 'legendary', 225, false),
  ('spent_500',    'Getting Comfortable',  'Spend 500 credits in total',              'consumption', 15,  'credits_spent', 500,   'common',    230, false),
  ('spent_2000',   'Credit Connoisseur',   'Spend 2,000 credits in total',            'consumption', 40,  'credits_spent', 2000,  'rare',      231, false),
  ('spent_10000',  'Big Spender',          'Spend 10,000 credits in total',           'consumption', 150, 'credits_spent', 10000, 'epic',      232, false),
  ('spent_50000',  'Money Is No Object',   'Spend 50,000 credits in total',           'consumption', 500, 'credits_spent', 50000, 'legendary', 233, false),

  -- COLLECTION: companions / creations / SSR / outfits (drives seats & creation cards)
  ('collector_1',  'First Meeting',        'Have your first companion',               'collection', 5,   'companion_count', 1,  'common',    300, false),
  ('collector_3',  'First Harem',          'Have 3 companions',                       'collection', 15,  'companion_count', 3,  'common',    301, false),
  ('collector_5',  'Card Collector',       'Have 5 companions',                       'collection', 25,  'companion_count', 5,  'rare',      302, false),
  ('collector_10', 'Heart Thief',          'Have 10 companions',                      'collection', 60,  'companion_count', 10, 'epic',      303, false),
  ('collector_20', 'Legendary Casanova',   'Have 20 companions',                      'collection', 120, 'companion_count', 20, 'legendary', 304, false),
  ('first_creation','Master Creator',      'Create your first companion',             'collection', 15,  'created_companions', 1,  'common',    310, false),
  ('created_5',    'Sculptor of Love',     'Create 5 companions',                     'collection', 40,  'created_companions', 5,  'rare',      311, false),
  ('created_10',   'Dream Architect',      'Create 10 companions',                    'collection', 100, 'created_companions', 10, 'epic',      312, false),
  ('created_30',   'Pygmalion',            'Create 30 companions',                    'collection', 200, 'created_companions', 30, 'epic',      313, false),
  ('created_50',   'Creator Supreme',      'Create 50 companions',                    'collection', 500, 'created_companions', 50, 'legendary', 314, false),
  ('ssr_1',        'Lucky Draw',           'Own an SSR companion (score 90+)',        'collection', 40,  'ssr_companions', 1,  'rare',      320, false),
  ('ssr_3',        'Blessed by Fate',      'Own 3 SSR companions',                    'collection', 120, 'ssr_companions', 3,  'epic',      321, false),
  ('ssr_10',       'SSR Connoisseur',      'Own 10 SSR companions',                   'collection', 400, 'ssr_companions', 10, 'legendary', 322, false),
  ('first_outfit', 'Fashion Forward',      'Buy your first outfit',                   'collection', 15,  'outfit_count', 1,  'common',    330, false),
  ('outfit_5',     'Style Explorer',       'Collect 5 outfits',                       'collection', 20,  'outfit_count', 5,  'common',    331, false),
  ('outfit_10',    'Wardrobe Curator',     'Collect 10 outfits',                      'collection', 60,  'outfit_count', 10, 'rare',      332, false),
  ('outfit_30',    'Fashion Icon',         'Collect 30 outfits',                      'collection', 150, 'outfit_count', 30, 'legendary', 333, false),

  -- INTIMACY: levels / heat messages / multi-companion bonds (drives seats)
  ('intimacy_lv3', 'Close Connection',     'Reach intimacy level 3',                  'intimacy', 25,  'intimacy_level', 3, 'common',    400, false),
  ('intimacy_lv4', 'Burning Desire',       'Reach intimacy level 4',                  'intimacy', 40,  'intimacy_level', 4, 'rare',      401, false),
  ('intimacy_lv5', 'Soul Mate',            'Reach intimacy level 5',                  'intimacy', 75,  'intimacy_level', 5, 'rare',      402, false),
  ('intimacy_lv6', 'Eternal Bond',         'Reach intimacy level 6',                  'intimacy', 200, 'intimacy_level', 6, 'legendary', 403, false),
  ('heat_10',      'Sparks Fly',           'Send 10 intimate messages',               'intimacy', 15,  'nsfw_message_count', 10,   'common',    410, false),
  ('heat_100',     'Heat Wave',            'Send 100 intimate messages',              'intimacy', 50,  'nsfw_message_count', 100,  'rare',      411, false),
  ('heat_500',     'Burning Passion',      'Send 500 intimate messages',              'intimacy', 120, 'nsfw_message_count', 500,  'epic',      412, false),
  ('heat_2000',    'Inferno of Love',      'Send 2,000 intimate messages',            'intimacy', 300, 'nsfw_message_count', 2000, 'legendary', 413, false),
  ('duo_lv5',      'Double Devotion',      '2 companions reach intimacy Lv.5',        'intimacy', 50,  'companions_intimacy_5', 2, 'rare',      420, false),
  ('trio_lv5',     'Triple Threat',        '3 companions reach intimacy Lv.5',        'intimacy', 100, 'companions_intimacy_5', 3, 'epic',      421, false),
  ('harem_lv5',    'Beloved by Many',      '5 companions reach intimacy Lv.5',        'intimacy', 300, 'companions_intimacy_5', 5, 'legendary', 422, false),
  ('soulmate_1',   'True Soulmate',        '1 companion reaches intimacy Lv.6',       'intimacy', 120, 'companions_intimacy_6', 1, 'epic',      425, false),
  ('soulmate_3',   'Eternal Harem',        '3 companions reach intimacy Lv.6',        'intimacy', 400, 'companions_intimacy_6', 3, 'legendary', 426, false),

  -- MEMBERSHIP: upgrades & top-ups (explicit monetization milestones)
  ('upgrade_pro',       'Pro Member',          'Upgrade to Pro',                      'membership', 50,  'subscription_tier', 1,     'epic',      500, false),
  ('upgrade_unlimited', 'Unlimited Elite',     'Upgrade to Unlimited',                'membership', 150, 'subscription_tier', 2,     'legendary', 501, false),
  ('first_top_up',      'First Top-Up',        'Make your first credit purchase',     'membership', 25,  'credits_purchased', 1,     'rare',      510, false),
  ('top_up_100',        'Pocket Change',       'Purchase 100 credits in total',       'membership', 40,  'credits_purchased', 100,   'rare',      511, false),
  ('top_up_500',        'Investor',            'Purchase 500 credits in total',       'membership', 100, 'credits_purchased', 500,   'epic',      512, false),
  ('top_up_1000',       'High Roller',         'Purchase 1,000 credits in total',     'membership', 100, 'credits_purchased', 1000,  'epic',      513, false),
  ('top_up_5000',       'Big Spender',         'Purchase 5,000 credits in total',     'membership', 300, 'credits_purchased', 5000,  'legendary', 514, false),
  ('top_up_20000',      'Whale Watcher',       'Purchase 20,000 credits in total',    'membership', 800, 'credits_purchased', 20000, 'legendary', 515, false),

  -- Retired duplicates (kept hidden so historical unlocks stay intact)
  ('photo_10', 'Private Gallery',      'Generate 10 images', 'collection', 20, 'image_count', 10, 'rare', 998, true),
  ('photo_50', 'Muse of Inspiration',  'Generate 50 images', 'collection', 60, 'image_count', 50, 'epic', 999, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  reward_tokens = EXCLUDED.reward_tokens,
  condition_type = EXCLUDED.condition_type,
  condition_value = EXCLUDED.condition_value,
  rarity = EXCLUDED.rarity,
  sort_order = EXCLUDED.sort_order,
  is_hidden = EXCLUDED.is_hidden;
