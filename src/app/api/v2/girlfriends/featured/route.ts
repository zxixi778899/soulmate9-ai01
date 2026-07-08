import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * GET /api/v2/girlfriends/featured - 获取首页推荐角色
 * 返回8-10个热门预设角色，用户可直接快速聊天
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    // Featured girlfriend浏览不需要登录，但登录用户会获得额外信息

    const supabase = auth?.client;

    // 获取所有活跃的推荐角色
    const { data: featured, error: featuredError } = await supabase
      ?.from('featured_girlfriends')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(10);

    if (featuredError) throw new Error(featuredError.message);

    // 如果用户已登录，还要获取用户对这些角色的互动历史
    let userInteractions: any = {};
    if (auth?.user) {
      const { data: userGirlfriends, error: userGfError } = await supabase
        ?.from('girlfriends')
        .select('id, user_id, created_at')
        .eq('user_id', auth.user.id)
        .in('name', (featured || []).map((f) => f.name));

      if (!userGfError && userGirlfriends) {
        userGirlfriends.forEach((ug) => {
          userInteractions[ug.name] = { owned: true, created_at: ug.created_at };
        });
      }
    }

    const enrichedFeatured = (featured || []).map((f) => ({
      ...f,
      user_has_created: userInteractions[f.name]?.owned || false,
      quick_chat_available: f.quick_chat_enabled && !auth?.user, // 未登录用户可快速试聊
    }));

    return NextResponse.json({
      featured_girlfriends: enrichedFeatured,
      total: enrichedFeatured.length,
    });
  } catch (err: any) {
    console.error('[girlfriends/featured] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch featured girlfriends' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/girlfriends/categories - 获取角色分类列表（用于浏览筛选）
 */
export async function getGirlfriendsCategories(req: NextRequest) {
  try {
    const supabase = await getAuthUser(req).then((auth) => auth?.client);
    if (!supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 获取所有分类类型
    const { data: categories, error } = await supabase
      .from('girlfriend_categories')
      .select('category_type, category_value')
      .order('category_type', { ascending: true });

    if (error) throw new Error(error.message);

    // 按type分组
    const grouped = (categories || []).reduce((acc, cat) => {
      if (!acc[cat.category_type]) {
        acc[cat.category_type] = [];
      }
      if (!acc[cat.category_type].includes(cat.category_value)) {
        acc[cat.category_type].push(cat.category_value);
      }
      return acc;
    }, {} as Record<string, string[]>);

    return NextResponse.json({ categories: grouped });
  } catch (err: any) {
    console.error('[girlfriends/categories] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/girlfriends/browse - 浏览角色库（带分类筛选）
 *
 * 查询参数:
 * - personality: 性格标签 (逗号分割)
 * - body_type: 身材类型
 * - vibe: 气质
 * - search: 搜索名字
 * - page: 分页（默认1）
 * - limit: 每页数量（默认12）
 */
export async function browseGirlfriends(req: NextRequest) {
  try {
    const supabase = await getAuthUser(req).then((auth) => auth?.client);
    if (!supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const personality = searchParams.get('personality')?.split(',') || [];
    const bodyType = searchParams.get('body_type');
    const vibe = searchParams.get('vibe');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');

    // ⚠️ TODO: 构建动态查询，应用筛选条件
    // 目前返回placeholder

    return NextResponse.json({
      girlfriends: [],
      total: 0,
      page,
      limit,
      filters: { personality, body_type: bodyType, vibe, search },
    });
  } catch (err: any) {
    console.error('[girlfriends/browse] error:', err);
    return NextResponse.json(
      { error: 'Failed to browse girlfriends' },
      { status: 500 }
    );
  }
}
