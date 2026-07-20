import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

/**
 * GET /api/runpod/status?job_id=xxx[&girlfriend_id=yyy&scene=chat_selfie]
 * Poll a RunPod job status and return images if completed.
 * When girlfriend_id is provided, persists the image to chat_messages + chat_media on completion.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, client } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('job_id');
    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
    }
    const girlfriendId = searchParams.get('girlfriend_id') || undefined;
    const scene = searchParams.get('scene') || 'chat_selfie';

    const result = await runpodClient.pollJob(jobId, {
      poll_budget_ms: 8000, // Quick check — client polls every 3s anyway
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
            const key = await uploadDataUrl(dataUrl, girlfriendId ? `chat_photos/${girlfriendId}` : 'generated-images');
            return (await resolveImageUrl(key)) || key;
          } catch (e) {
            logger.error('[runpod/status] upload failed', { error: e });
            return '';
          }
        }),
      );
      const validUrls = urls.filter(Boolean);

      // Persist to chat_messages + chat_media when girlfriend context is provided
      if (girlfriendId && client && validUrls.length > 0) {
        const caption = scene === 'chat_selfie'
          ? '拍好啦～这是专门为你拍的新照片 💕'
          : '新的照片来啦 📸';
        try {
          await client.from('chat_messages').insert({
            user_id: user.id,
            girlfriend_id: girlfriendId,
            role: 'assistant',
            content: caption,
            media_url: validUrls[0],
            media_type: 'image',
          });
          await client.from('chat_media').insert({
            user_id: user.id,
            girlfriend_id: girlfriendId,
            media_type: 'image',
            url: validUrls[0],
            metadata: { job_id: jobId, scene },
          });
        } catch (e) {
          logger.warn('[runpod/status] chat persist failed', { error: e });
        }
      }

      return NextResponse.json({
        status: 'COMPLETED',
        images: validUrls,
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
