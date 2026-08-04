/**
 * Local chat history cache — survives page reloads when API is slow/empty,
 * and merges with server history so intimacy + messages are retained.
 */

export type CachedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  is_proactive?: boolean;
  media_url?: string | null;
  media_type?: string | null;
  status?: 'sending' | 'sent' | 'read' | 'failed';
};

export type CachedChat = {
  messages: CachedMessage[];
  intimacy?: { score: number; level: number; daily_score_gained?: number };
  mood?: string;
  updatedAt: string;
};

// Bumped to v2 to invalidate polluted caches (pre-rate-limit proactive spam
// copies and leftovers from deleted companions) persisted under v1.
const PREFIX = 'soulmate_chat_v2_';
const MAX_MESSAGES = 200;

function key(girlfriendId: string) {
  return `${PREFIX}${girlfriendId}`;
}

export function loadChatCache(girlfriendId: string): CachedChat | null {
  if (typeof window === 'undefined' || !girlfriendId) return null;
  try {
    const raw = localStorage.getItem(key(girlfriendId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedChat;
  } catch {
    return null;
  }
}

export function saveChatCache(
  girlfriendId: string,
  data: Partial<CachedChat> & { messages?: CachedMessage[] },
): void {
  if (typeof window === 'undefined' || !girlfriendId) return;
  try {
    const prev = loadChatCache(girlfriendId);
    const messages = (data.messages ?? prev?.messages ?? []).slice(-MAX_MESSAGES);
    const payload: CachedChat = {
      messages,
      intimacy: data.intimacy ?? prev?.intimacy,
      mood: data.mood ?? prev?.mood,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key(girlfriendId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Remove the cached chat for a companion (e.g. after unfriend/delete). */
export function deleteChatCache(girlfriendId: string): void {
  if (typeof window === 'undefined' || !girlfriendId) return;
  try {
    localStorage.removeItem(key(girlfriendId));
  } catch {
    /* ignore */
  }
}

// ─── Merge helpers ───────────────────────────────────────────────────────────

/** Placeholders created client-side before the server row exists. */
function isFuzzyId(id: string): boolean {
  return (
    !id || id.startsWith('temp-') || id.startsWith('assist-') || id.startsWith('proactive-')
  );
}

/** Whitespace-insensitive content fingerprint for matching copies. */
function contentKey(content: string): string {
  return content.replace(/\s+/g, '').slice(0, 40);
}

function normalizeMessage(raw: unknown): CachedMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    const r = raw as Partial<CachedMessage> & Record<string, unknown>;
    const id = r.id != null ? String(r.id) : '';
    const role: CachedMessage['role'] = r.role === 'user' ? 'user' : 'assistant';
    const content =
      typeof r.content === 'string' ? r.content : r.content == null ? '' : String(r.content);
    const created_at =
      typeof r.created_at === 'string' && r.created_at ? r.created_at : new Date().toISOString();
    return {
      id: id || `${role}:${created_at}:${content.slice(0, 24)}`,
      role,
      content,
      created_at,
      is_proactive: r.is_proactive,
      media_url: r.media_url,
      media_type: r.media_type ?? null,
      status: r.status,
    };
  } catch {
    return null;
  }
}

/**
 * Merge server + local history. Server rows are the source of truth.
 *
 * Client-side placeholders (temp-/assist-/proactive-) carry device-clock
 * timestamps. They are matched against server rows by role + content within
 * a tolerance window and DROPPED once the server copy exists — exact
 * timestamp matching used to fail on clock skew / minute boundaries, leaving
 * both copies in the list so every bubble rendered twice.
 */
const FUZZY_MATCH_WINDOW_MS = 5 * 60 * 1000; // placeholder ↔ server row
const FUZZY_STALE_MS = 30 * 60 * 1000; // unmatched placeholders older than this are dropped

export function mergeMessages(
  server: CachedMessage[],
  local: CachedMessage[],
): CachedMessage[] {
  const serverList = (Array.isArray(server) ? server : [])
    .map(normalizeMessage)
    .filter((m): m is CachedMessage => !!m);
  const localList = (Array.isArray(local) ? local : [])
    .map(normalizeMessage)
    .filter((m): m is CachedMessage => !!m);

  // 1) Real-id entries (server rows, cached server copies, client media msgs):
  //    dedupe by id; server processed last wins ties / longer content.
  const byId = new Map<string, CachedMessage>();
  for (const m of [...localList, ...serverList]) {
    if (isFuzzyId(m.id)) continue;
    const existing = byId.get(m.id);
    if (!existing || (m.content?.length || 0) >= (existing.content?.length || 0)) {
      byId.set(m.id, m);
    }
  }

  // 2) Index server rows for fuzzy matching: role+content → server timestamps.
  const serverByKey = new Map<string, number[]>();
  for (const m of serverList) {
    const k = `${m.role}:${contentKey(m.content)}`;
    const arr = serverByKey.get(k);
    if (arr) arr.push(new Date(m.created_at).getTime());
    else serverByKey.set(k, [new Date(m.created_at).getTime()]);
  }

  // 3) Drop placeholders whose server copy exists (count-aware greedy match,
  //    so a legitimately repeated identical message is not swallowed).
  const consumed = new Map<string, number[]>();
  const keptFuzzy: CachedMessage[] = [];
  for (const m of localList) {
    if (!isFuzzyId(m.id)) continue;
    const k = `${m.role}:${contentKey(m.content)}`;
    const times = serverByKey.get(k);
    const t = new Date(m.created_at).getTime();
    if (times?.length) {
      const used = consumed.get(k) || [];
      const match = times.find(
        (st) => !used.includes(st) && Math.abs(st - t) <= FUZZY_MATCH_WINDOW_MS,
      );
      if (match != null) {
        used.push(match);
        consumed.set(k, used);
        continue; // synced to server — server copy wins
      }
    }
    // Never-synced and stale (failed send / leftover artifact) → drop.
    if (Number.isFinite(t) && Date.now() - t > FUZZY_STALE_MS) continue;
    keptFuzzy.push(m);
  }

  // 4) Dedupe remaining placeholders among themselves (double-cached copies).
  const fuzzyById = new Map<string, CachedMessage>();
  for (const m of keptFuzzy) {
    const k = `${m.role}:${m.created_at.slice(0, 16)}:${contentKey(m.content)}`;
    const existing = fuzzyById.get(k);
    if (!existing || (m.content?.length || 0) >= (existing.content?.length || 0)) {
      fuzzyById.set(k, m);
    }
  }

  return [...byId.values(), ...fuzzyById.values()].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });
}

/** Derive display mood from last message + intimacy */
export function deriveMood(
  lastContent: string | undefined,
  intimacyScore = 0,
): { emoji: string; label: string; tone: string } {
  const c = (lastContent || '').toLowerCase();
  if (/kiss|亲|吻|lips|mouth|咬/.test(c)) return { emoji: '💋', label: '想被亲吻', tone: 'text-rose-300' };
  if (/miss|想你|lonely|寂寞/.test(c)) return { emoji: '🥺', label: '想你了', tone: 'text-pink-300' };
  if (/fuck|hard|粗暴|惩罚|spank|绑/.test(c)) return { emoji: '😈', label: '坏心思', tone: 'text-purple-300' };
  if (/photo|自拍|look at|看我|穿着|wearing/.test(c)) return { emoji: '📸', label: '想给你看', tone: 'text-amber-300' };
  if (/night|晚安|sleep|梦/.test(c)) return { emoji: '🌙', label: '睡意朦胧', tone: 'text-indigo-300' };
  if (/love|爱|喜欢|heart/.test(c)) return { emoji: '❤️', label: '心跳加速', tone: 'text-rose-400' };
  if (/angry|生气|哼|不理/.test(c)) return { emoji: '😤', label: '小脾气', tone: 'text-orange-300' };
  if (intimacyScore >= 1000) return { emoji: '🔥', label: 'On fire', tone: 'text-[#ff6ba6]' };
  if (intimacyScore >= 300) return { emoji: '😊', label: 'Teasing', tone: 'text-pink-300' };
  if (intimacyScore >= 100) return { emoji: '💭', label: 'Curious', tone: 'text-white/60' };
  return { emoji: '✨', label: '刚认识', tone: 'text-white/45' };
}
