import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl } from '@/lib/storage';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const PORTRAIT_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 }; // 10/h/user  RunPod FLUX 

// ============================================================
//    RunPod + Vercel Blob
// ============================================================

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

function buildWorkflow(prompt: string): Record<string, any> {
  const seed = Math.floor(Math.random() * 2147483647);
  return {
    '1': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 28,
        cfg: 3.5,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
      },
    },
    '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 1] } },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'deformed, bad anatomy, low quality, blurry, watermark, nsfw, nude, cartoon, anime, illustration, 3d render, ugly, disfigured, stiff, unnatural, plastic, dead eyes, blank expression, gloomy, depressing',
        clip: ['2', 1],
      },
    },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1024, batch_size: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };
}

async function generateImage(prompt: string): Promise<string> {
  const workflow = buildWorkflow(prompt);
  const submitRes = await fetch(`${RUNPOD_BASE_URL}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { workflow } }),
  });
  if (!submitRes.ok) throw new Error(`RunPod submit failed: ${await submitRes.text()}`);
  const { id: jobId } = await submitRes.json();
  if (!jobId) throw new Error('No RunPod job ID');

  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') {
      const images = status.output?.images || [];
      if (!images.length) throw new Error('No images in output');
      return images[0].data || images[0];
    }
    if (status.status === 'FAILED') throw new Error(`RunPod error: ${status.error || 'unknown'}`);
  }
  throw new Error('RunPod timeout');
}

async function uploadToStorage(base64Data: string, name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  const dataUrl = `data:image/png;base64,${base64Data}`;
  //  OSS key key image_url 
  const key = await uploadDataUrl(dataUrl, `portraits/${safeName}_${Date.now()}`);
  return key;
}

export async function POST(request: NextRequest) {
  try {
    // Authentication:  getAuthUser  user.id key
    const { user, error: authError } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    // RunPod FLUX 
    const rl = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many portrait generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, PORTRAIT_GEN_LIMIT) },
      );
    }

    const { name, hairStyle, hairColor, eyeColor, bodyType, style, personality } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const prompt = `Stunningly beautiful gorgeous young woman named ${name}, ${hairStyle} hair (${hairColor}), gorgeous ${eyeColor} eyes, ${bodyType} sexy figure, dressed in ${style} style attire that flatters her figure. ${personality ? `Personality: ${personality}` : ''}. Elegant portrait, warm vibrant lighting, ultra photorealistic, shot on Canon EOS R5 85mm f/1.4, magazine cover quality, 8K UHD, detailed beautiful face, warm genuine smile, radiant glowing skin, natural skin texture, captivating alluring presence, looking at viewer, clean background, sharp focus, professional photography.`;

    logger.info('[Generate Portrait] Generating for:', { data: name });
    const base64 = await generateImage(prompt);

    logger.info('[Generate Portrait] Uploading to storage...');
    const signedUrl = await uploadToStorage(base64, name);

    return NextResponse.json({ imageUrl: signedUrl, key: null });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Generate Portrait] Error:', { data: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
