import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { resolveImageUrl, toPublicUrl, looksLikePromptText } from '@/lib/storage';

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
  const { type, id, field } = body as {
    type: 'girlfriend' | 'outfit' | 'shop_item';
    id: string;
    imageUrl: string;
    field: string;
  };
  let imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

  if (!type || !id || !imageUrl) {
    return NextResponse.json({ error: 'Missing required fields: type, id, imageUrl' }, { status: 400 });
  }

  // Reject prompt text mistakenly saved as image URL (UI used to show the prompt as "the image")
  if (looksLikePromptText(imageUrl)) {
    return NextResponse.json(
      { error: 'imageUrl looks like a text prompt, not an image URL' },
      { status: 400 },
    );
  }

  // Normalize bare storage keys → public HTTPS (DB should store browser-loadable URLs)
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:image/')) {
    const resolved = (await resolveImageUrl(imageUrl)) || toPublicUrl(imageUrl);
    if (!resolved || !resolved.startsWith('http')) {
      return NextResponse.json(
        { error: 'imageUrl must be http(s), data:image, or a valid storage key path' },
        { status: 400 },
      );
    }
    imageUrl = resolved;
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

  // Never overwrite girlfriend name with a full image prompt (was corrupting DB names)
  const rawTitle = typeof body.title === 'string' ? body.title.trim() : '';
  const safeName =
    rawTitle &&
    rawTitle.length > 0 &&
    rawTitle.length <= 60 &&
    (rawTitle.match(/,/g) || []).length < 3 &&
    !/\b(raw photo|masterpiece|photorealistic|best quality|8k|sharp focus|three-quarter|natural skin)\b/i.test(
      rawTitle,
    )
      ? rawTitle
      : null;

  if (rawTitle && !safeName) {
    logger.warn('admin/images/update: ignored prompt-like title for name', {
      id,
      titleLen: rawTitle.length,
      titleHead: rawTitle.slice(0, 60),
    });
  }

  // Girlfriend: keep portrait + avatar in sync for list/chat thumbnails
  const payload: Record<string, unknown> =
    type === 'girlfriend'
      ? {
          portrait_url: imageUrl,
          avatar_url: imageUrl,
          ...(safeName ? { name: safeName } : {}),
          ...(Array.isArray(body.tags) ? { tags: body.tags } : {}),
          ...(typeof body.description === 'string' && body.description.length < 500
            ? { short_description: body.description }
            : {}),
        }
      : { [field || (type === 'outfit' ? 'preview_url' : 'image_url')]: imageUrl };

  const { error } = await client.from(table).update(payload).eq('id', id);

  if (error) {
    logger.error('admin/images/update: db error', { table, id, error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: imageUrl });
}