/**
 * TRC-20 USDT on-chain verification via TronGrid public API.
 *
 * No SDK required — uses plain fetch against TronGrid REST endpoints.
 * The TRC-20 USDT contract on TRON: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
 */

import { logger } from '@/lib/logger';

const TRONGRID_BASE = 'https://api.trongrid.io';
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export interface TronVerifyResult {
  verified: boolean;
  amountUsd?: number;
  confirmations?: number;
  reason?: string;
}

/**
 * Verify a TRC-20 USDT transfer on the TRON blockchain.
 *
 * Checks:
 *  1. Transaction exists and is confirmed on-chain
 *  2. `to` address matches our receiving wallet
 *  3. USDT amount (from TRC20 transfer event) >= expected amount
 *  4. Block confirmations >= minimum (default 2)
 */
export async function verifyTrc20UsdtTransfer(
  txHash: string,
  expectedWalletAddress: string,
  expectedAmountUsd: number,
  minConfirmations = 2,
): Promise<TronVerifyResult> {
  try {
    // ── Fetch transaction detail ────────────────────────────────────────────
    const txRes = await fetch(`${TRONGRID_BASE}/v1/transactions/${txHash}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!txRes.ok) {
      return { verified: false, reason: `TronGrid HTTP ${txRes.status}` };
    }
    const txBody = await txRes.json() as {
      data?: Array<{
        ret?: Array<{ contractRet?: string }>;
        raw_data?: { contract?: Array<{ parameter?: { value?: Record<string, string> } }> };
      }>;
      success?: boolean;
      error?: string;
    };
    const txData = txBody.data?.[0];
    if (!txData) {
      return { verified: false, reason: 'Transaction not found on TRON network' };
    }
    if (txData.ret?.[0]?.contractRet !== 'SUCCESS') {
      return { verified: false, reason: `Transaction status: ${txData.ret?.[0]?.contractRet || 'unknown'}` };
    }

    // ── Fetch TRC20 transfer events for this tx ───────────────────────────
    const trc20Res = await fetch(
      `${TRONGRID_BASE}/v1/transactions/${txHash}/trc20`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!trc20Res.ok) {
      return { verified: false, reason: `TronGrid TRC20 HTTP ${trc20Res.status}` };
    }
    const trc20Body = await trc20Res.json() as {
      data?: Array<{
        to?: string;
        from?: string;
        value?: string;
        token_info?: { address?: string; decimals?: string; symbol?: string };
        block_timestamp?: number;
        transaction_id?: string;
      }>;
      meta?: { fingerprint?: string; at?: number };
      success?: boolean;
    };
    const transfers = trc20Body.data || [];

    // Find a USDT transfer to our wallet
    const match = transfers.find((t) => {
      const tokenAddr = t.token_info?.address;
      const toAddr = t.to;
      return (
        tokenAddr?.toUpperCase() === USDT_TRC20_CONTRACT.toUpperCase() &&
        toAddr?.toUpperCase() === expectedWalletAddress.toUpperCase()
      );
    });

    if (!match) {
      return {
        verified: false,
        reason: `No USDT TRC-20 transfer to ${expectedWalletAddress.slice(0, 8)}… found in this tx`,
      };
    }

    // ── Check amount (USDT has 6 decimals) ────────────────────────────────
    const decimals = Number(match.token_info?.decimals || 6);
    const rawAmount = BigInt(match.value || '0');
    const amountUsd = Number(rawAmount) / 10 ** decimals;

    // Allow 0.5% tolerance for network rounding / exchange rate drift
    const tolerance = Math.max(expectedAmountUsd * 0.005, 0.10);
    if (amountUsd < expectedAmountUsd - tolerance) {
      return {
        verified: false,
        amountUsd,
        reason: `Amount mismatch: received $${amountUsd.toFixed(2)}, expected $${expectedAmountUsd.toFixed(2)}`,
      };
    }

    // ── Check block confirmations ─────────────────────────────────────────
    // TRON produces blocks every ~3 seconds.
    // TronGrid TRC20 events include block_timestamp; use elapsed time as proxy.
    let confirmations = 999;
    if (match.block_timestamp) {
      const elapsed = Date.now() - match.block_timestamp;
      confirmations = Math.floor(elapsed / 3000);
    }

    if (confirmations < minConfirmations) {
      return {
        verified: false,
        amountUsd,
        confirmations,
        reason: `Insufficient confirmations: ${confirmations}/${minConfirmations}`,
      };
    }

    logger.info('[tron-verify] USDT transfer verified', {
      txHash: txHash.slice(0, 16) + '…',
      amountUsd: amountUsd.toFixed(2),
      confirmations,
    });

    return { verified: true, amountUsd, confirmations };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[tron-verify] Verification error:', { err: msg, txHash });
    return { verified: false, reason: `Verification error: ${msg}` };
  }
}
