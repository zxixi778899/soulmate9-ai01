/**
 * Admin API: Preset Folders (预览管理 / 文件夹)
 *
 * GET    /api/admin/preset-folders        → list folders + item counts
 * POST   /api/admin/preset-folders        → create folder {name, name_zh, kind, description}
 * PATCH  /api/admin/preset-folders        → rename/update {id, data}
 * DELETE /api/admin/preset-folders?id=    → delete folder (presets kept, folder_id→null)
 *
 * kind='character' folders hold character_presets. scene/pose/closeup/other are
 * reserved for future preset types.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS = ['character', 'scene', 'pose', 'closeup', 'other'] as const;
type FolderKind = (typeof VALID_KINDS)[number];

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  try {
    const { data: folders, error } = await admin.supabase
      .from('preset_folders')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Count character presets per folder (the only item table today).
    const { data: presetRows } = await admin.supabase
      .from('character_presets')
      .select('folder_id');
    const countByFolder = new Map<string, number>();
    for (const row of (presetRows || []) as Array<{ folder_id: string | null }>) {
      if (!row.folder_id) continue;
      countByFolder.set(row.folder_id, (countByFolder.get(row.folder_id) || 0) + 1);
    }

    const result = ((folders || []) as Record<string, unknown>[]).map((f) => ({
      ...f,
      item_count: countByFolder.get(String(f.id)) || 0,
    }));

    return NextResponse.json({ folders: result });
  } catch (error) {
    logger.error('[admin/preset-folders] GET error', { error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const name = String(data.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const kindRaw = String(data.kind || 'character');
  const kind: FolderKind = (VALID_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as FolderKind)
    : 'other';

  try {
    const insert = {
      name,
      name_zh: String(data.name_zh || '').trim() || null,
      kind,
      description: String(data.description || '').trim(),
      sort_order: typeof data.sort_order === 'number' ? data.sort_order : 0,
    };
    const { data: row, error } = await admin.supabase
      .from('preset_folders')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, folder: row });
  } catch (error) {
    logger.error('[admin/preset-folders] POST error', { error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id, data } = body as { id?: string; data?: Record<string, unknown> };
  if (!id || !data) {
    return NextResponse.json({ error: 'id and data required' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim();
  if (data.name_zh !== undefined) patch.name_zh = String(data.name_zh || '').trim() || null;
  if (data.description !== undefined) patch.description = String(data.description || '').trim();
  if (typeof data.sort_order === 'number') patch.sort_order = data.sort_order;
  if (data.kind !== undefined) {
    const kindRaw = String(data.kind);
    patch.kind = (VALID_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'other';
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const { data: row, error } = await admin.supabase
      .from('preset_folders')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, folder: row });
  } catch (error) {
    logger.error('[admin/preset-folders] PATCH error', { id, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  try {
    const { error } = await admin.supabase.from('preset_folders').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    logger.error('[admin/preset-folders] DELETE error', { id, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
