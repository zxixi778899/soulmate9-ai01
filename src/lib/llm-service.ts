/**
 * LLM Service — 直连 Coze API（不依赖 SDK）
 * 通过环境变量或缓存获取 Coze API 访问令牌
 */

// ── Token 缓存（避免每次调用都启动 Python 子进程）─────────
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
const TOKEN_CACHE_TTL = 50 * 60 * 1000; // 50 minutes (tokens typically expire in 1 hour)

// ── 获取 Coze API 访问令牌 ─────────────────────────
async function getCozeAccessToken(): Promise<string> {
  // Check cache first
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // Try environment variable first (preferred for production)
  const envToken = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || process.env.COZE_API_KEY;
  if (envToken) {
    cachedToken = envToken;
    tokenExpiry = Date.now() + TOKEN_CACHE_TTL;
    return envToken;
  }

  // Fallback: use Python to get token (only if env var not set)
  try {
    const { execSync } = await import('child_process');
    const token = execSync(
      'python3 -c "from coze_workload_identity import Client; print(Client().get_access_token())"',
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    cachedToken = token;
    tokenExpiry = Date.now() + TOKEN_CACHE_TTL;
    return token;
  } catch (err) {
    console.error('[llm-service] Failed to get Coze access token:', err);
    throw new Error('Failed to authenticate with Coze API. Set COZE_WORKLOAD_IDENTITY_API_KEY environment variable.');
  }
}

const API_BASE = process.env.COZE_INTEGRATION_MODEL_BASE_URL || process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn';
const DEFAULT_MODEL = 'doubao-seed-2-0-pro-260215';

/**
 * 调用 LLM 生成文本
 */
export async function generateText(options: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { prompt, systemPrompt, model = DEFAULT_MODEL, temperature = 0.7, maxTokens = 1024 } = options;
  const accessToken = await getCozeAccessToken();

  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ];

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`LLM API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const text = await res.text();
  
  // 尝试解析为纯 JSON
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content;
    if (content) return content;
  } catch {
    // 不是纯 JSON，尝试 SSE 格式
  }
  
  // 解析 SSE 格式
  let fullContent = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(line.slice(6));
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
        if (delta) fullContent += delta;
      } catch {
        // skip malformed
      }
    }
  }

  if (!fullContent) {
    throw new Error('LLM returned empty content');
  }

  return fullContent.trim();
}

/**
 * 生成结构化数据（JSON 输出）
 */
export async function generateStructured<T>(options: {
  prompt: string;
  systemPrompt?: string;
  model?: string;
}): Promise<T> {
  const systemPrompt = options.systemPrompt
    ? `${options.systemPrompt}\n\nAlways respond with valid JSON only, no markdown.`
    : 'Always respond with valid JSON only, no markdown.';

  const text = await generateText({
    ...options,
    systemPrompt,
  });

  // 提取 JSON（可能被 markdown 包裹）
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 200)}`);
  }
}
