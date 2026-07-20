import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const VIDEO_LIMIT = { maxRequests: 6, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/generate-video
 *
 * Generates a short video from an input image using RunPod SVD (Stable Video Diffusion).
 * Body: { input_image (url or base64), girlfriend_id?, motion_bucket_id?, fps? }
 */
export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`gen-video:${user.id}`, VIDEO_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many video generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, VIDEO_LIMIT) },
    );
  }

  const started = Date.now();
  try {
    const body = await request.json();
    const inputImage = String(body.input_image || body.image_url || '').trim();
    if (!inputImage) {
      return NextResponse.json(
        { error: 'input_image is required (URL or base64)' },
        { status: 400 },
      );
    }

    const girlfriendId = String(body.girlfriend_id || '').trim() || null;
    const motionBucketId = Number(body.motion_bucket_id) || 127;
    const fps = Number(body.fps) || 7;
    const numFrames = Number(body.num_frames) || 25;
    const decodeChunkSize = Number(body.decode_chunk_size) || 8;

    const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
    const videoEndpointId = process.env.RUNPOD_VIDEO_ENDPOINT_ID || process.env.RUNPOD_SVD_ENDPOINT_ID || '';

    if (!apiKey || !videoEndpointId) {
      return NextResponse.json(
        { error: 'Video generation is not configured. Set RUNPOD_VIDEO_ENDPOINT_ID.', code: 'not_configured' },
        { status: 503 },
      );
    }

    const baseUrl = `https://api.runpod.ai/v2/${videoEndpointId}`;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Resolve input image to base64 if URL
    let imagePayload = inputImage;
    if (inputImage.startsWith('http')) {
      try {
        const imgRes = await fetch(inputImage, { signal: AbortSignal.timeout(15000) });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          imagePayload = buf.toString('base64');
        }
      } catch (e) {
        logger.warn('[generate-video] failed to fetch input image', { err: e instanceof Error ? e.message : String(e) });
      }
    } else if (inputImage.startsWith('data:image/')) {
      imagePayload = inputImage.replace(/^data:image\/\w+;base64,/, '');
    }

    // Submit to RunPod SVD
    const submitRes = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {
          input_image: imagePayload,
          motion_bucket_id: motionBucketId,
          fps,
          num_frames: numFrames,
          decode_chunk_size: decodeChunkSize,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      logger.error('[generate-video] submit failed', { status: submitRes.status, body: errText.slice(0, 200) });
      return NextResponse.json({ error: `Video generation submit failed: ${submitRes.status}` }, { status: 502 });
    }

    const { id: jobId } = (await submitRes.json()) as { id: string };
    if (!jobId) {
      return NextResponse.json({ error: 'No job ID returned' }, { status: 502 });
    }

    logger.info('[generate-video] job submitted', { jobId, girlfriendId });

    // Poll for completion (max 150s under Vercel timeout)
    const pollIntervalMs = 3000;
    const maxAttempts = Math.floor(150_000 / pollIntervalMs);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const statusRes = await fetch(`${baseUrl}/status/${jobId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!statusRes.ok) continue;

      const status = (await statusRes.json()) as { status: string; output?: unknown; error?: string };

      if (status.status === 'COMPLETED') {
        const output = status.output as Record<string, unknown> | undefined;
        let videoUrl = '';

        if (output) {
          const candidates = [output.video, output.video_url, output.output, output.url, output.data_url];
          for (const c of candidates) {
            if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:video/'))) {
              videoUrl = c;
              break;
            }
          }
          if (!videoUrl && typeof output.output === 'object' && output.output) {
            const inner = output.output as Record<string, unknown>;
            for (const c of [inner.video, inner.video_url, inner.url]) {
              if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:'))) {
                videoUrl = c;
                break;
              }
            }
          }
        }

        if (!videoUrl) {
          return NextResponse.json({ error: 'Video generation completed but no video URL returned' }, { status: 500 });
        }

        // Upload data URLs to storage
        let finalUrl = videoUrl;
        if (videoUrl.startsWith('data:video/')) {
          try {
            const folder = girlfriendId ? `chat_videos/${girlfriendId}` : 'chat_videos';
            const key = await uploadDataUrl(videoUrl, folder);
            finalUrl = (await resolveImageUrl(key)) || key;
          } catch (e) {
            logger.warn('[generate-video] upload failed, using original URL', { err: e instanceof Error ? e.message : String(e) });
          }
        }

        // Save to chat_media
        if (girlfriendId) {
          await client.from('chat_media').insert({
            user_id: user.id,
            girlfriend_id: girlfriendId,
            media_type: 'video',
            url: finalUrl,
            metadata: { job_id: jobId, motion_bucket_id: motionBucketId, fps, num_frames: numFrames },
          }).then(({ error: insErr }) => {
            if (insErr) logger.warn('[generate-video] chat_media insert failed', { err: insErr.message });
          });
        }

        return NextResponse.json({ video_url: finalUrl, job_id: jobId, latency_ms: Date.now() - started });
      }

      if (status.status === 'FAILED') {
        const failMsg = status.error || 'Video generation failed';
        return NextResponse.json({ error: failMsg, code: 'video_gen_failed' }, { status: 500 });
      }
    }

    // Timeout — return pending
    return NextResponse.json({
      pending: true,
      job_id: jobId,
      status: 'IN_PROGRESS',
      message: 'Video is still generating. Poll /api/runpod/status?job_id=' + jobId,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[generate-video] Error:', { data: errMsg });
    return NextResponse.json({ error: errMsg, code: 'video_gen_failed' }, { status: 500 });
  }
}
