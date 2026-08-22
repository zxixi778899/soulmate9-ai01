import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { isGpuCapacityError } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { CREDIT_COSTS, deductCredits, grantCredits } from '@/lib/credit-system';
import { checkAchievements, type SupabaseLike } from '@/lib/achievement-checker';
import { createGenJob, updateGenJob, updateGenJobStage } from '@/lib/gen-hub';
import { computeCacheKey, lookupCache, writeCache } from '@/lib/generation-cache';
import { resolveVideoModelRoute, buildVideoWorkerInput, type VideoModel } from '@/lib/video-routing';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const VIDEO_LIMIT = { maxRequests: 6, windowMs: 60 * 60 * 1000 };
// Daily GPU ceiling: protects cost when users buy extra credits to burn
// videos. Cache hits do NOT consume this budget (no GPU used). Default 10/day,
// tunable via VIDEO_DAILY_LIMIT env var.
const VIDEO_DAILY_LIMIT = {
  maxRequests: Number(process.env.VIDEO_DAILY_LIMIT) || 10,
  windowMs: 24 * 60 * 60 * 1000,
};

/**
 * Fingerprint the source image so identical (image + motion params) reuse a
 * cached video instead of re-running the GPU. Hashing is O(n) but source
 * portraits are typically 100–500 KB — negligible vs. a 30–60s GPU job.
 */
function fingerprintImagePayload(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Compute a video cache key from the source image fingerprint + motion params.
 * Reuses the generation_cache infrastructure (kind='video', 7-day TTL).
 */
function computeVideoCacheKey(input: {
  imagePayload: string;
  model: VideoModel;
  duration: number;
  fps: number;
  numFrames: number;
  motionBucketId?: number;
  decodeChunkSize?: number;
  prompt?: string;
  negativePrompt?: string;
}): string {
  const imageFp = fingerprintImagePayload(input.imagePayload);
  // Fold all motion-affecting params into the "prompt" slot so the existing
  // SHA256 canonicalization keys on the full determinism surface.
  const compositePrompt = [
    imageFp,
    `d=${input.duration}`,
    `fps=${input.fps}`,
    `nf=${input.numFrames}`,
    `mbi=${input.motionBucketId ?? ''}`,
    `dcs=${input.decodeChunkSize ?? ''}`,
    input.prompt || '',
  ].join('|');
  const dims = input.model === 'wan22' ? { w: 832, h: 480 } : { w: 576, h: 1024 };
  return computeCacheKey({
    prompt: compositePrompt,
    negativePrompt: input.negativePrompt,
    width: dims.w,
    height: dims.h,
    steps: 30,
    guidance: 5,
    model: input.model,
    kind: 'video',
  });
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

  // Membership redesign: video is a Premium/Unlimited surface. Responses carry
  // structured codes so the frontend renders an upgrade guide, not a failure.
  const { data: tierProfile } = await client
    .from('profiles')
    .select('membership_tier')
    .eq('user_id', user.id)
    .maybeSingle();
  const tier = String((tierProfile as { membership_tier?: string | null } | null)?.membership_tier || 'free');
  if (tier !== 'premium' && tier !== 'unlimited' && tier !== 'admin') {
    return NextResponse.json(
      {
        error: 'Video generation is available on Premium and Unlimited plans.',
        code: tier === 'free' ? 'membership_required' : 'video_requires_premium',
        upgrade_url: '/pricing',
      },
      { status: 403 },
    );
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

    // Resolve input image to base64 BEFORE cache check / credit charge so we
    // can fingerprint the actual pixel content (URL content may drift over time).
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

    // Generation cache: identical (image + motion params) reuses a 7-day-TTL
    // cached video and skips the GPU entirely. Cache hits are FREE (no credit
    // charge, no daily GPU budget consumed) — there is zero marginal cost.
    const videoCacheKey = computeVideoCacheKey({
      imagePayload,
      model: videoRoute.model,
      duration: requestedDuration,
      fps,
      numFrames,
      motionBucketId,
      decodeChunkSize,
      prompt,
      negativePrompt,
    });
    const cachedOssKey = await lookupCache(videoCacheKey, 'video');
    if (cachedOssKey) {
      const cachedUrl = await resolveImageUrl(cachedOssKey).catch(() => null);
      if (cachedUrl) {
        logger.info('[generate-video] cache hit — skipping GPU', { cacheKey: videoCacheKey });
        return NextResponse.json({
          video_url: cachedUrl,
          job_id: null,
          cached: true,
          latency_ms: Date.now() - started,
        });
      }
    }

    // Daily GPU ceiling (cost protection): caps real GPU burns per day even
    // when a user buys extra credits. Checked AFTER cache so free hits don't
    // consume the budget.
    const dailyRl = await checkRateLimitAsync(`gen-video-daily:${user.id}`, VIDEO_DAILY_LIMIT);
    if (!dailyRl.allowed) {
      return NextResponse.json(
        { error: 'Daily video generation limit reached. Try again tomorrow.', code: 'daily_limit' },
        { status: 429, headers: rateLimitHeaders(dailyRl, VIDEO_DAILY_LIMIT) },
      );
    }

    // Verify the endpoint is configured BEFORE charging — users must never
    // lose credits to a 503 not_configured response.
    const apiKey = process.env.RUNPOD_WAN_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
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
      // Credits were already deducted — refund before surfacing the failure.
      await grantCredits(client, user.id, videoCost, 'refund', `submit-fail:${Date.now()}`).catch(() => {});
      return NextResponse.json(
        {
          error: gpuBusy
            ? 'GPU is busy right now. Please try again in a minute.'
            : `Video generation submit failed: ${submitRes.status}`,
          code: gpuBusy ? 'gpu_busy' : undefined,
          refunded: true,
        },
        { status: 502 },
      );
    }

    if (!submitRes || !submitRes.ok) {
      await grantCredits(client, user.id, videoCost, 'refund', `submit-fail:${Date.now()}`).catch(() => {});
      return NextResponse.json({ error: 'Video generation submit failed', refunded: true }, { status: 502 });
    }

    let jobId = String(((await submitRes.json()) as { id?: string }).id || '');
    if (!jobId) {
      await grantCredits(client, user.id, videoCost, 'refund', `submit-fail:${Date.now()}`).catch(() => {});
      return NextResponse.json({ error: 'No job ID returned', refunded: true }, { status: 502 });
    }

    logger.info('[generate-video] job submitted', { jobId, girlfriendId, model: videoRoute.model });

    // Phase 3: track the video as a resumable generation_jobs row.
    const genJob = await createGenJob(client, {
      user_id: user.id,
      kind: 'video',
      girlfriend_id: girlfriendId,
      provider: 'runpod',
      provider_job_id: jobId,
      cost_tokens: videoCost,
      status: 'running',
      stage: 'generating',
      params: { model: videoRoute.model, duration: durationSec, fps, num_frames: numFrames },
    });

    // Queued mode: return immediately, the client polls by job id (断点续查).
    if (body.queue === true || body.queue === 'true') {
      return NextResponse.json({
        status: 'queued',
        job_id: genJob?.id || null,
        provider_job_id: jobId,
        endpoint_id: videoEndpointId,
        kind: 'video',
        girlfriend_id: girlfriendId || undefined,
        cost_tokens: videoCost,
        message:
          'Video queued. Poll /api/ai/status?job_id=' + jobId + '&kind=video&endpoint_id=' + videoEndpointId + '&cost=' + videoCost,
      });
    }

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
          if (genJob) {
            await updateGenJob(client, genJob.id, {
              status: 'failed',
              error: 'No video URL returned',
              refunded: true,
            });
          }
          return NextResponse.json({ error: 'Video generation completed but no video URL returned' }, { status: 500 });
        }

        // Persist the video to object storage so the URL is stable + cacheable.
        // data: URLs are uploaded directly; http URLs (RunPod-hosted) are
        // fetched and re-uploaded so they survive RunPod link expiry and can
        // warm the 7-day video cache for identical future requests.
        let finalUrl = videoUrl;
        let persistedOssKey: string | null = null;
        try {
          const folder = girlfriendId ? `chat_videos/${girlfriendId}` : 'chat_videos';
          if (videoUrl.startsWith('data:video/')) {
            persistedOssKey = await uploadDataUrl(videoUrl, folder);
          } else if (videoUrl.startsWith('http')) {
            const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(30000) });
            if (vidRes.ok) {
              const vidBuf = Buffer.from(await vidRes.arrayBuffer());
              const dataUrl = `data:video/mp4;base64,${vidBuf.toString('base64')}`;
              persistedOssKey = await uploadDataUrl(dataUrl, folder);
            }
          }
          if (persistedOssKey) {
            finalUrl = (await resolveImageUrl(persistedOssKey)) || persistedOssKey;
          }
        } catch (e) {
          logger.warn('[generate-video] upload failed, using original URL', { err: e instanceof Error ? e.message : String(e) });
        }

        // Warm the video cache with the persisted OSS key (best-effort, never
        // blocks the response).
        if (persistedOssKey && videoCacheKey) {
          await writeCache(videoCacheKey, 'video', persistedOssKey).catch(() => {});
        }

        // Persist video to chat_messages + chat_media so it survives page refresh.
        let chatMessageId: string | null = null;
        if (girlfriendId) {
          try {
            const caption = "Here's a little video just for you~ see me move \ud83d\udc95";
            const { data: msgRow, error: msgErr } = await client
              .from('chat_messages')
              .insert({
                user_id: user.id,
                girlfriend_id: girlfriendId,
                role: 'assistant',
                content: caption,
                media_url: finalUrl,
                media_type: 'video',
              })
              .select('id')
              .maybeSingle();
            if (msgErr) {
              logger.warn('[generate-video] chat_messages insert failed', { err: msgErr.message });
            } else {
              chatMessageId = msgRow?.id || null;
            }

            await client.from('chat_media').insert({
              user_id: user.id,
              girlfriend_id: girlfriendId,
              message_id: chatMessageId,
              media_type: 'video',
              url: finalUrl,
              metadata: { job_id: jobId, motion_bucket_id: motionBucketId, fps, num_frames: numFrames },
            });
          } catch (persistErr) {
            logger.warn('[generate-video] chat persist failed', { err: String(persistErr) });
          }
          // Re-evaluate achievements (video milestones) — fire and forget
          void checkAchievements(client as unknown as SupabaseLike, user.id);
        }

        if (genJob) {
          await updateGenJobStage(client, genJob.id, 'done', {
            result: { video_url: finalUrl, job_id: jobId, latency_ms: Date.now() - started },
            provider_job_id: jobId,
          });
        }
        return NextResponse.json({ video_url: finalUrl, job_id: jobId, latency_ms: Date.now() - started, message_id: chatMessageId });
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
            if (genJob) await updateGenJob(client, genJob.id, { provider_job_id: jobId });
            attempt = -1;
            continue;
          }
        }
        const gpuBusy = isGpuCapacityError(failMsg);
        // Auto-refund the video cost on failure.
        await grantCredits(client, user.id, videoCost, 'refund', jobId).catch(() => {});
        if (genJob) {
          await updateGenJob(client, genJob.id, {
            status: 'failed',
            error: failMsg,
            refunded: true,
          });
        }
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
