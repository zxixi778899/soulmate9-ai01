import { logger } from '@/lib/logger';
/**
 * Coze API 认证工具
 * 支持两种环境：
 * 1. Coze 沙箱：使用 Python coze_workload_identity
 * 2. Vercel/生产：使用环境变量直接调用 API
 */

// 缓存 token，避免每次请求都调用
let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * 获取 Coze API 访问令牌（JWT）
 * Token 有效期约 2 小时，缓存 1.5 小时后刷新
 */
export async function getCozeAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  // 优先使用环境变量（Vercel/生产环境）
  const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
  const clientSecret = process.env.COZE_WORKLOAD_IDENTITY_CLIENT_SECRET;

  if (apiKey && clientSecret) {
    try {
      // 使用环境变量直接调用 Coze API 获取 token
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

  // 回退到 Python 模块（Coze 沙箱环境）
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
 * 清除缓存的 token（用于强制刷新）
 */
export function clearCozeTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Coze API 基础 URL
 */
export const COZE_API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL
  || `${process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn'}/api/v3`;

/**
 * 默认模型
 */
export const DEFAULT_LLM_MODEL = 'doubao-seed-2-0-pro-260215';
