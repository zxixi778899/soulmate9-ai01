import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { uploadFile } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const WRITE_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 };

type Collection = 'outfit' | 'prop';

function parseCollection(v: string | null | undefined): Collection {
  return v === 'outfit' ? 'outfit' : 'prop';
}

function mapOutfit(row: Record<string, unknown>) {
  return {
    id: row.id,
    collection: 'outfit' as const,
    name: row.name,
    description: row.description || '',
    price_cents: row.price_cents ?? 0,
    tier: row.tier || 'free',
    category: row.category || 'everyday',
    image_url: row.preview_url || null,
    intimacy_boost: row.intimacy_boost ?? 0,
    active: true,
    emoji: '',
    sort_order: 0,
    item_type: 'outfit',
    visual_type: '',
    is_gift: !!row.is_gift,
    is_limited: !!row.is_limited,
    created_at: row.created_at,
  };
}

function mapProp(row: Record<string, unknown>) {
  return {
    id: row.id,
    collection: 'prop' as const,
    name: row.name,
    description: row.description || '',
    price_cents: row.price_cents ?? 0,
    tier: row.tier || 'free',
    category: row.category || 'gift',
    image_url: row.image_url || null,
    intimacy_boost: row.intimacy_boost ?? 0,
    active: row.active !== false,
    emoji: row.emoji || '',
    sort_order: row.sort_order ?? 0,
    item_type: row.item_type || 'intimacy_boost',
    visual_type: row.visual_type || '',
    is_gift: false,
    is_limited: !!row.is_limited,
    created_at: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get('collection'); // outfit | prop | all
    const search = (searchParams.get('search') || '').trim();
    const category = (searchParams.get('category') || '').trim();

    const wantOutfit = !collection || collection === 'all' || collection === 'outfit';
    const wantProp = !collection || collection === 'all' || collection === 'prop';

    const items: ReturnType<typeof mapOutfit>[] = [];
    const categories = new Set<string>();

    if (wantOutfit) {
      let q = supabase.from('outfits').select('*').order('name', { ascending: true });
      if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data || []) {
        const m = mapOutfit(row as Record<string, unknown>);
        items.push(m);
        if (m.category) categories.add(String(m.category));
      }
    }

    if (wantProp) {
      let q = supabase.from('shop_items').select('*').order('sort_order', { ascending: true });
      if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      for (const row of data || []) {
        const m = mapProp(row as Record<string, unknown>);
        items.push(m as never);
        if (m.category) categories.add(String(m.category));
      }
    }

    return NextResponse.json({
      items,
      categories: Array.from(categories).sort(),
      counts: {
        outfit: items.filter((i) => i.collection === 'outfit').length,
        prop: items.filter((i) => i.collection === 'prop').length,
        total: items.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('admin/shop GET', { msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-shop-write:${user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many writes' }, { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    // Batch multipart create (CSV-like fields + optional images)
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const collection = parseCollection(String(form.get('collection') || 'prop'));
      const payloadRaw = String(form.get('items') || '[]');
      let rows: Array<Record<string, unknown>> = [];
      try {
        rows = JSON.parse(payloadRaw);
      } catch {
        return NextResponse.json({ error: 'items must be JSON array' }, { status: 400 });
      }
      if (!Array.isArray(rows) || !rows.length) {
        return NextResponse.json({ error: 'items required' }, { status: 400 });
      }
      if (rows.length > 50) {
        return NextResponse.json({ error: 'Max 50 items per batch' }, { status: 400 });
      }

      const created: unknown[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const name = String(row.name || '').trim();
          if (!name) throw new Error('name required');
          const description = String(row.description || '');
          const price_cents = Number(row.price_cents || 0);
          const category = String(row.category || (collection === 'outfit' ? 'everyday' : 'gift'));
          const tier = String(row.tier || 'free');
          const intimacy_boost = Number(row.intimacy_boost || 0);

          // optional image file for this index
          const file = form.get(`file_${i}`);
          let imageUrl: string | null = (row.image_url as string) || null;
          if (file instanceof File && file.size > 0) {
            const buf = Buffer.from(await file.arrayBuffer());
            const up = await uploadFile(
              buf,
              file.name || `item_${i}.png`,
              file.type || 'image/png',
              collection === 'outfit' ? 'admin/outfits' : 'admin/shop_items',
            );
            imageUrl = up.url;
          }

          if (collection === 'outfit') {
            const { data, error } = await supabase
              .from('outfits')
              .insert({
                name,
                description,
                price_cents,
                tier,
                category,
                intimacy_boost,
                preview_url: imageUrl,
                is_gift: !!row.is_gift,
                is_limited: !!row.is_limited,
              })
              .select()
              .single();
            if (error) throw error;
            created.push(mapOutfit(data as Record<string, unknown>));
          } else {
            const { data, error } = await supabase
              .from('shop_items')
              .insert({
                name,
                description,
                price_cents,
                category,
                image_url: imageUrl,
                intimacy_boost,
                item_type: String(row.item_type || 'intimacy_boost'),
                effect_value: row.effect_value || {},
                emoji: String(row.emoji || ''),
                tier,
                visual_type: String(row.visual_type || ''),
                sort_order: Number(row.sort_order || 0),
                active: row.active !== false,
              })
              .select()
              .single();
            if (error) throw error;
            created.push(mapProp(data as Record<string, unknown>));
          }
        } catch (e) {
          errors.push(`#${i}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return NextResponse.json({
        success: true,
        created: created.length,
        failed: errors.length,
        items: created,
        errors: errors.slice(0, 20),
      });
    }

    // Single JSON create
    const body = await request.json();
    const collection = parseCollection(body.collection || body.kind || 'prop');
    const name = String(body.name || '').trim();
    const description = String(body.description || '');
    if (!name || !description) {
      return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
    }

    if (collection === 'outfit') {
      const { data, error } = await supabase
        .from('outfits')
        .insert({
          name,
          description,
          price_cents: body.price_cents || 0,
          tier: body.tier || 'free',
          category: body.category || 'everyday',
          intimacy_boost: body.intimacy_boost || 0,
          preview_url: body.image_url || body.preview_url || null,
          is_gift: !!body.is_gift,
          is_limited: !!body.is_limited,
        })
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ item: mapOutfit(data as Record<string, unknown>) });
    }

    const { data, error } = await supabase
      .from('shop_items')
      .insert({
        name,
        emoji: body.emoji || '',
        description,
        price_cents: body.price_cents || 0,
        tier: body.tier || 'free',
        category: body.category || 'gift',
        visual_type: body.visual_type || null,
        effect_value: body.effect_value || {},
        sort_order: body.sort_order || 0,
        active: body.active !== false,
        image_url: body.image_url || null,
        intimacy_boost: body.intimacy_boost || 0,
        item_type: body.item_type || 'intimacy_boost',
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ item: mapProp(data as Record<string, unknown>) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('admin/shop POST', { msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-shop-write:${user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many writes' }, { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) });
  }

  try {
    const body = await request.json();

    // Batch patch
    if (Array.isArray(body.items)) {
      const items = body.items as Array<Record<string, unknown>>;
      if (!items.length) return NextResponse.json({ error: 'items required' }, { status: 400 });
      if (items.length > 100) return NextResponse.json({ error: 'Max 100 items' }, { status: 400 });

      let updated = 0;
      const errors: string[] = [];
      for (const it of items) {
        try {
          const id = String(it.id || '');
          const collection = parseCollection(String(it.collection || 'prop'));
          if (!id) throw new Error('id required');
          const updates: Record<string, unknown> = {};
          if (it.name !== undefined) updates.name = it.name;
          if (it.description !== undefined) updates.description = it.description;
          if (it.price_cents !== undefined) updates.price_cents = Number(it.price_cents);
          if (it.category !== undefined) updates.category = it.category;
          if (it.tier !== undefined) updates.tier = it.tier;
          if (it.intimacy_boost !== undefined) updates.intimacy_boost = Number(it.intimacy_boost);

          if (collection === 'outfit') {
            if (it.image_url !== undefined) updates.preview_url = it.image_url;
            if (it.is_gift !== undefined) updates.is_gift = !!it.is_gift;
            if (it.is_limited !== undefined) updates.is_limited = !!it.is_limited;
            const { error } = await supabase.from('outfits').update(updates).eq('id', id);
            if (error) throw error;
          } else {
            if (it.image_url !== undefined) updates.image_url = it.image_url;
            if (it.emoji !== undefined) updates.emoji = it.emoji;
            if (it.visual_type !== undefined) updates.visual_type = it.visual_type;
            if (it.sort_order !== undefined) updates.sort_order = Number(it.sort_order);
            if (it.active !== undefined) updates.active = !!it.active;
            if (it.item_type !== undefined) updates.item_type = it.item_type;
            const { error } = await supabase.from('shop_items').update(updates).eq('id', id);
            if (error) throw error;
          }
          updated += 1;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      return NextResponse.json({ success: true, updated, failed: errors.length, errors: errors.slice(0, 20) });
    }

    // Single patch
    const id = body.id as string | undefined;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const collection = parseCollection(body.collection || 'prop');
    const { id: _id, collection: _c, kind: _k, ...rest } = body as Record<string, unknown>;
    const updates: Record<string, unknown> = { ...rest };
    if (collection === 'outfit') {
      if ('image_url' in updates) {
        updates.preview_url = updates.image_url;
        delete updates.image_url;
      }
      // strip prop-only fields
      delete updates.emoji;
      delete updates.visual_type;
      delete updates.sort_order;
      delete updates.active;
      delete updates.item_type;
      const { error } = await supabase.from('outfits').update(updates).eq('id', id);
      if (error) throw error;
    } else {
      delete updates.preview_url;
      delete updates.is_gift;
      const { error } = await supabase.from('shop_items').update(updates).eq('id', id);
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('admin/shop PATCH', { msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-shop-write:${user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many writes' }, { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) });
  }

  try {
    const { searchParams } = new URL(request.url);
    // batch: ?ids=a,b,c&collection=prop
    const idsParam = searchParams.get('ids');
    const collection = parseCollection(searchParams.get('collection') || 'prop');
    const table = collection === 'outfit' ? 'outfits' : 'shop_items';

    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('admin/shop DELETE', { msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
