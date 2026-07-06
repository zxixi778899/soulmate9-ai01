import { logger } from '@/lib/logger';

/**
 * Coze API Authentication — single source of truth
 *
 * Obtains a JWT via the Coze authorization/token endpoint using
 * workload-identity credentials (API key + client secret).
 *
 * Token is cached in-memory with a 50-minute TTL (tokens are valid
 * for ~2 hours, so this gives a comfortable safety margin).
 *
 * This module is safe for serverless (Vercel / Railway) — no child_process.
 */

// ── Token cache ──────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;
const TOKEN_CACHE_TTL = 50 * 60 * 1000; // 50 minutes

/**
 * Obtain a Coze API JWT access token.
 *
 * 1. Return cached token if still valid.
 * 2. Exchange workload-identity credentials for a fresh JWT via HTTP POST.
 * 3. Throw a clear error if required env vars are missing.
 */
export async function getCozeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const clientSecret = process.env.COZE_WORKLOAD_IDENTITY_CLIENT_SECRET;

  if (!apiKey || !clientSecret) {
    throw new Error(
      '[coze-auth] Missing COZE_WORKLOAD_IDENTITY_API_KEY or COZE_WORKLOAD_IDENTITY_CLIENT_SECRET env vars. ' +
      'Set both to enable Coze API authentication.'
    );
  }

  try {
    const response = await fetch('https://api.coze.cn/api/authorization/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'unknown');
      throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await response.json();
    const token: string | undefined = data.access_token || data.token;

    if (!token) {
      throw new Error('No access_token in Coze authorization response');
    }

    cachedToken = token;
    tokenExpiry = now + TOKEN_CACHE_TTL;

    logger.info('[coze-auth] Token refreshed, expires in 50 min');
    return token;
  } catch (err) {
    logger.error('[coze-auth] Failed to obtain Coze access token', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Failed to authenticate with Coze API');
  }
}

/**
 * Clear the in-memory token cache (useful for tests or forced refresh).
 */
export function clearCozeTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Coze Integration API base URL.
 */
export const COZE_API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL
  || `${process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn'}/api/v3`;

/**
 * Default LLM model identifier.
 */
export const DEFAULT_LLM_MODEL = 'doubao-seed-2-0-pro-260215';
