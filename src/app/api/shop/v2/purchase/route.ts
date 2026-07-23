/**
 *  v2  
 * POST /api/shop/v2/purchase
 *
 * Uses purchase_virtual_product RPC (atomic transaction in Postgres).
 * No raw pg connection needed — works via Supabase REST API.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

interface PurchaseBody {
  product_id: string;
  quantity?: number;
  girlfriend_id?: string;
}

const MAX_QUANTITY = 99;

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`shop-purchase:${user.id}`, {
    maxRequests: 10,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many purchase attempts. Please slow down.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS.api) }
    );
  }

  let body: PurchaseBody;
  try {
    body = (await request.json()) as PurchaseBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.product_id || typeof body.product_id !== 'string') {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  }
  const quantity = Math.max(1, Math.min(MAX_QUANTITY, body.quantity ?? 1));

  try {
    const orderNumber = `SM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Call the atomic RPC function (handles validation, balance check, inventory, membership, etc.)
    const { data: rpcResult, error: rpcError } = await client.rpc('purchase_virtual_product', {
      p_user_id: user.id,
      p_product_id: body.product_id,
      p_quantity: quantity,
      p_girlfriend_id: body.girlfriend_id || null,
    });

    if (rpcError) {
      logger.error('purchase RPC failed', { userId: user.id, err: rpcError.message });
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as Record<string, unknown> | null;
    if (!result) {
      return NextResponse.json({ error: 'Purchase failed: empty response' }, { status: 500 });
    }

    // RPC returns error object for business-logic failures
    if (result.error) {
      const code = String(result.code || '');
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        BAD_REQUEST: 400,
        GONE: 410,
        CONFLICT: 409,
        INSUFFICIENT_CREDITS: 402,
      };
      return NextResponse.json(
        { error: String(result.error) },
        { status: statusMap[code] || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      new_credits_balance: result.new_balance,
      inventory_item_id: result.inventory_item_id,
      membership_tier: result.membership_tier ?? null,
      order: {
        order_number: orderNumber,
        product_id: body.product_id,
        product_name: result.product_name,
        quantity,
        total_credits: result.total_credits,
        new_balance: result.new_balance,
        status: 'completed',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Purchase failed';
    logger.error('purchase failed', { userId: user.id, err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
