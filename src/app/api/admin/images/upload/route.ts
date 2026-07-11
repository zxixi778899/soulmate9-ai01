import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  uploadFile,
  uploadImageBase64,
  resolveImageUrl,
  toPublicUrl,
} from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UPLOAD_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 }; // 60/h/admin

type EntityType = 'girlfriend' | 'outfit' | 'shop_item';

function resolveTablePayload(
  type: string,
  field: string | null | undefined,
  url: string,
): { table: string; payload: Record<string, string> } | { error: string } {
  switch (type as EntityType) {
    case 'girlfriend':
      return {
        table: 'girlfriends',
        payload: { portrait_url: url, avatar_url: url },
      };
    case 'outfit':
      return {
        table: 'outfits',
        payload: { [field || 'preview_url']: url },
      };
    case 'shop_item':
      return {
        table: 'shop_items',
        payload: { [field || 'image_url']: url },
      };
    default:
      return { error: `Invalid type: ${type}` };
  }
}

/**
 * Apply image to entity:
 * 1) multipart file upload
 * 2) JSON { imageUrl } — use Comfy 操作台 / 已生成图 URL（可 copy 或直链）
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-upload:${guard.user!.id}`, UPLOAD_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many upload requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, UPLOAD_LIMIT) },
    );
  }

  const client = guard.supabase;

  try {
    const contentType = req.headers.get('content-type') || '';

    // ── JSON: apply existing URL (Comfy 操作台图库 / 生成结果) ───────────
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const type = body.type as string | null;
      const id = body.id as string | null;
      const field = (body.field as string | null) || null;
      let imageUrl = (body.imageUrl || body.url || body.image_url || '') as string;
      const rehost = body.rehost !== false; // default: copy into admin/ folder

      if (!type || !id || !imageUrl) {
        return NextResponse.json(
          { error: 'Missing required fields: type, id, imageUrl' },
          { status: 400 },
        );
      }

      // Resolve storage key → public URL
      imageUrl = (await resolveImageUrl(imageUrl)) || toPublicUrl(imageUrl) || imageUrl;
      if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
        return NextResponse.json(
          { error: `Invalid image URL/key: ${String(imageUrl).slice(0, 80)}` },
          { status: 400 },
        );
      }

      let finalUrl = imageUrl;
      let key: string | undefined;

      // Re-host into admin/{type}s so entity keeps a stable copy
      if (rehost) {
        try {
          if (imageUrl.startsWith('data:')) {
            const up = await uploadImageBase64(imageUrl, `admin/${type}s`, 'image/png');
            finalUrl = up.url;
            key = up.key;
          } else {
            const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) throw new Error(`fetch source failed: ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            const ct = res.headers.get('content-type') || 'image/png';
            const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
            const up = await uploadFile(
              buf,
              `from_console_${Date.now()}.${ext}`,
              ct.startsWith('image/') ? ct : 'image/png',
              `admin/${type}s`,
            );
            finalUrl = up.url;
            key = up.key;
          }
        } catch (e) {
          logger.warn('[admin/upload] rehost failed, using original URL', {
            err: e instanceof Error ? e.message : String(e),
          });
          // fall through with original imageUrl
          finalUrl = imageUrl;
        }
      }

      const resolved = resolveTablePayload(type, field, finalUrl);
      if ('error' in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }

      const { error: dbError } = await client
        .from(resolved.table)
        .update(resolved.payload)
        .eq('id', id);

      if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        key: key || null,
        url: finalUrl,
        source: 'console_or_url',
        rehosted: !!key,
      });
    }

    // ── multipart: local file ────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string | null;
    const id = formData.get('id') as string | null;
    const field = formData.get('field') as string | null;

    if (!file || !type || !id) {
      return NextResponse.json(
        { error: 'Missing required fields: file, type, id (or send JSON imageUrl)' },
        { status: 400 },
      );
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const folder = `admin/${type}s`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name, file.type, folder);

    const resolved = resolveTablePayload(type, field, result.url);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const { error: dbError } = await client
      .from(resolved.table)
      .update(resolved.payload)
      .eq('id', id);

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      key: result.key,
      url: result.url,
      source: 'file',
    });
  } catch (error) {
    logger.error('Admin upload error', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}