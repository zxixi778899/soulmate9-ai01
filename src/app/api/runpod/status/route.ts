import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, uploadImageBase64, resolveImageUrl } from '@/lib/storage';
import { normalizeCharacterAssetRole } from '@/lib/character-asset-production';
import { logger } from '@/lib/logger';

/**
 * GET /api/runpod/status?job_id=xxx[&girlfriend_id=yyy&scene=chat_selfie]
 * Poll a RunPod job status and return images if completed.
 *
 * Two modes:
 *  - Chat mode (default): persists image to chat_messages + chat_media.
 *  - Admin mode (admin_source=true): uploads to girlfriends/{id}/{asset_role}/
 *    and inserts a generation_assets record directly — no separate finalize needed.
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
    const requestedEndpointId = searchParams.get('endpoint_id') || undefined;
    const endpointId =
      requestedEndpointId && /^[a-zA-Z0-9_-]+$/.test(requestedEndpointId)
        ? requestedEndpointId
        : undefined;

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
            const key = await uploadDataUrl(dataUrl, girlfriendId ? `chat_photos/${girlfriendId}` : 'generated-images');
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
            const caption = scene === 'chat_selfie'
              ? '\u4e3a\u4f60\u751f\u6210\u4e86\u4e00\u5f20\u7b26\u5408\u6211\u4eec\u5f53\u524d\u804a\u5929\u60c5\u5883\u7684\u65b0\u7acb\u7ed8 \ud83d\udc97'
              : '\u65b0\u7684\u7167\u7247\u6765\u5566 \ud83d\udcf8';
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
