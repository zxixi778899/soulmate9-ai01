import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Plan NUCLEAR — hardcoded config + force cache bust
 * Each deploy changes this timestamp to invalidate all chunk hashes
 */
export const SOULMATE_BUILD_ID = 'nuclear-deploy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

let _browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;

  // 硬编码方案 — 直接解决 Railway cache + Turbopack env 问题
  const hardcodedUrl = 'https://vvblrkngzuyxeeoslzkl.supabase.co';
  const hardcodedKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Ymxya25nend5eGVlb3Nsemt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE4NzU0OTgsImV4cCI6MjAxNzQ1MTQ5OH0.dcXgk_H_1TNBuNwGg4p4lERm_6vWQfYNwvoEGnVQYl0';

  // 优先使用 env vars，fallback 到硬编码
  const url = SUPABASE_URL || hardcodedUrl;
  const key = SUPABASE_ANON_KEY || hardcodedKey;

  if (!_browserClient) {
    _browserClient = createClient(url, key, {
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
