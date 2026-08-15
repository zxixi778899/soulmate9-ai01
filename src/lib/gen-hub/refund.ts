/**
 * gen-hub unified failure refund.
 *
 * Every paid generation that fails must be refunded exactly once. The
 * `refunded` flag on the job row is the guard; legacy per-route refund code
 * (e.g. generate-video) will be folded into this helper in phase 2/3.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { grantCredits } from '@/lib/credit-system';
import { logger } from '@/lib/logger';
import { updateGenJob } from './jobs';

export interface RefundableJob {
  id: string;
  user_id: string;
  cost_tokens: number;
  refunded: boolean;
}

export type RefundOutcome =
  | { refunded: true; balance_after: number }
  | { refunded: false; skipped: 'no_cost' | 'already_refunded' | 'grant_failed' };

/**
 * Refund a failed job's cost to the user. Guaranteed at-most-once per job:
 * skips when cost is zero or the job is already flagged `refunded`.
 */
export async function refundGenJob(
  client: SupabaseClient,
  job: RefundableJob,
): Promise<RefundOutcome> {
  if (!job || job.cost_tokens <= 0) {
    return { refunded: false, skipped: 'no_cost' };
  }
  if (job.refunded) {
    return { refunded: false, skipped: 'already_refunded' };
  }

  const grant = await grantCredits(client, job.user_id, job.cost_tokens, 'refund', job.id);
  if (!grant.ok) {
    logger.error('[gen-hub] refund grant failed', {
      jobId: job.id,
      userId: job.user_id,
      amount: job.cost_tokens,
      error: grant.error,
    });
    return { refunded: false, skipped: 'grant_failed' };
  }

  // Flag the job so a retry can never refund twice (best-effort write).
  await updateGenJob(client, job.id, { refunded: true });

  logger.info('[gen-hub] refunded failed generation', {
    jobId: job.id,
    userId: job.user_id,
    amount: job.cost_tokens,
    balanceAfter: grant.balance_after,
  });
  return { refunded: true, balance_after: grant.balance_after };
}
