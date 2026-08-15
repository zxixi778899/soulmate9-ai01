import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import {
  loadStylePreviews,
  saveStylePreviews,
  invalidateStylePreviewsCache,
  STYLE_PREVIEW_KEYS,
  type StylePreviewKey,
} from '@/lib/style-previews-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function isStyleKey(v: unknown): v is StylePreviewKey {
  return STYLE_PREVIEW_KEYS.includes(v as StylePreviewKey);
}

// GET /api/admin/style-previews — current config (defaults merged)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    // Use admin.supabase but cast to avoid SiteSettingsClient type depth
    const config = await loadStylePreviews(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ previews: config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/style-previews
 * Swap one style's sample image.
 *  - multipart: { style: realistic|anime|3d, file: <image> }
 *  - JSON:      { style, url } — point at an existing public image URL
 * Persists into site_settings so the create page picks it up without deploy.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const contentType = request.headers.get('content-type') || '';
    let style = '';
    let url = '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      style = String(body?.style || '');
      url = String(body?.url || body?.image_url || '').trim();
      if (!isStyleKey(style)) {
        return NextResponse.json(
          { error: `style must be one of ${STYLE_PREVIEW_KEYS.join(', ')}` },
          { status: 400 },
        );
      }
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      style = String(formData.get('style') || '');
      const file = formData.get('file') as File | null;

      if (!isStyleKey(style)) {
        return NextResponse.json(
          { error: `style must be one of ${STYLE_PREVIEW_KEYS.join(', ')}` },
          { status: 400 },
        );
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
      const result = await uploadFile(buffer, `${style}-sample.${ext}`, file.type, 'style-previews');
      url = result.url;
    }

    // Use admin.supabase but cast to avoid SiteSettingsClient type depth
    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await saveStylePreviews({ [style]: url }, client);
    invalidateStylePreviewsCache();

    logger.info('[admin/style-previews] updated', { style, url: url.slice(0, 120) });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/style-previews] update failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
