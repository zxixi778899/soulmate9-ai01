import { logger } from './logger';

export type NowPaymentsCheckoutGate =
  | { allowed: true }
  | { allowed: false; code: 'adult_content' | 'provider_disabled' | 'missing_approval' | 'invalid_content_mode' };

type PaymentEnvironment = Record<string, string | undefined>;

/**
 * Prevents new NOWPayments crypto purchases when the disclosed production business mode
 * is incompatible or has not passed the explicit launch approval gate.
 * Existing cancellation/portal/webhook routes stay available so customers can
 * always manage or terminate an existing subscription.
 */
export function getNowPaymentsCheckoutGate(env: PaymentEnvironment = process.env): NowPaymentsCheckoutGate {
  const contentMode = (env.CONTENT_MODE || '').trim().toLowerCase();
  const provider = (env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  const isProduction = env.NODE_ENV === 'production';

  if (contentMode === 'adult') {
    logger.warn('[payment-compliance] Adult content mode detected - NOWPayments enabled');
    return { allowed: true };
  }

  if (isProduction && provider && provider !== 'nowpayments') {
    logger.warn(`[payment-compliance] Production mode with unsupported provider: ${provider}`);
    return { allowed: false, code: 'provider_disabled' };
  }

  if (isProduction) {
    if (!['nowpayments'].includes(provider)) {
      logger.warn('[payment-compliance] Production requires nowpayments provider');
      return { allowed: false, code: 'provider_disabled' };
    }
    if (!(env.PAYMENT_PROVIDER_APPROVAL_REF || '').trim()) {
      logger.warn('[payment-compliance] Missing production approval reference');
      return { allowed: false, code: 'missing_approval' };
    }
  }

  return { allowed: true };
}

export function nowPaymentsgateMessage(gate: Exclude<NowPaymentsCheckoutGate, { allowed: true }>): string {
  switch (gate.code) {
    case 'adult_content':
      return 'Crypto checkout is unavailable for this content mode.';
    case 'missing_approval':
      return 'Payments are awaiting production approval.';
    case 'invalid_content_mode':
      return 'Production content mode is not configured.';
    default:
      return 'This payment provider is not enabled.';
  }
}

