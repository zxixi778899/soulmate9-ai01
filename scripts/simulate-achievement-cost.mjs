/**
 * Achievement Full-Clear Cost Simulator
 * 模拟"完美解锁全部成就"所需的统计量、积分、时间与金钱成本。
 * 数据来源: db/migrations/0026_achievement_expansion.sql + scripts/seed-achievements.mjs
 * 定价来源: src/lib/credit-system.ts + src/lib/constants.ts (MEMBERSHIP_TIERS)
 *
 * Usage: node scripts/simulate-achievement-cost.mjs
 */
import fs from 'node:fs';

// ── 1. Parse achievement catalog from repo sources ──────────────────────────
const defs = []; // { code, cond, value, reward, category }

// base catalog (0026): ('code','name','desc','category', reward, 'cond', value, 'rarity', sort, hidden)
const sql = fs.readFileSync('db/migrations/0026_achievement_expansion.sql', 'utf8');
const rowRe = /\('([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'([^']+)',\s*(\d+),\s*'([^']+)',\s*(\d+),\s*'([^']+)',\s*(\d+),\s*(true|false)\)/g;
let m;
while ((m = rowRe.exec(sql)) !== null) {
  defs.push({ code: m[1], category: m[4], reward: Number(m[5]), cond: m[6], value: Number(m[7]), hidden: m[10] === 'true' });
}

// expansion catalog (seed-achievements.mjs): [code, cond, value, name, rarity, reward, CAT.x]
const seed = fs.readFileSync('scripts/seed-achievements.mjs', 'utf8');
const defsBlock = seed.slice(seed.indexOf('const DEFS = ['), seed.indexOf('];', seed.indexOf('const DEFS = [')));
const seedRe = /\['([^']+)',\s*'([^']+)',\s*(\d+),\s*'((?:[^']|\\')*)',\s*'([^']+)',\s*(\d+),\s*CAT\.([a-z]+)\]/g;
while ((m = seedRe.exec(defsBlock)) !== null) {
  defs.push({ code: m[1], cond: m[2], value: Number(m[3]), reward: Number(m[6]), category: m[7], hidden: false });
}

const visible = defs.filter((d) => !d.hidden);
console.log(`成就总数: ${defs.length} (含隐藏 ${defs.length - visible.length}) | 可见: ${visible.length}`);

// ── 2. Max required stat per condition type + total reward ──────────────────
const maxByCond = {};
const countByCond = {};
let totalReward = 0;
for (const d of visible) {
  maxByCond[d.cond] = Math.max(maxByCond[d.cond] || 0, d.value);
  countByCond[d.cond] = (countByCond[d.cond] || 0) + 1;
  totalReward += d.reward;
}
console.log('\n== 各条件类型: 通关所需最大值 (成就数) ==');
for (const [k, v] of Object.entries(maxByCond).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} ${v.toLocaleString('en-US').padStart(12)}  (${countByCond[k]}个)`);
}
console.log(`\n全部成就奖励积分合计: ${totalReward.toLocaleString('en-US')} credits`);

// ── 3. Credit consumption model ──────────────────────────────────────────────
const COSTS = { image: 10, video_3s: 30, gift_min: 5, outfit_avg: 850, creation_card_est: 200 };
const need = maxByCond;

const images = need.image_count || 0;
const videos = need.video_count || 0;
const gifts = need.gift_purchases || 0;
const outfits = need.outfit_count || 0;
const creations = need.created_companions || 0;

const spendImages = images * COSTS.image;
const spendVideos = videos * COSTS.video_3s; // 全部用最便宜 3s 视频
const spendGifts = gifts * COSTS.gift_min; // 全部买最便宜的 rose
const spendOutfits = Math.round(outfits * COSTS.outfit_avg);
const monthlyFreeCards = 10; // Unlimited 配额
const estDays = Math.max(need.total_checkins || 0, Math.ceil((need.checkin_streak || 0)));
const freeCardsTotal = Math.round((estDays / 365) * 12 * monthlyFreeCards);
const cardsToBuy = Math.max(0, creations - freeCardsTotal);
const spendCards = cardsToBuy * COSTS.creation_card_est;

const totalSpend = spendImages + spendVideos + spendGifts + spendOutfits + spendCards;
console.log('\n== 积分消耗估算 ==');
console.log(`  图片 ${images.toLocaleString()} 张 × ${COSTS.image}          = ${spendImages.toLocaleString()}`);
console.log(`  视频 ${videos.toLocaleString()} 条 × ${COSTS.video_3s}         = ${spendVideos.toLocaleString()}`);
console.log(`  礼物 ${gifts.toLocaleString()} 个 × ${COSTS.gift_min}          = ${spendGifts.toLocaleString()}`);
console.log(`  服装 ${outfits} 件 × ~${COSTS.outfit_avg}         = ${spendOutfits.toLocaleString()}`);
console.log(`  创建卡补购 ~${cardsToBuy} 张 × ~${COSTS.creation_card_est}  = ${spendCards.toLocaleString()} (估算)`);
console.log(`  总消耗 ≈ ${totalSpend.toLocaleString()} credits (credits_spent 要求 ${need.credits_spent?.toLocaleString()})`);

// ── 4. Free income model ─────────────────────────────────────────────────────
const days = need.total_checkins || 0; // 签到决定最短天数
const checkinIncome = days * 10;
const questIncome = days * 80; // 6任务 5+5+15+15+20 +全勤20, 每天7条 claim → 同时满足 quest_5000
const subIncome = Math.round((days / 30.4) * 300); // Unlimited 每月赠 300
const achievementIncome = totalReward;
const freeIncome = checkinIncome + questIncome + subIncome + achievementIncome;
console.log('\n== 免费积分收入估算 ==');
console.log(`  签到 ${days} 天 × 10      = ${checkinIncome.toLocaleString()}`);
console.log(`  每日任务 × 80/天      = ${questIncome.toLocaleString()}`);
console.log(`  订阅赠送 (300/月)     = ${subIncome.toLocaleString()}`);
console.log(`  成就奖励              = ${achievementIncome.toLocaleString()}`);
console.log(`  合计 ≈ ${freeIncome.toLocaleString()} credits`);

// ── 5. Money cost ────────────────────────────────────────────────────────────
const PACKAGES = [
  { n: 'Starter 100/$4.99', credits: 100, cents: 499 },
  { n: 'Popular 500/$19.99', credits: 500, cents: 1999 },
  { n: 'Power 1200/$29.99', credits: 1200, cents: 2999 },
];
const best = PACKAGES.reduce((a, b) => (b.cents / b.credits < a.cents / a.credits ? b : a));
const purchasedRequired = need.credits_purchased || 0; // top_up_1000000 硬性要求
const netNeed = Math.max(purchasedRequired, totalSpend - freeIncome);
const creditCostUsd = (netNeed / best.credits) * best.cents / 100;
const firstTopupDouble = Math.min(netNeed * 0.0, 0); // 首充翻倍仅一次，忽略不计
console.log('\n== 金钱成本 ==');
console.log(`  需充值积分 ≥ max(${purchasedRequired.toLocaleString()}(成就要求), ${totalSpend.toLocaleString()}消耗 - ${freeIncome.toLocaleString()}免费) = ${netNeed.toLocaleString()}`);
console.log(`  最优充值包: ${best.n} → $${(best.cents / best.credits / 100).toFixed(5)}/credit`);
console.log(`  积分花费 ≈ $${Math.round(creditCostUsd).toLocaleString()}`);

// subscription
const years = days / 365;
const subYearly = 287.88;
const subCost = Math.ceil(years) * subYearly;
console.log(`  Unlimited 年费 $${subYearly} × ${Math.ceil(years)} 年 ≈ $${Math.round(subCost).toLocaleString()}`);
console.log(`  总计 ≈ $${Math.round(creditCostUsd + subCost).toLocaleString()} (不含税)`);

// ── 6. Time model ────────────────────────────────────────────────────────────
const msgs = need.message_count || 0;
console.log('\n== 时间估算 ==');
console.log(`  签到瓶颈: ${days} 天 ≈ ${(days / 365).toFixed(1)} 年 (每日1次)`);
console.log(`  任务瓶颈: ${need.quests_completed} ÷ 7条/天 = ${Math.ceil(need.quests_completed / 7)} 天`);
console.log(`  连签瓶颈: ${need.checkin_streak} 天`);
for (const rate of [3000, 5000, 10000]) {
  console.log(`  消息瓶颈: ${msgs.toLocaleString()} 条 ÷ ${rate.toLocaleString()}/天 = ${Math.ceil(msgs / rate)} 天 (${(msgs / rate / 365).toFixed(1)} 年)`);
}
console.log(`  图片瓶颈: ${images.toLocaleString()} 张 ÷ 150/天 = ${Math.ceil(images / 150)} 天 (假设无其他限流)`);
console.log(`  亲密值瓶颈: Lv5=1000分, +2/条, 日上限50 → 单伴侣最快 20 天; ${need.companions_intimacy_5} 个并行无额外瓶颈`);

// ── 7. Unreachable check ─────────────────────────────────────────────────────
console.log('\n== 可达性检查 ==');
const unreachable = visible.filter((d) => d.cond === 'companions_intimacy_6' || (d.cond === 'intimacy_level' && d.value > 5));
for (const d of unreachable) {
  console.log(`  ❌ ${d.code} (${d.cond} ≥ ${d.value}) — 代码上限 Lv5 (INTIMACY_MAX_SCORE=1500), 永远无法解锁`);
}
if (unreachable.length === 0) console.log('  ✅ 全部可达');
const softBlocked = visible.filter((d) => ['community_fans', 'community_follows', 'published_works'].includes(d.cond));
for (const d of softBlocked) {
  console.log(`  ⚠️ ${d.code} (${d.cond} ${d.value.toLocaleString()}) — 依赖平台规模/管理员审核, 个人无法保证`);
}
