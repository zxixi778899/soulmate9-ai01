export type StripeCheckoutGate =
  | { allowed: true }
  | { allowed: false; code: 'adult_content' | 'provider_disabled' | 'missing_approval' | 'invalid_content_mode' };

type PaymentEnvironment = Record<string, string | undefined>;

/**
 * Prevents new Stripe purchases when the disclosed production business mode
 * is incompatible or has not passed the explicit launch approval gate.
 * Existing cancellation/portal/webhook routes stay available so customers can
 * always manage or terminate an existing subscription.
 */
export function getStripeCheckoutGate(env: PaymentEnvironment = process.env): StripeCheckoutGate {
  const contentMode = (env.CONTENT_MODE || '').trim().toLowerCase();
  const provider = (env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  const isProduction = env.NODE_ENV === 'production';

  if (contentMode === 'adult') return { allowed: false, code: 'adult_content' };

  if (isProduction && contentMode !== 'sfw') {
    return { allowed: false, code: 'invalid_content_mode' };
  }

  if (provider && !['stripe', 'nowpayments', 'nexapay', 'multi'].includes(provider)) {
    return { allowed: false, code: 'provider_disabled' };
  }

  if (isProduction) {
    if (!['stripe', 'nowpayments', 'nexapay', 'multi'].includes(provider)) return { allowed: false, code: 'provider_disabled' };
    if (!(env.PAYMENT_PROVIDER_APPROVAL_REF || '').trim()) {
      return { allowed: false, code: 'missing_approval' };
    }
  }

  return { allowed: true };
}

export function stripeGateMessage(gate: Exclude<StripeCheckoutGate, { allowed: true }>): string {
  switch (gate.code) {
    case 'adult_content':
      return 'Card checkout is unavailable for this content mode.';
    case 'missing_approval':
      return 'Payments are awaiting production approval.';
    case 'invalid_content_mode':
      return 'Production content mode is not configured.';
    default:
      return 'This payment provider is not enabled.';
  }
}

