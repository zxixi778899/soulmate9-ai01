/**
 * Unit tests for gen-hub's unified failure refund.
 *
 * Verifies the at-most-once refund guarantee: zero-cost jobs and already
 * refunded jobs are skipped, a failed grant never flags the job, and the
 * happy path grants exactly once and marks `refunded: true`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/credit-system', () => ({
  grantCredits: vi.fn(),
}));
vi.mock('@/lib/gen-hub/jobs', () => ({
  updateGenJob: vi.fn(),
}));

import { refundGenJob, type RefundableJob } from '../gen-hub/refund';
import { grantCredits } from '@/lib/credit-system';
import { updateGenJob } from '@/lib/gen-hub/jobs';

const client = {} as unknown as SupabaseClient;

const mockGrant = grantCredits as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = updateGenJob as unknown as ReturnType<typeof vi.fn>;

function makeJob(overrides: Partial<RefundableJob> = {}): RefundableJob {
  return {
    id: 'job-1',
    user_id: 'user-1',
    cost_tokens: 20,
    refunded: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockGrant.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
});

describe('refundGenJob', () => {
  it('skips jobs with zero or negative cost', async () => {
    expect(await refundGenJob(client, makeJob({ cost_tokens: 0 }))).toEqual({
      refunded: false,
      skipped: 'no_cost',
    });
    expect(await refundGenJob(client, makeJob({ cost_tokens: -5 }))).toEqual({
      refunded: false,
      skipped: 'no_cost',
    });
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('skips jobs already refunded', async () => {
    const outcome = await refundGenJob(client, makeJob({ refunded: true }));
    expect(outcome).toEqual({ refunded: false, skipped: 'already_refunded' });
    expect(mockGrant).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports grant failures without flagging the job', async () => {
    mockGrant.mockResolvedValue({ ok: false, error: 'db down' });
    const outcome = await refundGenJob(client, makeJob());
    expect(outcome).toEqual({ refunded: false, skipped: 'grant_failed' });
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('grants exactly once and marks the job refunded', async () => {
    mockGrant.mockResolvedValue({ ok: true, balance_after: 120 });
    const job = makeJob({ cost_tokens: 30 });

    const outcome = await refundGenJob(client, job);
    expect(outcome).toEqual({ refunded: true, balance_after: 120 });
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockGrant).toHaveBeenCalledWith(client, 'user-1', 30, 'refund', 'job-1');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(client, 'job-1', { refunded: true });
  });

  it('a second call after the flag is set never refunds twice', async () => {
    mockGrant.mockResolvedValue({ ok: true, balance_after: 100 });
    const job = makeJob();

    const first = await refundGenJob(client, job);
    expect(first.refunded).toBe(true);

    // Simulate the persisted flag coming back from the job row.
    job.refunded = true;
    const second = await refundGenJob(client, job);
    expect(second).toEqual({ refunded: false, skipped: 'already_refunded' });
    expect(mockGrant).toHaveBeenCalledTimes(1);
  });
});
