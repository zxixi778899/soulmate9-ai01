import { logger } from '@/lib/logger';
/**
 * Coze API 
 * 
 * 1. Coze  Python coze_workload_identity
 * 2. Vercel/ API
 */

//  token
let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 *  Coze API JWT
 * Token  2  1.5 
 */
export async function getCozeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  // Vercel/
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const clientSecret = process.env.COZE_WORKLOAD_IDENTITY_CLIENT_SECRET;

  if (apiKey && clientSecret) {
    try {
      //  Coze API  token
      const response = await fetch('https://api.coze.cn/api/authorization/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const token = data.access_token || data.token;

      if (!token) {
        throw new Error('No token in response');
      }

      cachedToken = token;
      tokenExpiry = now + 1.5 * 60 * 60 * 1000;
      return token;
    } catch (err) {
      logger.error('[coze-auth] Failed to get token via API:', { data: err });
      throw new Error('Failed to authenticate with Coze API');
    }
  }

  //  Python Coze 
  try {
    const { execSync } = await import('child_process');
    const token = execSync(
      'python3 -c "from coze_workload_identity import Client; print(Client().get_access_token())"',
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    cachedToken = token;
    tokenExpiry = now + 1.5 * 60 * 60 * 1000;
    return token;
  } catch (err) {
    logger.error('[coze-auth] Failed to get Coze access token via Python:', { data: err });
    throw new Error('Failed to authenticate with Coze API');
  }
}

/**
 *  token
 */
export function clearCozeTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Coze API  URL
 */
export const COZE_API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL
  || `${process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn'}/api/v3`;

/**
 * 
 */
export const DEFAULT_LLM_MODEL = 'doubao-seed-2-0-pro-260215';
