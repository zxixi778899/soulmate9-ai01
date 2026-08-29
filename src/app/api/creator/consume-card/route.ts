import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import {
  cancelCreationCard,
  commitCreationCard,
  consumeCreationCard,
  reserveCreationCard,
} from '@/lib/creation-cards';
import { logger } from '@/lib/logger';

/**
 * POST /api/creator/consume-card
 *
 * Three modes (defaults to `consume` for backward compatibility, but new
 * callers should use `reserve` + `commit` so the card is only deducted
 * after the generation is confirmed complete):
 *
 *   - `reserve` — return a reservation token, NO card deducted yet. The
 *     caller must later `commit` (after success) or `cancel` (after
 *     failure). This is the recommended path for the creator wizard.
 *   - `commit` — actually deduct -1 from creation_cards. Requires the
 *     reservation_token returned by the reserve step.
 *   - `cancel` — release a reservation. No-op server-side (reserve does
 *     not deduct) but kept for symmetry and analytics.
 *   - `consume` — legacy "deduct immediately" path. Kept for backward
 *     compatibility with existing callers that don't track reservations.
 *
 * Body: { mode?: 'reserve' | 'commit' | 'cancel' | 'consume', reservation_token?: string }
 * Returns:
 *   - reserve → { ok: true, reservation: { token, balance_at_reserve, tier, expires_at } }
 *   - commit  → { ok: true, remaining }
 *   - cancel  → { ok: true, cancelled: true }
 *   - consume → { ok: true, remaining }  (legacy)
 */
export async function POST(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = String(body.mode || 'consume') as 'reserve' | 'commit' | 'cancel' | 'consume';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;

    if (mode === 'reserve') {
      const result = await reserveCreationCard(c, user.id);
      if (!result.ok) {
        const isFree = result.reason === 'free_tier';
        return NextResponse.json(
          {
            error:
              result.reason === 'free_tier'
                ? 'Creating companions is available on membership plans.'
                : result.reason === 'quota_exceeded'
                  ? 'Monthly creation quota reached. Upgrade for more, or buy extra cards in the shop.'
                  : 'No creation cards available.',
            code: isFree
              ? 'membership_required'
              : result.reason === 'quota_exceeded'
                ? 'creation_quota_exceeded'
                : 'NO_CARDS',
            upgrade_url: '/pricing',
            shop_url: isFree ? undefined : '/shop',
            remaining: result.balance,
          },
          { status: 403 },
        );
      }
      return NextResponse.json({
        ok: true,
        mode: 'reserve',
        reservation: {
          token: result.reservation.token,
          balance_at_reserve: result.reservation.balanceAtReserve,
          tier: result.reservation.tier,
          expires_at: new Date(result.reservation.expiresAt).toISOString(),
        },
      });
    }

    if (mode === 'commit') {
      const token = String(body.reservation_token || '').trim();
      if (!token) {
        return NextResponse.json(
          { error: 'reservation_token is required for commit', code: 'missing_token' },
          { status: 400 },
        );
      }
      const result = await commitCreationCard(c, user.id, token);
      if (!result.ok) {
        return NextResponse.json(
          {
            error: 'Failed to commit card reservation — balance may have changed.',
            code: 'commit_failed',
            remaining: result.remaining,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({
        ok: true,
        mode: 'commit',
        remaining: result.remaining,
        already_committed: result.already_committed,
      });
    }

    if (mode === 'cancel') {
      const token = String(body.reservation_token || '').trim();
      if (!token) {
        return NextResponse.json(
          { error: 'reservation_token is required for cancel', code: 'missing_token' },
          { status: 400 },
        );
      }
      const result = await cancelCreationCard(token);
      return NextResponse.json({ ok: true, mode: 'cancel', cancelled: true });
    }

    // Legacy `consume` mode — kept for backward compatibility.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await consumeCreationCard(c as any, user.id);
    if (!result.ok) {
      const isFree = result.tier === 'free' || result.tier === '';
      return NextResponse.json(
        {
          error: isFree
            ? 'Creating companions is available on membership plans.'
            : 'Monthly creation quota reached. Upgrade for more, or buy extra cards in the shop.',
          code: isFree ? 'membership_required' : 'creation_quota_exceeded',
          upgrade_url: '/pricing',
          shop_url: isFree ? undefined : '/shop',
          remaining: result.remaining,
        },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, mode: 'consume', remaining: result.remaining });
  } catch (err) {
    logger.error('[creator/consume-card] error', { err: String(err) });
    return NextResponse.json({ error: 'Failed to process card request' }, { status: 500 });
  }
}
