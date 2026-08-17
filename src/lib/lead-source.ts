/**
 * Lead source attribution — 投流归因（AB 站漏斗）。
 *
 * 链路：A 站 CTA → B 站 ?src=meta&subid=xxx&utm_*&fbclid
 *   → middleware 写 `lead_src` Cookie（30 天）
 *   → /api/auth/signup 落库（profiles.lead_source + user metadata）
 *   → 服务端 CAPI 上报 Lead 事件（见 @/lib/meta-capi）
 */

export const LEAD_COOKIE_NAME = 'lead_src';
export const LEAD_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/** 归因字段白名单（URL 参数名 → 落库字段名） */
const LEAD_FIELDS = [
  'src', // 渠道：meta / tiktok ...
  'medium', // astar / bstar ...
  'placement', // A 站点位：hero / chat_demo / girl_luna ...
  'subid', // A 站生成的访问唯一 ID（归因主键）
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type LeadSource = Partial<Record<(typeof LEAD_FIELDS)[number], string>> & {
  /** 首次触达时间（ISO） */
  ts?: string;
};

/** 从 query string 提取归因字段；无任何字段时返回 null */
export function extractLeadSource(searchParams: URLSearchParams): LeadSource | null {
  const lead: LeadSource = {};
  let found = false;
  for (const key of LEAD_FIELDS) {
    const value = searchParams.get(key);
    if (value) {
      lead[key] = value.slice(0, 512); // 防御超长注入
      found = true;
    }
  }
  if (!found) return null;
  lead.ts = new Date().toISOString();
  return lead;
}

/** 解析 Cookie 中的归因数据（容错：损坏数据返回 null） */
export function parseLeadCookie(cookieValue: string | undefined | null): LeadSource | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue)) as LeadSource;
    if (!parsed || typeof parsed !== 'object') return null;
    const hasField = LEAD_FIELDS.some((key) => parsed[key]);
    return hasField ? parsed : null;
  } catch {
    return null;
  }
}

/** 从 Request Cookie header 读取归因数据 */
export function readLeadSourceFromRequest(request: Request): LeadSource | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const match = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LEAD_COOKIE_NAME}=`));
  if (!match) return null;
  return parseLeadCookie(match.slice(LEAD_COOKIE_NAME.length + 1));
}

/** 序列化为 Set-Cookie 值 */
export function serializeLeadCookie(lead: LeadSource): string {
  return `${LEAD_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(lead))}; Path=/; Max-Age=${LEAD_COOKIE_MAX_AGE}; SameSite=Lax`;
}
