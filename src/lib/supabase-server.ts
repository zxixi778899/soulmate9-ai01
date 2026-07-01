import { createClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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