import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { routeImageGeneration } from '@/lib/image-router';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import { checkCompanionAccess } from '@/lib/companion-access';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    girlfriend_id,
    message,
    context_type,
    existing_prompt,
    count,
  } = body as {
    girlfriend_id?: string;
    message?: string;
    context_type?: string;
    existing_prompt?: string;
    count?: number;
  };

  if (!girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id required' }, { status: 400 });
  }

  // Access control
  const access = await checkCompanionAccess(client, user.id, girlfriend_id);
  if (!access.allowed) {
    return NextResponse.json({ error: 'This companion is private' }, { status: 403 });
  }

  const gf = await client.from('girlfriends').select('*').eq('id', girlfriend_id).maybeSingle();
  if (!gf?.data) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Build prompt from existing or create basic one
  let naturalPrompt = existing_prompt?.trim();

  if (!naturalPrompt) {
    // Basic character-based prompt
    const parts = [
      'natural editorial photograph with realistic skin texture',
      `gorgeous young adult ${gf.data.gender || 'Female'} age 22-28 named ${gf.data.name}`,
      `${gf.data.appearance_race || 'mixed'} features, oval face shape`,
      `${gf.data.hair_style || gf.data.hairStyle || 'long flowing'} ${gf.data.hair_color || gf.data.hairColor || 'brown'} hair`,
      `${gf.data.eye_color || gf.data.eyeColor || 'brown'} eyes looking at viewer`,
      `${gf.data.body_type || gf.data.bodyType || 'slim'} adult feminine figure`,
      `wearing flattering ${gf.data.fashion_style || 'casual'} outfit`,
      'clear eyes, complete head in frame, soft lighting, professional photography',
    ].filter(Boolean);

    naturalPrompt = parts.join(', ').slice(0, 900);
  }

  // Determine parameters
  const nsfwLevel = Math.max(1, Math.min(5, Number(body.nsfw_intensity) || 1));
  const renderStyle = normalizeCompanionRenderStyle(gf.data.visual_style || 'realistic');
  const category = normalizeCompanionCategory({ gender: gf.data.gender || 'Female' });

  // Resolve generation parameters
  const route = resolveImageGenerationRoute({
    surface: 'companion',
    category,
    renderStyle,
    nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
  });

  // Generate images
  const countArg = Math.max(1, Math.min(count || 1, 4));
  const results: Array<{ url?: string; jobId?: string; pending?: boolean }> = [];

  for (let idx = 0; idx < countArg; idx++) {
    try {
      const result = await routeImageGeneration({
        prompt: naturalPrompt,
        negative_prompt: route.negativePrompt,
        width: route.width,
        height: route.height,
        num_inference_steps: route.steps,
        guidance_scale: route.cfg,
        seed: Math.floor(Math.random() * 2 ** 31), // Unique seed per image
        ckpt_name: route.checkpoint,
        sampler_name: route.sampler,
        scheduler: route.scheduler,
        clip_skip: route.clipSkip,
        model_family: route.modelFamily,
        force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
        endpoint_id: route.endpointId,
        nsfw: nsfwLevel >= 3,
      });

      if (result.pending) {
        results.push({ jobId: result.job_id, pending: true });
      } else {
        results.push({ url: result.images?.[0] });
      }
    } catch (error) {
      console.error(`Image generation failed for ${idx+1}/${countArg}`, { error });
      results.push({ pending: true }); // Queue will handle it later
    }
  }

  // Upload URLs
  const { uploadDataUrl, resolveImageUrl } = await import('@/lib/storage');
  const uploadedUrls = await Promise.all(
    results.map(async (r, i) => {
      if (r.url) {
        try {
          const dataUrl = r.url.startsWith('data:') 
            ? r.url 
            : `data:image/png;base64,${r.url}`;
          const safeName = (gf.data.name || 'companion').replace(/[^a-zA-Z0-9]/g, '_');
          const key = await uploadDataUrl(dataUrl, `chat-images/${safeName}_${Date.now()}_${i}`);
          return (await resolveImageUrl(key)) || key;
        } catch (err) {
          console.warn('Failed to upload chat image', { error: err });
          return null;
        }
      }
      return null;
    })
  );

  const successUrls = uploadedUrls.filter(Boolean) as string[];
  const pendingJobs = results.filter((r) => r.pending).map((r) => ({
    job_id: r.jobId!,
    endpoint_id: route.endpointId,
  }));

  // Save to database
  await client.from('chat_messages').insert({
    user_id: user.id,
    girlfriend_id,
    role: 'assistant',
    content: message || `[Generated ${successUrls.length} new portraits]`,
    metadata: {
      reply_mode: 'dialogue',
      generated_images: successUrls,
      pending_jobs: pendingJobs,
      prompt_used: naturalPrompt,
      context_type: context_type,
    },
  });

  logger.info('[chat-image-gen] generation complete', {
    userId: user.id,
    girlfriendId: girlfriend_id,
    immediate: successUrls.length,
    queued: pendingJobs.length,
  });

  return NextResponse.json({
    success: true,
    images: successUrls,
    pending_jobs: pendingJobs,
    prompt_generated: naturalPrompt,
    count: results.length,
    ...(pendingJobs.length ? {
      message: 'Images are being generated. Poll /api/ai/status?job_id=<job_id>'
    } : {}),
  });
}
