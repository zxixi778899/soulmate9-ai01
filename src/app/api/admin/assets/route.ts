import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { deleteFile, extractKeyFromUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/assets - 获取所有资产（从 comfy API）
 */
export async function GET(request: NextRequest) {
  // Redirect to existing comfy assets endpoint for now
  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  searchParams.set('view', 'assets');
  
  const newUrl = `${request.nextUrl.origin}/api/admin/comfy?${searchParams.toString()}`;
  return NextResponse.redirect(newUrl);
}

/**
 * DELETE /api/admin/assets?id=xxx - 删除资产
 */
export async function DELETE(request: NextRequest) {
  // Apply rate limiting for admin write operations
  const rateLimitResult = rateLimitMiddleware('admin:assets', RATE_LIMITS.api);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many admin write requests. Please try again later.' },
      { 
        status: 429,
        headers: rateLimitResult.headers,
      }
    );
  }

  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const assetId = String(searchParams.get('id') || '');
  
  if (!assetId) {
    return NextResponse.json({ error: 'asset id is required' }, { status: 400 });
  }

  try {
    // Delete from generation_assets table
    const supabase = admin.supabase as unknown as any;
    const { error } = await supabase
      .from('generation_assets')
      .delete()
      .eq('id', assetId);

    if (error) {
      logger.warn('[admin/assets] delete db error', { error: error.message });
      // Continue with storage deletion even if DB delete fails
    }

    // Also try to delete by storage_key if available
    const { data: assetData } = await supabase
      .from('generation_assets')
      .select('storage_key')
      .eq('id', assetId)
      .single();

    if (assetData?.storage_key) {
      const key = extractKeyFromUrl(assetData.storage_key);
      if (key) {
        await deleteFile(key);
        logger.info('[admin/assets] deleted storage file', { key });
      }
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (e) {
    logger.error('[admin/assets] delete failed', {
      err: e instanceof Error ? e.message : String(e),
      assetId,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
