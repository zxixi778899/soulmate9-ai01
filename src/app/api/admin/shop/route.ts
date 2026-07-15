import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { uploadFile } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { invalidateShop } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

const WRITE_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 };
const COLLECTIONS = ['outfit', 'prop', 'membership', 'credits'] as const;
type Collection = (typeof COLLECTIONS)[number];

type ProductInput = {
  id?: string;
  collection?: Collection;
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  price_cents?: number;
  price_credits?: number;
  image_url?: string | null;
  video_url?: string | null;
  effect_asset_url?: string | null;
  effect_type?: string;
  effect_config?: Record<string, unknown>;
  wear_prompt?: string;
  auto_generate_image?: boolean;
  auto_generate_video?: boolean;
  membership_tier?: string;
  duration_days?: number;
  token_amount?: number;
  rarity?: string;
  active?: boolean;
  featured?: boolean;
  sort_order?: number;
};

function parseCollection(value: unknown): Collection {
  return COLLECTIONS.includes(value as Collection) ? (value as Collection) : 'prop';
}

function dbCategory(collection: Collection): string {
  if (collection === 'outfit') return 'outfit';
  if (collection === 'prop') return 'effect';
  return 'consumable';
}

function collectionFromProduct(row: Record<string, unknown>): Collection {
  const meta = (row.virtual_meta || {}) as Record<string, unknown>;
  const declared = meta.collection;
  if (COLLECTIONS.includes(declared as Collection)) return declared as Collection;
  if (row.category === 'outfit') return 'outfit';
  if (meta.kind === 'membership') return 'membership';
  if (meta.kind === 'credits' || meta.kind === 'points') return 'credits';
  return 'prop';
}

function firstImage(row: Record<string, unknown>): string | null {
  const images = Array.isArray(row.images) ? row.images : [];
  const first = images[0] as string | { key?: string; url?: string } | undefined;
  if (typeof first === 'string') return first;
  return first?.url || first?.key || null;
}

function mapProduct(row: Record<string, unknown>, asset?: Record<string, unknown>) {
  const meta = (row.virtual_meta || {}) as Record<string, unknown>;
  const assetMeta = ((asset?.metadata || {}) as Record<string, unknown>) || {};
  return {
    id: String(row.id),
    collection: collectionFromProduct(row),
    sku: String(row.sku || ''),
    name: String(row.name || ''),
    description: String(row.description || ''),
    category: String(row.subcategory || ''),
    price_cents: Number(row.price_cents || 0),
    price_credits: Number(row.price_credits || 0),
    image_url: String(asset?.image_url || firstImage(row) || ''),
    video_url: String(assetMeta.video_url || meta.video_url || ''),
    effect_asset_url: String(meta.effect_asset_url || ''),
    effect_type: String(meta.effect_type || ''),
    effect_config: (meta.effect_config || {}) as Record<string, unknown>,
    wear_prompt: String(asset?.prompt_suffix || meta.wear_prompt || ''),
    auto_generate_image: meta.auto_generate_image !== false,
    auto_generate_video: meta.auto_generate_video === true,
    membership_tier: String(meta.membership_tier || ''),
    duration_days: Number(meta.duration_days || 0),
    token_amount: Number(meta.token_amount || 0),
    rarity: String(row.rarity || 'common'),
    active: row.status === 'active' && row.is_active !== false,
    featured: row.is_featured === true,
    sort_order: Number(row.display_order || 100),
    asset_id: asset?.id ? String(asset.id) : String(meta.asset_id || ''),
    created_at: row.created_at,
  };
}

function slug(value: string): string {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${normalized || 'item'}-${Date.now().toString(36)}`;
}

function virtualMeta(input: ProductInput, collection: Collection, current: Record<string, unknown> = {}) {
  return {
    ...current,
    collection,
    kind: collection === 'outfit' ? 'outfit' : collection,
    video_url: input.video_url || null,
    effect_asset_url: input.effect_asset_url || null,
    effect_type: input.effect_type || null,
    effect_config: input.effect_config || {},
    wear_prompt: input.wear_prompt || null,
    auto_generate_image: input.auto_generate_image !== false,
    auto_generate_video: input.auto_generate_video === true,
    membership_tier: input.membership_tier || null,
    duration_days: Number(input.duration_days || 0),
    token_amount: Number(input.token_amount || 0),
  };
}

async function writeGuard(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return { error: admin.error };
  const rl = await checkRateLimitAsync(`admin-shop-write:${admin.user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return {
      error: NextResponse.json({ error: 'Too many writes' }, { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) }),
    };
  }
  return { admin };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { searchParams } = new URL(request.url);
  const selected = searchParams.get('collection');
  const search = (searchParams.get('search') || '').trim().toLowerCase();

  try {
    const { data: products, error } = await admin.supabase
      .from('products')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw error;

    const productIds = (products || []).map((p) => p.id);
    const { data: assets } = productIds.length
      ? await admin.supabase.from('outfit_assets').select('*').in('product_id', productIds)
      : { data: [] };
    const assetByProduct = new Map((assets || []).map((asset) => [String(asset.product_id), asset as Record<string, unknown>]));
    const all = (products || []).map((product) => mapProduct(product as Record<string, unknown>, assetByProduct.get(String(product.id))));
    const filtered = all.filter((item) => {
      if (selected && selected !== 'all' && item.collection !== selected) return false;
      if (!search) return true;
      return `${item.name} ${item.description} ${item.category} ${item.sku}`.toLowerCase().includes(search);
    });
    const counts = Object.fromEntries(COLLECTIONS.map((key) => [key, all.filter((item) => item.collection === key).length]));
    return NextResponse.json({ items: filtered, counts: { ...counts, all: all.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Load failed';
    logger.error('admin shop load failed', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guarded = await writeGuard(request);
  if (guarded.error) return guarded.error;
  const { supabase } = guarded.admin!;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: 'file is required' }, { status: 400 });
      }
      if (file.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: 'File exceeds 50MB' }, { status: 400 });
      }
      const allowed = /^(image|video)\//.test(file.type) || /\.(svga|json)$/i.test(file.name);
      if (!allowed) return NextResponse.json({ error: 'Only image, video, SVGA or JSON effect files are allowed' }, { status: 400 });
      const uploaded = await uploadFile(Buffer.from(await file.arrayBuffer()), file.name, file.type || 'application/octet-stream', 'admin/catalog');
      return NextResponse.json({ url: uploaded.url, key: uploaded.key, media_type: file.type });
    }

    const input = (await request.json()) as ProductInput;
    const collection = parseCollection(input.collection);
    if (!input.name?.trim() || !input.description?.trim()) {
      return NextResponse.json({ error: 'Name and description are required' }, { status: 400 });
    }
    const sku = input.sku?.trim() || slug(input.name);
    const meta = virtualMeta(input, collection);
    const { data: product, error } = await supabase.from('products').insert({
      sku,
      name: input.name.trim(),
      description: input.description.trim(),
      category: dbCategory(collection),
      subcategory: input.category || collection,
      price_credits: Math.max(0, Number(input.price_credits || 0)),
      price_cents: Math.max(0, Number(input.price_cents || 0)),
      images: input.image_url ? [{ key: input.image_url }] : [],
      virtual_meta: meta,
      rarity: input.rarity || 'common',
      type: collection === 'membership' ? 'subscription' : 'virtual',
      status: input.active === false ? 'draft' : 'active',
      is_active: input.active !== false,
      is_featured: input.featured === true,
      display_order: Number(input.sort_order || 100),
    }).select().single();
    if (error) throw error;

    let asset: Record<string, unknown> | undefined;
    if (collection === 'outfit') {
      const { data: createdAsset, error: assetError } = await supabase.from('outfit_assets').insert({
        product_id: product.id,
        asset_key: sku,
        name: input.name.trim(),
        image_url: input.image_url || null,
        prompt_suffix: input.wear_prompt || null,
        metadata: { video_url: input.video_url || null, effect_asset_url: input.effect_asset_url || null },
      }).select().single();
      if (assetError) throw assetError;
      asset = createdAsset as Record<string, unknown>;
      await supabase.from('products').update({ virtual_meta: { ...meta, asset_id: createdAsset.id } }).eq('id', product.id);
    }
    invalidateShop();
    return NextResponse.json({ item: mapProduct(product as Record<string, unknown>, asset) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create failed';
    logger.error('admin shop create failed', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guarded = await writeGuard(request);
  if (guarded.error) return guarded.error;
  const { supabase } = guarded.admin!;

  try {
    const input = (await request.json()) as ProductInput;
    if (!input.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const collection = parseCollection(input.collection);
    const { data: existing, error: findError } = await supabase.from('products').select('virtual_meta,sku').eq('id', input.id).single();
    if (findError) throw findError;
    const currentMeta = (existing.virtual_meta || {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      name: input.name,
      description: input.description,
      category: dbCategory(collection),
      subcategory: input.category || collection,
      price_credits: Math.max(0, Number(input.price_credits || 0)),
      price_cents: Math.max(0, Number(input.price_cents || 0)),
      virtual_meta: virtualMeta(input, collection, currentMeta),
      rarity: input.rarity || 'common',
      type: collection === 'membership' ? 'subscription' : 'virtual',
      status: input.active === false ? 'draft' : 'active',
      is_active: input.active !== false,
      is_featured: input.featured === true,
      display_order: Number(input.sort_order || 100),
      updated_at: new Date().toISOString(),
    };
    if (input.image_url !== undefined) updates.images = input.image_url ? [{ key: input.image_url }] : [];
    const { error } = await supabase.from('products').update(updates).eq('id', input.id);
    if (error) throw error;

    if (collection === 'outfit') {
      const assetId = String(currentMeta.asset_id || '');
      const assetPayload = {
        product_id: input.id,
        asset_key: String(existing.sku),
        name: input.name || String(existing.sku),
        image_url: input.image_url || null,
        prompt_suffix: input.wear_prompt || null,
        metadata: { video_url: input.video_url || null, effect_asset_url: input.effect_asset_url || null },
      };
      const result = assetId
        ? await supabase.from('outfit_assets').update(assetPayload).eq('id', assetId).select().maybeSingle()
        : await supabase.from('outfit_assets').insert(assetPayload).select().single();
      if (result.error) throw result.error;
      if (!assetId && result.data) {
        await supabase.from('products').update({ virtual_meta: { ...virtualMeta(input, collection, currentMeta), asset_id: result.data.id } }).eq('id', input.id);
      }
    }
    invalidateShop();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
    logger.error('admin shop update failed', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guarded = await writeGuard(request);
  if (guarded.error) return guarded.error;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const { error } = await guarded.admin!.supabase.from('products').update({ status: 'archived', is_active: false }).eq('id', id);
    if (error) throw error;
    invalidateShop();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Archive failed';
    logger.error('admin shop archive failed', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
