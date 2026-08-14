import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { isGpuCapacityError } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { CREDIT_COSTS, deductCredits, grantCredits } from '@/lib/credit-system';
import { checkAchievements, type SupabaseLike } from '@/lib/achievement-checker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const VIDEO_LIMIT = { maxRequests: 6, windowMs: 60 * 60 * 1000 };

type VideoModel = 'svd' | 'wan22';

export function resolveVideoModelRoute(requested: unknown): { model: VideoModel; endpointId: string } {
  const configuredDefault: VideoModel = process.env.VIDEO_DEFAULT_MODEL === 'svd' ? 'svd' : 'wan22';
  const model: VideoModel = requested === 'wan22' || requested === 'wan-2.2'
    ? 'wan22'
    : requested === 'svd' ? 'svd' : configuredDefault;
  const endpointId = model === 'wan22'
    ? process.env.RUNPOD_WAN_VIDEO_ENDPOINT?.trim() || ''
    : (process.env.RUNPOD_VIDEO_ENDPOINT_ID || process.env.RUNPOD_SVD_ENDPOINT_ID || '').trim();
  return { model, endpointId };
}

export function buildVideoWorkerInput(input: {
  model: VideoModel;
  imagePayload: string;
  prompt?: string;
  negativePrompt?: string;
  duration: 3 | 5 | 10;
  fps?: number;
  numFrames?: number;
  motionBucketId?: number;
  decodeChunkSize?: number;
}): Record<string, unknown> {
  if (input.model === 'wan22') {
    const duration = input.duration === 10 ? 10 : 5;
    const fps = Math.min(24, Math.max(8, input.fps || 16));
    const numFrames = input.numFrames || (duration === 10 ? 161 : 81);
    return {
      model: 'wan22',
      prompt: input.prompt || 'subtle natural movement, stable identity, smooth motion, static camera',
      negative_prompt: input.negativePrompt || 'blurry, flicker, distorted face, identity drift, extra limbs, watermark, text',
      image: input.imagePayload,
      image_base64: input.imagePayload,
      width: 832,
      height: 480,
      num_frames: Math.min(161, Math.max(16, numFrames)),
      fps,
      num_inference_steps: 30,
      guidance_scale: 5,
    };
  }
  return {
    input_image: input.imagePayload,
    motion_bucket_id: input.motionBucketId || 127,
    fps: input.fps || 7,
    num_frames: input.numFrames || (input.duration === 10 ? 40 : input.duration === 3 ? 14 : 25),
    decode_chunk_size: input.decodeChunkSize || 8,
  };
}

/**
 * POST /api/generate-video
 *
 * Generates a short image-to-video clip. WAN 2.2 is the production route;
 * SVD remains an explicit legacy fallback during migration.
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
    const requestedDuration = Number(body.duration) === 10 ? 10 : Number(body.duration) === 3 ? 3 : 5;
    const fps = Number(body.fps) || 7;
    const numFrames = Number(body.num_frames) || (requestedDuration === 3 ? 14 : requestedDuration === 10 ? 40 : 25);
    const decodeChunkSize = Number(body.decode_chunk_size) || 8;
    const videoRoute = resolveVideoModelRoute(body.model || body.video_model);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const negativePrompt = typeof body.negative_prompt === 'string' ? body.negative_prompt.trim() : '';

    // Verify the endpoint is configured BEFORE charging — users must never
    // lose credits to a 503 not_configured response.
    const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
    const videoEndpointId = videoRoute.endpointId;
    if (!apiKey || !videoEndpointId) {
      return NextResponse.json(
        { error: `Video generation model ${videoRoute.model} is not configured.`, code: 'not_configured' },
        { status: 503 },
      );
    }

    // Site-wide credit rule: videos cost credits (5s default / 10s premium).
    const durationSec = requestedDuration;
    const videoCost = durationSec === 10 ? CREDIT_COSTS.video_10s : durationSec === 3 ? CREDIT_COSTS.video_3s : CREDIT_COSTS.video_5s;
    const deducted = await deductCredits(client, user.id, videoCost, 'video_gen', girlfriendId || undefined);
    if (!deducted.ok) {
      const { data: balProfile } = await client
        .from('profiles')
        .select('credits_remaining')
        .eq('user_id', user.id)
        .single();
      return NextResponse.json(
        {
          error: `Insufficient credits. Need ${videoCost}, have ${balProfile?.credits_remaining ?? 0}.`,
          code: 'insufficient_credits',
          required: videoCost,
          balance: balProfile?.credits_remaining ?? 0,
        },
        { status: 403 },
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

    const workerInput = buildVideoWorkerInput({
      model: videoRoute.model,
      imagePayload,
      prompt,
      negativePrompt,
      duration: requestedDuration,
      fps,
      numFrames: Number(body.num_frames) || undefined,
      motionBucketId,
      decodeChunkSize,
    });

    // Submit to RunPod. GPU-capacity failures (429 / 5xx / OOM / no worker)
    // are retried once after a short delay before surfacing a friendly error.
    let submitRes: Response | null = null;
    let submitErrText = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      submitRes = await fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: workerInput,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (submitRes.ok) break;
      submitErrText = await submitRes.text().catch(() => '');
      logger.error('[generate-video] submit failed', {
        status: submitRes.status,
        body: submitErrText.slice(0, 200),
        attempt,
      });
      if (attempt === 0 && (isGpuCapacityError(submitErrText) || submitRes.status >= 500 || submitRes.status === 429)) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const gpuBusy = isGpuCapacityError(submitErrText) || submitRes.status === 429;
      return NextResponse.json(
        {
          error: gpuBusy
            ? 'GPU is busy right now. Please try again in a minute.'
            : `Video generation submit failed: ${submitRes.status}`,
          code: gpuBusy ? 'gpu_busy' : undefined,
        },
        { status: 502 },
      );
    }

    if (!submitRes || !submitRes.ok) {
      return NextResponse.json({ error: 'Video generation submit failed' }, { status: 502 });
    }

    let jobId = String(((await submitRes.json()) as { id?: string }).id || '');
    if (!jobId) {
      return NextResponse.json({ error: 'No job ID returned' }, { status: 502 });
    }

    logger.info('[generate-video] job submitted', { jobId, girlfriendId, model: videoRoute.model });

    // Poll for completion. The budget is caller-tunable: chat clients pass a
    // short budget and continue via /api/ai/status?kind=video, while the admin
    // studio passes 150000 to keep its synchronous pipeline behavior.
    const pollIntervalMs = 3000;
    const requestedPollMs = Number(body.sync_poll_ms);
    const syncPollMs = Number.isFinite(requestedPollMs)
      ? Math.min(150_000, Math.max(10_000, requestedPollMs))
      : 25_000;
    const maxAttempts = Math.floor(syncPollMs / pollIntervalMs);
    let videoRetried = false;

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
          await grantCredits(client, user.id, videoCost, 'refund', jobId).catch(() => {});
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
          // Re-evaluate achievements (video milestones) — fire and forget
          void checkAchievements(client as unknown as SupabaseLike, user.id);
        }

        return NextResponse.json({ video_url: finalUrl, job_id: jobId, latency_ms: Date.now() - started });
      }

      if (status.status === 'FAILED') {
        const failMsg = status.error || 'Video generation failed';
        // 稳定性：任务失败自动重提一次（换新 job），降低“抽卡”式失败
        if (!videoRetried) {
          videoRetried = true;
          logger.warn('[generate-video] job failed, resubmitting once', {
            jobId,
            failMsg: failMsg.slice(0, 160),
          });
          let resubmitOk = false;
          for (let attempt = 0; attempt < 2; attempt++) {
            const sres = await fetch(`${baseUrl}/run`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ input: workerInput }),
              signal: AbortSignal.timeout(15000),
            });
            if (sres.ok) {
              const sj = (await sres.json().catch(() => ({}))) as { id?: string };
              if (sj.id) {
                jobId = sj.id;
                resubmitOk = true;
                break;
              }
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          if (resubmitOk) {
            logger.info('[generate-video] resubmitted', { jobId });
            attempt = -1;
            continue;
          }
        }
        const gpuBusy = isGpuCapacityError(failMsg);
        // Auto-refund the video cost on failure.
        await grantCredits(client, user.id, videoCost, 'refund', jobId).catch(() => {});
        return NextResponse.json(
          {
            error: gpuBusy
              ? 'GPU is busy right now. Please try again in a minute.'
              : failMsg,
            code: gpuBusy ? 'gpu_busy' : 'video_gen_failed',
          },
          { status: 500 },
        );
      }
    }

    // Timeout — return pending with full context so the client can continue
    // polling /api/ai/status?kind=video (video-aware status route).
    return NextResponse.json({
      pending: true,
      job_id: jobId,
      endpoint_id: videoEndpointId,
      kind: 'video',
      girlfriend_id: girlfriendId || undefined,
      cost: videoCost,
      status: 'IN_PROGRESS',
      message: 'Video is still generating. Poll /api/ai/status?job_id=' + jobId + '&kind=video&endpoint_id=' + videoEndpointId,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[generate-video] Error:', { data: errMsg });
    return NextResponse.json({ error: errMsg, code: 'video_gen_failed' }, { status: 500 });
  }
}
