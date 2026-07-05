/**
 *  v2  
 * POST /api/shop/v2/purchase
 *
 *  pg  +  PostgREST cache +  RPC
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { withPgClient, queryPgOne } from '@/storage/database/supabase-client';

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

  // 
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
    // 1) 
    const product = await queryPgOne<{
      id: string;
      type: string;
      status: string;
      name: string;
      sku: string;
      price_credits: number;
      price_cents: number;
      stock_type: string;
      stock_remaining: number | null;
      virtual_meta: Record<string, unknown>;
      rarity: string;
    }>(
      `SELECT id, type, status, name, sku, price_credits, price_cents,
              stock_type, stock_remaining, virtual_meta, rarity
       FROM products WHERE id = $1`,
      [body.product_id]
    );

    if (!product) {
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

    const totalCredits = product.price_credits * quantity;
    if (totalCredits <= 0) {
      return NextResponse.json({ error: 'Product has no price' }, { status: 400 });
    }

    // 2)  +  +  inventory +  +1
    const orderNumber = `SM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const isConsumable = (product.virtual_meta as any)?.kind === 'consumable';
    const assetType = (product.virtual_meta as any)?.kind || product.sku;
    const assetId = (product.virtual_meta as any)?.asset_id || product.sku;
    const assetPayload = product.virtual_meta || {};

    const result = await withPgClient(async (db) => {
      await db.query('BEGIN');
      try {
        // 2.1  profile 
        const profileRes = await db.query<{ credits_remaining: number }>(
          'SELECT credits_remaining FROM profiles WHERE user_id = $1 FOR UPDATE',
          [user.id]
        );
        if (profileRes.rows.length === 0) {
          throw new Error('PROFILE_NOT_FOUND');
        }
        const current = profileRes.rows[0].credits_remaining ?? 0;
        if (current < totalCredits) {
          throw new Error('INSUFFICIENT_CREDITS');
        }
        const newBalance = current - totalCredits;
        await db.query(
          'UPDATE profiles SET credits_remaining = $1 WHERE user_id = $2',
          [newBalance, user.id]
        );
        //  ledger
        await db.query(
          `INSERT INTO user_credits_ledger (user_id, delta, balance_after, reason, ref_id)
           VALUES ($1, $2, $3, 'purchase', $4)`,
          [user.id, -totalCredits, newBalance, body.product_id]
        );

        // 2.2 
        const orderRes = await db.query<{ id: string }>(
          `INSERT INTO shop_orders
            (order_number, user_id, product_id, quantity, price_credits, price_cents,
             status, payment_method, paid_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'paid', 'credits', NOW())
           RETURNING id`,
          [orderNumber, user.id, product.id, quantity, totalCredits, product.price_cents * quantity]
        );
        const orderId = orderRes.rows[0].id;

        // 2.3  user_inventory
        let inventoryId: string | null = null;
        if (isConsumable) {
          // 
          const invRes = await db.query<{ id: string }>(
            `INSERT INTO user_inventory
              (user_id, product_id, asset_type, asset_id, asset_payload, quantity, source, source_ref, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, 'purchase', $7, $8)
             ON CONFLICT (user_id, asset_type, asset_id)
             DO UPDATE SET quantity = user_inventory.quantity + EXCLUDED.quantity,
                           acquired_at = NOW()
             RETURNING id`,
            [user.id, product.id, assetType, assetId, assetPayload, quantity, orderId, { rarity: product.rarity }]
          );
          inventoryId = invRes.rows[0].id;
        } else {
          const invRes = await db.query<{ id: string }>(
            `INSERT INTO user_inventory
              (user_id, product_id, asset_type, asset_id, asset_payload, quantity, source, source_ref, metadata)
             VALUES ($1, $2, $3, $4, $5, 1, 'purchase', $6, $7)
             ON CONFLICT (user_id, asset_type, asset_id) DO NOTHING
             RETURNING id`,
            [user.id, product.id, assetType, assetId, assetPayload, orderId, { rarity: product.rarity, name: product.name }]
          );
          inventoryId = invRes.rows[0]?.id ?? null;
        }

        // 2.4  +1
        await db.query(
          'UPDATE products SET sales_count = sales_count + $1 WHERE id = $2',
          [quantity, product.id]
        );

        // 2.5 
        if (inventoryId) {
          await db.query(
            `UPDATE shop_orders SET status = 'completed', fulfilled_at = NOW(), inventory_item_id = $1 WHERE id = $2`,
            [inventoryId, orderId]
          );
        }

        await db.query('COMMIT');
        return { orderId, newBalance, inventoryId };
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    });

    return NextResponse.json({
      success: true,
      order: {
        order_number: orderNumber,
        product_id: product.id,
        product_name: product.name,
        quantity,
        total_credits: totalCredits,
        new_balance: result.newBalance,
        status: 'completed',
      },
    });
  } catch (err: any) {
    const msg = err?.message || 'Purchase failed';
    if (msg === 'INSUFFICIENT_CREDITS') {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }
    if (msg === 'PROFILE_NOT_FOUND') {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    logger.error('purchase failed', { userId: user.id, err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
