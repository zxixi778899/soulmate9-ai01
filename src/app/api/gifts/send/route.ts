import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { GIFT_CREDIT_COSTS, deductCredits } from '@/lib/credit-system';
import { DEFAULT_CHAT_GIFTS, type ChatGift } from '@/lib/gifts/catalog';
import { listGifts } from '@/lib/gifts/store';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { INTIMACY_MAX_SCORE, getIntimacyLevel } from '@/lib/constants';
import { maybeUnlockIntimacyMilestone } from '@/lib/intimacy-milestones';
import { companionScore, rarityFromTraits, RARITY_ORDER, type Rarity } from '@/lib/rarity';
import { checkCompanionAccess } from '@/lib/companion-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clampStat(v: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
}

/**
 * POST /api/gifts/send
 * Body: { gift_code: string, girlfriend_id: string }
 *
 * Deducts credits server-side and records the gift. Applies:
 *  - intimacy boost to intimacy_scores (per user + companion)
 *  - desire / development / kink boosts to the companion's base stats
 *  - automatic rarity re-grade when the new stats cross a threshold
 *
 * Returns { ok, cost, balance_after, intimacy_boost, intimacy, stats, rarity }.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, client } = auth;
    const body = await req.json().catch(() => ({}));
    const giftCode = String(body.gift_code || '').trim().toLowerCase();
    const girlfriendId = String(body.girlfriend_id || '').trim();

    if (!giftCode) {
      return NextResponse.json({ error: 'gift_code is required' }, { status: 400 });
    }

    // Resolve gift from the backend catalog first (admin-configured:
    // chat_gifts table → site_settings → local file → defaults)
    let gift: ChatGift | undefined;
    try {
      const listed = await listGifts(getSupabaseClient(), { includeInactive: false });
      gift = listed.gifts.find((g) => g.code === giftCode || g.id === giftCode);
    } catch (e) {
      logger.warn('[gifts/send] catalog lookup failed, using defaults', { err: String(e) });
    }
    if (!gift) {
      gift = DEFAULT_CHAT_GIFTS.find((g) => g.code === giftCode || g.id === giftCode);
    }
    if (!gift) {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 });
    }

    // Validate the companion before charging anything
    let girlfriend: Record<string, unknown> | null = null;
    if (girlfriendId) {
      const { data } = await client
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriendId)
        .maybeSingle();
      girlfriend = (data ?? null) as Record<string, unknown> | null;
      if (!girlfriend) {
        return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
      }
      // Access control: private companions can only receive gifts from their
      // owner; library companions are giftable once added as a friend.
      const access = await checkCompanionAccess(client, user.id, girlfriendId);
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'This companion is private. Only the creator can use it.' },
          { status: 403 },
        );
      }
    }

    // Cost priority: backend admin setting (catalog cost_tokens) → unified
    // credit table → 5.
    const catalogCost = Number(gift.cost_tokens);
    const cost = catalogCost > 0 ? catalogCost : (GIFT_CREDIT_COSTS[giftCode] ?? 5);

    // Deduct credits
    const result = await deductCredits(client, user.id, cost, 'gift_send', giftCode);
    if (!result.ok) {
      if (result.error === 'insufficient_credits') {
        const { data: profile } = await client
          .from('profiles')
          .select('credits_remaining')
          .eq('user_id', user.id)
          .single();
        return NextResponse.json({
          error: `Insufficient credits. Need ${cost}, have ${profile?.credits_remaining ?? 0}.`,
          code: 'insufficient_credits',
          required: cost,
          balance: profile?.credits_remaining ?? 0,
        }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // ---- Apply intimacy boost (direct write; paid gifts bypass the free
    // daily cap but respect the absolute maximum) ----
    const intimacyBoost = gift.intimacy_boost || 0;
    let intimacyResult: { gained: number; score: number; level: number } | null = null;
    if (girlfriendId && intimacyBoost > 0) {
      try {
        const { data: current } = await client
          .from('intimacy_scores')
          .select('*')
          .eq('user_id', user.id)
          .eq('girlfriend_id', girlfriendId)
          .maybeSingle();
        const row = (current ?? null) as Record<string, unknown> | null;

        if (!row) {
          const today = new Date().toISOString().split('T')[0];
          const score = Math.min(intimacyBoost, INTIMACY_MAX_SCORE);
          await client.from('intimacy_scores').insert({
            user_id: user.id,
            girlfriend_id: girlfriendId,
            score,
            level: getIntimacyLevel(score),
            last_interacted_at: new Date().toISOString(),
            daily_message_count: 0,
            daily_score_gained: 0,
            last_daily_reset: today,
          });
          intimacyResult = { gained: intimacyBoost, score, level: getIntimacyLevel(score) };
        } else {
          const oldScore = Number(row.score || 0);
          const gained = Math.max(0, Math.min(intimacyBoost, INTIMACY_MAX_SCORE - oldScore));
          const score = Math.min(oldScore + intimacyBoost, INTIMACY_MAX_SCORE);
          await client
            .from('intimacy_scores')
            .update({
              score,
              level: getIntimacyLevel(score),
              last_interacted_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          intimacyResult = { gained, score, level: getIntimacyLevel(score) };
          void maybeUnlockIntimacyMilestone(client, user.id, girlfriendId, intimacyResult.level).catch(() => {});
        }
      } catch (e) {
        logger.warn('[gifts/send] intimacy boost failed', { err: String(e) });
      }
    }

    // ---- Apply desire / development / kink boosts + auto rarity upgrade ----
    let statsResult: {
      base_desire: number;
      base_development: number;
      base_kink: number;
      score: number;
    } | null = null;
    let rarityResult: { before: Rarity; after: Rarity; upgraded: boolean } | null = null;
    if (girlfriend) {
      try {
        const oldDesire = clampStat(Number(girlfriend.base_desire ?? 0));
        const oldDev = clampStat(Number(girlfriend.base_development ?? 0));
        const oldKink = clampStat(Number(girlfriend.base_kink ?? 0));
        const beforeRarity = rarityFromTraits(oldDesire, oldDev, oldKink);

        const newDesire = clampStat(oldDesire + (gift.desire_boost || 0));
        const newDev = clampStat(oldDev + (gift.development_boost || 0));
        const newKink = clampStat(oldKink + (gift.kink_boost || 0));
        const afterRarity = rarityFromTraits(newDesire, newDev, newKink);

        const patch: Record<string, unknown> = {
          base_desire: newDesire,
          base_development: newDev,
          base_kink: newKink,
        };
        if (afterRarity !== beforeRarity) patch.rarity = afterRarity;

        await client
          .from('girlfriends')
          .update(patch)
          .eq('id', girlfriend.id);

        statsResult = {
          base_desire: newDesire,
          base_development: newDev,
          base_kink: newKink,
          score: companionScore(newDesire, newDev, newKink),
        };
        rarityResult = {
          before: beforeRarity,
          after: afterRarity,
          upgraded: RARITY_ORDER.indexOf(afterRarity) > RARITY_ORDER.indexOf(beforeRarity),
        };
      } catch (e) {
        logger.warn('[gifts/send] stat boost failed', { err: String(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      gift_code: giftCode,
      cost,
      balance_after: result.balance_after,
      intimacy_boost: intimacyBoost,
      intimacy: intimacyResult,
      boosts: {
        desire: gift.desire_boost || 0,
        development: gift.development_boost || 0,
        kink: gift.kink_boost || 0,
      },
      stats: statsResult,
      rarity: rarityResult,
    });
  } catch (err) {
    logger.error('[gifts/send] error', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
