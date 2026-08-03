'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';

type UnreadData = {
  counts: Record<string, number>;
  total: number;
};

/**
 * Hook to fetch and manage unread proactive message counts.
 * Polls every 60s and refreshes on data change events.
 */
export function useUnreadMessages() {
  const [data, setData] = useState<UnreadData>({ counts: {}, total: 0 });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/chat/unread-count');
      const json = await res.json().catch(() => ({}));
      setData({
        counts: (json as { counts?: Record<string, number> }).counts || {},
        total: (json as { total?: number }).total || 0,
      });
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { unreadCounts: data.counts, unreadTotal: data.total, refreshUnread: refresh, loading };
}
