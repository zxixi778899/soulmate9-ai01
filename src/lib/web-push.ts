/**
 * Web Push 适配层（懒加载）
 *
 * - web-push 包未装时 no-op
 * - VAPID 未配置时 no-op
 * - 用户订阅存到 user_push_subscriptions 表
 */

interface PushSubscriptionLike {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface WebPushLike {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: PushSubscriptionLike,
    payload: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
}

let webpushInstance: WebPushLike | null = null;
let initialized = false;

function loadWebPush(): WebPushLike | null {
  if (webpushInstance !== null) return webpushInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webpushInstance = require('web-push') as WebPushLike;
  } catch {
    webpushInstance = null;
  }
  return webpushInstance;
}

function ensureInitialized(): WebPushLike | null {
  if (initialized) return loadWebPush();
  initialized = true;
  const wp = loadWebPush();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@soulmate9.com';
  if (wp && publicKey && privateKey) {
    try {
      wp.setVapidDetails(subject, publicKey, privateKey);
    } catch {
      // init 失败时下一次调用降级
    }
  }
  return wp;
}

/**
 * 推送一条 Web Push 通知
 */
export async function sendPushNotification(
  subscription: PushSubscriptionLike,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    tag?: string;
    data?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const wp = ensureInitialized();
  if (!wp) return { ok: false, error: 'web_push_disabled' };

  try {
    await wp.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/icon-192.png',
        data: { url: payload.url || '/', ...payload.data },
        tag: payload.tag,
      }),
      { TTL: '86400' }, // 24h 过期
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * 判断 Web Push 是否可用
 */
export function isPushActive(): boolean {
  return ensureInitialized() !== null && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}
