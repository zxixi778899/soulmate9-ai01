/**
 * Universal companion rarity system (site-wide).
 *
 * Score = round((base_desire + base_development + base_kink) / 3)
 *   90-100 → SSR
 *   80-89  → SR
 *   70-79  → R
 *   < 70   → N
 *
 * Newly-created companions roll each stat uniformly in 70-100, so fresh
 * creations land on R / SR / SSR. Existing records keep their stats and get
 * their rarity re-derived from the same formula (migration 0024).
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export const RARITY_ORDER: readonly Rarity[] = ['N', 'R', 'SR', 'SSR'];

function clampStat(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Overall companion score: average of desire / development / kink (0-100). */
export function companionScore(desire: unknown, development: unknown, kink: unknown): number {
  return Math.round((clampStat(desire) + clampStat(development) + clampStat(kink)) / 3);
}

/** Map a 0-100 overall score to its rarity tier. */
export function rarityFromScore(score: number): Rarity {
  if (score >= 90) return 'SSR';
  if (score >= 80) return 'SR';
  if (score >= 70) return 'R';
  return 'N';
}

/** Derive rarity from the three core stats using the universal score rule. */
export function rarityFromTraits(desire: unknown, development: unknown, kink: unknown): Rarity {
  return rarityFromScore(companionScore(desire, development, kink));
}

/** Score bands with localized flavor labels (used by reveal / detail UIs). */
export const RARITY_SCORE_BANDS: ReadonlyArray<{
  rarity: Rarity;
  min: number;
  max: number;
  labelZh: string;
  labelEn: string;
}> = [
  { rarity: 'SSR', min: 90, max: 100, labelZh: '传说', labelEn: 'Legendary' },
  { rarity: 'SR', min: 80, max: 89, labelZh: '史诗', labelEn: 'Epic' },
  { rarity: 'R', min: 70, max: 79, labelZh: '稀有', labelEn: 'Rare' },
  { rarity: 'N', min: 0, max: 69, labelZh: '普通', labelEn: 'Common' },
];

export function rarityBandLabel(rarity: Rarity, zh: boolean): string {
  const band = RARITY_SCORE_BANDS.find((b) => b.rarity === rarity);
  if (!band) return rarity;
  return zh ? band.labelZh : band.labelEn;
}

/**
 * Stat roll for a freshly created companion: desire / development / kink are
 * each uniform 70-100, rarity derived from the resulting score.
 */
export function rollCompanionStats(): {
  base_desire: number;
  base_development: number;
  base_kink: number;
  score: number;
  rarity: Rarity;
} {
  const roll = () => 70 + Math.floor(Math.random() * 31); // 70-100 inclusive
  const base_desire = roll();
  const base_development = roll();
  const base_kink = roll();
  const score = companionScore(base_desire, base_development, base_kink);
  return { base_desire, base_development, base_kink, score, rarity: rarityFromScore(score) };
}
