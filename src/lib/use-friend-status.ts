'use client';

/**
 * useFriendStatus — client-side friend-status awareness.
 *
 * Fetches GET /api/friends once per auth state and exposes an `isFriend(girl)`
 * matcher using the same rules as ensureCompanionChatId (exact id match first,
 * then case-insensitive name match), plus `refresh()` to re-sync after a
 * successful add so card/detail UI can flip from "ADD" to "去聊天".
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';

type FriendRef = { id: string; name: string };

export function useFriendStatus() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [names, setNames] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      setNames(new Set());
      setLoaded(true);
      return;
    }
    try {
      const res = await authedFetch('/api/friends');
      if (res.ok) {
        const data = (await readResponseJson(res).catch(() => ({}))) as {
          friends?: FriendRef[];
        };
        const list = Array.isArray(data.friends) ? data.friends : [];
        setIds(new Set(list.map((f) => f.id)));
        setNames(new Set(list.map((f) => (f.name || '').toLowerCase())));
      }
    } catch {
      /* keep previous state */
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh]);

  const isFriend = useCallback(
    (girl: { id?: string; name?: string } | null | undefined): boolean => {
      if (!girl || !loaded) return false;
      if (girl.id && ids.has(girl.id)) return true;
      if (girl.name && names.has(girl.name.toLowerCase())) return true;
      return false;
    },
    [ids, names, loaded],
  );

  return { isFriend, loaded, refresh };
}
