import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { getAuthUser } from '@/lib/supabase-server';
import { getCompanionContext } from '@/lib/companion-assets';
import {
  createVideoSignedUpload,
  isAllowedVideoContentType,
  VIDEO_CONTENT_TYPES,
} from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/companion/[id]/assets/upload-url
 * 为伴侣资源库签发视频直传地址（浏览器 → Supabase，Vercel 不过数据）。
 * 仅伴侣创建者或管理员可用。Body: { fileName, contentType }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    let client = null as Awaited<ReturnType<typeof getAuthUser>>['client'] | null;
    let userId: string | null = null;
    let isAdmin = false;

    const adminCheck = await requireAdmin(req);
    if (!adminCheck.error) {
      isAdmin = true;
      userId = adminCheck.user.id;
      client = adminCheck.supabase;
    } else {
      const auth = await getAuthUser(req);
      if (auth.user && auth.client) {
        userId = auth.user.id;
        client = auth.client;
      }
    }
    if (!client || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ctx = await getCompanionContext(client, userId, id, isAdmin);
    if (!ctx) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    if (!ctx.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const contentType = String(body.contentType || body.type || 'video/mp4');
    if (!isAllowedVideoContentType(contentType)) {
      return NextResponse.json(
        { error: `Unsupported type ${contentType}`, allowed: VIDEO_CONTENT_TYPES },
        { status: 400 },
      );
    }
    const fileName = String(body.fileName || body.name || 'clip.mp4');

    const signed = await createVideoSignedUpload({
      fileName,
      contentType,
      folder: `companions/${id}`,
    });

    return NextResponse.json({
      success: true,
      ...signed,
      method: 'PUT',
      maxBytes: 50 * 1024 * 1024,
    });
  } catch (e) {
    logger.error('[companion/assets/upload-url] failed', {
      id,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
