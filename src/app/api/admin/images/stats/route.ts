import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const client = guard.supabase;

  // Girlfriends
  const { data: girlfriends, error: gfErr } = await client
    .from('girlfriends')
    .select('id, name, portrait_url, avatar_url, is_public');

  if (gfErr) {
    return NextResponse.json({ error: gfErr.message }, { status: 500 });
  }

  // Outfits
  const { data: outfits, error: outErr } = await client
    .from('outfits')
    .select('id, name, preview_url');

  if (outErr) {
    return NextResponse.json({ error: outErr.message }, { status: 500 });
  }

  // Shop items
  const { data: shopItems, error: shopErr } = await client
    .from('shop_items')
    .select('id, name, image_url');

  if (shopErr) {
    return NextResponse.json({ error: shopErr.message }, { status: 500 });
  }

  const totalGirlfriends = girlfriends?.length ?? 0;
  const withPortrait = girlfriends?.filter(
    (g: { portrait_url?: string | null; avatar_url?: string | null }) =>
      g.portrait_url || g.avatar_url
  ).length ?? 0;

  const totalOutfits = outfits?.length ?? 0;
  const withPreview = outfits?.filter(
    (o: { preview_url?: string | null }) => o.preview_url
  ).length ?? 0;

  const totalShopItems = shopItems?.length ?? 0;
  const withShopImage = shopItems?.filter(
    (s: { image_url?: string | null }) => s.image_url
  ).length ?? 0;

  return NextResponse.json({
    totalGirlfriends,
    withPortrait,
    missingPortrait: totalGirlfriends - withPortrait,
    totalOutfits,
    withPreview,
    missingPreview: totalOutfits - withPreview,
    totalShopItems,
    withShopImage,
    missingShopImage: totalShopItems - withShopImage,
  });
}