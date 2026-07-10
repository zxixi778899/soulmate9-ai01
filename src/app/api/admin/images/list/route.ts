import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type ItemType = 'girlfriend' | 'outfit' | 'shop_item';

function mapGirlfriend(gf: Record<string, unknown>) {
  const cc = (gf.character_card || {}) as Record<string, unknown>;
  const appearance = (cc.appearance || {}) as Record<string, string>;

  const race = (gf.appearance_race as string) || appearance.race || '';
  const hair = (gf.appearance_hair as string) || appearance.hair_style || appearance.hair || '';
  const hairColor =
    (gf.appearance_hair_color as string) || appearance.hair_color || '';
  const eyes = (gf.appearance_eyes as string) || appearance.eyes || '';
  const body = (gf.appearance_body as string) || appearance.body || '';
  const style = (gf.appearance_style as string) || appearance.style || '';

  const appearanceParts: string[] = [];
  if (race) appearanceParts.push(race);
  if (hairColor && hair) appearanceParts.push(`${hairColor} ${hair}`);
  else if (hair) appearanceParts.push(hair);
  if (eyes) appearanceParts.push(`${eyes} eyes`);
  if (body) appearanceParts.push(`${body} figure`);
  if (style) appearanceParts.push(style);

  const portraitUrl = (gf.portrait_url as string) || null;
  const avatarUrl = (gf.avatar_url as string) || null;
  const imageUrl = portraitUrl || avatarUrl || null;

  return {
    id: gf.id,
    name: gf.name,
    personality: gf.personality || '',
    tags: gf.tags || [],
    slug: gf.slug || null,
    review_status: gf.review_status || null,
    created_at: gf.created_at || null,
    appearance_race: race || null,
    appearance_hair: hair || null,
    appearance_hair_color: hairColor || null,
    appearance_eyes: eyes || null,
    appearance_body: body || null,
    appearance_style: style || null,
    character_card: gf.character_card || null,
    image_prompt: gf.image_prompt || null,
    backstory: gf.backstory || null,
    short_description: gf.short_description || null,
    imageUrl,
    portraitUrl,
    avatarUrl,
    hasImage: !!imageUrl,
    itemCategory: 'girlfriend' as const,
    field: 'portrait_url',
    appearance: appearanceParts.join(', '),
  };
}

function mapOutfit(o: Record<string, unknown>) {
  return {
    id: o.id,
    name: o.name,
    description: o.description || '',
    category: o.category || null,
    tier: o.tier || null,
    imageUrl: (o.preview_url as string) || null,
    hasImage: !!o.preview_url,
    itemCategory: 'outfit' as const,
    field: 'preview_url',
  };
}

function mapShopItem(si: Record<string, unknown>) {
  return {
    id: si.id,
    name: si.name,
    description: si.description || '',
    category: si.category || null,
    item_type: si.item_type || null,
    intimacy_boost: si.intimacy_boost ?? null,
    imageUrl: (si.image_url as string) || null,
    hasImage: !!si.image_url,
    itemCategory: 'shop_item' as const,
    field: 'image_url',
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  try {
    const db = guard.supabase;
    const { searchParams } = new URL(req.url);

    const type = (searchParams.get('type') || 'girlfriend') as ItemType;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(48, Math.max(6, parseInt(searchParams.get('pageSize') || '12', 10) || 12));
    const search = (searchParams.get('search') || '').trim();
    const status = searchParams.get('status') || 'all'; // all | with_image | without_image
    const sort = searchParams.get('sort') || 'created_at'; // name | created_at
    const includeStats = searchParams.get('stats') !== '0';

    // ── Stats (light counts) ──────────────────────────────────────────
    let stats = {
      totalGirlfriends: 0,
      withPortrait: 0,
      totalOutfits: 0,
      withPreview: 0,
      totalShopItems: 0,
      shopItemsWithImage: 0,
    };

    if (includeStats) {
      try {
        const [gfAll, gfImg, ofAll, ofImg, shAll, shImg] = await Promise.all([
          db.from('girlfriends').select('id', { count: 'exact', head: true }),
          db
            .from('girlfriends')
            .select('id', { count: 'exact', head: true })
            .or('portrait_url.not.is.null,avatar_url.not.is.null'),
          db.from('outfits').select('id', { count: 'exact', head: true }),
          db
            .from('outfits')
            .select('id', { count: 'exact', head: true })
            .not('preview_url', 'is', null),
          db.from('shop_items').select('id', { count: 'exact', head: true }),
          db
            .from('shop_items')
            .select('id', { count: 'exact', head: true })
            .not('image_url', 'is', null),
        ]);
        stats = {
          totalGirlfriends: gfAll.count || 0,
          withPortrait: gfImg.count || 0,
          totalOutfits: ofAll.count || 0,
          withPreview: ofImg.count || 0,
          totalShopItems: shAll.count || 0,
          shopItemsWithImage: shImg.count || 0,
        };
      } catch (e) {
        logger.warn('admin/images/list: stats failed', { err: String(e) });
      }
    }

    // ── Paginated list by type ────────────────────────────────────────
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let items: unknown[] = [];
    let total = 0;

    if (type === 'girlfriend') {
      let q = db
        .from('girlfriends')
        .select(
          'id, name, personality, avatar_url, portrait_url, created_at, slug, tags, review_status, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, character_card, image_prompt, backstory, short_description',
          { count: 'exact' },
        );

      if (search) {
        q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%,personality.ilike.%${search}%`);
      }
      if (status === 'with_image') {
        q = q.or('portrait_url.not.is.null,avatar_url.not.is.null');
      } else if (status === 'without_image') {
        q = q.is('portrait_url', null).is('avatar_url', null);
      }

      q =
        sort === 'name'
          ? q.order('name', { ascending: true })
          : q.order('created_at', { ascending: false });

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      total = count || 0;
      items = (data || []).map((row) => mapGirlfriend(row as Record<string, unknown>));
    } else if (type === 'outfit') {
      let q = db
        .from('outfits')
        .select('id, name, description, category, preview_url, tier', { count: 'exact' });

      if (search) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      }
      if (status === 'with_image') {
        q = q.not('preview_url', 'is', null);
      } else if (status === 'without_image') {
        q = q.is('preview_url', null);
      }

      q =
        sort === 'name'
          ? q.order('name', { ascending: true })
          : q.order('name', { ascending: true });

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      total = count || 0;
      items = (data || []).map((row) => mapOutfit(row as Record<string, unknown>));
    } else if (type === 'shop_item') {
      let q = db
        .from('shop_items')
        .select('id, name, description, image_url, item_type, category, intimacy_boost', {
          count: 'exact',
        });

      if (search) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      }
      if (status === 'with_image') {
        q = q.not('image_url', 'is', null);
      } else if (status === 'without_image') {
        q = q.is('image_url', null);
      }

      q =
        sort === 'name'
          ? q.order('name', { ascending: true })
          : q.order('name', { ascending: true });

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      total = count || 0;
      items = (data || []).map((row) => mapShopItem(row as Record<string, unknown>));
    } else {
      return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      items,
      // backward-compat aliases (old page loaded all three arrays)
      girlfriends: type === 'girlfriend' ? items : undefined,
      outfits: type === 'outfit' ? items : undefined,
      shopItems: type === 'shop_item' ? items : undefined,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        type,
        search,
        status,
        sort,
      },
      stats,
    });
  } catch (error) {
    logger.error('admin/images/list error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load list' },
      { status: 500 },
    );
  }
}
