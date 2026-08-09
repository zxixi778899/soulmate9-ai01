/**
 * Ensure a catalog/demo companion exists in the user's girlfriends table,
 * then return the real UUID for /chat/[id].
 */

import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import type { DemoGirl } from '@/lib/demo-data';

export async function ensureCompanionChatId(girl: {
  id: string;
  name: string;
  slug?: string;
  age?: number;
  tagline?: string;
  portrait?: string;
  avatar?: string;
  image_url?: string;
  tags?: string[];
  personality?: string;
  relationship?: string;
}): Promise<string | null> {
  // 1) Already a friend? (reference list includes both created and public friends)
  try {
    const listRes = await authedFetch('/api/friends');
    if (listRes.ok) {
      const data = await readResponseJson(listRes).catch(() => ({} as any));
      const list = (data.friends || []) as Array<{ id: string; name: string }>;
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

  // 2) Add the public companion as a reference friend (no clone). Consumes a seat.
  //    POST /api/friends accepts { slug } or { girlfriend_id }; prefer slug, fall back
  //    to the real girlfriend UUID so a missing slug doesn't dead-end into null (which
  //    callers misread as "not logged in" and bounce to /login).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const addBody = girl.slug
    ? { slug: girl.slug }
    : UUID_RE.test(girl.id)
      ? { girlfriend_id: girl.id }
      : null;
  if (addBody) {
    const add = await authedFetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addBody),
    });
    const d = await readResponseJson(add).catch(() => ({} as Record<string, unknown>));
    if (add.ok) {
      const gid = (
        (d as { friend?: { id?: string } }).friend?.id ||
        (d as { girlfriend?: { id?: string } }).girlfriend?.id ||
        (d as { id?: string }).id
      ) as string | undefined;
      if (gid) return gid;
    }
    const err = new Error(
      (d as { error?: string }).error || 'Failed to add companion',
    ) as Error & { code?: string; seats?: unknown };
    err.code = (d as { code?: string }).code;
    err.seats = (d as { seats?: unknown }).seats;
    throw err;
  }

  // No public slug and no real girlfriend UUID — nothing to reference-add.
  return null;
}

export async function openCompanionChat(
  girl: DemoGirl & { relationship?: string },
  router: { push: (href: string) => void },
): Promise<boolean> {
  if (!girl?.id && !girl?.name) return false;
  try {
    const chatId = await ensureCompanionChatId(girl);
    if (!chatId || chatId === 'undefined' || chatId === 'null') return false;
    try {
      sessionStorage.setItem(
        'soulmate_selected_companion',
        JSON.stringify({
          id: chatId,
          name: girl.name,
          portrait: girl.portrait || girl.avatar || '',
        }),
      );
    } catch {
      /* ignore */
    }
    router.push(`/companion/${encodeURIComponent(chatId)}`);
    return true;
  } catch (err) {
    throw err;
  }
}
