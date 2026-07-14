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

const PREFIX = 'soulmate_chat_v1_';
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

/** Merge server + local by id/created_at, prefer longer content for same temp window */
export function mergeMessages(
  server: CachedMessage[],
  local: CachedMessage[],
): CachedMessage[] {
  const map = new Map<string, CachedMessage>();
  const list = [...(Array.isArray(local) ? local : []), ...(Array.isArray(server) ? server : [])];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    try {
      const id = raw.id != null ? String(raw.id) : '';
      const role: CachedMessage['role'] = raw.role === 'user' ? 'user' : 'assistant';
      const content =
        typeof raw.content === 'string'
          ? raw.content
          : raw.content == null
            ? ''
            : String(raw.content);
      const created_at =
        typeof raw.created_at === 'string' && raw.created_at
          ? raw.created_at
          : new Date().toISOString();
      const m: CachedMessage = {
        id: id || `${role}:${created_at}:${content.slice(0, 24)}`,
        role,
        content,
        created_at,
        is_proactive: raw.is_proactive,
        media_url: raw.media_url,
        media_type: raw.media_type ?? null,
        status: raw.status,
      };
      const k =
        m.id.startsWith('temp-') || m.id.startsWith('assist-') || m.id.startsWith('proactive-')
          ? `${m.role}:${m.created_at.slice(0, 16)}:${m.content.slice(0, 40)}`
          : m.id;
      const existing = map.get(k);
      if (!existing || (m.content?.length || 0) >= (existing.content?.length || 0)) {
        map.set(k, m);
      }
    } catch {
      /* skip corrupt row */
    }
  }
  return Array.from(map.values()).sort((a, b) => {
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
  if (intimacyScore >= 80) return { emoji: '🔥', label: 'On fire', tone: 'text-[#ff6ba6]' };
  if (intimacyScore >= 50) return { emoji: '😊', label: 'Teasing', tone: 'text-pink-300' };
  if (intimacyScore >= 20) return { emoji: '💭', label: 'Curious', tone: 'text-white/60' };
  return { emoji: '✨', label: '刚认识', tone: 'text-white/45' };
}
