import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { uploadFile } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX = 10 * 1024 * 1024;

type EntityType = 'girlfriend' | 'outfit' | 'shop_item';

function payloadFor(type: EntityType, field: string | null, url: string): { table: string; payload: Record<string, string> } | null {
  if (type === 'girlfriend') return { table: 'girlfriends', payload: { portrait_url: url, avatar_url: url } };
  if (type === 'outfit') return { table: 'outfits', payload: { [field || 'preview_url']: url } };
  if (type === 'shop_item') return { table: 'shop_items', payload: { [field || 'image_url']: url } };
  return null;
}

/**
 * Multipart batch upload.
 * fields:
 *  - type: girlfriend|outfit|shop_item
 *  - ids: JSON string array matching files order, OR id0,id1...
 *  - field?: optional field name
 *  - files: multiple File under "files" or file0,file1...
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-img-batch-upload:${guard.user!.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many batch upload requests' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  try {
    const form = await req.formData();
    const type = String(form.get('type') || '') as EntityType;
    const field = (form.get('field') as string | null) || null;
    if (!type || !['girlfriend', 'outfit', 'shop_item'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    let ids: string[] = [];
    const rawIds = form.get('ids');
    if (typeof rawIds === 'string' && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) ids = parsed.map(String);
      } catch {
        ids = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (!ids.length) {
      for (const [k, v] of form.entries()) {
        if (k.startsWith('id') && typeof v === 'string') ids.push(v);
      }
    }

    const files: File[] = [];
    for (const f of form.getAll('files')) {
      if (f instanceof File) files.push(f);
    }
    if (!files.length) {
      for (const [k, v] of form.entries()) {
        if ((k === 'file' || k.startsWith('file')) && v instanceof File) files.push(v);
      }
    }

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }
    if (files.length > 30) {
      return NextResponse.json({ error: 'Max 30 files per batch' }, { status: 400 });
    }
    if (ids.length && ids.length !== files.length) {
      return NextResponse.json(
        { error: `ids (${ids.length}) must match files (${files.length}) when ids provided` },
        { status: 400 },
      );
    }

    const client = guard.supabase;
    const results: Array<{ id?: string; url?: string; error?: string; name?: string }> = [];
    let ok = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = ids[i];
      try {
        if (!ALLOWED.includes(file.type)) throw new Error(`Unsupported type: ${file.type}`);
        if (file.size > MAX) throw new Error('File > 10MB');
        const buffer = Buffer.from(await file.arrayBuffer());
        const up = await uploadFile(buffer, file.name, file.type, `admin/${type}s`);
        if (id) {
          const resolved = payloadFor(type, field, up.url);
          if (!resolved) throw new Error('Invalid type');
          const { error } = await client.from(resolved.table).update(resolved.payload).eq('id', id);
          if (error) throw error;
        }
        ok += 1;
        results.push({ id, url: up.url, name: file.name });
      } catch (e) {
        results.push({ id, name: file.name, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({ success: true, uploaded: ok, failed: files.length - ok, results });
  } catch (error) {
    logger.error('admin/images/batch-upload', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch upload failed' },
      { status: 500 },
    );
  }
}
