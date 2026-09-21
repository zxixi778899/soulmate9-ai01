import { describe, expect, it } from 'vitest';
import { getNowPaymentsCheckoutGate } from '@/lib/payment-compliance';

describe('getNowPaymentsCheckoutGate', () => {
  it('allows NOWPayments for adult mode', () => {
    expect(getNowPaymentsCheckoutGate({ NODE_ENV: 'development', CONTENT_MODE: 'adult' })).toEqual({
      allowed: true,
    });
  });

  it('allows an unconfigured local development environment', () => {
    expect(getNowPaymentsCheckoutGate({ NODE_ENV: 'development' })).toEqual({ allowed: true });
  });

  it('allows nowpayments provider in production', () => {
    expect(getNowPaymentsCheckoutGate({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'nowpayments' })).toEqual({
      allowed: false,
      code: 'missing_approval',
    });
  });

  it('requires a written approval reference in production', () => {
    expect(
      getNowPaymentsCheckoutGate({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'nowpayments',
        PAYMENT_PROVIDER_APPROVAL_REF: 'case-123',
      }),
    ).toEqual({ allowed: true });
  });

  it('blocks unsupported providers in production', () => {
    expect(
      getNowPaymentsCheckoutGate({
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'stripe',
      }),
    ).toEqual({ allowed: false, code: 'provider_disabled' });
  });
});

