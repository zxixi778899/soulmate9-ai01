import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Plan W — invalidates stale Turbopack module cache from Plan I era.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const _BUILD_TAG = 'planW-fresh-chunk';

let _browserClient = null;

export function createBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!_browserClient) {
    _browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _browserClient;
}

export function getSessionToken() {
  if (typeof window === 'undefined') return null;
  if (!SUPABASE_URL) return null;
  const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)/)?.[1] ?? '';
  if (!projectRef) return null;
  const raw = localStorage.getItem('sb-' + projectRef + '-auth-token');
  if (!raw) return null;
  try { return JSON.parse(raw).access_token || null; } catch { return null; }
}

export function authedFetch(url, options) {
  const token = getSessionToken();
  return fetch(url, { ...options, headers: { ...options?.headers, ...(token ? { 'x-session': token } : {}) } });
}
