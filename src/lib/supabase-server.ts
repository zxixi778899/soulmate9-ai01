import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Lazy-read PUBLIC env vars so module-load doesn't crash if vars are missing
// (defensive — this file is server-only and should never be bundled to client,
//  but a stray import from a client component would otherwise throw at hydration).
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

/**
 * Server-side: validate token against PUBLIC Supabase and return user info.
 * Returns a service_role client for Coze Supabase (full schema) for data queries.
 *
 * Architecture:
 * - Auth (login/register) → Public Supabase (stores users, basic schema)
 * - Data (girlfriends/intimacy/etc) → Coze Supabase (full schema, service_role)
 * - The public token is validated via auth.getUser() then a fresh Coze client is returned
 *
 * NOTE: This file is server-only (uses child_process/coze SDK). Do NOT import from client components.
 */
export async function getAuthUser(request: Request) {
  const token = request.headers.get('x-session');
  if (!token) {
    return { user: null, error: 'No session token' as const };
  }

  // Step 1: Validate token against PUBLIC Supabase (where users are stored)
  if (!publicUrl || !publicAnonKey) {
    return { user: null, error: 'Supabase public URL not configured' as const };
  }
  const publicClient = createClient(publicUrl, publicAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await publicClient.auth.getUser();
  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid session' as const };
  }

  // Step 2: Create service_role client via Coze proxy (full schema, bypass RLS)
  const dataClient = getSupabaseClient();

  return { user, client: dataClient };
}