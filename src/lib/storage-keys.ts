/**
 * 集中的 localStorage key 列表
 *
 * 之前各组件硬编码 'sb-{project_ref}-auth-token' 等字符串，容易在 Supabase project 切换时失效。
 * 这里集中管理，并提供类型化的 helper 防止 key 拼写错误。
 */

const PREFIX = 'soulmate9:';

export const StorageKeys = {
  /** 当前选中的语言（也支持 SSR cookie） */
  locale: `${PREFIX}locale`,
  /** onboarding 已读版本号 */
  onboardingVersion: `${PREFIX}onboarding_v`,
  /** 客户端匿名 ID（PostHog distinctId fallback） */
  anonymousId: `${PREFIX}anon_id`,
  /** PWA 安装提示是否已显示 */
  pwaInstallDismissed: `${PREFIX}pwa_install_dismissed`,
  /** 主题偏好（light/dark/system） */
  theme: `${PREFIX}theme`,
  /** 用户最近一次访问的 chat 女友 ID */
  lastVisitedGirlfriend: `${PREFIX}last_girlfriend`,
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

/**
 * 安全地读 localStorage（SSR 时返回 null）
 */
export function getStorageItem(key: StorageKey): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 安全地写 localStorage（SSR 时 no-op）
 */
export function setStorageItem(key: StorageKey, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota exceeded / disabled - silently ignore
  }
}

/**
 * 安全地删除
 */
export function removeStorageItem(key: StorageKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
