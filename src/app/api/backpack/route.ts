import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { resolveImageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/backpack
 * List user's backpack items with product details.
 */
export async function GET(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: rows, error } = await client
      .from('user_backpack')
      .select(`
        id,
        product_id,
        quantity,
        acquired_at,
        metadata,
        products!inner (
          id,
          name,
          description,
          category,
          price_credits,
          price_cents,
          images,
          rarity,
          virtual_meta,
          preview_url
        )
      `)
      .eq('user_id', user.id)
      .gt('quantity', 0)
      .order('acquired_at', { ascending: false });

    if (error) {
      logger.warn('[backpack] query failed', { err: error.message });
      return NextResponse.json({ items: [], total: 0 });
    }

    const items = await Promise.all(
      (rows || []).map(async (row) => {
        const product = (row.products as unknown as Record<string, unknown> | null);
        const previewUrl = product?.preview_url as string | null | undefined;
        const images = product?.images as string | string[] | null | undefined;

        // Resolve image URLs
        let resolvedPreview = '';
        if (previewUrl) {
          resolvedPreview = await resolveImageUrl(previewUrl);
        }

        let resolvedImages: string[] = [];
        if (Array.isArray(images)) {
          resolvedImages = await Promise.all(
            images.map((img: string) => resolveImageUrl(img)),
          );
        } else if (typeof images === 'string' && images) {
          resolvedImages = [await resolveImageUrl(images)];
        }

        return {
          id: row.id,
          product_id: row.product_id,
          quantity: row.quantity,
          acquired_at: row.acquired_at,
          metadata: row.metadata,
          product: product
            ? {
                id: product.id,
                name: product.name,
                description: product.description,
                category: product.category,
                price_credits: product.price_credits,
                price_cents: product.price_cents,
                rarity: product.rarity,
                virtual_meta: product.virtual_meta,
                preview_url: resolvedPreview,
                images: resolvedImages,
              }
            : null,
        };
      }),
    );

    return NextResponse.json({ items, total: items.length });
  } catch (e) {
    logger.error('[backpack] GET failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ items: [], total: 0 });
  }
}
