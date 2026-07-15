import { describe, expect, it } from 'vitest';
import { getStripeCheckoutGate } from '@/lib/payment-compliance';

describe('getStripeCheckoutGate', () => {
  it('always blocks Stripe for adult mode', () => {
    expect(getStripeCheckoutGate({ NODE_ENV: 'development', CONTENT_MODE: 'adult' })).toEqual({
      allowed: false,
      code: 'adult_content',
    });
  });

  it('allows an unconfigured local development environment', () => {
    expect(getStripeCheckoutGate({ NODE_ENV: 'development' })).toEqual({ allowed: true });
  });

  it('fails closed when production mode is not explicit', () => {
    expect(getStripeCheckoutGate({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'stripe' })).toEqual({
      allowed: false,
      code: 'invalid_content_mode',
    });
  });

  it('requires a written approval reference in SFW production', () => {
    expect(
      getStripeCheckoutGate({
        NODE_ENV: 'production',
        CONTENT_MODE: 'sfw',
        PAYMENT_PROVIDER: 'stripe',
      }),
    ).toEqual({ allowed: false, code: 'missing_approval' });
  });

  it('allows approved SFW production checkout', () => {
    expect(
      getStripeCheckoutGate({
        NODE_ENV: 'production',
        CONTENT_MODE: 'sfw',
        PAYMENT_PROVIDER: 'stripe',
        PAYMENT_PROVIDER_APPROVAL_REF: 'case-123',
      }),
    ).toEqual({ allowed: true });
  });
});

