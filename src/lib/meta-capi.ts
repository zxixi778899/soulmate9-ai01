/**
 * Meta Conversions API (CAPI) — 服务端事件上报。
 *
 * 用途：
 * 1. A 站 CTA/PageView 事件经 /api/meta/capi 代理转发（A 站是纯静态，
 *    access token 不能放前端，统一由 B 站服务端代发）。
 * 2. 注册成功时直接上报 Lead 事件（/api/auth/signup）。
 *
 * 环境变量：META_PIXEL_ID / META_CAPI_ACCESS_TOKEN（未配置时静默跳过）。
 * 与浏览器 Pixel 通过相同 event_id 去重（deduplication）。
 */
import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

const GRAPH_VERSION = 'v23.0';

/** A 站代理允许的事件白名单（防滥用） */
export const CAPI_ALLOWED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'CompleteRegistration',
  'Subscribe',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface CapiEventInput {
  eventName: string;
  /** 与浏览器 Pixel 端相同的 eventID（去重用） */
  eventId?: string;
  eventTime?: number; // 秒级时间戳
  subid?: string;
  fbclid?: string;
  /** 浏览器 _fbp cookie（A 站转发） */
  fbp?: string;
  /** fbc 优先直传；缺省时由 fbclid 组装 */
  fbc?: string;
  email?: string;
  clientIp?: string;
  userAgent?: string;
  landingUrl?: string;
  customData?: Record<string, string | number>;
}

/** 组装 user_data（全部哈希字段按 Meta 规范 SHA-256） */
function buildUserData(input: CapiEventInput): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  if (input.subid) userData.external_id = sha256(input.subid);
  if (input.email) userData.em = sha256(input.email);
  if (input.fbp) userData.fbp = input.fbp;
  const fbc =
    input.fbc ||
    (input.fbclid ? `fb.1.${Date.now()}.${input.fbclid}` : undefined);
  if (fbc) userData.fbc = fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  return userData;
}

/**
 * 上报单个事件到 Meta CAPI。fire-and-forget 语义：
 * 失败只记日志，绝不阻塞业务主流程。
 */
export async function sendCapiEvent(input: CapiEventInput): Promise<boolean> {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !token) return false;
  if (!CAPI_ALLOWED_EVENTS.has(input.eventName)) return false;

  const event = {
    event_name: input.eventName,
    event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: input.eventId,
    event_source_url: input.landingUrl,
    action_source: 'website',
    user_data: buildUserData(input),
    ...(input.customData ? { custom_data: input.customData } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event], access_token: token }),
      }
    );
    const body = await res.json();
    if (!res.ok) {
      logger.warn('[META:CAPI] event rejected', {
        data: { event: input.eventName, status: res.status, body },
      });
      return false;
    }
    logger.info('[META:CAPI] event sent', {
      data: { event: input.eventName, events_received: body.events_received },
    });
    return true;
  } catch (err) {
    logger.warn('[META:CAPI] send failed', { data: { event: input.eventName, err: String(err) } });
    return false;
  }
}
