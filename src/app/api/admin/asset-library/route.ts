import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile, deleteFile, extractKeyFromUrl } from '@/lib/storage';
import {
  loadAssetLibrary,
  addAssetItem,
  removeAssetItem,
  invalidateAssetLibraryCache,
} from '@/lib/asset-library-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/admin/asset-library — list all library images (newest first)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const config = await loadAssetLibrary(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ items: config.items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/asset-library — multipart { file, name? }
 * Uploads to storage (site-assets folder) and registers the item.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = String(formData.get('name') || '').trim().slice(0, 120);

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

    const id = randomUUID();
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, `${id}.${ext}`, file.type, 'site-assets');

    const config = await addAssetItem(
      { id, url: result.url, name: name || file.name },
      admin.supabase as unknown as SiteSettingsClient,
    );
    invalidateAssetLibraryCache();
    logger.info('[admin/asset-library] asset added', { id, name: name || file.name });
    return NextResponse.json({ success: true, items: config.items });
  } catch (e) {
    logger.error('[admin/asset-library] upload failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/asset-library?id=xxx — remove record + storage object
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get('id') || '');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const { config, removed } = await removeAssetItem(
      id,
      admin.supabase as unknown as SiteSettingsClient,
    );
    invalidateAssetLibraryCache();
    if (removed) {
      const key = extractKeyFromUrl(removed.url);
      if (key) await deleteFile(key);
    }
    logger.info('[admin/asset-library] asset removed', { id, found: !!removed });
    return NextResponse.json({ success: true, items: config.items });
  } catch (e) {
    logger.error('[admin/asset-library] delete failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
