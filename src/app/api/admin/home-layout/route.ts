import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import { invalidateHomepage, invalidateAds } from '@/lib/revalidate';
import {
  loadHomeLayout,
  saveHomeLayout,
  setHomeSectionImage,
  setGridPromoImage,
  setHotOrder,
  invalidateHomeLayoutCache,
  isHomeSectionId,
  isGridPromoVariant,
  HOME_LAYOUT_DEFAULTS,
  GRID_PROMO_DEFAULTS,
  type HomeSectionConfig,
} from '@/lib/home-layout-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/admin/home-layout — current layout (also doubles as admin probe)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const layout = await loadHomeLayout(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ layout });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/home-layout
 *  - JSON:     { sections: [{ id, visible, image }] } — save order/visibility/images
 *  - JSON:     { hotOrder: [girlfriendId, ...] } — save the admin-pinned hot grid order
 *  - multipart:{ section, file } — upload an image for one section.
 *    adsBanner uploads swap the first banner ad's artwork (admin_ads);
 *    hero / promo store an override image in the layout config.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const client = admin.supabase as unknown as SiteSettingsClient;

  try {
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      const body = await request.json();

      // Admin-pinned hot grid order (drag & drop on the homepage).
      if (Array.isArray(body?.hotOrder)) {
        const ids = (body.hotOrder as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0,
        );
        const layout = await setHotOrder(ids, client);
        invalidateHomeLayoutCache();
        invalidateHomepage();
        logger.info('[admin/home-layout] hot order saved', { count: layout.hotOrder.length });
        return NextResponse.json({ success: true, layout });
      }

      const sections = Array.isArray(body?.sections)
        ? (body.sections as HomeSectionConfig[])
        : null;
      if (!sections?.length) {
        return NextResponse.json({ error: 'sections array is required' }, { status: 400 });
      }
      const layout = await saveHomeLayout(sections, client);
      invalidateHomeLayoutCache();
      invalidateHomepage();
      logger.info('[admin/home-layout] layout saved', { count: layout.sections.length });
      return NextResponse.json({ success: true, layout });
    }

    // ── multipart image upload ──
    const formData = await request.formData();
    const section = String(formData.get('section') || '');
    const file = formData.get('file') as File | null;

    // Grid promo card backgrounds use their own variant keys.
    const gridPromoVariant = section.startsWith('gridPromo')
      ? section.slice('gridPromo'.length).toLowerCase()
      : '';
    const homeSection = isHomeSectionId(section) ? section : null;

    if (!homeSection && !isGridPromoVariant(gridPromoVariant)) {
      return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const buffer = Buffer.from(await file.arrayBuffer());
    const assetName = isGridPromoVariant(gridPromoVariant) ? `grid-promo-${gridPromoVariant}` : section;
    const result = await uploadFile(buffer, `${assetName}.${ext}`, file.type, 'home-layout');
    const url = result.url;

    if (isGridPromoVariant(gridPromoVariant)) {
      await setGridPromoImage(gridPromoVariant, url, client);
      invalidateHomeLayoutCache();
      invalidateHomepage();
    } else if (section === 'adsBanner') {
      // Swap the first banner ad's artwork (admin_ads is the banner source of truth).
      const { data: ads, error: adsErr } = await admin.supabase
        .from('admin_ads')
        .select('id')
        .eq('position', 'banner')
        .order('sort_order', { ascending: true })
        .limit(1);
      if (adsErr) throw adsErr;
      const firstAd = ads?.[0];
      if (firstAd) {
        const { error: upErr } = await admin.supabase
          .from('admin_ads')
          .update({ image_url: url, updated_at: new Date().toISOString() })
          .eq('id', firstAd.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await admin.supabase.from('admin_ads').insert({
          title: 'Homepage banner',
          image_url: url,
          link_url: null,
          position: 'banner',
          active: true,
          sort_order: 0,
        });
        if (insErr) throw insErr;
      }
      invalidateAds();
    } else {
      if (!homeSection) {
        return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
      }
      await setHomeSectionImage(homeSection, url, client);
      invalidateHomeLayoutCache();
      invalidateHomepage();
    }

    logger.info('[admin/home-layout] section image updated', {
      section,
      url: url.slice(0, 120),
    });
    const layout = await loadHomeLayout(client);
    return NextResponse.json({ success: true, layout, image: url });
  } catch (e) {
    logger.error('[admin/home-layout] save failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Save failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/home-layout
 *  - ?reset=1                    restore default order / visibility / images
 *  - ?section=hero|promo         clear one section's image override
 *  - ?section=gridPromoRecharge|gridPromoFirstTopup  clear a promo card bg
 */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const client = admin.supabase as unknown as SiteSettingsClient;

  try {
    if (searchParams.get('reset') === '1') {
      const layout = await saveHomeLayout(HOME_LAYOUT_DEFAULTS, client, GRID_PROMO_DEFAULTS, []);
      invalidateHomeLayoutCache();
      invalidateHomepage();
      logger.info('[admin/home-layout] reset to defaults');
      return NextResponse.json({ success: true, layout });
    }

    const section = String(searchParams.get('section') || '');

    if (section.startsWith('gridPromo')) {
      const variant = section.slice('gridPromo'.length).toLowerCase();
      if (!isGridPromoVariant(variant)) {
        return NextResponse.json(
          { error: 'section must be gridPromoRecharge or gridPromoFirstTopup' },
          { status: 400 },
        );
      }
      const layout = await setGridPromoImage(variant, '', client);
      invalidateHomeLayoutCache();
      invalidateHomepage();
      logger.info('[admin/home-layout] grid promo image cleared', { variant });
      return NextResponse.json({ success: true, layout });
    }

    if (!isHomeSectionId(section) || section === 'adsBanner') {
      return NextResponse.json(
        { error: 'section must be hero or promo' },
        { status: 400 },
      );
    }

    const layout = await setHomeSectionImage(section, '', client);
    invalidateHomeLayoutCache();
    invalidateHomepage();
    logger.info('[admin/home-layout] section image cleared', { section });
    return NextResponse.json({ success: true, layout });
  } catch (e) {
    logger.error('[admin/home-layout] delete failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Reset failed' },
      { status: 500 },
    );
  }
}
