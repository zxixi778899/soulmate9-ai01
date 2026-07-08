import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const IMAGE_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 }; // 10/h/user

/**
 * POST /api/generate-image
 *
 * Generates an image using RunPod FLUX (self-hosted, uncensored).
 * Previously used Coze doubao model (removed — NSFW censorship).
 */
export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`gen-img:${user.id}`, IMAGE_GEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, IMAGE_GEN_LIMIT) },
    );
  }

  try {
    const body = await request.json();
    const { prompt, size = '1024x1024' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const [width, height] = String(size).split('x').map(Number);
    if (!runpodClient.isConfigured) {
      return NextResponse.json(
        { error: 'Image generation is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.' },
        { status: 500 },
      );
    }

    // Generate via RunPod FLUX (returns base64 images)
    const result = await runpodClient.generate({
      prompt,
      width: width || 1024,
      height: height || 1024,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    });

    // Upload each generated image to S3 and resolve public URLs
    const images = await Promise.all(
      result.images.map(async (base64Data) => {
        if (!base64Data) return { url: '', prompt };
        try {
          const dataUrl = `data:image/png;base64,${base64Data}`;
          const key = await uploadDataUrl(dataUrl, 'chat-images');
          const signed = await resolveImageUrl(key);
          return { url: signed, key, prompt };
        } catch (e) {
          logger.error('Upload failed for generated image:', { data: e });
          return { url: '', prompt };
        }
      }),
    );

    return NextResponse.json({ images, job_id: result.job_id });
  } catch (error) {
    logger.error('Image generation error:', { data: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed' },
      { status: 500 },
    );
  }
}