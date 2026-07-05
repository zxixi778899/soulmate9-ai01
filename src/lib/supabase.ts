import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Client-side Supabase (lazy, DCE-proof)
// ============================================================================
// Why DCE-proof: Turbopack/webpack inlines `process.env.NEXT_PUBLIC_*` at build
// time as a string literal. If the var is missing, it becomes JS `undefined`,
// and the minifier aggressively removes "always-false" guards around constants.
// Module-top-level `const publicUrl = process.env.X` gets fully inlined, and
// `if (!publicUrl) return null` becomes dead code that vanishes from the bundle.
//
// To defeat this:
//   (1) Read env inside the function body, not at module scope.
//   (2) Use a throw indirection that the minifier cannot prove is dead.
//   (3) Pass values to createClient from the same runtime read.
// ============================================================================

const ENV_KEYS = [
  ['NEXT_PUBLIC_COZE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
] as const;

function readEnv(names: readonly string[]): string {
  for (const k of names) {
    const v = (globalThis as any).process?.env?.[k];
    if (typeof v === 'string' && v.length > 0 && v !== 'undefined') return v;
  }
  throw new Error(`[soulmate9] Missing required env var: ${names.join(' / ')}`);
}

let _browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient | null {
  let url: string;
  let key: string;
  try {
    url = readEnv(ENV_KEYS[0]);
    key = readEnv(ENV_KEYS[1]);
  } catch {
    if (typeof window !== 'undefined') {
      console.warn(
        '[soulmate9] Supabase browser client unavailable: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing at build time.',
      );
    }
    return null;
  }
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
  let projectRef: string;
  try {
    projectRef = readEnv(ENV_KEYS[0]).match(/https?:\/\/([^.]+)/)?.[1] ?? '';
  } catch {
    return null;
  }
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