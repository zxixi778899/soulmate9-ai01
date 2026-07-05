/**
 * PostHog 
 *
 * -  + funnel 
 * -  posthog-js  PostHogProvider
 *
 * 
 * 1. posthog-node  no-op
 * 2. POSTHOG_API_KEY / POSTHOG_PROJECT_API_KEY 
 * 3. fire-and-forget
 * 4.  server / route  super properties
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
        // 
        flushInterval: Number(process.env.POSTHOG_FLUSH_INTERVAL ?? 5000),
        // 1 
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
 * 
 *
 * @param distinctId  ID  ID
 * @param event  'chat_message_sent', 'subscription_started'
 * @param properties 
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
        // 
        server: true,
        env: process.env.NODE_ENV,
        route: properties?.route as string | undefined,
      },
    });
  } catch {
    // 
  }
}

/**
 *  ID   ID
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
 *  serverless  flush Vercel function 
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
 *  PostHog  + key 
 */
export function isPostHogActive(): boolean {
  return ensureInitialized() !== null && !!process.env.POSTHOG_API_KEY;
}

// 
// 
// 
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
