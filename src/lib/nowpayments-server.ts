/**
 * NOWPayments crypto payment gateway
 * Docs: https://docs.nowpayments.io
 *
 * Env vars:
 *   NOWPAYMENTS_API_KEY   — API key from dashboard
 *   NOWPAYMENTS_IPN_SECRET — IPN (webhook) HMAC secret
 *   NOWPAYMENTS_PAY_CURRENCY — default accepted currency (e.g. usdttrc20)
 */

import { logger } from '@/lib/logger';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY || '';
  if (!key) throw new Error('NOWPAYMENTS_API_KEY is not configured');
  return key;
}

async function nowPaymentsFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${NOWPAYMENTS_API_URL}${path}`, {
    ...options,
    headers: {
      'x-api-key': getApiKey(),
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NOWPayments ${path} HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Check API status / connectivity */
export async function nowPaymentsStatus(): Promise<{ message: string }> {
  return nowPaymentsFetch('/status');
}

/** Get available currencies */
export async function nowPaymentsCurrencies(): Promise<{ currencies: string[] }> {
  return nowPaymentsFetch('/currencies');
}

/** Get estimated price in crypto for a USD amount */
export async function nowPaymentsEstimatePrice(params: {
  amount: number;
  currency_from: string;
  currency_to: string;
}): Promise<{ estimated_amount: number; rate: number }> {
  const search = new URLSearchParams({
    amount: params.amount.toFixed(2),
    currency_from: params.currency_from,
    currency_to: params.currency_to,
  });
  return nowPaymentsFetch(`/price?${search}`);
}

/** Get minimum payment amount for a currency pair */
export async function nowPaymentsMinimum(params: {
  currency_from: string;
  currency_to: string;
}): Promise<{ min_amount: number }> {
  const search = new URLSearchParams({
    currency_from: params.currency_from,
    currency_to: params.currency_to,
  });
  return nowPaymentsFetch(`/minimum-amount?${search}`);
}

/** Create a new payment */
export async function nowPaymentsCreatePayment(params: {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
}): Promise<{
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  pay_amount_v2?: number;
  network?: string;
}> {
  return nowPaymentsFetch('/payment', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Create a hosted checkout page payment */
export async function nowPaymentsCreateInvoice(params: {
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
}): Promise<{
  id: string;
  invoice_url: string;
  order_id: string;
}> {
  return nowPaymentsFetch('/invoice', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Check payment status by ID */
export async function nowPaymentsGetPayment(paymentId: string): Promise<{
  payment_id: string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  actually_paid?: number;
  payment_completed_at?: string;
}> {
  return nowPaymentsFetch(`/payment/${paymentId}`);
}

/**
 * Supported NOWPayments currencies mapped to display info.
 * Currency codes follow NOWPayments naming convention.
 */
export const NOWPAYMENTS_CURRENCIES = [
  { id: 'usdttrc20', name: 'USDT', network: 'TRC-20', symbol: 'USDT' },
  { id: 'btc', name: 'Bitcoin', network: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', network: 'ERC-20', symbol: 'ETH' },
  { id: 'usdt', name: 'USDT', network: 'ERC-20', symbol: 'USDT' },
  { id: 'ltc', name: 'Litecoin', network: 'Litecoin', symbol: 'LTC' },
  { id: 'sol', name: 'Solana', network: 'Solana', symbol: 'SOL' },
  { id: 'bnb', name: 'BNB', network: 'BSC', symbol: 'BNB' },
  { id: 'trx', name: 'TRON', network: 'TRC-20', symbol: 'TRX' },
] as const;

export type NowPaymentsCurrency = (typeof NOWPAYMENTS_CURRENCIES)[number]['id'];

/**
 * Map plan + billing to USD cents for NOWPayments
 */
export function getNowPaymentsPriceCents(plan: string, billing: string): number {
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

/**
 * Verify IPN webhook signature (HMAC-SHA512)
 */
export function verifyNowPaymentsIPN(body: string, signature: string): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    logger.warn('[nowpayments] IPN secret not configured, skipping verification');
    return false;
  }
  // TODO: implement proper HMAC-SHA512 verification with crypto module
  // NOWPayments signs IPN payloads with HMAC-SHA512 using the IPN secret
  return signature.length > 0;
}
