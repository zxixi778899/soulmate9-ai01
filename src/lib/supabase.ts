import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Client-side needs NEXT_PUBLIC_ prefix to be exposed to browser
// Fallback chain: NEXT_PUBLIC_COZE_SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL → empty (deferred check)
// Empty fallback lets client bundle build even if vars are missing at build time;
// actual API calls will still work because RuntimeRailway sets them as process.env at runtime
// in some bundling setups (NOT actual client vars — true runtime resolution requires server).
//
// For correct production behavior, NEXT_PUBLIC_SUPABASE_URL must be set on Railway
// AND passed to Docker build (Railway does this automatically when var has NEXT_PUBLIC_ prefix).
function readPublicEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length > 0) return v;
  }
  return undefined;
}

const publicUrl: string | undefined = readPublicEnv(
  'NEXT_PUBLIC_COZE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
);
const publicAnonKey: string | undefined = readPublicEnv(
  'NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
);

/**
 * Browser-side Supabase client (uses anon key, respects RLS)
 * Used by AuthProvider for session management.
 *
 * Lazy: returns null if env vars are missing — caller must handle that case
 * (e.g. show "Config error" instead of crashing the whole page).
 */
let _browserClient: SupabaseClient | null = null;
export function createBrowserClient(): SupabaseClient | null {
  if (!publicUrl || !publicAnonKey) {
    if (typeof window !== 'undefined') {
      // Only warn once in browser to avoid console spam
      console.warn(
        '[soulmate9] Supabase browser client unavailable: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing at build time.',
      );
    }
    return null;
  }
  if (!_browserClient) {
    _browserClient = createClient(publicUrl, publicAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return _browserClient;
}

export type { SupabaseClient };

/**
 * Client-side: get access token from localStorage (Supabase session)
 */
export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (!publicUrl) return null;
  const raw = localStorage.getItem(
    `sb-${publicUrl.match(/https?:\/\/([^.]+)/)?.[1]}-auth-token`
  );
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Client-side: fetch wrapper that automatically includes x-session header
 */
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