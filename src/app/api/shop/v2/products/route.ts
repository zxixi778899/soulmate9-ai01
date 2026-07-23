/**
 *  v2  
 * GET /api/shop/v2/products
 *
 *  Supabase REST (bypass PostgREST cache with force-dynamic)
 *  Vercel env: COZE_SUPABASE_URL + COZE_SUPABASE_SERVICE_ROLE_KEY
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { parsePagination } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

/** Storefront collections — must stay in sync with /api/admin/shop. */
const COLLECTIONS = ['outfit', 'prop', 'membership', 'credits'] as const;
type Collection = (typeof COLLECTIONS)[number];

/** Derive the admin-managed collection from a product row (mirror of admin/shop logic). */
function collectionFromProduct(row: Record<string, unknown>): Collection {
  const meta = (row.virtual_meta || {}) as Record<string, unknown>;
  const declared = meta.collection;
  if ((COLLECTIONS as readonly string[]).includes(declared as string)) return declared as Collection;
  if (row.category === 'outfit') return 'outfit';
  if (meta.kind === 'membership') return 'membership';
  if (meta.kind === 'credits' || meta.kind === 'points') return 'credits';
  return 'prop';
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price_credits: number;
  price_cents: number;
  compare_at_price_cents: number | null;
  images: Array<{ key: string; alt?: string }> | string;
  tags: string[] | null;
  virtual_meta: Record<string, unknown>;
  rarity: string;
  is_featured: boolean;
  is_new: boolean;
  sales_count: number;
  display_order: number;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collection = searchParams.get('collection');
  const category = searchParams.get('category');
  const rarity = searchParams.get('rarity');
  const featured = searchParams.get('featured');
  const search = searchParams.get('search');
  const { page, limit } = parsePagination(req, {
    maxLimit: 60,
    defaultLimit: 24,
  });

  const sb = getSupabaseClient();

  // Build query with DB-level filters (collection is derived, filtered in JS below)
  let query = sb
    .from('products')
    .select('*')
    .eq('type', 'virtual')
    .eq('status', 'active')
    .order('is_featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);
  if (rarity) query = query.eq('rarity', rarity);
  if (featured === 'true') query = query.eq('is_featured', true);
  if (search) query = query.ilike('name', `%${search.slice(0, 50)}%`);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Tag every row with its admin-managed collection + per-collection counts
  const all = (rows || []) as unknown as ProductRow[];
  const counts: Record<string, number> = { all: all.length };
  for (const c of COLLECTIONS) counts[c] = 0;
  const withCollection = all.map((row) => {
    const col = collectionFromProduct(row as unknown as Record<string, unknown>);
    counts[col] = (counts[col] || 0) + 1;
    return { row, collection: col };
  });
  const filtered = collection && (COLLECTIONS as readonly string[]).includes(collection)
    ? withCollection.filter((p) => p.collection === collection)
    : withCollection;

  const total = filtered.length;
  const from = (page - 1) * limit;
  const pageItems = filtered.slice(from, from + limit);

  const products = await Promise.all(
    pageItems.map(async ({ row, collection: col }) => {
      const rawImages = (typeof row.images === 'string' ? JSON.parse(row.images) : row.images || []) as Array<{ key: string; alt?: string }>;
      const image_urls = await Promise.all(
        rawImages.map(async (img: { key: string; alt?: string }) => ({
          ...img,
          url: await resolveImageUrl(img.key),
        }))
      );
      const preview_url = image_urls[0]?.url || '';
      return {
        ...row,
        collection: col,
        image_urls,
        preview_url,
        is_on_sale: !!(row.compare_at_price_cents && row.compare_at_price_cents > row.price_cents),
      };
    })
  );

  return NextResponse.json(
    {
      products,
      counts,
      page,
      limit,
      total,
      has_more: from + limit < total,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60',
        'CDN-Cache-Control': 'public, s-maxage=10',
      },
    }
  );
}
