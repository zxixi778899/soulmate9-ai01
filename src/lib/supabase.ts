import { createClient } from '@supabase/supabase-js';

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client (uses anon key, respects RLS)
 * Used by AuthProvider for session management
 */
export function createBrowserClient() {
  return createClient(publicUrl, publicAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export type SupabaseClient = ReturnType<typeof createBrowserClient>;

/**
 * Client-side: get access token from localStorage (Supabase session)
 */
export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
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