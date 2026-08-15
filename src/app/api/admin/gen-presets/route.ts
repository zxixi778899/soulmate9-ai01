/**
 * Admin API: gen preset catalog CRUD (generation control center, Tab 3).
 *
 * GET    /api/admin/gen-presets?category=       → list rows (incl. inactive)
 * POST   /api/admin/gen-presets                 → seed legacy or upsert one
 * PATCH  /api/admin/gen-presets                 → partial update by (category, slug)
 * DELETE /api/admin/gen-presets?category=&slug= → remove one row
 *
 * POST body: { seed?: true } or a single preset object. Upserts on
 * (category, slug) so the same call creates or edits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  buildLegacyCatalog,
  GEN_PRESET_CATEGORIES,
  invalidatePresetCache,
  isGenPresetCategory,
  isMissingPresetTableError,
  presetFromRow,
  seedPresetsFromLegacy,
  type GenPreset,
  type GenPresetCategory,
} from '@/lib/gen-presets/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clampLevel(value: unknown): number {
  return Math.min(5, Math.max(0, Math.round(Number(value || 0))));
}

function sanitizeSlug(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 64);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const categoryParam = String(
    request.nextUrl.searchParams.get('category') || '',
  ).toLowerCase();
  const categories: GenPresetCategory[] = isGenPresetCategory(categoryParam)
    ? [categoryParam]
    : [...GEN_PRESET_CATEGORIES];

  const presets: GenPreset[] = [];
  let tableMissing = false;
  for (const category of categories) {
    const { data, error } = await admin.supabase
      .from('gen_preset_catalog')
      .select('*')
      .eq('category', category)
      .order('sort_order', { ascending: true })
      .order('slug', { ascending: true })
      .limit(1000);
    if (error) {
      tableMissing = isMissingPresetTableError(error);
      continue;
    }
    for (const row of (data as unknown[]) || []) {
      const preset = presetFromRow(row);
      if (preset) presets.push(preset);
    }
  }

  // Before the first seed the table is empty — expose the legacy mapping so
  // the admin UI is immediately usable.
  const seeded = presets.length > 0;
  return NextResponse.json({
    presets: seeded ? presets : buildLegacyCatalog(),
    seeded,
    table_missing: tableMissing,
    categories: GEN_PRESET_CATEGORIES,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Bulk bootstrap: { seed: true } upserts the entire legacy mapping.
  if (body.seed === true) {
    const result = await seedPresetsFromLegacy(admin.supabase);
    if (result.error) {
      return NextResponse.json(
        { error: result.error, upserted: result.upserted },
        { status: isMissingPresetTableError({ message: result.error }) ? 503 : 500 },
      );
    }
    return NextResponse.json({ success: true, upserted: result.upserted });
  }

  const category = String(body.category || '').toLowerCase();
  const slug = sanitizeSlug(body.slug);
  if (!isGenPresetCategory(category) || !slug) {
    return NextResponse.json({ error: 'category + slug are required' }, { status: 400 });
  }

  const row = {
    category,
    slug,
    label_en: String(body.label_en || '').slice(0, 120),
    label_zh: String(body.label_zh || '').slice(0, 120),
    preview_url: body.preview_url != null ? String(body.preview_url) : null,
    prompt_fragment: String(body.prompt_fragment || ''),
    negative_fragment: String(body.negative_fragment || ''),
    lora_hints: Array.isArray(body.lora_hints) ? body.lora_hints : [],
    nsfw_level: clampLevel(body.nsfw_level),
    tier: body.tier === 'premium' ? 'premium' : 'free',
    model_family: body.model_family != null ? String(body.model_family).slice(0, 32) : null,
    sort_order: Math.round(Number(body.sort_order || 0)),
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin.supabase
    .from('gen_preset_catalog')
    .upsert(row, { onConflict: 'category,slug' })
    .select('*')
    .maybeSingle();
  if (error) {
    const status = isMissingPresetTableError(error) ? 503 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  invalidatePresetCache();
  return NextResponse.json({ success: true, preset: presetFromRow(data) });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const category = String(body.category || '').toLowerCase();
  const slug = sanitizeSlug(body.slug);
  if (!isGenPresetCategory(category) || !slug) {
    return NextResponse.json({ error: 'category + slug are required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label_en !== undefined) patch.label_en = String(body.label_en).slice(0, 120);
  if (body.label_zh !== undefined) patch.label_zh = String(body.label_zh).slice(0, 120);
  if (body.preview_url !== undefined) patch.preview_url = body.preview_url ? String(body.preview_url) : null;
  if (body.prompt_fragment !== undefined) patch.prompt_fragment = String(body.prompt_fragment);
  if (body.negative_fragment !== undefined) patch.negative_fragment = String(body.negative_fragment);
  if (body.lora_hints !== undefined) patch.lora_hints = Array.isArray(body.lora_hints) ? body.lora_hints : [];
  if (body.nsfw_level !== undefined) patch.nsfw_level = clampLevel(body.nsfw_level);
  if (body.tier !== undefined) patch.tier = body.tier === 'premium' ? 'premium' : 'free';
  if (body.model_family !== undefined) {
    patch.model_family = body.model_family != null ? String(body.model_family).slice(0, 32) : null;
  }
  if (body.sort_order !== undefined) patch.sort_order = Math.round(Number(body.sort_order || 0));
  if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

  const { data, error } = await admin.supabase
    .from('gen_preset_catalog')
    .update(patch)
    .eq('category', category)
    .eq('slug', slug)
    .select('*')
    .maybeSingle();
  if (error) {
    const status = isMissingPresetTableError(error) ? 503 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!data) {
    return NextResponse.json({ error: `preset not found: ${category}/${slug}` }, { status: 404 });
  }
  invalidatePresetCache();
  return NextResponse.json({ success: true, preset: presetFromRow(data) });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const category = String(request.nextUrl.searchParams.get('category') || '').toLowerCase();
  const slug = sanitizeSlug(request.nextUrl.searchParams.get('slug'));
  if (!isGenPresetCategory(category) || !slug) {
    return NextResponse.json({ error: 'category + slug are required' }, { status: 400 });
  }

  const { error } = await admin.supabase
    .from('gen_preset_catalog')
    .delete()
    .eq('category', category)
    .eq('slug', slug);
  if (error) {
    const status = isMissingPresetTableError(error) ? 503 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  invalidatePresetCache();
  return NextResponse.json({ success: true });
}
