import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseClient: () => ({ rpc: mocks.rpc, from: vi.fn() }),
}));

vi.mock('@/lib/stripe-server', () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
  AnalyticsEvents: {
    SUBSCRIPTION_STARTED: 'subscription_started',
    SUBSCRIPTION_CANCELED: 'subscription_canceled',
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 60_000,
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from '@/app/api/stripe/webhook/route';

function makeReq(body: string, signature = 't=1,v1=abc'): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  });
}

describe('Stripe webhook boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  it('returns 400 when Stripe rejects the signature', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const response = await POST(makeReq('{}', 'bad'));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the webhook secret is missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const response = await POST(makeReq('{}'));
    expect(response.status).toBe(503);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it('returns 500 and records failure when trusted checkout metadata is invalid', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_missing_user',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: {} } },
    });
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ claimed: true, attempts: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(makeReq('{}'));
    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'fail_stripe_webhook_event', {
      p_event_id: 'evt_missing_user',
      p_error: 'checkout session is missing trusted user_id metadata',
    });
  });

  it('acknowledges an already completed duplicate without processing it', async () => {
    mocks.constructEvent.mockReturnValue({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', metadata: { user_id: 'user-1' } } },
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ claimed: false, attempts: 1 }],
      error: null,
    });

    const response = await POST(makeReq('{}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
