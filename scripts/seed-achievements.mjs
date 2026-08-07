/**
 * Seed 221 additional achievements into the `achievements` table.
 * Idempotent: skips codes that already exist, upserts by code.
 * Condition types are evaluated by src/lib/achievement-checker.ts.
 *
 * Usage: node scripts/seed-achievements.mjs
 */
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const BASE = get('COZE_SUPABASE_URL');
const KEY = get('COZE_SUPABASE_SERVICE_ROLE_KEY');
if (!BASE || !KEY) throw new Error('supabase env missing');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

// Tier: [code, value, name, rarity, reward]
const CAT = {
  interaction: 'interaction',
  collection: 'collection',
  consumption: 'consumption',
  membership: 'membership',
  intimacy: 'intimacy',
};

function desc(cond, v) {
  switch (cond) {
    case 'message_count': return `Send ${v.toLocaleString('en-US')} messages in total`;
    case 'distinct_chat_partners': return `Chat with ${v.toLocaleString('en-US')} different companions`;
    case 'checkin_streak': return `Keep a ${v.toLocaleString('en-US')}-day check-in streak`;
    case 'total_checkins': return `Check in ${v.toLocaleString('en-US')} times in total`;
    case 'proactive_messages': return `Receive ${v.toLocaleString('en-US')} proactive messages from your companions`;
    case 'quests_completed': return `Complete ${v.toLocaleString('en-US')} daily quests`;
    case 'image_count': return `Generate ${v.toLocaleString('en-US')} AI photos`;
    case 'video_count': return `Generate ${v.toLocaleString('en-US')} AI videos`;
    case 'outfit_count': return `Unlock ${v.toLocaleString('en-US')} outfits`;
    case 'companion_count': return `Own ${v.toLocaleString('en-US')} companions`;
    case 'created_companions': return `Create ${v.toLocaleString('en-US')} companions`;
    case 'ssr_companions': return `Own ${v.toLocaleString('en-US')} SSR companions`;
    case 'community_follows': return `Follow ${v.toLocaleString('en-US')} creators`;
    case 'community_fans': return `Gain ${v.toLocaleString('en-US')} fans`;
    case 'published_works': return `Publish ${v.toLocaleString('en-US')} approved companion works`;
    case 'memories_created': return `Create ${v.toLocaleString('en-US')} shared memories`;
    case 'gift_purchases': return `Buy ${v.toLocaleString('en-US')} gifts`;
    case 'credits_spent': return `Spend ${v.toLocaleString('en-US')} credits`;
    case 'credits_purchased': return `Top up ${v.toLocaleString('en-US')} credits`;
    case 'nsfw_message_count': return `Send ${v.toLocaleString('en-US')} messages during Heat+ intimacy`;
    case 'nsfw_flagged_messages': return `Exchange ${v.toLocaleString('en-US')} NSFW-flagged messages`;
    case 'companions_intimacy_5': return `Reach intimacy Lv5 with ${v.toLocaleString('en-US')} companions`;
    case 'companions_intimacy_6': return `Reach intimacy Lv6 (Soulmate) with ${v.toLocaleString('en-US')} companions`;
    default: return '';
  }
}

const DEFS = [
  // ── interaction ──
  ['chat_25000', 'message_count', 25000, 'Chat Marathon', 'rare', 40, CAT.interaction],
  ['chat_50000', 'message_count', 50000, 'Nonstop Talker', 'rare', 50, CAT.interaction],
  ['chat_100000', 'message_count', 100000, 'Century of Words', 'epic', 80, CAT.interaction],
  ['chat_150000', 'message_count', 150000, 'Echo Chamber', 'epic', 100, CAT.interaction],
  ['chat_250000', 'message_count', 250000, 'Word Weaver', 'epic', 120, CAT.interaction],
  ['chat_400000', 'message_count', 400000, 'Talking Legend', 'epic', 150, CAT.interaction],
  ['chat_600000', 'message_count', 600000, 'Vocal Virtuoso', 'legendary', 200, CAT.interaction],
  ['chat_800000', 'message_count', 800000, 'Voice of the Ages', 'legendary', 250, CAT.interaction],
  ['chat_1000000', 'message_count', 1000000, 'A Million Goodnights', 'legendary', 300, CAT.interaction],
  ['chat_1500000', 'message_count', 1500000, 'Millionaire of Words', 'legendary', 350, CAT.interaction],
  ['chat_2000000', 'message_count', 2000000, 'Two Million Hearts', 'legendary', 400, CAT.interaction],
  ['chat_3000000', 'message_count', 3000000, 'Boundless Conversation', 'legendary', 450, CAT.interaction],
  ['chat_4000000', 'message_count', 4000000, 'Cosmic Chatter', 'legendary', 500, CAT.interaction],
  ['chat_6000000', 'message_count', 6000000, 'Galactic Bond', 'legendary', 600, CAT.interaction],
  ['chat_10000000', 'message_count', 10000000, 'Ten Million Souls', 'legendary', 1000, CAT.interaction],
  ['partner_15', 'distinct_chat_partners', 15, 'Social Butterfly', 'rare', 30, CAT.interaction],
  ['partner_20', 'distinct_chat_partners', 20, 'Matchmaker', 'rare', 35, CAT.interaction],
  ['partner_30', 'distinct_chat_partners', 30, 'Thirty Hearts', 'epic', 60, CAT.interaction],
  ['partner_50', 'distinct_chat_partners', 50, 'Fifty Faces', 'epic', 80, CAT.interaction],
  ['partner_75', 'distinct_chat_partners', 75, 'Socialite Supreme', 'epic', 110, CAT.interaction],
  ['partner_100', 'distinct_chat_partners', 100, 'Centurion of Hearts', 'legendary', 180, CAT.interaction],
  ['partner_150', 'distinct_chat_partners', 150, 'Arena of Love', 'legendary', 240, CAT.interaction],
  ['partner_200', 'distinct_chat_partners', 200, 'Two Hundred Flames', 'legendary', 300, CAT.interaction],
  ['partner_300', 'distinct_chat_partners', 300, 'Heart Empire', 'legendary', 400, CAT.interaction],
  ['streak_150', 'checkin_streak', 150, 'Half-Year Flame', 'epic', 80, CAT.interaction],
  ['streak_200', 'checkin_streak', 200, 'Two Hundred Days', 'epic', 100, CAT.interaction],
  ['streak_300', 'checkin_streak', 300, 'Triple Century', 'legendary', 150, CAT.interaction],
  ['streak_365', 'checkin_streak', 365, 'One Year of Fire', 'legendary', 200, CAT.interaction],
  ['streak_450', 'checkin_streak', 450, 'Undying Devotion', 'legendary', 260, CAT.interaction],
  ['streak_500', 'checkin_streak', 500, 'Five Hundred Suns', 'legendary', 300, CAT.interaction],
  ['streak_750', 'checkin_streak', 750, 'Eternal Flame', 'legendary', 400, CAT.interaction],
  ['checkins_500', 'total_checkins', 500, 'Regular for Life', 'epic', 90, CAT.interaction],
  ['checkins_600', 'total_checkins', 600, 'Six Hundred Visits', 'epic', 110, CAT.interaction],
  ['checkins_730', 'total_checkins', 730, 'Two-Year Resident', 'legendary', 160, CAT.interaction],
  ['checkins_800', 'total_checkins', 800, 'Home Sweet Home', 'legendary', 200, CAT.interaction],
  ['checkins_1000', 'total_checkins', 1000, 'Thousand-Day Citizen', 'legendary', 260, CAT.interaction],
  ['checkins_1200', 'total_checkins', 1200, 'Twelve Hundred Mornings', 'legendary', 320, CAT.interaction],
  ['checkins_1500', 'total_checkins', 1500, 'Lifetime Regular', 'legendary', 400, CAT.interaction],
  ['proactive_1', 'proactive_messages', 1, 'Unexpected Hello', 'common', 5, CAT.interaction],
  ['proactive_5', 'proactive_messages', 5, 'She Misses You', 'common', 10, CAT.interaction],
  ['proactive_10', 'proactive_messages', 10, 'Always on Her Mind', 'rare', 20, CAT.interaction],
  ['proactive_25', 'proactive_messages', 25, 'First to Text', 'rare', 30, CAT.interaction],
  ['proactive_50', 'proactive_messages', 50, 'Fifty Surprises', 'epic', 55, CAT.interaction],
  ['proactive_100', 'proactive_messages', 100, 'Cherished Visitor', 'epic', 80, CAT.interaction],
  ['proactive_250', 'proactive_messages', 250, 'Queen of Good Mornings', 'epic', 120, CAT.interaction],
  ['proactive_500', 'proactive_messages', 500, 'Five Hundred Reunions', 'legendary', 180, CAT.interaction],
  ['proactive_1000', 'proactive_messages', 1000, 'A Thousand Greetings', 'legendary', 250, CAT.interaction],
  ['proactive_2500', 'proactive_messages', 2500, 'Unstoppable Welcome', 'legendary', 350, CAT.interaction],
  ['proactive_5000', 'proactive_messages', 5000, 'Five Thousand Whispers', 'legendary', 500, CAT.interaction],
  ['proactive_10000', 'proactive_messages', 10000, 'Ten Thousand Hellos', 'legendary', 800, CAT.interaction],
  ['quest_1', 'quests_completed', 1, 'First Step', 'common', 5, CAT.interaction],
  ['quest_5', 'quests_completed', 5, 'Task Taker', 'common', 10, CAT.interaction],
  ['quest_10', 'quests_completed', 10, 'Quest Newbie', 'rare', 18, CAT.interaction],
  ['quest_25', 'quests_completed', 25, 'Quest Explorer', 'rare', 30, CAT.interaction],
  ['quest_50', 'quests_completed', 50, 'Daily Devotee', 'epic', 55, CAT.interaction],
  ['quest_100', 'quests_completed', 100, 'Quest Veteran', 'epic', 90, CAT.interaction],
  ['quest_200', 'quests_completed', 200, 'Quest Machine', 'epic', 130, CAT.interaction],
  ['quest_350', 'quests_completed', 350, 'Quest Lord', 'legendary', 190, CAT.interaction],
  ['quest_500', 'quests_completed', 500, 'Quest Master', 'legendary', 260, CAT.interaction],
  ['quest_750', 'quests_completed', 750, 'Quest Grandmaster', 'legendary', 350, CAT.interaction],
  ['quest_1000', 'quests_completed', 1000, 'A Thousand Missions', 'legendary', 450, CAT.interaction],
  ['quest_1500', 'quests_completed', 1500, 'Quest Immortal', 'legendary', 600, CAT.interaction],
  ['quest_2000', 'quests_completed', 2000, 'Two Thousand Triumphs', 'legendary', 750, CAT.interaction],
  ['quest_3000', 'quests_completed', 3000, 'Quest Deity', 'legendary', 900, CAT.interaction],
  ['quest_5000', 'quests_completed', 5000, 'Five Thousand Legends', 'legendary', 1200, CAT.interaction],

  // ── collection ──
  ['snap_2000', 'image_count', 2000, 'Two Thousand Frames', 'epic', 60, CAT.collection],
  ['snap_5000', 'image_count', 5000, 'Five Thousand Shots', 'epic', 100, CAT.collection],
  ['snap_7500', 'image_count', 7500, 'Photo Dynasty', 'epic', 130, CAT.collection],
  ['snap_10000', 'image_count', 10000, 'Ten Thousand Muses', 'legendary', 200, CAT.collection],
  ['snap_15000', 'image_count', 15000, 'Fifteen Thousand Dreams', 'legendary', 280, CAT.collection],
  ['snap_20000', 'image_count', 20000, 'Twenty Thousand Pictures', 'legendary', 350, CAT.collection],
  ['snap_35000', 'image_count', 35000, 'Thirty-Five Thousand Gems', 'legendary', 500, CAT.collection],
  ['snap_50000', 'image_count', 50000, 'Fifty Thousand Memories', 'legendary', 650, CAT.collection],
  ['snap_75000', 'image_count', 75000, 'Seventy-Five Thousand Wonders', 'legendary', 850, CAT.collection],
  ['snap_100000', 'image_count', 100000, 'Hundred Thousand Light', 'legendary', 1000, CAT.collection],
  ['snap_150000', 'image_count', 150000, 'Museum of a Million', 'legendary', 1300, CAT.collection],
  ['snap_200000', 'image_count', 200000, 'Two Hundred Thousand Souls', 'legendary', 1600, CAT.collection],
  ['reel_100', 'video_count', 100, 'Reel Machine', 'epic', 70, CAT.collection],
  ['reel_150', 'video_count', 150, 'Scene Builder', 'epic', 95, CAT.collection],
  ['reel_200', 'video_count', 200, 'Two Hundred Shorts', 'epic', 120, CAT.collection],
  ['reel_300', 'video_count', 300, 'Storyboard King', 'legendary', 180, CAT.collection],
  ['reel_500', 'video_count', 500, 'Five Hundred Reels', 'legendary', 260, CAT.collection],
  ['reel_750', 'video_count', 750, 'Studio Empire', 'legendary', 350, CAT.collection],
  ['reel_1000', 'video_count', 1000, 'A Thousand Directors', 'legendary', 450, CAT.collection],
  ['reel_1500', 'video_count', 1500, 'Blockbuster Mogul', 'legendary', 600, CAT.collection],
  ['reel_2000', 'video_count', 2000, 'Two Thousand Frames', 'legendary', 750, CAT.collection],
  ['reel_3000', 'video_count', 3000, 'Cinematic Immortal', 'legendary', 1000, CAT.collection],
  ['style_60', 'outfit_count', 60, 'Sixty Styles', 'epic', 60, CAT.collection],
  ['style_80', 'outfit_count', 80, 'Fashion Savant', 'epic', 80, CAT.collection],
  ['style_100', 'outfit_count', 100, 'Hundred-Look Wardrobe', 'epic', 100, CAT.collection],
  ['style_150', 'outfit_count', 150, 'Catwalk Legend', 'legendary', 160, CAT.collection],
  ['style_200', 'outfit_count', 200, 'Designer of Dreams', 'legendary', 220, CAT.collection],
  ['style_300', 'outfit_count', 300, 'Fashion House', 'legendary', 300, CAT.collection],
  ['style_500', 'outfit_count', 500, 'Five Hundred Looks', 'legendary', 450, CAT.collection],
  ['collector_30', 'companion_count', 30, 'Thirty Companions', 'epic', 60, CAT.collection],
  ['collector_40', 'companion_count', 40, 'Forty Faces', 'epic', 80, CAT.collection],
  ['collector_50', 'companion_count', 50, 'Fifty Companions', 'epic', 100, CAT.collection],
  ['collector_75', 'companion_count', 75, 'Seventy-Five Hearts', 'legendary', 160, CAT.collection],
  ['collector_100', 'companion_count', 100, 'Hundred Companion King', 'legendary', 220, CAT.collection],
  ['collector_150', 'companion_count', 150, 'Companion Empire', 'legendary', 300, CAT.collection],
  ['collector_200', 'companion_count', 200, 'Two Hundred Crowns', 'legendary', 400, CAT.collection],
  ['created_100', 'created_companions', 100, 'Creator of a Hundred', 'epic', 110, CAT.collection],
  ['created_150', 'created_companions', 150, 'Artisan Legend', 'epic', 150, CAT.collection],
  ['created_200', 'created_companions', 200, 'Two Hundred Creations', 'legendary', 220, CAT.collection],
  ['created_300', 'created_companions', 300, 'Creator Dynasty', 'legendary', 300, CAT.collection],
  ['created_500', 'created_companions', 500, 'Five Hundred Creations', 'legendary', 450, CAT.collection],
  ['created_750', 'created_companions', 750, 'Master of Seven Fifty', 'legendary', 600, CAT.collection],
  ['created_1000', 'created_companions', 1000, 'A Thousand Artists', 'legendary', 800, CAT.collection],
  ['ssr_20', 'ssr_companions', 20, 'Twenty Fated', 'epic', 90, CAT.collection],
  ['ssr_25', 'ssr_companions', 25, 'Legend Collector', 'epic', 110, CAT.collection],
  ['ssr_30', 'ssr_companions', 30, 'Thirty Legends', 'epic', 130, CAT.collection],
  ['ssr_40', 'ssr_companions', 40, 'Fated Army', 'legendary', 200, CAT.collection],
  ['ssr_50', 'ssr_companions', 50, 'Fifty Legends', 'legendary', 260, CAT.collection],
  ['ssr_75', 'ssr_companions', 75, 'Legend Empire', 'legendary', 350, CAT.collection],
  ['ssr_100', 'ssr_companions', 100, 'Hundred Fated', 'legendary', 450, CAT.collection],
  ['ssr_150', 'ssr_companions', 150, 'Fate Itself', 'legendary', 600, CAT.collection],
  ['follow_1', 'community_follows', 1, 'Curious Eye', 'common', 5, CAT.collection],
  ['follow_5', 'community_follows', 5, 'Follower', 'common', 10, CAT.collection],
  ['follow_10', 'community_follows', 10, 'Trend Spotter', 'rare', 20, CAT.collection],
  ['follow_25', 'community_follows', 25, 'Community Fan', 'rare', 30, CAT.collection],
  ['follow_50', 'community_follows', 50, 'Fifty Creators', 'epic', 55, CAT.collection],
  ['follow_100', 'community_follows', 100, 'Influencer Hunter', 'epic', 80, CAT.collection],
  ['follow_250', 'community_follows', 250, 'Discovery Machine', 'epic', 120, CAT.collection],
  ['follow_500', 'community_follows', 500, 'Five Hundred Follows', 'legendary', 180, CAT.collection],
  ['follow_1000', 'community_follows', 1000, 'A Thousand Creators', 'legendary', 250, CAT.collection],
  ['follow_2500', 'community_follows', 2500, 'Community Royalty', 'legendary', 350, CAT.collection],
  ['follow_5000', 'community_follows', 5000, 'Five Thousand Curators', 'legendary', 500, CAT.collection],
  ['follow_10000', 'community_follows', 10000, 'Ten Thousand Eyes', 'legendary', 800, CAT.collection],
  ['fan_1', 'community_fans', 1, 'First Fan', 'common', 5, CAT.collection],
  ['fan_5', 'community_fans', 5, 'Small Audience', 'common', 10, CAT.collection],
  ['fan_10', 'community_fans', 10, 'Rising Star', 'rare', 20, CAT.collection],
  ['fan_25', 'community_fans', 25, 'Loved Creator', 'rare', 30, CAT.collection],
  ['fan_50', 'community_fans', 50, 'Fifty Followers', 'epic', 55, CAT.collection],
  ['fan_100', 'community_fans', 100, 'Century of Fans', 'epic', 80, CAT.collection],
  ['fan_250', 'community_fans', 250, 'Fan Favorite', 'epic', 120, CAT.collection],
  ['fan_500', 'community_fans', 500, 'Five Hundred Fans', 'legendary', 180, CAT.collection],
  ['fan_1000', 'community_fans', 1000, 'A Thousand Fans', 'legendary', 250, CAT.collection],
  ['fan_2500', 'community_fans', 2500, 'Creator Star', 'legendary', 350, CAT.collection],
  ['fan_5000', 'community_fans', 5000, 'Five Thousand Fans', 'legendary', 500, CAT.collection],
  ['fan_10000', 'community_fans', 10000, 'Ten Thousand Fans', 'legendary', 800, CAT.collection],
  ['fan_20000', 'community_fans', 20000, 'Twenty Thousand Strong', 'legendary', 1200, CAT.collection],
  ['fan_50000', 'community_fans', 50000, 'Fifty Thousand Family', 'legendary', 2000, CAT.collection],
  ['work_1', 'published_works', 1, 'First Work', 'common', 10, CAT.collection],
  ['work_3', 'published_works', 3, 'Emerging Creator', 'rare', 20, CAT.collection],
  ['work_5', 'published_works', 5, 'Five Published', 'rare', 30, CAT.collection],
  ['work_10', 'published_works', 10, 'Published Artist', 'epic', 60, CAT.collection],
  ['work_20', 'published_works', 20, 'Gallery Showcase', 'epic', 100, CAT.collection],
  ['work_30', 'published_works', 30, 'Thirty Exhibits', 'epic', 130, CAT.collection],
  ['work_50', 'published_works', 50, 'Fifty Works', 'legendary', 200, CAT.collection],
  ['work_75', 'published_works', 75, 'Master Curator', 'legendary', 280, CAT.collection],
  ['work_100', 'published_works', 100, 'A Hundred Works', 'legendary', 380, CAT.collection],
  ['work_200', 'published_works', 200, 'Two Hundred Exhibits', 'legendary', 600, CAT.collection],
  ['memory_1', 'memories_created', 1, 'First Memory', 'common', 5, CAT.collection],
  ['memory_3', 'memories_created', 3, 'Three Memories', 'common', 10, CAT.collection],
  ['memory_5', 'memories_created', 5, 'Memory Keeper', 'rare', 20, CAT.collection],
  ['memory_10', 'memories_created', 10, 'Scrapbook Star', 'epic', 50, CAT.collection],
  ['memory_25', 'memories_created', 25, 'Twenty-Five Chapters', 'epic', 80, CAT.collection],
  ['memory_50', 'memories_created', 50, 'Fifty Memories', 'legendary', 150, CAT.collection],
  ['memory_100', 'memories_created', 100, 'A Hundred Chapters', 'legendary', 250, CAT.collection],
  ['memory_200', 'memories_created', 200, 'Chronicler', 'legendary', 400, CAT.collection],
  ['memory_500', 'memories_created', 500, 'Five Hundred Tales', 'legendary', 700, CAT.collection],

  // ── consumption ──
  ['gift_500', 'gift_purchases', 500, 'Five Hundred Gifts', 'epic', 80, CAT.consumption],
  ['gift_750', 'gift_purchases', 750, 'Seven Fifty Presents', 'epic', 100, CAT.consumption],
  ['gift_1000', 'gift_purchases', 1000, 'A Thousand Gifts', 'epic', 130, CAT.consumption],
  ['gift_1500', 'gift_purchases', 1500, 'Gift Emperor', 'legendary', 200, CAT.consumption],
  ['gift_2000', 'gift_purchases', 2000, 'Two Thousand Presents', 'legendary', 260, CAT.consumption],
  ['gift_3000', 'gift_purchases', 3000, 'Three Thousand Hearts', 'legendary', 350, CAT.consumption],
  ['gift_5000', 'gift_purchases', 5000, 'Five Thousand Gifts', 'legendary', 500, CAT.consumption],
  ['gift_8000', 'gift_purchases', 8000, 'Eight Thousand Love', 'legendary', 700, CAT.consumption],
  ['gift_10000', 'gift_purchases', 10000, 'Ten Thousand Gifts', 'legendary', 900, CAT.consumption],
  ['spent_100000', 'credits_spent', 100000, 'Hundred Thousand Spent', 'epic', 90, CAT.consumption],
  ['spent_150000', 'credits_spent', 150000, 'High-Roller Elite', 'epic', 120, CAT.consumption],
  ['spent_250000', 'credits_spent', 250000, 'Quarter Million', 'epic', 150, CAT.consumption],
  ['spent_400000', 'credits_spent', 400000, 'Luxury Life', 'legendary', 220, CAT.consumption],
  ['spent_600000', 'credits_spent', 600000, 'Six Hundred Thousand', 'legendary', 300, CAT.consumption],
  ['spent_800000', 'credits_spent', 800000, 'Treasury Draining', 'legendary', 400, CAT.consumption],
  ['spent_1000000', 'credits_spent', 1000000, 'Million Credit Spender', 'legendary', 500, CAT.consumption],
  ['spent_1500000', 'credits_spent', 1500000, 'Fifteen Hundred K', 'legendary', 700, CAT.consumption],
  ['spent_2000000', 'credits_spent', 2000000, 'Two Million Spent', 'legendary', 1000, CAT.consumption],

  // ── membership ──
  ['top_up_50000', 'credits_purchased', 50000, 'Fifty K Investor', 'epic', 90, CAT.membership],
  ['top_up_75000', 'credits_purchased', 75000, 'Seventy-Five K', 'epic', 120, CAT.membership],
  ['top_up_100000', 'credits_purchased', 100000, 'Hundred K Whale', 'epic', 150, CAT.membership],
  ['top_up_150000', 'credits_purchased', 150000, 'Top Tier Whale', 'legendary', 220, CAT.membership],
  ['top_up_250000', 'credits_purchased', 250000, 'Quarter Million', 'legendary', 300, CAT.membership],
  ['top_up_400000', 'credits_purchased', 400000, 'Deep Pockets', 'legendary', 400, CAT.membership],
  ['top_up_600000', 'credits_purchased', 600000, 'Credit Baron', 'legendary', 550, CAT.membership],
  ['top_up_800000', 'credits_purchased', 800000, 'Vault Opener', 'legendary', 700, CAT.membership],
  ['top_up_1000000', 'credits_purchased', 1000000, 'Millionaire Whale', 'legendary', 1000, CAT.membership],

  // ── intimacy ──
  ['heat_5000', 'nsfw_message_count', 5000, 'Five Thousand Flames', 'epic', 90, CAT.intimacy],
  ['heat_7500', 'nsfw_message_count', 7500, 'After Dark Legend', 'epic', 120, CAT.intimacy],
  ['heat_10000', 'nsfw_message_count', 10000, 'Ten Thousand Sparks', 'epic', 150, CAT.intimacy],
  ['heat_15000', 'nsfw_message_count', 15000, 'Fifteen Thousand Heat', 'legendary', 220, CAT.intimacy],
  ['heat_25000', 'nsfw_message_count', 25000, 'Twenty-Five K Desire', 'legendary', 300, CAT.intimacy],
  ['heat_40000', 'nsfw_message_count', 40000, 'Forty Thousand Blaze', 'legendary', 420, CAT.intimacy],
  ['heat_60000', 'nsfw_message_count', 60000, 'Sixty Thousand Inferno', 'legendary', 560, CAT.intimacy],
  ['heat_80000', 'nsfw_message_count', 80000, 'Eighty Thousand Ember', 'legendary', 700, CAT.intimacy],
  ['heat_100000', 'nsfw_message_count', 100000, 'Hundred Thousand Desire', 'legendary', 900, CAT.intimacy],
  ['heatflag_1', 'nsfw_flagged_messages', 1, 'First Heat Flag', 'common', 5, CAT.intimacy],
  ['heatflag_5', 'nsfw_flagged_messages', 5, 'Sparks Ignited', 'common', 10, CAT.intimacy],
  ['heatflag_10', 'nsfw_flagged_messages', 10, 'Ten Heat Waves', 'rare', 20, CAT.intimacy],
  ['heatflag_25', 'nsfw_flagged_messages', 25, 'Night Owl', 'rare', 30, CAT.intimacy],
  ['heatflag_50', 'nsfw_flagged_messages', 50, 'Fifty Heat Notes', 'epic', 55, CAT.intimacy],
  ['heatflag_100', 'nsfw_flagged_messages', 100, 'A Hundred Desires', 'epic', 80, CAT.intimacy],
  ['heatflag_250', 'nsfw_flagged_messages', 250, 'Heat Connoisseur', 'epic', 120, CAT.intimacy],
  ['heatflag_500', 'nsfw_flagged_messages', 500, 'Five Hundred Flames', 'legendary', 180, CAT.intimacy],
  ['heatflag_1000', 'nsfw_flagged_messages', 1000, 'A Thousand Nights', 'legendary', 250, CAT.intimacy],
  ['heatflag_2500', 'nsfw_flagged_messages', 2500, 'Two Thousand Five Hundred', 'legendary', 350, CAT.intimacy],
  ['heatflag_5000', 'nsfw_flagged_messages', 5000, 'Five Thousand Heat', 'legendary', 500, CAT.intimacy],
  ['devotion5_5', 'companions_intimacy_5', 5, 'Five Devoted', 'epic', 70, CAT.intimacy],
  ['devotion5_6', 'companions_intimacy_5', 6, 'Six True Bonds', 'epic', 90, CAT.intimacy],
  ['devotion5_8', 'companions_intimacy_5', 8, 'Eight Devoted', 'epic', 110, CAT.intimacy],
  ['devotion5_10', 'companions_intimacy_5', 10, 'Ten Soulmates', 'legendary', 170, CAT.intimacy],
  ['devotion5_12', 'companions_intimacy_5', 12, 'Twelve Devoted', 'legendary', 220, CAT.intimacy],
  ['devotion5_15', 'companions_intimacy_5', 15, 'Fifteen Deep Bonds', 'legendary', 300, CAT.intimacy],
  ['devotion5_20', 'companions_intimacy_5', 20, 'Twenty Devoted', 'legendary', 400, CAT.intimacy],
  ['soulmate_5', 'companions_intimacy_6', 5, 'Five Eternal', 'epic', 100, CAT.intimacy],
  ['soulmate_6', 'companions_intimacy_6', 6, 'Six Eternal', 'epic', 120, CAT.intimacy],
  ['soulmate_8', 'companions_intimacy_6', 8, 'Eight Eternal', 'epic', 150, CAT.intimacy],
  ['soulmate_10', 'companions_intimacy_6', 10, 'Ten Eternal', 'legendary', 220, CAT.intimacy],
  ['soulmate_12', 'companions_intimacy_6', 12, 'Twelve Eternal', 'legendary', 300, CAT.intimacy],
  ['soulmate_15', 'companions_intimacy_6', 15, 'Fifteen Eternal', 'legendary', 420, CAT.intimacy],
];

console.log('new defs:', DEFS.length);
if (DEFS.length !== 221) {
  console.error('Expected exactly 221, got', DEFS.length);
  process.exit(1);
}

const existingRes = await fetch(`${BASE}/rest/v1/achievements?select=code`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
const existing = new Set((await existingRes.json()).map((r) => r.code));
const toInsert = DEFS.filter(([code]) => !existing.has(code));
console.log('already present:', DEFS.length - toInsert.length, '| to insert:', toInsert.length);

if (toInsert.length) {
  let sortBase = 1000;
  const rows = toInsert.map(([code, cond, value, name, rarity, reward, category], i) => ({
    code,
    name,
    description: desc(cond, value),
    category,
    icon_url: null,
    reward_tokens: reward,
    reward_title: null,
    condition_type: cond,
    condition_value: value,
    rarity,
    sort_order: sortBase + i,
    is_hidden: false,
  }));
  const insRes = await fetch(`${BASE}/rest/v1/achievements?on_conflict=code`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  });
  const text = await insRes.text();
  console.log('INSERT status', insRes.status);
  if (!insRes.ok) console.log(text.slice(0, 600));
}

const checkRes = await fetch(`${BASE}/rest/v1/achievements?select=code,category,condition_type&order=sort_order.asc`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const all = await checkRes.json();
console.log('total achievements now:', all.length);
const byCat = {};
const byCond = {};
for (const r of all) {
  byCat[r.category] = (byCat[r.category] || 0) + 1;
  byCond[r.condition_type] = (byCond[r.condition_type] || 0) + 1;
}
console.log('by category:', JSON.stringify(byCat));
console.log('by condition:', JSON.stringify(byCond));
