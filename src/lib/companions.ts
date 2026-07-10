/**
 * Companion catalog helpers — maps public/featured API rows to the UI card model,
 * with demo-data fallback when the DB is empty or unreachable.
 */

import type { AccessStatus, DemoGirl, Rarity, Relationship } from '@/lib/demo-data';
import { GIRLS, ELEMENT_COLORS } from '@/lib/demo-data';

export type CompanionSource = 'api' | 'demo';

export interface CompanionCatalog {
  girls: DemoGirl[];
  source: CompanionSource;
  total: number;
}

const RARITIES: Rarity[] = ['N', 'R', 'SR', 'SSR'];
const ELEMENTS: DemoGirl['element'][] = ['fire', 'water', 'wind', 'light', 'dark'];

function hashPick<T>(seed: string, arr: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

/** Normalize any public/featured/girlfriend row into DemoGirl for cards. */
export function mapToDemoGirl(row: Record<string, unknown>, index = 0): DemoGirl {
  const id = String(row.id || row.slug || `c-${index}`);
  const name = String(row.name || 'Companion');
  const image =
    (row.image_url as string) ||
    (row.portrait_url as string) ||
    (row.avatar_url as string) ||
    (row.portrait as string) ||
    (row.avatar as string) ||
    GIRLS[index % GIRLS.length]?.portrait ||
    '';

  const tagsRaw = row.tags;
  const tags = Array.isArray(tagsRaw)
    ? (tagsRaw as string[]).map(String)
    : typeof tagsRaw === 'string'
      ? tagsRaw.split(/[,|]/).map((t) => t.trim()).filter(Boolean)
      : ['romantic'];

  const personality =
    (row.personality as string) ||
    (row.short_description as string) ||
    tags.slice(0, 3).join(' · ') ||
    'mysterious';

  const rarity = (row.rarity as Rarity) || hashPick(id, RARITIES);
  const element = (row.element as DemoGirl['element']) || hashPick(id + name, ELEMENTS);
  const age = Number(row.age) || 22 + (Math.abs(id.charCodeAt(0) || 0) % 6);
  const intimacy =
    Number(row.base_intimacy ?? row.intimacy ?? row.hot_score ?? row.popularity) ||
    20 + (index * 7) % 70;
  const desire =
    Number(row.base_desire ?? row.desire) || Math.min(99, intimacy + 8);
  const development =
    Number(row.base_development ?? row.development) ||
    Math.min(99, Math.floor(intimacy * 0.85));
  const kink =
    Number(row.base_kink ?? row.kink) ||
    Math.min(99, Math.floor(intimacy * 0.7 + index * 3));
  const relationships: Relationship[] = ['邻居', '老师', '姐姐', '学妹', '同事', '上司', '青梅竹马', '陌生人', '女友'];
  const relationship: Relationship =
    (row.relationship as Relationship) ||
    relationships[Math.abs(id.charCodeAt(0) || 0) % relationships.length];

  const access_status = (['open', 'locked', 'closed'].includes(String(row.access_status))
    ? (row.access_status as AccessStatus)
    : 'open');
  const is_unlocked = row.is_unlocked === true || row.unlocked === true;
  const locked = access_status === 'locked' && !is_unlocked;

  return {
    id,
    name,
    age,
    tagline:
      (row.tagline as string) ||
      (row.short_description as string) ||
      (row.rarity_quote as string) ||
      personality,
    avatar: image,
    portrait: image,
    rarity: RARITIES.includes(rarity) ? rarity : 'R',
    tags: tags.length ? tags : ['romantic'],
    personality,
    element: ELEMENTS.includes(element) ? element : 'light',
    intimacy: Math.min(99, Math.max(0, intimacy)),
    desire: Math.min(99, Math.max(0, desire)),
    development: Math.min(99, Math.max(0, development)),
    kink: Math.min(99, Math.max(0, kink)),
    relationship,
    rarity_quote:
      (row.rarity_quote as string) ||
      `"${name} is waiting for you."`,
    voice_preview: row.voice_preview as string | undefined,
    hot_score: Number(row.hot_score ?? intimacy) || intimacy,
    access_status,
    is_unlocked,
    unlock_price_tokens: Number(row.unlock_price_tokens) || 0,
    locked,
  };
}

/**
 * Fetch public companions for Explore / Home.
 * Order: featured API → public girlfriends → demo seed data.
 */
async function mergeUnlockFlags(girls: DemoGirl[]): Promise<DemoGirl[]> {
  const lockedIds = girls.filter((g) => g.access_status === 'locked').map((g) => g.id);
  if (lockedIds.length === 0) return girls;
  try {
    const res = await fetch(`/api/girlfriends/unlock?ids=${lockedIds.join(',')}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return girls;
    const data = await res.json();
    const unlocked = new Set(
      ((data.unlocks || []) as { girlfriend_id: string }[]).map((u) => u.girlfriend_id),
    );
    return girls.map((g) => {
      if (g.access_status !== 'locked') return g;
      const is_unlocked = unlocked.has(g.id);
      return { ...g, is_unlocked, locked: !is_unlocked };
    });
  } catch {
    return girls;
  }
}

export async function fetchCompanionCatalog(limit = 48): Promise<CompanionCatalog> {
  // 1) Featured (auth optional; server returns public rows when possible)
  try {
    const featuredRes = await fetch('/api/v2/girlfriends/featured', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (featuredRes.ok) {
      const data = await featuredRes.json();
      const rows = (data.featured_girlfriends || data.girlfriends || []) as Record<string, unknown>[];
      // Hide closed
      const visible = rows.filter((r) => String(r.access_status || 'open') !== 'closed');
      if (visible.length > 0) {
        const girls = await mergeUnlockFlags(visible.map((r, i) => mapToDemoGirl(r, i)));
        return {
          girls,
          source: 'api',
          total: data.total ?? girls.length,
        };
      }
    }
  } catch {
    /* fall through */
  }

  // 2) Public approved girlfriends
  try {
    const pubRes = await fetch(`/api/girlfriends/public?limit=${limit}`, {
      cache: 'no-store',
    });
    if (pubRes.ok) {
      const data = await pubRes.json();
      const rows = (data.girlfriends || []) as Record<string, unknown>[];
      const visible = rows.filter((r) => String(r.access_status || 'open') !== 'closed');
      if (visible.length > 0) {
        const girls = await mergeUnlockFlags(visible.map((r, i) => mapToDemoGirl(r, i)));
        return {
          girls,
          source: 'api',
          total: girls.length,
        };
      }
    }
  } catch {
    /* fall through */
  }

  // 3) Demo fallback so the product never shows an empty lobby
  return {
    girls: GIRLS.slice(0, limit),
    source: 'demo',
    total: GIRLS.length,
  };
}

export { ELEMENT_COLORS };
