import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { resolveImageUrl } from '@/lib/storage';
import {
  loadCreatorPreviews,
  saveCreatorPreviews,
  invalidateCreatorPreviewsCache,
  PREVIEW_GENDERS,
  PREVIEW_STYLES,
  type PreviewGender,
  type PreviewStyle,
} from '@/lib/creator-previews-store';

export const dynamic = 'force-dynamic';

// GET /api/admin/creator-previews — list all 9 preview slots (resolved URLs)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    // Use admin.supabase but cast to avoid SiteSettingsClient type depth
    const config = await loadCreatorPreviews(admin.supabase as unknown as SiteSettingsClient);

    const previews = await Promise.all(
      config.previews
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(async (p) => ({
          ...p,
          thumbnail_url: p.thumbnail_url ? await resolveImageUrl(p.thumbnail_url) : '',
        })),
    );

    return NextResponse.json({ previews, updated_at: config.updated_at });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

// PUT /api/admin/creator-previews — update one slot { gender, visual_style, thumbnail_url?, is_active? }
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const { gender, visual_style, thumbnail_url, is_active } = body || {};

    if (!PREVIEW_GENDERS.includes(gender as PreviewGender)) {
      return NextResponse.json(
        { error: `gender must be one of ${PREVIEW_GENDERS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!PREVIEW_STYLES.includes(visual_style as PreviewStyle)) {
      return NextResponse.json(
        { error: `visual_style must be one of ${PREVIEW_STYLES.join(', ')}` },
        { status: 400 },
      );
    }
    if (thumbnail_url === undefined && is_active === undefined) {
      return NextResponse.json(
        { error: 'provide thumbnail_url and/or is_active' },
        { status: 400 },
      );
    }

    // Use admin.supabase but cast to avoid SiteSettingsClient type depth
    const config = await loadCreatorPreviews(admin.supabase as unknown as SiteSettingsClient);

    const idx = config.previews.findIndex(
      (p) => p.gender === gender && p.visual_style === visual_style,
    );
    if (idx === -1) {
      return NextResponse.json({ error: 'preview slot not found' }, { status: 404 });
    }

    if (thumbnail_url !== undefined) {
      config.previews[idx].thumbnail_url = String(thumbnail_url || '').trim();
    }
    if (is_active !== undefined) {
      config.previews[idx].is_active = Boolean(is_active);
    }

    await saveCreatorPreviews(config, admin.supabase as unknown as SiteSettingsClient);
    invalidateCreatorPreviewsCache();

    return NextResponse.json({ preview: config.previews[idx] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}
