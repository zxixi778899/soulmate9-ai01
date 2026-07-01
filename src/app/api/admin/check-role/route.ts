import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ isAdmin: false }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

    return NextResponse.json({ isAdmin, role: profile?.role || 'user' });
  } catch {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }
}