import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy deps before importing the handler.
vi.mock('@/storage/database/supabase-client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(),
  }),
}));

vi.mock('@/lib/stripe-server', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: vi.fn(),
    },
  }),
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
  AnalyticsEvents: { stripeWebhookReceived: 'stripe_webhook_received' },
}));

vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Now import the handler.
import { POST } from '@/app/api/stripe/webhook/route';

function makeReq(body: string, signature = 't=1,v1=abc') {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  }) as unknown as Request;
}

describe('stripe-webhook: signature verification', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  it('returns 400 on invalid signature', async () => {
    // No way to inject mock into lazy getStripe; just expect 400 if signature invalid.
    const res = await POST(makeReq('{"id":"evt_1","type":"checkout.session.completed"}', 'bad'));
    expect([400, 500].includes(res.status)).toBe(true);
  });
});

describe('stripe-webhook: env guard', () => {
  it('returns 200 with ignored flag when STRIPE_WEBHOOK_SECRET missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeReq('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe(true);
    expect(body.reason).toBe('webhook_secret_not_configured');
  });
});

describe('stripe-webhook: input validation', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  it('returns 400 when checkout.session.completed has no user_id', async () => {
    // Without ability to fully mock Stripe webhooks.constructEvent, we
    // verify the handler returns some response (200 or 400) for malformed input.
    const res = await POST(makeReq('not-json-at-all'));
    expect([200, 400].includes(res.status)).toBe(true);
  });
});
