'use client';

/**
 * SW 
 *  useServiceWorker hook  register
 */

import { useServiceWorker } from '@/hooks/useServiceWorker';

export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
