/**
 * PostHog 分析适配层（懒加载）
 *
 * - 服务端：用于事件埋点 + funnel 分析
 * - 客户端：通过 posthog-js 单独接入（见 PostHogProvider）
 *
 * 设计原则：
 * 1. posthog-node 未安装时静默 no-op
 * 2. POSTHOG_API_KEY / POSTHOG_PROJECT_API_KEY 未配时不上报
 * 3. 不阻塞主流程（fire-and-forget）
 * 4. 自动注入 server / route 上下文作为 super properties
 */

interface PostHogLike {
  capture(options: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    timestamp?: Date;
  }): void;
  identify(options: {
    distinctId: string;
    properties?: Record<string, unknown>;
  }): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

let phInstance: PostHogLike | null = null;
let initialized = false;

function loadPostHog(): PostHogLike | null {
  if (phInstance !== null) return phInstance;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PostHog } = require('posthog-node');
    phInstance = new PostHog(
      process.env.POSTHOG_API_KEY || process.env.POSTHOG_PROJECT_API_KEY || 'disabled',
      {
        host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
        // 批量发送：避免阻塞主流程
        flushInterval: Number(process.env.POSTHOG_FLUSH_INTERVAL ?? 5000),
        // 失败重试：1 次即丢（不要阻塞业务）
        maxRetries: 1,
      },
    ) as PostHogLike;
  } catch {
    phInstance = null;
  }
  return phInstance;
}

function ensureInitialized(): PostHogLike | null {
  if (initialized) return loadPostHog();
  initialized = true;
  return loadPostHog();
}

/**
 * 上报一个事件（服务端）
 *
 * @param distinctId 用户 ID 或匿名 ID
 * @param event 事件名（如 'chat_message_sent', 'subscription_started'）
 * @param properties 事件属性
 */
export function capture(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = ensureInitialized();
  if (!ph || !process.env.POSTHOG_API_KEY) return;
  try {
    ph.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        // 自动注入的服务端环境上下文
        server: true,
        env: process.env.NODE_ENV,
        route: properties?.route as string | undefined,
      },
    });
  } catch {
    // 上报失败不抛错
  }
}

/**
 * 标识用户（合并匿名 ID → 用户 ID）
 */
export function identify(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  const ph = ensureInitialized();
  if (!ph || !process.env.POSTHOG_API_KEY) return;
  try {
    ph.identify({ distinctId, properties });
  } catch {
    // no-op
  }
}

/**
 * 在 serverless 环境中强制 flush（如 Vercel function 退出前）
 */
export async function flush(): Promise<void> {
  const ph = ensureInitialized();
  if (!ph) return;
  try {
    await ph.flush();
  } catch {
    // no-op
  }
}

/**
 * 判断 PostHog 是否已可用（包已装 + key 已配）
 */
export function isPostHogActive(): boolean {
  return ensureInitialized() !== null && !!process.env.POSTHOG_API_KEY;
}

// ─────────────────────────────────────────
// 业务事件常量（统一埋点名称）
// ─────────────────────────────────────────
export const AnalyticsEvents = {
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  CHAT_MESSAGE_SENT: 'chat_message_sent',
  CHAT_MESSAGE_RECEIVED: 'chat_message_received',
  IMAGE_GENERATED: 'image_generated',
  IMAGE_CACHED_HIT: 'image_cache_hit',
  VIDEO_GENERATED: 'video_generated',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  GIRLFRIEND_CREATED: 'girlfriend_created',
  GIRLFRIEND_PUBLISHED: 'girlfriend_published',
  GIFT_SENT: 'gift_sent',
  ITEM_PURCHASED: 'item_purchased',
  PROACTIVE_MESSAGE_SENT: 'proactive_message_sent',
  LLM_FALLBACK_USED: 'llm_fallback_used',
  ADMIN_ACTION: 'admin_action',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
