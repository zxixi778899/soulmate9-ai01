'use client';

import { useEffect, useState } from 'react';

/**
 * 主页伴侣网格当前断点的实际列数（与 page.tsx 中
 * `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` 对应）。
 * 用于「固定 N 行」截断：总格数 = 列数 × 行数。
 */
export function useGridColumns(): number {
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const queries = [
      { mq: window.matchMedia('(min-width: 1280px)'), value: 5 },
      { mq: window.matchMedia('(min-width: 1024px)'), value: 4 },
      { mq: window.matchMedia('(min-width: 640px)'), value: 3 },
    ];
    const apply = (): void => {
      for (const { mq, value } of queries) {
        if (mq.matches) {
          setCols(value);
          return;
        }
      }
      setCols(2);
    };
    apply();
    queries.forEach(({ mq }) => mq.addEventListener?.('change', apply));
    return () => queries.forEach(({ mq }) => mq.removeEventListener?.('change', apply));
  }, []);
  return cols;
}
