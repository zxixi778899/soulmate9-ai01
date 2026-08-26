import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Hardcoded Supabase config — primary fallback when env vars are not
 * injected at build time. Next.js / Turbopack performs dead-code elimination
 * on `process.env.NEXT_PUBLIC_X || HARDCODED_X` patterns: if the env var is
 * undefined at build time the bundler drops the `|| HARDCODED_X` branch and
 * only the undefined env value is inlined into the client bundle, breaking
 * `createClient(URL, KEY)` with "supabaseUrl is required".
 *
 * Resolution: read HARDCODED first, fall back to env if explicitly set.
 * This keeps the fallback chain reachable regardless of bundler behaviour.
 */
const HARDCODED_URL = 'https://vvblrnkguyxeeeoslkk.supabase.co';
const HARDCODED_KEY = 'sb_publishable_7YIlnWCPFcTez5gK6pvRtA_zNPFC8LX';

const SUPABASE_URL: string =
  (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) ||
  HARDCODED_URL;
const SUPABASE_ANON_KEY: string =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()) ||
  HARDCODED_KEY;

export const SOULMATE_BUILD_ID = 'nuclear-deploy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

let _browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;

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
