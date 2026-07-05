'use client';

/**
 * Service Worker 注册 hook
 *
 * - 仅在 production + https + 浏览器支持时注册
 * - dev 模式完全跳过（避免缓存阻碍调试）
 * - 检测到更新时自动提示用户刷新
 */

import { useEffect, useState } from 'react';

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    const onUpdate = (registration: ServiceWorkerRegistration) => {
      const waiting = registration.waiting;
      if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setUpdateAvailable(true);
      }
    };

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // 检查已有更新
        if (registration.waiting) {
          onUpdate(registration);
        }
        registration.addEventListener('updatefound', () => {
          const newSw = registration.installing;
          if (!newSw) return;
          newSw.addEventListener('statechange', () => {
            if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
              onUpdate(registration);
            }
          });
        });
      })
      .catch(() => {
        // 注册失败不抛错
      });

    // 监听 controller 切换（用户接受更新后）
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  return { updateAvailable };
}
