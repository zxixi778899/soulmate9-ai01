import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import {
  loadGenderPreviews,
  saveGenderPreviews,
  invalidateGenderPreviewsCache,
  GENDER_PREVIEW_KEYS,
  type GenderPreviewKey,
} from '@/lib/gender-previews-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function isGenderKey(v: unknown): v is GenderPreviewKey {
  return GENDER_PREVIEW_KEYS.includes(v as GenderPreviewKey);
}

// GET /api/admin/gender-previews — current config (defaults merged)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const config = await loadGenderPreviews(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ previews: config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/gender-previews
 * Swap one gender's sample image.
 *  - multipart: { gender: female|male|transgender, file: <image> }
 *  - JSON:      { gender, url } — point at an existing public image URL
 * Persists into site_settings so the create page picks it up without deploy.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const contentType = request.headers.get('content-type') || '';
    let gender = '';
    let url = '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      gender = String(body?.gender || '').toLowerCase();
      url = String(body?.url || body?.image_url || '').trim();
      if (!isGenderKey(gender)) {
        return NextResponse.json(
          { error: `gender must be one of ${GENDER_PREVIEW_KEYS.join(', ')}` },
          { status: 400 },
        );
      }
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      gender = String(formData.get('gender') || '').toLowerCase();
      const file = formData.get('file') as File | null;

      if (!isGenderKey(gender)) {
        return NextResponse.json(
          { error: `gender must be one of ${GENDER_PREVIEW_KEYS.join(', ')}` },
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
      const result = await uploadFile(buffer, `${gender}-sample.${ext}`, file.type, 'gender-previews');
      url = result.url;
    }

    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await saveGenderPreviews({ [gender]: url }, client);
    invalidateGenderPreviewsCache();

    logger.info('[admin/gender-previews] updated', { gender, url: url.slice(0, 120) });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/gender-previews] update failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/gender-previews?gender=female
 * Clear one gender's sample image (card falls back to the symbol placeholder).
 */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const gender = String(searchParams.get('gender') || '').toLowerCase();
  if (!isGenderKey(gender)) {
    return NextResponse.json(
      { error: `gender must be one of ${GENDER_PREVIEW_KEYS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await saveGenderPreviews({ [gender]: '' }, client);
    invalidateGenderPreviewsCache();
    logger.info('[admin/gender-previews] cleared', { gender });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/gender-previews] clear failed', {
      gender,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
