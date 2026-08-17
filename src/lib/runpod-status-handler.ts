import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, uploadImageAsWebP, uploadImageBase64, resolveImageUrl } from '@/lib/storage';
import { normalizeCharacterAssetRole } from '@/lib/character-asset-production';
import { logger } from '@/lib/logger';
import { checkAchievements, type SupabaseLike } from '@/lib/achievement-checker';
import { CREDIT_COSTS, grantCredits } from '@/lib/credit-system';
import { findGenJobByProviderJobId, refundGenJob, updateGenJob, updateGenJobStage, type GenerationJob } from '@/lib/gen-hub';

/**
 * GET /api/runpod/status?job_id=xxx[&girlfriend_id=yyy&scene=chat_selfie]
 * Poll a RunPod job status and return images if completed.
 *
 * Three modes:
 *  - Chat mode (default): persists image to chat_messages + chat_media.
 *  - Admin mode (admin_source=true): uploads to girlfriends/{id}/{asset_role}/
 *    and inserts a generation_assets record directly — no separate finalize needed.
 *  - Video mode (kind=video): polls a WAN/SVD video endpoint, uploads the
 *    result and persists it to chat_media (used by /api/generate-video's
 *    async continuation).
 */

/** In-memory guard so a failed video job is refunded at most once per instance. */
const refundedVideoJobs = new Set<string>();

/** Extract a video URL from a RunPod video job output (tolerant of worker shapes). */
function extractVideoUrl(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const out = output as Record<string, unknown>;
  const candidates = [out.video, out.video_url, out.output, out.url, out.data_url];
  for (const c of candidates) {
    if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:video/'))) return c;
  }
  if (typeof out.output === 'object' && out.output) {
    const inner = out.output as Record<string, unknown>;
    for (const c of [inner.video, inner.video_url, inner.url]) {
      if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:'))) return c;
    }
  }
  return '';
}

async function handleVideoStatus(
  req: NextRequest,
  params: {
    jobId: string;
    endpointId: string | undefined;
    girlfriendId: string | undefined;
    userId: string;
    client: SupabaseClient | null;
    costRequested: number;
  },
): Promise<NextResponse> {
  // Unified state: completed video jobs are answered from generation_jobs
  // (idempotent reconnect — 断点续查), no provider round-trip needed.
  const genJob: GenerationJob | null = params.client
    ? await findGenJobByProviderJobId(params.client, params.userId, params.jobId)
    : null;
  if (genJob?.status === 'completed' && genJob.result) {
    const stored = genJob.result as Record<string, unknown>;
    return NextResponse.json({ status: 'COMPLETED', video_url: stored.video_url || '', job_id: params.jobId });
  }

  const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
  if (!apiKey || !params.endpointId) {
    return NextResponse.json(
      { error: 'Video status requires endpoint_id and a configured RunPod key', status: 'FAILED' },
      { status: 400 },
    );
  }
  const baseUrl = `https://api.runpod.ai/v2/${params.endpointId}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  const statusRes = await fetch(`${baseUrl}/status/${params.jobId}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!statusRes.ok) {
    return NextResponse.json({ status: 'IN_PROGRESS', pending: true, job_id: params.jobId });
  }
  const status = (await statusRes.json()) as { status: string; output?: unknown; error?: string };

  if (status.status === 'COMPLETED') {
    let videoUrl = extractVideoUrl(status.output);
    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Video generation completed but no video URL returned', status: 'FAILED' },
        { status: 500 },
      );
    }
    if (videoUrl.startsWith('data:video/') && params.client) {
      try {
        const folder = params.girlfriendId ? `chat_videos/${params.girlfriendId}` : 'chat_videos';
        const key = await uploadDataUrl(videoUrl, folder);
        videoUrl = (await resolveImageUrl(key)) || key;
      } catch (e) {
        logger.warn('[runpod/status] video upload failed, using original URL', { err: e instanceof Error ? e.message : String(e) });
      }
    }
    // Persist once to the album when girlfriend context is provided.
    let videoMessageId: string | null = null;
    if (params.girlfriendId && params.client) {
      const { data: existingMedia } = await params.client
        .from('chat_media')
        .select('id')
        .eq('user_id', params.userId)
        .eq('girlfriend_id', params.girlfriendId)
        .contains('metadata', { job_id: params.jobId })
        .limit(1)
        .maybeSingle();
      if (!existingMedia) {
        // Insert chat_messages row first so the video survives page refresh.
        let chatMessageId: string | null = null;
        try {
          const caption = "Here's a little video just for you~ see me move \ud83d\udc95";
          const { data: msgRow, error: msgErr } = await params.client
            .from('chat_messages')
            .insert({
              user_id: params.userId,
              girlfriend_id: params.girlfriendId,
              role: 'assistant',
              content: caption,
              media_url: videoUrl,
              media_type: 'video',
            })
            .select('id')
            .maybeSingle();
          if (!msgErr && msgRow?.id) { chatMessageId = msgRow.id; videoMessageId = msgRow.id; }
        } catch (e) {
          logger.warn('[runpod/status] video chat_messages insert failed', { err: e instanceof Error ? e.message : String(e) });
        }

        const { error: mediaError } = await params.client.from('chat_media').insert({
          user_id: params.userId,
          girlfriend_id: params.girlfriendId,
          message_id: chatMessageId,
          media_type: 'video',
          url: videoUrl,
          metadata: { job_id: params.jobId, source: 'video_status_poll' },
        });
        if (mediaError) logger.warn('[runpod/status] video chat_media insert failed', { err: mediaError.message });
      }
      void checkAchievements(params.client as unknown as SupabaseLike, params.userId);
    }
    if (genJob && params.client) {
      await updateGenJobStage(params.client, genJob.id, 'done', {
        result: { video_url: videoUrl, job_id: params.jobId },
      });
    }
    return NextResponse.json({ status: 'COMPLETED', video_url: videoUrl, job_id: params.jobId, message_id: videoMessageId });
  }

  if (status.status === 'FAILED') {
    // Unified refund: the job row's refunded flag guards at-most-once across
    // instances. Legacy in-memory guard remains for untracked jobs.
    let refunded = false;
    if (genJob && params.client) {
      const outcome = await refundGenJob(params.client, genJob);
      refunded = outcome.refunded;
      await updateGenJob(params.client, genJob.id, {
        status: 'failed',
        error: status.error || 'Video generation failed',
      }).catch(() => undefined);
    } else if (params.client && !refundedVideoJobs.has(params.jobId)) {
      refundedVideoJobs.add(params.jobId);
      const refund = Math.min(Math.max(0, Math.floor(params.costRequested)), CREDIT_COSTS.video_10s);
      if (refund > 0) {
        await grantCredits(params.client, params.userId, refund, 'refund', params.jobId).catch(() => undefined);
        refunded = true;
      }
    }
    return NextResponse.json(
      { error: status.error || 'Video generation failed', status: 'FAILED', refunded },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: status.status || 'IN_QUEUE', pending: true, job_id: params.jobId });
}
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
    const locale = (searchParams.get('locale') || 'en').toLowerCase();

    // Unified state: answer repeat polls for already-finished jobs from the
    // generation_jobs table (idempotent fast path, no provider round-trip).
    const genJob = client
      ? await findGenJobByProviderJobId(client, user.id, jobId)
      : null;
    if (genJob?.status === 'completed' && genJob.result) {
      const stored = genJob.result as Record<string, unknown>;
      return NextResponse.json({ ...stored, job_id: jobId });
    }
    // Mirror poll outcomes back onto the job row (best-effort).
    const mirrorJobCompleted = async (result: Record<string, unknown>) => {
      if (genJob && client) await updateGenJobStage(client, genJob.id, 'done', { result });
    };
    const requestedEndpointId = searchParams.get('endpoint_id') || undefined;
    const endpointId =
      requestedEndpointId && /^[a-zA-Z0-9_-]+$/.test(requestedEndpointId)
        ? requestedEndpointId
        : undefined;

    // Video jobs use a different RunPod endpoint and output shape — handle
    // them before the image-oriented pollJob path.
    if (searchParams.get('kind') === 'video') {
      return await handleVideoStatus(req, {
        jobId,
        endpointId,
        girlfriendId,
        userId: user.id,
        client: (client as SupabaseClient | undefined) ?? null,
        costRequested: Number(searchParams.get('cost')) || 0,
      });
    }

    // Admin studio context — save directly to the correct asset folder
    const adminSource = searchParams.get('admin_source') === 'true';
    const assetRole = normalizeCharacterAssetRole(searchParams.get('asset_role') || undefined);

    const result = await runpodClient.pollJob(jobId, {
      endpoint_id: endpointId,
      poll_budget_ms: 8000, // Quick check — client polls every 3s anyway
      on_timeout: 'pending',
    });

    // Upload images if completed
    if (!result.pending && result.images.length > 0) {
      // ─── Admin mode: upload to girlfriends/{id}/{assetRole}/ + generation_assets ───
      if (adminSource) {
        const folder = girlfriendId
          ? `girlfriends/${girlfriendId}/${assetRole}`
          : 'comfy-outputs';

        // Use service-role client for generation_assets insert
        let adminDb: ReturnType<typeof getSupabaseClient> | null = null;
        try {
          adminDb = getSupabaseClient();
        } catch (e) {
          logger.warn('[runpod/status] admin db unavailable, assets will need finalize', { error: e });
        }

        const assets: Array<Record<string, unknown>> = [];
        for (const base64Data of result.images.slice(0, 4)) {
          if (!base64Data) continue;
          try {
            const raw = /^https?:\/\//i.test(base64Data)
              ? base64Data
              : base64Data.startsWith('data:')
                ? base64Data
                : `data:image/png;base64,${base64Data}`;
            const { key, url } = await uploadImageBase64(raw, folder, 'image/png');

            // Insert into generation_assets directly (no separate finalize needed)
            let savedRow: Record<string, unknown> | null = null;
            if (adminDb) {
              const row = {
                created_by: user.id,
                kind: 'girlfriend',
                girlfriend_id: girlfriendId || null,
                storage_key: key,
                url,
                prompt: null,
                negative_prompt: null,
                workflow_id: null,
                endpoint_id: endpointId || null,
                ckpt_name: null,
                lora_name: null,
                width: null,
                height: null,
                steps: null,
                cfg: null,
                seed: null,
                meta: {
                  job_id: jobId,
                  finalized: true,
                  asset_role: assetRole,
                  reference_role: assetRole.startsWith('identity-') || assetRole === 'avatar-closeup'
                    ? 'identity'
                    : 'identity',
                  source: 'status_poll',
                },
              };
              const { data: saved, error: insErr } = await adminDb
                .from('generation_assets')
                .insert(row)
                .select('*')
                .single();
              if (insErr) {
                logger.warn('[runpod/status] generation_assets insert failed', {
                  err: insErr.message,
                  key,
                });
              } else {
                savedRow = saved;
              }
            }

            assets.push(savedRow || {
              id: null,
              kind: 'girlfriend',
              girlfriend_id: girlfriendId || null,
              storage_key: key,
              url,
              meta: { job_id: jobId, finalized: !adminDb, asset_role: assetRole, source: 'status_poll' },
            });
          } catch (e) {
            logger.error('[runpod/status] admin upload failed', { error: e });
          }
        }
        await mirrorJobCompleted({
          status: 'COMPLETED',
          images: assets.map((a) => String(a.url || '')).filter(Boolean),
          job_id: jobId,
        });
        return NextResponse.json({
          status: 'COMPLETED',
          images: assets.map((a) => String(a.url || '')).filter(Boolean),
          assets,
          job_id: jobId,
        });
      }

      // ─── Chat mode (original behavior) ───
      const urls = await Promise.all(
        result.images.map(async (base64Data) => {
          if (!base64Data) return '';
          if (/^https?:\/\//i.test(base64Data)) return base64Data;
          try {
            const dataUrl = base64Data.startsWith('data:')
              ? base64Data
              : `data:image/png;base64,${base64Data}`;
            const key = await uploadImageAsWebP(dataUrl, girlfriendId ? `chat_photos/${girlfriendId}` : 'generated-images');
            return (await resolveImageUrl(key)) || key;
          } catch (e) {
            logger.error('[runpod/status] upload failed', { error: e });
            return '';
          }
        }),
      );
      const validUrls = urls.filter(Boolean);

      // Persist once to chat + album when girlfriend context is provided.
      if (girlfriendId && client && validUrls.length > 0) {
        try {
          const { data: existingMedia } = await client
            .from('chat_media')
            .select('id')
            .eq('user_id', user.id)
            .eq('girlfriend_id', girlfriendId)
            .contains('metadata', { job_id: jobId })
            .limit(1)
            .maybeSingle();

          if (!existingMedia) {
            const { data: intimacyRow } = await client
              .from('intimacy_scores')
              .select('score, level')
              .eq('user_id', user.id)
              .eq('girlfriend_id', girlfriendId)
              .order('score', { ascending: false })
              .limit(1)
              .maybeSingle();
            const caption = locale.startsWith('zh')
              ? scene === 'chat_selfie'
                ? '\u4e3a\u4f60\u751f\u6210\u4e86\u4e00\u5f20\u7b26\u5408\u6211\u4eec\u5f53\u524d\u804a\u5929\u60c5\u5883\u7684\u65b0\u7acb\u7ed8 \ud83d\udc97'
                : '\u65b0\u7684\u7167\u7247\u6765\u5566 \ud83d\udcf8'
              : scene === 'chat_selfie'
                ? 'I made a fresh picture just for our moment together \ud83d\udc97'
                : 'Here is a new photo for you \ud83d\udcf8';
            const { data: message, error: messageError } = await client
              .from('chat_messages')
              .insert({
                user_id: user.id,
                girlfriend_id: girlfriendId,
                role: 'assistant',
                content: caption,
                media_url: validUrls[0],
                media_type: 'image',
              })
              .select('id')
              .maybeSingle();
            if (messageError) throw messageError;

            const { error: mediaError } = await client.from('chat_media').insert({
              user_id: user.id,
              girlfriend_id: girlfriendId,
              message_id: message?.id || null,
              media_type: 'image',
              url: validUrls[0],
              metadata: {
                job_id: jobId,
                scene,
                source: 'chat_generation',
                asset_role: 'character-art',
                intimacy_score: Number(intimacyRow?.score || 0),
                intimacy_level: Number(intimacyRow?.level || 1),
              },
            });
            if (mediaError) throw mediaError;
          }
        } catch (e) {
          logger.warn('[runpod/status] chat persist failed', { error: e });
        }
        // Re-evaluate achievements (image milestones) — fire and forget
        void checkAchievements(client as unknown as SupabaseLike, user.id);
      }

      await mirrorJobCompleted({ status: 'COMPLETED', images: validUrls, job_id: jobId });
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
    // Best-effort failure mirror (genJob lookups live inside the try block).
    return NextResponse.json({ error: errMsg, status: 'FAILED' }, { status: 500 });
  }
}
