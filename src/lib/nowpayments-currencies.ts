/**
 * Supported NOWPayments currencies mapped to display info.
 *
 * Client-safe: pure constants with no Node.js dependencies, so UI components
 * can import this without dragging the server-only payment gateway (and its
 * `node:crypto` usage) into the client bundle.
 *
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
