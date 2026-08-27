/**
 * JangoPay payment gateway integration
 * Docs: https://www.jangopay.org/zh/developer
 * 
 * Env vars:
 *   JANGOPAY_API_KEY     - Merchant API key from dashboard
 *   JANGOPAY_SECRET_KEY  - Secret key for HMAC signature
 *   JANGOPAY_URL         - Base URL (sandbox/production)
 */

import { logger } from '@/lib/logger';

const JANGOPAY_API_BASE = process.env.JANGOPAY_URL || 'https://apitest.jangopay.com'; // Default to sandbox

interface PaymentRequest {
  amount: number;
  currency: string;
  recipientId: string;
  description?: string;
  reference?: string;
}

interface PaymentResponse {
  status: string;
  transactionId?: string;
  merchantReference?: string;
  redirectUrl?: string;
  error?: string;
}

async function jangoFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = {
    'Authorization': `Bearer ${process.env.JANGOPAY_API_KEY}`,
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  try {
    const res = await fetch(`${JANGOPAY_API_BASE}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let text = '';
      try {
        text = await res.text().catch(() => '');
      } catch (e) {
        text = '[unable to read response body]';
      }

      logger.error('JangoPay API error:', {
        path,
        status: res.status,
        statusText: res.statusText,
        body: text,
      });

      throw new Error(`JangoPay ${path} HTTP ${res.status}: ${text || 'Unknown error'}`);
    }

    return res.json() as Promise<T>;
  } catch (error) {
    logger.error('JangoPay request failed:', { error });
    throw error;
  }
}

/**
 * Create a payment via JangoPay
 */
export async function jangoPayCreatePayment(params: PaymentRequest): Promise<PaymentResponse> {
  logger.info('[jangopay] Creating payment:', {
    amount: params.amount,
    currency: params.currency,
    recipientId: params.recipientId,
    reference: params.reference,
  });

  try {
    const body = {
      amount: params.amount.toFixed(2),
      currency: params.currency,
      recipient_id: params.recipientId,
      description: params.description || 'Payment',
      merchant_reference: params.reference || `soulmate_${Date.now()}`,
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/jangopay/webhook`,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
    };

    const result = await jangoFetch<PaymentResponse>('/merchant/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    logger.info('[jangopay] Payment created successfully:', {
      status: result.status,
      transactionId: result.transactionId,
    });

    return result;
  } catch (err) {
    logger.error('[jangopay] Payment creation failed:', { err });
    throw err;
  }
}

/**
 * Verify payment status
 */
export async function jangoPayGetPaymentStatus(transactionId: string): Promise<{
  status: string;
  amount: string;
  currency: string;
  createdAt: string;
}> {
  logger.info('[jangopay] Checking payment status:', { transactionId });

  const result = await jangoFetch(`/merchant/payments/${transactionId}`);
  return {
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    createdAt: result.created_at,
  };
}

/**
 * Get supported currencies
 */
export async function jangoPayGetCurrencies(): Promise<string[]> {
  const result = await jangoFetch<{ currencies: string[] }>('/config/currencies');
  return result.currencies;
}

/**
 * Verify webhook signature
 */
export function verifyJangoPaySignature(payload: string, signature: string): boolean {
  const secret = process.env.JANGOPAY_SECRET_KEY;
  if (!secret) {
    logger.warn('[jangopay] Secret key not configured, skipping verification');
    return false;
  }

  // TODO: Implement proper HMAC signature verification
  // JangoPay uses HMAC-SHA256 for webhook signatures
  return true;
}
