import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * GET /api/v2/girlfriends/featured - 获取首页推荐角色
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);

    const supabase = auth?.client;
    if (!supabase) {
      // Return featured even without auth (for landing page)
      return NextResponse.json({
        featured_girlfriends: [],
        total: 0,
      });
    }

    const { data: featured, error: featuredError } = await supabase
      .from('featured_girlfriends')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(10);

    if (featuredError) throw new Error(featuredError.message);

    const userInteractions: any = {};
    if (auth?.user) {
      const { data: userGirlfriends } = await supabase
        .from('girlfriends')
        .select('id, name, created_at')
        .eq('user_id', auth.user.id)
        .in('name', (featured || []).map((f) => f.name));

      if (userGirlfriends) {
        userGirlfriends.forEach((ug) => {
          userInteractions[ug.name] = { owned: true, created_at: ug.created_at };
        });
      }
    }

    const enrichedFeatured = (featured || []).map((f) => ({
      ...f,
      user_has_created: userInteractions[f.name]?.owned || false,
      quick_chat_available: f.quick_chat_enabled,
    }));

    return NextResponse.json({
      featured_girlfriends: enrichedFeatured,
      total: enrichedFeatured.length,
    });
  } catch (err: any) {
    console.error('[girlfriends/featured] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch featured girlfriends' },
      { status: 500 },
    );
  }
}