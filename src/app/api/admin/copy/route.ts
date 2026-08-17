import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { invalidateHomepage } from '@/lib/revalidate';
import {
  loadSiteCopy,
  setSiteCopyValue,
  invalidateSiteCopyCache,
  isCopyKey,
  COPY_KEYS,
  COPY_META,
} from '@/lib/copy-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/admin/copy — current overrides + key metadata (admin probe target)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const copy = await loadSiteCopy(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ copy, keys: COPY_KEYS, meta: COPY_META });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/copy
 * Body: { key, value } — value '' (or omitted) restores the i18n default.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const key = String(body?.key || '');
    if (!isCopyKey(key)) {
      return NextResponse.json({ error: 'Unknown copy key' }, { status: 400 });
    }
    const value = typeof body?.value === 'string' ? body.value : '';

    const copy = await setSiteCopyValue(
      key,
      value,
      admin.supabase as unknown as SiteSettingsClient,
    );
    invalidateSiteCopyCache();
    invalidateHomepage();
    logger.info('[admin/copy] saved', { key, custom: value.trim() ? true : false });
    return NextResponse.json({ success: true, copy });
  } catch (e) {
    logger.error('[admin/copy] save failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Save failed' },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/copy?key=xxx — remove one override (back to i18n default)
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const key = String(searchParams.get('key') || '');
  if (!isCopyKey(key)) {
    return NextResponse.json({ error: 'Unknown copy key' }, { status: 400 });
  }

  try {
    const copy = await setSiteCopyValue(
      key,
      '',
      admin.supabase as unknown as SiteSettingsClient,
    );
    invalidateSiteCopyCache();
    invalidateHomepage();
    logger.info('[admin/copy] override removed', { key });
    return NextResponse.json({ success: true, copy });
  } catch (e) {
    logger.error('[admin/copy] delete failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
