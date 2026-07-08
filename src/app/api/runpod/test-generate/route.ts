import { NextRequest, NextResponse } from 'next/server';
import { runpodClient } from '@/lib/runpod';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin, denyInProduction } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

/**
 * GET /api/runpod/test-generate
 *
 * Debug-only route: generates a single test portrait for the first
 * girlfriend missing an avatar. Superadmin-gated and disabled in
 * production unless ENABLE_DEBUG_ROUTES=true (see denyInProduction()).
 *
 * NOTE: previously wrote debug output to a hardcoded filesystem path
 * (/app/work/logs/bypass//dev.log) that does not exist in Vercel/Railway
 * containers, causing every call to throw before doing anything useful.
 * Replaced with the structured logger, which is safe everywhere.
 */
export async function GET(req: NextRequest) {
  const deny = denyInProduction();
  if (deny) return deny;

  const adminCheck = await requireAdmin(req, 'superadmin');
  if (adminCheck.error) return adminCheck.error;

  try {
    logger.debug('[runpod/test-generate] starting');

    const db = getSupabaseClient();

    // Same query as batch route
    const { data: girlfriends, error: gfErr } = await db
      .from('girlfriends')
      .select('id, name, avatar_url, slug')
      .is('avatar_url', null);

    if (gfErr) {
      logger.error('[runpod/test-generate] DB error', { data: { message: gfErr.message } });
      return NextResponse.json({ error: gfErr.message }, { status: 500 });
    }

    logger.debug('[runpod/test-generate] found items needing images', { data: { count: girlfriends?.length || 0 } });

    if (!girlfriends || girlfriends.length === 0) {
      return NextResponse.json({ message: 'No items found (all have images)' });
    }

    // Generate for just the first item
    const gf = girlfriends[0];
    logger.debug('[runpod/test-generate] generating', { data: { name: gf.name, id: gf.id } });

    const params = {
      prompt: `Professional portrait of ${gf.name}, beautiful woman, cinematic lighting, high quality, realistic, 8k, detailed face`,
      negative_prompt: 'nsfw, nude, explicit, deformed, blurry, low quality, watermark, text, signature, bad anatomy, ugly, extra limbs',
      num_images: 1,
      width: 768,
      height: 1024,
    };

    const result = await runpodClient.generate(params);

    logger.debug('[runpod/test-generate] generate returned', { data: { images: result.images?.length || 0 } });

    return NextResponse.json({
      success: true,
      item: gf.name,
      resultImages: result.images?.length || 0,
      jobId: result.job_id,
      execTime: result.execution_time,
      imageLength: result.images?.[0]?.length || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[runpod/test-generate] error', { data: { message } });
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}
