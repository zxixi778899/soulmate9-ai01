import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/assets/folders — 获取所有文件夹（预留接口）
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  // TODO: 实现文件夹 CRUD
  // 暂时返回空数组
  return NextResponse.json({ folders: [] });
}

/**
 * POST /api/admin/assets/folders — 创建新文件夹（预留接口）
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const { name, category, description } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: 'name and category are required' },
        { status: 400 }
      );
    }

    // TODO: 实现文件夹创建逻辑
    logger.info('[admin/assets/folders] create', { name, category });

    return NextResponse.json({
      success: true,
      folder: { id: `folder_${Date.now()}`, name, category, description, assetCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });
  } catch (e) {
    logger.error('[admin/assets/folders] create failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Create failed' },
      { status: 500 }
    );
  }
}
