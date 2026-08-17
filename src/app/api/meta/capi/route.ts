import { NextResponse } from 'next/server';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sendCapiEvent, CAPI_ALLOWED_EVENTS } from '@/lib/meta-capi';

/**
 * Meta CAPI 代理端点 — 供 A 站（纯静态，无法持有 access token）转发事件。
 *
 * 请求：POST { event_name, event_id, event_time, subid, fbclid, fbp, landing_url }
 * 鉴权：x-capi-key 共享密钥（env META_CAPI_SHARED_KEY）+ IP 限流。
 * 注意：sendBeacon 发送的 body 为 JSON 时无自定义 header 能力受限，
 * 因此密钥同时接受 query 参数 ?key=（sendBeacon URL 携带）。
 */

const CAPI_PROXY_LIMIT = { maxRequests: 90, windowMs: 60_000 }; // 90/min per IP

interface CapiProxyBody {
  event_name?: string;
  event_id?: string;
  event_time?: number;
  subid?: string;
  fbclid?: string;
  fbp?: string;
  landing_url?: string;
}

function str(value: unknown, max = 512): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // 鉴权：共享密钥（header 或 query）
  const url = new URL(request.url);
  const key = request.headers.get('x-capi-key') || url.searchParams.get('key');
  const expected = process.env.META_CAPI_SHARED_KEY;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 限流
  const rl = rateLimitMiddleware(`meta-capi:${ip}`, CAPI_PROXY_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
  }

  let body: CapiProxyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName = str(body.event_name, 64);
  if (!eventName || !CAPI_ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: 'Event not allowed' }, { status: 400 });
  }

  // event_time 防伪造：仅接受最近 10 分钟内的事件
  const now = Math.floor(Date.now() / 1000);
  const eventTime =
    typeof body.event_time === 'number' && Math.abs(now - body.event_time) < 600
      ? body.event_time
      : now;

  const sent = await sendCapiEvent({
    eventName,
    eventId: str(body.event_id, 64),
    eventTime,
    subid: str(body.subid, 128),
    fbclid: str(body.fbclid, 256),
    fbp: str(body.fbp, 128),
    landingUrl: str(body.landing_url, 1024),
    clientIp: ip,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  if (!sent) {
    logger.warn('[META:CAPI-PROXY] forward failed', { data: { event: eventName, ip } });
  }
  // 无论 Graph API 是否成功都回 204，避免 A 站重试风暴
  return new NextResponse(null, { status: 204 });
}
