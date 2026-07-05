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

export async function getAuthUser(request: Request) {
  const token = request.headers.get('x-session');
  if (!token) {
    return { user: null, error: 'No session token' as const };
  }
  if (!publicUrl || !publicAnonKey) {
    return { user: null, error: 'Supabase public URL not configured' as const };
  }
  const publicClient = createClient(publicUrl, publicAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await publicClient.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: error?.message || 'Invalid session' as const };
  }
  const dataClient = getSupabaseClient();
  return { user, client: dataClient };
}