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
//   (1) Read env inside the function body, not at module scope. The minifier
//       cannot inline function-local reads that depend on a runtime construct.
//   (2) Use a `typeof check + throw` indirection that the minifier cannot prove
//       is dead — when the env var is missing, calling `readEnv(name)` throws
//       synchronously, which we catch and convert to `null`.
//   (3) Pass values to `createClient` from the same runtime read, never from
//       a captured constant.
// ============================================================================

const ENV_KEYS = [
  ['NEXT_PUBLIC_COZE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
] as const;

/**
 * Runtime env read. Wrapped in a try/catch so the minifier can't prove the
 * "missing var" branch is unreachable — the `throw` itself is the side effect
 * that forces the branch to be preserved in the emitted bundle.
 */
function readEnv(names: readonly string[]): string {
  for (const k of names) {
    // Use indirect property access via bracket notation — minifier keeps it.
    const v = (globalThis as any).process?.env?.[k];
    if (typeof v === 'string' && v.length > 0 && v !== 'undefined') return v;
  }
  throw new Error(`[soulmate9] Missing required env var: ${names.join(' / ')}`);
}

let _browserClient: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Lazy + DCE-proof.
 * Returns `null` if NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are missing at build.
 */
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

/**
 * Client-side: get access token from localStorage (Supabase session)
 */
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