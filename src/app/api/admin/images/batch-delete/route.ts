import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { extractKeyFromUrl, deleteFile } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

type EntityType = 'girlfriend' | 'outfit' | 'shop_item';

type BatchItem = {
  type: EntityType;
  id: string;
  imageUrl?: string | null;
  field?: string | null;
};

function clearPayload(type: EntityType, field?: string | null): Record<string, null> {
  if (type === 'girlfriend') {
    if (field === 'avatar_url') return { avatar_url: null };
    if (field === 'portrait_url') return { portrait_url: null };
    return { avatar_url: null, portrait_url: null };
  }
  if (type === 'outfit') return { preview_url: null };
  return { image_url: null };
}

function tableOf(type: EntityType): string {
  if (type === 'girlfriend') return 'girlfriends';
  if (type === 'outfit') return 'outfits';
  return 'shop_items';
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-img-batch-delete:${guard.user!.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many batch delete requests' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  try {
    const body = await req.json();
    const items = (Array.isArray(body.items) ? body.items : []) as BatchItem[];
    if (!items.length) {
      return NextResponse.json({ error: 'items required' }, { status: 400 });
    }
    if (items.length > 50) {
      return NextResponse.json({ error: 'Max 50 items per batch' }, { status: 400 });
    }

    const client = guard.supabase;
    let ok = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (!item?.type || !item?.id) {
        errors.push('missing type/id');
        continue;
      }
      try {
        if (item.imageUrl) {
          try {
            const key = extractKeyFromUrl(item.imageUrl);
            if (key) await deleteFile(key);
          } catch (e) {
            logger.warn('batch-delete storage', { err: String(e) });
          }
        }
        const { error } = await client
          .from(tableOf(item.type))
          .update(clearPayload(item.type, item.field))
          .eq('id', item.id);
        if (error) throw error;
        ok += 1;
      } catch (e) {
        errors.push(`${item.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ success: true, deleted: ok, failed: errors.length, errors: errors.slice(0, 10) });
  } catch (error) {
    logger.error('admin/images/batch-delete', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch delete failed' },
      { status: 500 },
    );
  }
}
