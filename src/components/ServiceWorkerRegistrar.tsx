'use client';

/**
 * SW 注册占位组件
 * 实际逻辑在 useServiceWorker hook 内（生产环境自动 register）
 */

import { useServiceWorker } from '@/hooks/useServiceWorker';

export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
