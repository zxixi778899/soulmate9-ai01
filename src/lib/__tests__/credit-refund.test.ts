/**
 * Unit tests for the unified refund helpers in credit-system.
 *
 * Verifies:
 *  - refundCredits delegates to grantCredits with reason='refund'
 *  - withCreditGuard auto-refunds on throw and re-throws
 *  - withCreditGuard does NOT refund on success
 *  - withCreditGuard swallows refund errors so the original error surfaces
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/credit-system', async () => {
  const actual = await vi.importActual<typeof import('../credit-system')>('../credit-system');
  return {
    ...actual,
    grantCredits: vi.fn(),
    deductCredits: vi.fn(),
  };
});

import { grantCredits } from '../credit-system';
import { refundCredits, withCreditGuard } from '../credit-system';

const mockGrant = grantCredits as unknown as ReturnType<typeof vi.fn>;

describe('refundCredits', () => {
  it('delegates to grantCredits with reason=refund', async () => {
    mockGrant.mockResolvedValue({ ok: true, balance_after: 100 });
    const client = {} as never;
    await refundCredits(client, 'user-1', 25, 'ref-1');
    expect(mockGrant).toHaveBeenCalledWith(client, 'user-1', 25, 'refund', 'ref-1');
  });

  it('skips zero/negative amounts without calling grant', async () => {
    mockGrant.mockReset();
    const client = {} as never;
    await refundCredits(client, 'user-1', 0);
    await refundCredits(client, 'user-1', -5);
    expect(mockGrant).not.toHaveBeenCalled();
  });
});

describe('withCreditGuard', () => {
  it('returns the operation result on success and does not refund', async () => {
    mockGrant.mockReset();
    const client = {} as never;
    const run = vi.fn().mockResolvedValue('ok-result');
    const result = await withCreditGuard(client, 'user-1', 30, 'ref-x', run);
    expect(result).toBe('ok-result');
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('refunds and re-throws on failure', async () => {
    mockGrant.mockReset();
    mockGrant.mockResolvedValue({ ok: true, balance_after: 50 });
    const client = {} as never;
    const failure = new Error('GPU OOM');
    const run = vi.fn().mockRejectedValue(failure);
    await expect(withCreditGuard(client, 'user-1', 40, 'gen-1', run)).rejects.toBe(failure);
    expect(mockGrant).toHaveBeenCalledWith(client, 'user-1', 40, 'refund', 'guard:gen-1');
  });

  it('swallows refund failures so the original error surfaces', async () => {
    mockGrant.mockReset();
    mockGrant.mockRejectedValue(new Error('db down'));
    const client = {} as never;
    const original = new Error('timeout');
    const run = vi.fn().mockRejectedValue(original);
    await expect(withCreditGuard(client, 'user-1', 5, 'gen-2', run)).rejects.toBe(original);
  });
});
