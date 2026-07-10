import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

function devEmailWhitelist(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  const raw = process.env.ALLOWED_ADMIN_EMAILS || '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ isAdmin: false }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, email')
      .eq('user_id', user.id)
      .single();

    let role = profile?.role || 'user';
    let isAdmin =
      role === 'admin' || role === 'superadmin' || role === 'reviewer';

    // Dev whitelist (same as requireAdmin)
    if (!isAdmin && process.env.NODE_ENV !== 'production') {
      const email = (user.email || profile?.email || '').toLowerCase();
      if (email && devEmailWhitelist().includes(email)) {
        isAdmin = true;
        role = role === 'user' ? 'admin' : role;
      }
    }

    return NextResponse.json({ isAdmin, role });
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}
