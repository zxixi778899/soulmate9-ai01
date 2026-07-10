import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { tryOnOutfit } from '@/lib/outfit-tryon';
import { OUTFIT_CATALOG } from '@/lib/outfit-catalog';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const LIMIT = { maxRequests: 20, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/wardrobe/try-on
 * Simple workflow: 女友图 + 服装 = 换装图
 *
 * Body:
 * {
 *   girlfriend_id: string
 *   outfit_id?: string          // catalog slug
 *   outfit_image_url?: string   // optional clothing reference URL
 *   outfit_text?: string        // free text clothes description
 *   strength?: number           // 0.35–0.75 denoise
 * }
 */
export async function POST(req: NextRequest) {
  const { user, client, error } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`try-on:${user.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '换装次数过多，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }
  if (!body.outfit_id && !body.outfit_image_url && !body.outfit_text) {
    return NextResponse.json(
      { error: '需要 outfit_id 或 outfit_image_url 或 outfit_text' },
      { status: 400 },
    );
  }

  const result = await tryOnOutfit({
    client,
    userId: user.id,
    girlfriendId: String(body.girlfriend_id),
    outfitId: body.outfit_id ? String(body.outfit_id) : undefined,
    outfitImageUrl: body.outfit_image_url ? String(body.outfit_image_url) : undefined,
    outfitText: body.outfit_text ? String(body.outfit_text) : undefined,
    strength: body.strength != null ? Number(body.strength) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    formula: 'girlfriend_image + outfit → new_portrait',
    portrait_url: result.portrait_url,
    outfit: result.outfit,
    girlfriend: result.girlfriend,
    warning: result.error || null,
  });
}

/** GET catalog for simple UI */
export async function GET() {
  return NextResponse.json({
    formula: '女友肖像图 + 服装(目录/描述/图) = 换装结果图',
    catalog: OUTFIT_CATALOG,
    howto: {
      step1: '选女友（用她的 portrait 做人脸/身材参考）',
      step2: '选一套服装或贴服装图 URL',
      step3: 'POST /api/wardrobe/try-on',
      step4: '新图写回 girlfriend.portrait_url',
    },
  });
}
