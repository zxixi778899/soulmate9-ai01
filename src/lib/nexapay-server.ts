/**
 * NexaPay — LATAM cross-border payment gateway
 * Supports Pix (Brazil instant payment) and TED (bank transfer)
 *
 * NexaPay provides API-driven collection accounts for e-commerce
 * expanding into Latin America. Primary market: Brazil.
 *
 * Env vars:
 *   NEXAPAY_API_KEY       — API authentication key
 *   NEXAPAY_API_SECRET    — API secret for signing requests
 *   NEXAPAY_MERCHANT_ID   — Merchant identifier
 *   NEXAPAY_WEBHOOK_SECRET — Webhook signature verification
 *   NEXAPAY_BASE_URL      — API base URL (default: https://api.nexapay.com/v1)
 */

import { logger } from '@/lib/logger';

const NEXAPAY_BASE_URL = process.env.NEXAPAY_BASE_URL || 'https://api.nexapay.com/v1';

function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.NEXAPAY_API_KEY || '';
  const merchantId = process.env.NEXAPAY_MERCHANT_ID || '';
  if (!apiKey) throw new Error('NEXAPAY_API_KEY is not configured');
  return {
    'Authorization': `Bearer ${apiKey}`,
    'X-Merchant-Id': merchantId,
    'Content-Type': 'application/json',
  };
}

async function nexaPayFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${NEXAPAY_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NexaPay ${path} HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Payment methods supported by NexaPay */
export const NEXAPAY_PAYMENT_METHODS = [
  { id: 'pix', name: 'Pix', description: 'Brazil instant payment', country: 'BR', currency: 'BRL' },
  { id: 'ted', name: 'TED', description: 'Brazil bank transfer', country: 'BR', currency: 'BRL' },
  { id: 'card_latam', name: 'Credit Card', description: 'LATAM credit card', country: 'BR', currency: 'BRL' },
  { id: 'boleto', name: 'Boleto', description: 'Brazil payment slip', country: 'BR', currency: 'BRL' },
] as const;

export type NexaPayPaymentMethod = (typeof NEXAPAY_PAYMENT_METHODS)[number]['id'];

/**
 * Create a NexaPay payment request
 * Returns a payment URL or redirect for the customer
 */
export async function createNexaPayPayment(params: {
  amount_cents: number;
  currency: string; // 'USD' — NexaPay converts to BRL
  payment_method: NexaPayPaymentMethod;
  order_id: string;
  description: string;
  customer_email: string;
  customer_name?: string;
  success_url?: string;
  cancel_url?: string;
  webhook_url?: string;
}): Promise<{
  payment_id: string;
  payment_url: string;
  status: string;
  amount_brl?: number;
  expires_at?: string;
}> {
  return nexaPayFetch('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: params.amount_cents / 100,
      currency: params.currency,
      payment_method: params.payment_method,
      order_id: params.order_id,
      description: params.description,
      customer: {
        email: params.customer_email,
        name: params.customer_name,
      },
      redirect_url: params.success_url,
      cancel_url: params.cancel_url,
      webhook_url: params.webhook_url,
    }),
  });
}

/**
 * Check NexaPay payment status
 */
export async function getNexaPayPaymentStatus(paymentId: string): Promise<{
  payment_id: string;
  status: 'pending' | 'completed' | 'failed' | 'expired' | 'refunded';
  amount_usd: number;
  amount_brl: number;
  payment_method: string;
  created_at: string;
  completed_at?: string;
}> {
  return nexaPayFetch(`/payments/${paymentId}`);
}

/**
 * Verify NexaPay webhook signature
 */
export function verifyNexaPayWebhook(body: string, signature: string): boolean {
  const secret = process.env.NEXAPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('[nexapay] Webhook secret not configured, skipping verification');
    return false;
  }
  // TODO: implement proper HMAC-SHA256 verification
  return signature.length > 0;
}

/**
 * Map plan + billing to USD cents for NexaPay
 */
export function getNexaPayPriceCents(plan: string, billing: string): number {
  const basePrices: Record<string, number> = {
    basic: 999,
    pro: 1999,
    unlimited: 2999,
  };
  const base = basePrices[plan] ?? 0;
  if (base === 0) return 0;

  const discounts: Record<string, { multiplier: number; discount: number }> = {
    monthly: { multiplier: 1, discount: 1.0 },
    quarterly: { multiplier: 3, discount: 0.85 },
    yearly: { multiplier: 12, discount: 0.70 },
  };
  const cycle = discounts[billing] ?? discounts.monthly;
  return Math.round(base * cycle.multiplier * cycle.discount);
}
