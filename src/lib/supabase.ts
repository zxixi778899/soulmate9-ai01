import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Plan AK — use Next.js inlining for NEXT_PUBLIC_*.
// These read at module load. process.env.NEXT_PUBLIC_X is inlined to string
// literal by Next.js during build. If vars missing at build time, fallback
// to empty string + return null in createBrowserClient.

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
