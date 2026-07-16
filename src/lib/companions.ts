/**
 * Companion catalog helpers — maps public/featured API rows to the UI card model,
 * with demo-data fallback when the DB is empty or unreachable.
 */

import type { AccessStatus, DemoGirl, Rarity, Relationship } from '@/lib/demo-data';
import { GIRLS, ELEMENT_COLORS } from '@/lib/demo-data';
import {
  extractPersonName,
  looksLikeFluxPrompt,
  safeDisplayName,
} from '@/lib/prompt/shared';

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

function cleanName(raw: unknown, slug?: unknown, index = 0): string {
  const s = String(raw || '').trim();
  const slugStr = String(slug || '');
  const fromSlug = slugStr
    ? slugStr
        .split('-')
        .filter((p) => p && !/^[a-z0-9]{6,}$/i.test(p))
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';
  if (!s) return fromSlug || `Companion ${index + 1}`;
  if (!looksLikeFluxPrompt(s) && s.length <= 48) return s;
  return extractPersonName(s) || safeDisplayName(s, fromSlug || `Companion ${index + 1}`);
}


function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split('?')[0];
  return (
    u.endsWith('.mp4') ||
    u.endsWith('.webm') ||
    u.endsWith('.mov') ||
    u.endsWith('.m4v') ||
    u.includes('/video/') ||
    u.includes('/videos/')
  );
}

function pickImage(row: Record<string, unknown>, index: number): string {
  const candidates = [
    row.image_url,
    row.portrait_url,
    row.avatar_url,
    row.card_url,
    row.portrait,
    row.avatar,
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (!u) continue;
    // Never use a full FLUX caption as an image src
    if (looksLikeFluxPrompt(u) && !u.startsWith('http') && !u.startsWith('/') && !u.startsWith('data:')) {
      continue;
    }
    if (
      u.startsWith('http://') ||
      u.startsWith('https://') ||
      u.startsWith('/') ||
      u.startsWith('data:image/')
    ) {
      // Image fields must not swallow video assets
      if (isLikelyVideoUrl(u) && !u.startsWith('data:image/')) continue;
      return u;
    }
    // Bare storage keys (girlfriends/<id>/x.png) — still usable if CDN resolves them client-side
    if (!looksLikeFluxPrompt(u) && u.includes('/') && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) {
      return u;
    }
  }
  // Do NOT fall back to demo portraits when we have real API rows — empty is better
  // than showing the wrong person's face. Demo fallback only when source is demo.
  if (row.is_demo) {
    return GIRLS[index % GIRLS.length]?.portrait || '';
  }
  return '';
}

function pickVideo(row: Record<string, unknown>): string | undefined {
  const candidates = [
    row.video_url,
    row.portrait_video_url,
    row.video,
    row.avatar_video_url,
    row.avatar_video,
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (!u) continue;
    if (looksLikeFluxPrompt(u) && !u.startsWith('http')) continue;
    if ((u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')) && isLikelyVideoUrl(u)) {
      return u;
    }
  }
  return undefined;
}

/** Normalize any public/featured/girlfriend row into DemoGirl for cards. */
export function mapToDemoGirl(row: Record<string, unknown>, index = 0): DemoGirl {
  const id = String(row.id || row.slug || `c-${index}`);
  const name = cleanName(row.name, row.slug, index);
  const image = pickImage(row, index);
  const video = pickVideo(row);
  const avatarVideo =
    pickVideo({
      video_url: row.avatar_video_url,
      portrait_video_url: row.avatar_video,
    }) || undefined;

  const tagsRaw = row.tags;
  const tags = Array.isArray(tagsRaw)
    ? (tagsRaw as string[]).map(String)
    : typeof tagsRaw === 'string'
      ? tagsRaw.split(/[,|]/).map((t) => t.trim()).filter(Boolean)
      : ['romantic'];

  const personalityRaw =
    (row.personality as string) ||
    (row.short_description as string) ||
    tags.slice(0, 3).join(' · ') ||
    'mysterious';
  // Guard: personality field sometimes holds a full caption
  const personality = looksLikeFluxPrompt(personalityRaw)
    ? tags.slice(0, 3).join(' · ') || 'mysterious'
    : personalityRaw;

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
  const relationships: Relationship[] = [
    'neighbor',
    'teacher',
    'sister',
    'junior',
    'coworker',
    'boss',
    'childhood',
    'stranger',
    'girlfriend',
  ];
  const relationship: Relationship =
    (row.relationship as Relationship) ||
    relationships[Math.abs(id.charCodeAt(0) || 0) % relationships.length];

  const access_status = (['open', 'locked', 'closed'].includes(String(row.access_status))
    ? (row.access_status as AccessStatus)
    : 'open');
  const is_unlocked = row.is_unlocked === true || row.unlocked === true;
  const locked = access_status === 'locked' && !is_unlocked;

  const taglineRaw =
    (row.tagline as string) ||
    (row.short_description as string) ||
    (row.rarity_quote as string) ||
    personality;
  const tagline = looksLikeFluxPrompt(taglineRaw)
    ? `${name} is waiting for you.`
    : taglineRaw;

  return {
    id,
    name,
    age,
    tagline,
    avatar: image,
    portrait: image,
    video,
    avatar_video: avatarVideo || undefined,
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
      (typeof row.rarity_quote === 'string' && !looksLikeFluxPrompt(row.rarity_quote)
        ? row.rarity_quote
        : undefined) || `"${name} is waiting for you."`,
    voice_preview: row.voice_preview as string | undefined,
    hot_score: Number(row.hot_score ?? intimacy) || intimacy,
    access_status,
    is_unlocked,
    unlock_price_tokens: Number(row.unlock_price_tokens) || 0,
    locked,
    is_featured: row.is_featured === true || row.list_kind === 'featured',
    is_hot: row.is_hot === true || row.list_kind === 'hot',
    list_kind: (row.list_kind as DemoGirl['list_kind']) || undefined,
    sort_order: Number(row.sort_order) || 0,
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
  // 1) Featured endpoint (now returns real public girlfriends first)
  try {
    const featuredRes = await fetch(`/api/v2/girlfriends/featured?limit=${limit}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (featuredRes.ok) {
      const data = await featuredRes.json();
      const apiSource = data.source === 'api';
      const rows = (data.featured_girlfriends || data.girlfriends || []) as Record<
        string,
        unknown
      >[];
      const visible = rows.filter((r) => String(r.access_status || 'open') !== 'closed');
      if (visible.length > 0 && apiSource) {
        const girls = await mergeUnlockFlags(visible.map((r, i) => mapToDemoGirl(r, i)));
        // Drop cards with no image at all when we have mixed quality — keep those with img first
        const withImg = girls.filter((g) => !!g.portrait);
        const ordered = withImg.length > 0 ? [...withImg, ...girls.filter((g) => !g.portrait)] : girls;
        return {
          girls: ordered,
          source: 'api',
          total: data.total ?? ordered.length,
        };
      }
      // If server admitted demo, fall through to try public route once more
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

  // 3) No data available — return empty instead of demo fallback
  return {
    girls: [],
    source: 'demo',
    total: 0,
  };
}

export { ELEMENT_COLORS };
