import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { extractKeyFromUrl, deleteFile } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const DELETE_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 }; // 120/h/admin

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-img-delete:${guard.user!.id}`, DELETE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many delete requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, DELETE_LIMIT) },
    );
  }

  const client = guard.supabase;
  const body = await req.json();
  const { type, id, imageUrl, field } = body as {
    type: 'girlfriend' | 'outfit' | 'shop_item';
    id: string;
    imageUrl?: string;
    field?: string;
  };

  if (!type || !id) {
    return NextResponse.json({ error: 'Missing required fields: type, id' }, { status: 400 });
  }

  let table: string;
  let clearFields: Record<string, null>;

  switch (type) {
    case 'girlfriend': {
      table = 'girlfriends';
      // Clear both display fields so list hasImage becomes false
      if (field === 'avatar_url') {
        clearFields = { avatar_url: null };
      } else if (field === 'portrait_url') {
        clearFields = { portrait_url: null };
      } else {
        clearFields = { avatar_url: null, portrait_url: null };
      }
      break;
    }
    case 'outfit':
      table = 'outfits';
      clearFields = { preview_url: null };
      break;
    case 'shop_item':
      table = 'shop_items';
      clearFields = { image_url: null };
      break;
    default:
      return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
  }

  // Best-effort storage delete
  if (imageUrl) {
    try {
      const key = extractKeyFromUrl(imageUrl);
      if (key) await deleteFile(key);
    } catch (e) {
      logger.warn('admin/images/delete: storage delete failed', { err: String(e) });
    }
  }

  const { error } = await client.from(table).update(clearFields).eq('id', id);

  if (error) {
    logger.error('admin/images/delete: db error', { table, id, error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
