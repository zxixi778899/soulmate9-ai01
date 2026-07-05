import { logger } from '@/lib/logger';
/**
 * Cryptocurrency wallet addresses for payment processing
 * In production, override via env vars:
 *   CRYPTO_WALLET_USDT, CRYPTO_WALLET_BTC, CRYPTO_WALLET_ETH
 */

export interface CryptoCurrency {
  id: string;
  name: string;
  symbol: string;
  network: string;
  address: string;
  icon: string;
  minConfirmations: number;
}

export const CRYPTO_CURRENCIES: CryptoCurrency[] = [
  {
    id: 'usdt-trc20',
    name: 'USDT',
    symbol: 'USDT',
    network: 'TRC-20',
    address: process.env.CRYPTO_WALLET_USDT || '',
    icon: '',
    minConfirmations: 2,
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    network: 'Bitcoin',
    address: process.env.CRYPTO_WALLET_BTC || '',
    icon: '',
    minConfirmations: 3,
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    network: 'ERC-20',
    address: process.env.CRYPTO_WALLET_ETH || '',
    icon: '',
    minConfirmations: 12,
  },
];

/**
 * Crypto-to-USD exchange rates
 * -  fallback  API 
 * -  fetchLiveCryptoRates()  CoinGecko  5 
 */
export const CRYPTO_RATES_FALLBACK: Record<string, number> = {
  USDT: 1.0,
  BTC: 67000,
  ETH: 3400,
};

// 
export const CRYPTO_RATES: Record<string, number> = { ...CRYPTO_RATES_FALLBACK };

// 5  TTL
interface RatesCache {
  rates: Record<string, number>;
  fetchedAt: number;
}
let ratesCache: RatesCache | null = null;
const RATES_TTL_MS = 5 * 60 * 1000;

// CoinGecko  API key
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin,ethereum&vs_currencies=usd';

/**
 *  CoinGecko 
 *  5 
 */
export async function fetchLiveCryptoRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (ratesCache && now - ratesCache.fetchedAt < RATES_TTL_MS) {
    return ratesCache.rates;
  }

  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { 'accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number }>;
    const rates: Record<string, number> = {
      USDT: data.tether?.usd ?? CRYPTO_RATES_FALLBACK.USDT,
      BTC: data.bitcoin?.usd ?? CRYPTO_RATES_FALLBACK.BTC,
      ETH: data.ethereum?.usd ?? CRYPTO_RATES_FALLBACK.ETH,
    };
    // 
    for (const k of Object.keys(rates)) {
      CRYPTO_RATES[k] = rates[k];
    }
    ratesCache = { rates, fetchedAt: now };
    return rates;
  } catch (e) {
    logger.warn('[crypto-config] fetchLiveCryptoRates failed, using fallback:', { err: e });
    return CRYPTO_RATES_FALLBACK;
  }
}

/**
 * Calculate crypto amount for a given USD price and currency
 *  fallback await fetchLiveCryptoRates()
 */
export function getCryptoAmount(usdCents: number, currencyId: string): string {
  const usd = usdCents / 100;
  const rate = CRYPTO_RATES[currencyId] ?? CRYPTO_RATES_FALLBACK[currencyId] ?? 1;
  const amount = usd / rate;

  if (currencyId === 'USDT') return amount.toFixed(2);
  if (currencyId === 'BTC') return amount.toFixed(6);
  if (currencyId === 'ETH') return amount.toFixed(4);
  return amount.toFixed(6);
}

/**
 *  API 
 */
export async function getCryptoAmountLive(usdCents: number, currencyId: string): Promise<string> {
  await fetchLiveCryptoRates();
  return getCryptoAmount(usdCents, currencyId);
}

/**
 * Plan pricing in cents
 */
export const PLAN_PRICES: Record<string, number> = {
  pro: 1999,       // $19.99
  unlimited: 3999, // $39.99
};
