import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Plan X — runtime export that forces Turbopack to keep this string in the
 * client bundle (DCE can't remove a string used in a public export).
 * Each redeploy that changes this string forces a fresh chunk hash, which
 * invalidates the stale `33c8a2200066d1a9` chunk.
 */
export const SOULMATE_BUILD_ID = 'planX-fresh-chunk-' + Date.now().toString(36);

let _browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!_browserClient) {
    _browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _browserClient;
}

export type { SupabaseClient };

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (!SUPABASE_URL) return null;
  const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)/)?.[1] ?? '';
  if (!projectRef) return null;
  const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
  if (!raw) return null;
  try {
    return JSON.parse(raw).access_token || null;
  } catch {
    return null;
  }
}

export function authedFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { 'x-session': token } : {}),
    },
  });
}
