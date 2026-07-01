/**
 * 虚拟商城 v2 — 购买商品
 * POST /api/shop/v2/purchase
 *
 * 简化 MVP：仅支持 credits 余额支付（Stripe 后续接入）
 * 流程：原子扣 credits → 写入 user_inventory → 创建 shop_orders 记录
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

interface PurchaseBody {
  product_id: string;
  quantity?: number;
}

const MAX_QUANTITY = 99;

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 限流：10 次/分钟（防刷单）
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

  // Body 校验
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

  // 1) 查询商品
  const { data: product, error: prodErr } = await client
    .from('products')
    .select('id, type, status, name, sku, price_credits, price_cents, stock_type, stock_remaining, virtual_meta, rarity')
    .eq('id', body.product_id)
    .maybeSingle();

  if (prodErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  if (product.type !== 'virtual') {
    return NextResponse.json({ error: 'Only virtual products can be purchased via this endpoint' }, { status: 400 });
  }
  if (product.status !== 'active') {
    return NextResponse.json({ error: 'Product is not available for purchase' }, { status: 410 });
  }
  if (product.stock_type === 'inventory' && product.stock_remaining !== null && product.stock_remaining < quantity) {
    return NextResponse.json(
      { error: `Insufficient stock. Only ${product.stock_remaining} available.` },
      { status: 409 }
    );
  }

  // 计算总价
  const totalCredits = product.price_credits * quantity;
  if (totalCredits <= 0) {
    return NextResponse.json({ error: 'Product has no price' }, { status: 400 });
  }

  // 2) 原子扣积分（使用 RPC，FOR UPDATE 防并发）
  const { data: deductResult, error: rpcErr } = await client.rpc('deduct_credits', {
    uid: user.id,
    amount: totalCredits,
    reason: 'purchase',
    ref_id: body.product_id,
  });

  if (rpcErr) {
    logger.error('deduct_credits rpc failed', { userId: user.id, err: rpcErr.message });
    return NextResponse.json({ error: 'Payment failed' }, { status: 500 });
  }
  const result = (deductResult as Array<{ success: boolean; new_balance: number; error_msg: string | null }> | null)?.[0];
  if (!result?.success) {
    return NextResponse.json(
      { error: result?.error_msg || 'Insufficient credits' },
      { status: 402 }
    );
  }

  // 3) 创建订单
  const orderNumber = `SM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: order, error: orderErr } = await client
    .from('shop_orders')
    .insert({
      order_number: orderNumber,
      user_id: user.id,
      product_id: product.id,
      quantity,
      price_credits: totalCredits,
      price_cents: product.price_cents * quantity,
      status: 'paid',
      payment_method: 'credits',
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (orderErr) {
    // 极端情况：扣了钱但订单创建失败 → 需要 refund
    logger.error('order create failed after deduct, attempting refund', { userId: user.id, err: orderErr.message });
    await client.rpc('grant_credits', { uid: user.id, amount: totalCredits });
    return NextResponse.json({ error: 'Order creation failed. Credits refunded.' }, { status: 500 });
  }

  // 4) 履约：写入 user_inventory
  // 消耗品 (consumable) 允许持有多个，非消耗品用 unique 约束防重
  const isConsumable = product.virtual_meta?.kind === 'consumable';
  const assetType = product.virtual_meta?.kind || product.category;
  const assetId = product.virtual_meta?.asset_id || product.sku;

  let inventoryItem = null;
  let inventoryErr = null;

  if (isConsumable) {
    // 消耗品：upsert（累加 quantity）
    const { data, error } = await client.rpc('merge_inventory', {
      p_user_id: user.id,
      p_product_id: product.id,
      p_asset_type: assetType,
      p_asset_id: assetId,
      p_quantity: quantity,
      p_source: 'purchase',
      p_source_ref: order.id,
      p_metadata: { rarity: product.rarity },
    });
    inventoryItem = data;
    inventoryErr = error;
  } else {
    // 永久道具：unique (user_id, asset_type, asset_id)，已持有则跳过
    const { data, error } = await client
      .from('user_inventory')
      .upsert(
        {
          user_id: user.id,
          product_id: product.id,
          asset_type: assetType,
          asset_id: assetId,
          asset_payload: product.virtual_meta || {},
          quantity: 1,
          source: 'purchase',
          source_ref: order.id,
          metadata: { rarity: product.rarity, name: product.name },
        },
        { onConflict: 'user_id,asset_type,asset_id', ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();
    inventoryItem = data;
    inventoryErr = error;
  }

  if (inventoryErr) {
    logger.error('inventory fulfillment failed', { userId: user.id, err: inventoryErr.message });
    // 不回滚 credits，记录错误让 ops 手动处理
  }

  // 5) 销量 +1
  await client
    .from('products')
    .update({ sales_count: (product as any).sales_count + quantity })
    .eq('id', product.id);

  // 6) 标记订单完成
  if (inventoryItem && (inventoryItem as any).id) {
    await client
      .from('shop_orders')
      .update({
        status: 'completed',
        fulfilled_at: new Date().toISOString(),
        inventory_item_id: (inventoryItem as any).id,
      })
      .eq('id', order.id);
  }

  return NextResponse.json({
    success: true,
    order: {
      order_number: orderNumber,
      product_id: product.id,
      product_name: product.name,
      quantity,
      total_credits: totalCredits,
      new_balance: result.new_balance,
    },
    inventory_item: inventoryItem,
    new_credits_balance: result.new_balance,
  });
}
