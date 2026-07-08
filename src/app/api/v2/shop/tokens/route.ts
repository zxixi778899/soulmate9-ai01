import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * GET /api/v2/shop/tokens - 获取代币套餐列表
 * POST /api/v2/shop/tokens - 用户购买代币（Stripe集成）
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = auth.client;

    // 获取所有活跃的代币套餐
    const { data: packages, error } = await supabase
      .from('token_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);

    // 获取用户当前代币余额
    const { data: userTokens, error: tokenError } = await supabase
      .from('user_tokens')
      .select('balance_tokens')
      .eq('user_id', auth.user.id)
      .single();

    if (tokenError && tokenError.code !== 'PGRST116') {
      throw new Error(tokenError.message);
    }

    return NextResponse.json({
      packages,
      user_balance: userTokens?.balance_tokens || 0,
    });
  } catch (err: any) {
    console.error('[shop/tokens] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch token packages' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { package_id, payment_method } = body;

    if (!package_id) {
      return NextResponse.json(
        { error: 'Missing package_id' },
        { status: 400 }
      );
    }

    const supabase = auth.client;

    // 获取代币套餐信息
    const { data: tokenPackage, error: pkgError } = await supabase
      .from('token_packages')
      .select('*')
      .eq('id', package_id)
      .single();

    if (pkgError || !tokenPackage) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      );
    }

    // ⚠️ TODO: 集成Stripe生成checkout session
    // 目前返回支付所需的信息
    return NextResponse.json({
      status: 'requires_payment',
      package: tokenPackage,
      checkout_required: true,
      message: `Please pay $${(tokenPackage.price_cents / 100).toFixed(2)} to receive ${tokenPackage.token_count} tokens`,
    });
  } catch (err: any) {
    console.error('[shop/tokens] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to purchase tokens' },
      { status: 500 }
    );
  }
}
