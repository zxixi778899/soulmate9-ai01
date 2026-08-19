import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function readPublicEnv(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.length > 0) return v;
  }
  return undefined;
}

const publicUrl = readPublicEnv(
  'NEXT_PUBLIC_COZE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
);
const publicAnonKey = readPublicEnv(
  'NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
);

let _publicClient: ReturnType<typeof createClient> | null = null;

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createClient(publicUrl as string, publicAnonKey as string, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _publicClient;
}

/**
 * Short-lived validation cache for x-session tokens. A single page load fans
 * out ~7 API calls that each validated the same token against Supabase Auth
 * (7 extra network round-trips on the critical path). Tokens are short-lived
 * JWTs and sign-out still works: worst-case staleness is the TTL below.
 */
const AUTH_CACHE_TTL_MS = 45_000;
const AUTH_CACHE_MAX = 2000;
type AuthCacheEntry = { user: import('@supabase/supabase-js').User; expiresAt: number };
const authCache = new Map<string, AuthCacheEntry>();

export async function getAuthUser(request: Request) {
  const token = request.headers.get('x-session');
  if (!token) {
    return { user: null, error: 'No session token' as const };
  }
  if (!publicUrl || !publicAnonKey) {
    return { user: null, error: 'Supabase public URL not configured' as const };
  }

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return { user: cached.user, client: getSupabaseClient() };
  }

  const publicClient = getPublicClient();
  const { data: { user }, error } = await publicClient.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid session' as const };
  }

  if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
  authCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });

  const dataClient = getSupabaseClient();
  return { user, client: dataClient };
}