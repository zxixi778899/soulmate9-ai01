import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import {
  loadPresetPreviews,
  savePresetPreview,
  invalidatePresetPreviewsCache,
  isPresetPreviewCategory,
  PRESET_PREVIEW_CATEGORIES,
} from '@/lib/preset-previews-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_KEY_LEN = 64;

function cleanKey(v: unknown): string {
  return String(v || '').trim().slice(0, MAX_KEY_LEN);
}

// GET /api/admin/preset-previews — current config (all categories)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const config = await loadPresetPreviews(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ previews: config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/preset-previews
 * Set one preset option's sample image.
 *  - multipart: { category: ethnicity|hair_style|body_type|fashion_style, key: <optionValue>, file: <image> }
 *  - JSON:      { category, key, url } — point at an existing public image URL
 * Persists into site_settings so the create page picks it up without deploy.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const contentType = request.headers.get('content-type') || '';
    let category = '';
    let key = '';
    let url = '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      category = String(body?.category || '').toLowerCase();
      key = cleanKey(body?.key);
      url = String(body?.url || body?.image_url || '').trim();
      if (!isPresetPreviewCategory(category)) {
        return NextResponse.json(
          { error: `category must be one of ${PRESET_PREVIEW_CATEGORIES.join(', ')}` },
          { status: 400 },
        );
      }
      if (!key) {
        return NextResponse.json({ error: 'key is required' }, { status: 400 });
      }
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      category = String(formData.get('category') || '').toLowerCase();
      key = cleanKey(formData.get('key'));
      const file = formData.get('file') as File | null;

      if (!isPresetPreviewCategory(category)) {
        return NextResponse.json(
          { error: `category must be one of ${PRESET_PREVIEW_CATEGORIES.join(', ')}` },
          { status: 400 },
        );
      }
      if (!key) {
        return NextResponse.json({ error: 'key is required' }, { status: 400 });
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
      const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadFile(buffer, `${category}-${safeKey}.${ext}`, file.type, 'preset-previews');
      url = result.url;
    }

    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await savePresetPreview(category, key, url, client);
    invalidatePresetPreviewsCache();

    logger.info('[admin/preset-previews] updated', { category, key, url: url.slice(0, 120) });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/preset-previews] update failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/preset-previews?category=ethnicity&key=Asian
 * Clear one option's sample image (card falls back to the emoji placeholder).
 */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const category = String(searchParams.get('category') || '').toLowerCase();
  const key = cleanKey(searchParams.get('key'));

  if (!isPresetPreviewCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of ${PRESET_PREVIEW_CATEGORIES.join(', ')}` },
      { status: 400 },
    );
  }
  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }

  try {
    const client = admin.supabase as unknown as SiteSettingsClient;
    const previews = await savePresetPreview(category, key, '', client);
    invalidatePresetPreviewsCache();
    logger.info('[admin/preset-previews] cleared', { category, key });
    return NextResponse.json({ success: true, previews });
  } catch (e) {
    logger.error('[admin/preset-previews] clear failed', {
      category,
      key,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
