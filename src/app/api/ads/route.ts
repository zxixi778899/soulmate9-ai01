import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Public ads endpoint — returns only active ads.
 * Optional query param: ?position=banner|sidebar|popup
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const position = searchParams.get('position');

    let query = supabase
      .from('admin_ads')
      .select('id, title, image_url, link_url, position, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (position) {
      query = query.eq('position', position);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ads: data || [] });
  } catch {
    return NextResponse.json({ ads: [] });
  }
}
