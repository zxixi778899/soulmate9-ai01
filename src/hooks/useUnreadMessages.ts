'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

type UnreadData = {
  counts: Record<string, number>;
  total: number;
};

/**
 * Hook to fetch and manage unread proactive message counts.
 * Polls every 60s and refreshes on data change events.
 */
export function useUnreadMessages() {
  const { user } = useAuth();
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
    if (!user) return;
    void refresh();
    const interval = setInterval(refresh, 60_000);
    // Instant cross-component sync: any mark-read dispatches this event.
    const onChanged = () => void refresh();
    window.addEventListener('soulmate:unread-changed', onChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('soulmate:unread-changed', onChanged);
    };
  }, [refresh, user]);

  return { unreadCounts: data.counts, unreadTotal: data.total, refreshUnread: refresh, loading };
}
