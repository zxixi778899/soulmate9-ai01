import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

/**
 * GET /api/runpod/status?job_id=xxx
 * Poll a RunPod job status and return images if completed.
 * Used for async image generation flow.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');
    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }

    const result = await runpodClient.pollJob(jobId, {
      poll_budget_ms: 30000, // Short poll — 30s max per request
      on_timeout: 'pending',
    });

    // Upload images if completed
    if (!result.pending && result.images.length > 0) {
      const urls = await Promise.all(
        result.images.map(async (base64Data) => {
          if (!base64Data) return '';
          if (/^https?:\/\//i.test(base64Data)) return base64Data;
          try {
            const dataUrl = base64Data.startsWith('data:')
              ? base64Data
              : `data:image/png;base64,${base64Data}`;
            const key = await uploadDataUrl(dataUrl, 'generated-images');
            return (await resolveImageUrl(key)) || key;
          } catch (e) {
            logger.error('[runpod/status] upload failed', { error: e });
            return '';
          }
        }),
      );
      return NextResponse.json({
        status: 'COMPLETED',
        images: urls.filter(Boolean),
        job_id: jobId,
      });
    }

    return NextResponse.json({
      status: result.status || 'IN_QUEUE',
      pending: true,
      job_id: jobId,
      waited_ms: result.waited_ms,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[runpod/status] Error:', { error: errMsg });
    return NextResponse.json({ error: errMsg, status: 'FAILED' }, { status: 500 });
  }
}
