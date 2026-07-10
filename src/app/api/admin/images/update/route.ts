import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UPDATE_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 }; // 120/h/admin

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-img-update:${guard.user!.id}`, UPDATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many update requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, UPDATE_LIMIT) },
    );
  }

  const client = guard.supabase;
  const body = await req.json();
  const { type, id, imageUrl, field } = body as {
    type: 'girlfriend' | 'outfit' | 'shop_item';
    id: string;
    imageUrl: string;
    field: string;
  };

  if (!type || !id || !imageUrl) {
    return NextResponse.json({ error: 'Missing required fields: type, id, imageUrl' }, { status: 400 });
  }

  let table: string;
  switch (type) {
    case 'girlfriend':
      table = 'girlfriends';
      break;
    case 'outfit':
      table = 'outfits';
      break;
    case 'shop_item':
      table = 'shop_items';
      break;
    default:
      return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
  }

  // Girlfriend: keep portrait + avatar in sync for list/chat thumbnails
  const payload: Record<string, unknown> =
    type === 'girlfriend'
      ? {
          portrait_url: imageUrl,
          avatar_url: imageUrl,
          ...(body.title ? { name: body.title } : {}),
          ...(Array.isArray(body.tags) ? { tags: body.tags } : {}),
          ...(typeof body.description === 'string' ? { short_description: body.description } : {}),
        }
      : { [field || (type === 'outfit' ? 'preview_url' : 'image_url')]: imageUrl };

  const { error } = await client.from(table).update(payload).eq('id', id);

  if (error) {
    logger.error('admin/images/update: db error', { table, id, error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: imageUrl });
}