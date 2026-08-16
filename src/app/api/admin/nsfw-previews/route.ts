import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import {
  loadNsfwPreviews,
  saveNsfwPreviews,
  invalidateNsfwPreviewsCache,
  NSFW_PREVIEW_KEYS,
  NSFW_PREVIEW_DEFAULTS,
  type NsfwPreviewKey,
} from '@/lib/nsfw-previews-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function isLevelKey(v: unknown): v is NsfwPreviewKey {
  return NSFW_PREVIEW_KEYS.includes(v as NsfwPreviewKey);
}

// GET /api/admin/nsfw-previews — current config (defaults merged)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const config = await loadNsfwPreviews(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ previews: config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/nsfw-previews
 * Swap one content-level's sample image.
 *  - multipart: { level: 1|2|3|4|5, file: <image> }
 *  - JSON:      { level, url } — point at an existing public image URL
 * Persists into site_settings so the create page picks it up without deploy.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const contentType = request.headers.get('content-type') || '';
    let level = '';
    let url = '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      level = String(body?.level || '');
      url = String(body?.url || body?.image_url || '').trim();
      if (!isLevelKey(level)) {
        return NextResponse.json(
          { error: `level must be one of ${NSFW_PREVIEW_KEYS.join(', ')}` },
          { status: 400 },
        );
      }
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      level = String(formData.get('level') || '');
      const file = formData.get('file') as File | null;

      if (!isLevelKey(level)) {
        return NextResponse.json(
          { error: `level must be one of ${NSFW_PREVIEW_KEYS.join(', ')}` },
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
      const result = await uploadFile(buffer, `level-${level}-sample.${ext}`, file.type, 'nsfw-previews');
      url = result.url;
    }

    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await saveNsfwPreviews({ [level]: url }, client);
    invalidateNsfwPreviewsCache();

    logger.info('[admin/nsfw-previews] updated', { level, url: url.slice(0, 120) });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/nsfw-previews] update failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/nsfw-previews?level=3
 * Reset one content-level's sample image back to the built-in default artwork.
 */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const level = String(searchParams.get('level') || '');
  if (!isLevelKey(level)) {
    return NextResponse.json(
      { error: `level must be one of ${NSFW_PREVIEW_KEYS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await saveNsfwPreviews({ [level]: NSFW_PREVIEW_DEFAULTS[level] }, client);
    invalidateNsfwPreviewsCache();
    logger.info('[admin/nsfw-previews] reset to default', { level });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/nsfw-previews] reset failed', {
      level,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Reset failed' },
      { status: 500 },
    );
  }
}
