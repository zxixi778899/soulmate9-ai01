import { NextRequest, NextResponse } from 'next/server';
import {
  uploadImageBase64,
  resolveImageUrl,
  toPublicUrl,
  decodeImagePayload,
  isValidImageBuffer,
} from '@/lib/storage';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { runpodClient, RunPodPendingError } from '@/lib/runpod';
import {
  assemblePrompt,
  assembleGirlfriendFromRow,
  sanitizeBlurKeywords,
} from '@/lib/prompt';

export const runtime = 'nodejs';
// Vercel Hobby max is 300s; Pro can raise via plan. Queue + gen must fit in this window.
export const maxDuration = 300;

// FLUX GPU rate limit for admin
const FLUX_GEN_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

/** Cap caption length for FLUX stability */
function polishFluxCaption(desc: string): string {
  let text = desc.trim();
  if (text.length > 900) {
    text = text.substring(0, 900);
    const lastComma = text.lastIndexOf(',');
    if (lastComma > 700) text = text.substring(0, lastComma);
  }
  return text;
}

/**
 * FLUX-safe negative: empty preferred for portraits;
 * short product bans OK for outfit/shop_item.
 */
function fluxNegative(type: string, userNeg: string, assembledNeg: string): string {
  if (type === 'girlfriend') {
    // Prefer empty; allow short user override only
    const n = (userNeg || '').trim();
    if (n && n.length < 160) return n;
    return '';
  }
  const n = (userNeg || assembledNeg || '').trim();
  if (n.length > 200) return n.slice(0, 200);
  return n;
}

/** Upload RunPod image payload → public HTTPS URL only (no data: URLs — they blow up JSON ~4MB) */
async function uploadToStorage(
  rawPayload: string,
  folder: string,
): Promise<{ url: string; key: string; bytes: number }> {
  // Worker may already return a hosted URL
  if (/^https?:\/\//i.test(rawPayload)) {
    return { url: rawPayload, key: '', bytes: 0 };
  }

  // Validate before upload — reject prompt text / garbage early
  const buffer = decodeImagePayload(rawPayload);
  if (!isValidImageBuffer(buffer)) {
    throw new Error('decoded image failed magic-byte check');
  }

  const { key, url } = await uploadImageBase64(rawPayload, folder, 'image/png');
  const resolved = (await resolveImageUrl(url || key)) || toPublicUrl(key) || url;
  if (!resolved || !resolved.startsWith('http')) {
    throw new Error(`upload produced non-http URL: ${String(resolved).slice(0, 80)}`);
  }

  logger.info('generate-from-meta: uploaded image', {
    folder,
    key,
    bytes: buffer.length,
    url: resolved.slice(0, 160),
  });
  return { url: resolved, key, bytes: buffer.length };
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  if (!runpodClient.isConfigured) {
    return NextResponse.json(
      { error: 'RunPod is not configured (RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID)' },
      { status: 503 },
    );
  }

  const rl = await checkRateLimitAsync(`flux-gen:${guard.user!.id}`, FLUX_GEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, FLUX_GEN_LIMIT) },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = (body.type as string) || 'girlfriend';
  const negativePrompt = (body.negativePrompt as string) || '';
  const girlfriendId = body.girlfriendId as string | undefined;
  const metadata = body.metadata as Record<string, string> | undefined;
  const resumeJobId =
    (typeof body.job_id === 'string' && body.job_id) ||
    (typeof body.jobId === 'string' && body.jobId) ||
    '';
  const folderEarly = ((type || 'girlfriend') + 's') as string;


  // Character consistency (img2img)
  const referenceImage =
    (body.referenceImage as string) ||
    (body.input_image as string) ||
    (body.inputImage as string) ||
    '';
  const denoiseRaw =
    body.denoise != null
      ? Number(body.denoise)
      : body.denoising_strength != null
        ? Number(body.denoising_strength)
        : 0.55;
  const denoise = Math.min(0.85, Math.max(0.3, denoiseRaw || 0.55));

  // FLUX-safe scene defaults
  let sceneDefaults = {
    steps: 18,
    cfg: 1.0,
    width: 768,
    height: 1152,
    count: 1,
    defaultNegative: '',
  };
  try {
    const { loadAiModules, resolveImageCall } = await import('@/lib/ai-modules');
    const modules = await loadAiModules(guard.supabase);
    const sceneKey =
      type === 'outfit'
        ? 'outfit_prop'
        : type === 'shop_item'
          ? 'shop_item'
          : 'girlfriend_portrait';
    const img = resolveImageCall(modules, { scene: sceneKey as any, tier: 'admin' });
    sceneDefaults = {
      steps: img.config.steps,
      // Clamp module cfg to FLUX-safe range
      cfg: Math.min(Math.max(img.config.cfg || 1.0, 1.0), 3.5),
      width: img.config.width,
      height: img.config.height,
      count: img.config.count,
      defaultNegative: type === 'girlfriend' ? '' : img.defaultNegative || '',
    };
  } catch {
    /* keep hardcoded defaults */
  }

  // Single worker endpoint: 1 image per request avoids queue flood (was 2–4 parallel jobs)
  const count = Math.min(1, Math.max(1, Number(body.count) || 1));

  const cfgIn =
    (body.cfg as number) || (body.cfg_scale as number) || sceneDefaults.cfg;
  const params = {
    steps: (body.steps as number) || sceneDefaults.steps,
    // FLUX: 1.0–3.5 (high CFG darkens / blacks out)
    cfg: Math.min(Math.max(cfgIn || 1.0, 1.0), 3.5),
    seed: (body.seed as number) || 0,
    width: (body.width as number) || sceneDefaults.width,
    height: (body.height as number) || sceneDefaults.height,
    sampler: (body.sampler as string) || (body.sampler_name as string) || 'euler',
    scheduler: (body.scheduler as string) || 'simple',
  };

  let rawPrompt = '';
  let assembledNegative = '';
  let girlfriendRow: Record<string, unknown> | null = null;

  if (girlfriendId && type === 'girlfriend') {
    try {
      logger.info('generate-from-meta: fetching girlfriend data', { girlfriendId });
      const { data, error } = await guard.supabase
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriendId)
        .single();

      if (error) {
        logger.error('generate-from-meta: database query error', { girlfriendId, error });
      } else if (data) {
        girlfriendRow = data as Record<string, unknown>;
      } else {
        logger.warn('generate-from-meta: girlfriend not found', { girlfriendId });
      }
    } catch (err) {
      logger.error('generate-from-meta: failed to fetch girlfriend', { girlfriendId, err });
    }
  }

  const customOrMeta =
    (body.customPrompt as string) ||
    (metadata?.appearance as string) ||
    (body.concept as string) ||
    '';

  if (type === 'girlfriend') {
    if (girlfriendRow) {
      const assembled = assembleGirlfriendFromRow(girlfriendRow, customOrMeta);
      rawPrompt = assembled.positive;
      assembledNegative = assembled.negative;
    } else {
      const assembled = assemblePrompt('girlfriend', {
        rawPrompt: sanitizeBlurKeywords(customOrMeta),
        extraNegative: negativePrompt || undefined,
      });
      rawPrompt = assembled.positive;
      assembledNegative = assembled.negative;
    }
    logger.info('generate-from-meta: girlfriend DSL applied', {
      girlfriendId,
      promptLen: rawPrompt.length,
    });
  } else if (type === 'outfit') {
    const assembled = assemblePrompt('outfit', {
      rawPrompt: sanitizeBlurKeywords(customOrMeta),
      extraNegative: negativePrompt || undefined,
    });
    rawPrompt = assembled.positive;
    assembledNegative = assembled.negative;
  } else if (type === 'shop_item') {
    const assembled = assemblePrompt('shop_item', {
      rawPrompt: sanitizeBlurKeywords(customOrMeta),
      extraNegative: negativePrompt || undefined,
    });
    rawPrompt = assembled.positive;
    assembledNegative = assembled.negative;
  } else {
    rawPrompt = sanitizeBlurKeywords(customOrMeta);
  }

  rawPrompt = polishFluxCaption(sanitizeBlurKeywords(rawPrompt));
  const finalNegativePrompt = fluxNegative(
    type,
    negativePrompt || sceneDefaults.defaultNegative || '',
    assembledNegative,
  );

  logger.info('generate-from-meta: prompt assembled', {
    type,
    rawPromptLen: rawPrompt.length,
    negLen: finalNegativePrompt.length,
    hasRef: !!referenceImage,
    denoise: referenceImage ? denoise : 1,
    cfg: params.cfg,
  });

  if (!rawPrompt) {
    return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
  }

  try {
    // Fast resume path: only poll existing job (no re-submit, no re-prompt)
    if (resumeJobId) {
      logger.info('generate-from-meta: resuming job', { jobId: resumeJobId, type });
      try {
        const result = await runpodClient.generate({
          prompt: rawPrompt || 'resume',
          job_id: resumeJobId,
          on_timeout: 'pending',
          throw_on_pending: false,
          poll_budget_ms: 240_000,
        });
        if (result.pending || !result.images?.length) {
          return NextResponse.json({
            success: false,
            pending: true,
            job_id: result.job_id || resumeJobId,
            endpoint_id: result.endpoint_id,
            status: result.status || 'IN_QUEUE',
            waited_ms: result.waited_ms || 0,
            message:
              `仍在排队/生成中（job ${result.job_id || resumeJobId}，状态 ${result.status || 'IN_QUEUE'}）。` +
              '请勿重新点生成；页面会自动继续等待。',
          });
        }
        const b64 = result.images[0];
        if (typeof b64 !== 'string') throw new Error('Invalid image payload on resume');
        const uploaded = await uploadToStorage(b64, folderEarly);
        return NextResponse.json({
          success: true,
          images: [
            {
              url: uploaded.url,
              key: uploaded.key,
              previewUrl: uploaded.url,
              alt: '生成图 1',
            },
          ],
          job_id: result.job_id || resumeJobId,
          meta: metadata,
          optimizedPrompt: rawPrompt,
          usedConsistency: !!referenceImage,
          denoise: referenceImage ? denoise : 1,
          params: {
            steps: params.steps,
            cfg: params.cfg,
            width: params.width,
            height: params.height,
            sampler: params.sampler,
            scheduler: params.scheduler,
          },
        });
      } catch (err) {
        if (err instanceof RunPodPendingError) {
          return NextResponse.json({
            success: false,
            pending: true,
            job_id: err.job_id,
            endpoint_id: err.endpoint_id,
            status: err.status,
            waited_ms: err.waited_ms,
            message: err.message,
          });
        }
        throw err;
      }
    }

    logger.info('generate-from-meta: starting generation (sequential, 1 job)', {
      count,
      type,
      consistency: !!referenceImage,
      steps: params.steps,
      width: params.width,
      height: params.height,
    });

    const folder = (type || 'girlfriend') + 's';
    const baseSeed =
      params.seed > 0 ? params.seed : Math.floor(Math.random() * 1_000_000);

    // Prefer faster admin portrait defaults on long queues (single worker).
    const steps =
      type === 'girlfriend'
        ? Math.min(params.steps || 18, 20)
        : params.steps;
    const width = type === 'girlfriend' ? Math.min(params.width || 768, 768) : params.width;
    const height = type === 'girlfriend' ? Math.min(params.height || 1152, 1152) : params.height;

    const results: Array<{
      url: string;
      key: string;
      previewUrl: string;
      bytes: number;
      alt: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const seed = baseSeed + i;
      let result;
      try {
        result = await runpodClient.generate({
          prompt: rawPrompt,
          negative_prompt: finalNegativePrompt,
          width,
          height,
          num_inference_steps: steps,
          guidance_scale: params.cfg,
          seed,
          sampler_name: params.sampler,
          scheduler: params.scheduler,
          input_image: referenceImage || undefined,
          denoising_strength: referenceImage ? denoise : undefined,
          on_timeout: 'pending',
          throw_on_pending: false,
          poll_budget_ms: 240_000,
        });
      } catch (err) {
        if (err instanceof RunPodPendingError) {
          return NextResponse.json({
            success: false,
            pending: true,
            job_id: err.job_id,
            endpoint_id: err.endpoint_id,
            status: err.status,
            waited_ms: err.waited_ms,
            message: err.message,
            optimizedPrompt: rawPrompt,
          });
        }
        throw err;
      }

      if (result.pending || !result.images?.length) {
        return NextResponse.json({
          success: false,
          pending: true,
          job_id: result.job_id,
          endpoint_id: result.endpoint_id,
          status: result.status || 'IN_QUEUE',
          waited_ms: result.waited_ms || 0,
          message:
            `仍在排队/生成中（job ${result.job_id}，状态 ${result.status || 'IN_QUEUE'}）。` +
            '任务未取消，请勿重复点生成；页面会自动续等。',
          optimizedPrompt: rawPrompt,
        });
      }

      const b64 = result.images?.[0];
      if (!b64) throw new Error(`No image returned for seed ${seed}`);
      if (typeof b64 !== 'string') {
        throw new Error(`Invalid image payload type for seed ${seed}`);
      }
      if (/\s/.test(b64) && /\b(photorealistic|portrait|masterpiece)\b/i.test(b64)) {
        throw new Error(
          'Worker returned text prompt instead of image bytes. Check RunPod Comfy output mapping.',
        );
      }
      const uploaded = await uploadToStorage(b64, folder);
      if (!uploaded.url.startsWith('http')) {
        throw new Error(`Upload did not produce public URL (got ${String(uploaded.url).slice(0, 60)})`);
      }
      results.push({
        url: uploaded.url,
        key: uploaded.key,
        previewUrl: uploaded.url,
        bytes: uploaded.bytes,
        alt: `生成图 ${i + 1}`,
      });
    }
    logger.info('generate-from-meta: completed', {
      results: results.length,
      consistency: !!referenceImage,
      sampleUrl: results[0]?.url?.slice(0, 160),
      bytes: results.map((r) => r.bytes),
    });

    return NextResponse.json({
      success: true,
      images: results.map((r) => ({
        url: r.url,
        key: r.key,
        previewUrl: r.url,
        alt: r.alt,
      })),
      meta: metadata,
      optimizedPrompt: rawPrompt,
      usedConsistency: !!referenceImage,
      denoise: referenceImage ? denoise : 1,
      params: {
        steps,
        cfg: params.cfg,
        width,
        height,
        sampler: params.sampler,
        scheduler: params.scheduler,
      },
    });
  } catch (err) {
    if (err instanceof RunPodPendingError) {
      return NextResponse.json({
        success: false,
        pending: true,
        job_id: err.job_id,
        endpoint_id: err.endpoint_id,
        status: err.status,
        waited_ms: err.waited_ms,
        message: err.message,
      });
    }
    logger.error('generate-from-meta: generation failed', { err });
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Generation failed',
        success: false,
      },
      { status: 500 },
    );
  }
}

