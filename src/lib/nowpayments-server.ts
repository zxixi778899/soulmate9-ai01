/**
 * NOWPayments crypto payment gateway - v2.1.0 (force rebuild marker)
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
  if (!key) {
    logger.error('[nowpayments] API Key not configured!');
    throw new Error('NOWPayments is misconfigured - API Key missing in environment variables');
  }
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
    let text = '';
    try {
      text = await res.text().catch(() => '');
    } catch (e) {
      text = '[unable to read response body]';
    }
    
    logger.error('NOWPayments API error:', {
      path,
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
    
    throw new Error(`NOWPayments ${path} HTTP ${res.status}: ${text || 'Unknown error'}`);
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
// This endpoint may not exist in all NOWPayments API versions.
// Using hardcoded defaults with generous safety margins based on common NOWPayments configurations:
export function getMinimumAmount(currency: string): number {
  // Common minimum amounts by currency (in USD) - higher thresholds to prevent AMOUNT_MINIMAL_ERROR
  const MIN_AMOUNTS: Record<string, number> = {
    USDTTRC20: 8.0,   // USDT TRC-20 minimum $8 (NOWPayments often requires ~$7-8)
    USDT: 8.0,        // USDT ERC-20 minimum $8
    BTC: 15.0,        // Bitcoin minimum $15 (fractional BTC has different rules)
    ETH: 15.0,        // Ethereum minimum $15
    LTC: 15.0,        // Litecoin minimum $15
    SOL: 15.0,        // Solana minimum $15
    BNB: 15.0,        // BNB minimum $15
    TRX: 15.0,        // TRON minimum $15
    TON: 15.0,        // Toncoin minimum $15
  };
  
  return MIN_AMOUNTS[currency.toUpperCase()] || 8.0; // Default to $8 if unknown
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
  logger.info('[nowpayments] Creating payment:', {
    price_amount: params.price_amount,
    price_currency: params.price_currency,
    pay_currency: params.pay_currency,
    order_id: params.order_id.slice(-8), // Log last 8 chars for privacy
  });
  
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
    pro: 999,
    premium: 1999,
    unlimited: 3499,
  };
  const base = basePrices[plan] ?? 0;
  if (base === 0) return 0;

  const discounts: Record<string, { multiplier: number; discount: number }> = {
    monthly: { multiplier: 1, discount: 1.0 },
    yearly: { multiplier: 12, discount: 0.85 }, // Pro 17% off; Premium/Unlimited 20% off (see YEARLY_PRICES)
  };
  const cycle = discounts[billing] ?? discounts.monthly;
  
  // For yearly billing, use exact values from crypto-config (.env.local)
  if (billing === 'yearly') {
    const yearlyMap: Record<string, number> = {
      pro: 8499,        // $84.99 (17% off from $99.99)
      premium: 16999,   // $169.99 (20% off from $199.99)
      unlimited: 25499, // $254.99 (25% off from $299.99)
    };
    return yearlyMap[plan] ?? 0;
  }
  
  return Math.round(base * cycle.multiplier * cycle.discount);
}

/**
 * Get token package price in USD cents from environment or fallback
 */
export function getTokenPackagePriceCents(tokenCount: number): number {
  // Check environment variables first
  const envPrices: Record<string, number> = {
    '500': parseInt(process.env.CRYPTO_TOKENS_500_PRICE || '599'),
    '1000': parseInt(process.env.CRYPTO_TOKENS_1000_PRICE || '999'),
    '2500': parseInt(process.env.CRYPTO_TOKENS_2500_PRICE || '2299'),
    '5000': parseInt(process.env.CRYPTO_TOKENS_5000_PRICE || '3999'),
    '10000': parseInt(process.env.CRYPTO_TOKENS_10000_PRICE || '6999'),
  };
  
  // Try to find exact match
  let price = envPrices[String(tokenCount)];
  if (price > 0) return price;
  
  // Fallback to hardcoded rates: 1000 credits = $9.99
  const ratePerToken = 0.00999; // ~$0.01 per token
  return Math.round(tokenCount * ratePerToken * 100);
}

/**
 * Verify IPN webhook signature using HMAC-SHA512
 * NOWPayments sends signature in IPNSignature header
 * 
 * @param body - Raw request body as string (must be exact same content)
 * @param signature - Signature from IPNSignature header
 * @returns true if signature is valid
 */
export function verifyNowPaymentsIPN(body: string, signature: string): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    logger.warn('[nowpayments] IPN secret not configured, skipping verification');
    return false;
  }

  // NOWPayments uses HMAC-SHA512: signature = hmac_sha512(ipn_secret, raw_body_as_hex_string)
  // The body must be converted to hex before signing
  const crypto = require('crypto');
  
  // Convert body to hex string
  const bodyHex = Buffer.from(body, 'utf8').toString('hex');
  const expectedSignature = crypto.createHmac('sha512', secret).update(bodyHex, 'hex').digest('hex');
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature.toLowerCase(), 'hex'),
    Buffer.from(expectedSignature.toLowerCase(), 'hex')
  );
}
