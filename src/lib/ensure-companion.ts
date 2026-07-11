/**
 * Ensure a catalog/demo companion exists in the user's girlfriends table,
 * then return the real UUID for /chat/[id].
 */

import { authedFetch } from '@/lib/supabase';
import type { DemoGirl } from '@/lib/demo-data';

export async function ensureCompanionChatId(girl: {
  id: string;
  name: string;
  age?: number;
  tagline?: string;
  portrait?: string;
  avatar?: string;
  tags?: string[];
  personality?: string;
  relationship?: string;
}): Promise<string | null> {
  // 1) Already a real UUID in user's collection?
  try {
    const listRes = await authedFetch('/api/girlfriends');
    if (listRes.ok) {
      const data = await listRes.json();
      const list = (data.girlfriends || []) as Array<{ id: string; name: string }>;
      const byId = list.find((g) => g.id === girl.id);
      if (byId) return byId.id;
      const byName = list.find(
        (g) => g.name.toLowerCase() === girl.name.toLowerCase(),
      );
      if (byName) return byName.id;
    }
  } catch {
    /* continue create */
  }

  // 2) Create a private clone for this user (uses a friend seat)
  try {
    const res = await authedFetch('/api/girlfriends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: girl.name,
        age: girl.age ?? 22,
        short_description: girl.tagline || '',
        personality: girl.personality || (girl.tags || []).join(', '),
        tags: girl.tags || [],
        portrait_url: girl.portrait || girl.avatar || undefined,
        avatar_url: girl.avatar || girl.portrait || undefined,
        meta: {
          source: 'catalog',
          catalog_id: girl.id,
          relationship: girl.relationship || 'girlfriend',
        },
      }),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const err = new Error(
        (data as { error?: string }).error || 'Failed to add companion',
      ) as Error & { code?: string; seats?: unknown };
      err.code = (data as { code?: string }).code;
      err.seats = (data as { seats?: unknown }).seats;
      throw err;
    }
    return (
      (data as { girlfriend?: { id?: string } }).girlfriend?.id ||
      (data as { id?: string }).id ||
      null
    );
  } catch (err) {
    throw err;
  }
}

export async function openCompanionChat(
  girl: DemoGirl & { relationship?: string },
  router: { push: (href: string) => void },
): Promise<boolean> {
  try {
    const chatId = await ensureCompanionChatId(girl);
    if (!chatId) return false;
    try {
      sessionStorage.setItem(
        'soulmate_selected_companion',
        JSON.stringify({ id: chatId, name: girl.name, portrait: girl.portrait }),
      );
    } catch {
      /* ignore */
    }
    router.push(`/chat/${chatId}`);
    return true;
  } catch (err) {
    throw err;
  }
}
