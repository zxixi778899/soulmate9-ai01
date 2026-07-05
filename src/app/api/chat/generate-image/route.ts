import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { uploadDataUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 }; // 10/h/user — RunPod FLUX 烧钱

/**
 * Preset options for image generation
 */
const MOOD_TAGS: Record<string, string> = {
  romantic: 'warm dreamy atmosphere, soft golden lighting, loving gaze, gentle warm smile, radiant glowing skin, vibrant warm colors',
  playful: 'cheeky expression, playful smirk, bright energetic lighting, candid moment, bright eyes sparkling with joy, vibrant colors',
  sweet: 'sweet innocent smile, warm cozy glow, soft pastel tones, tender expression, radiant skin, inviting girlfriend-next-door vibe',
  passionate: 'intense smoldering gaze, dramatic warm lighting, sultry expression, confident pose, captivating alluring presence, glowing skin',
  cozy: 'comfortable relaxed vibe, soft warm lighting, natural genuine smile, homely atmosphere, warm inviting glow, radiant skin',
  cheerful: 'bright sunny expression, energetic pose, vibrant colors, laughing joyfully, eyes sparkling with happiness, sun-kissed glowing skin',
};

const POSE_TAGS: Record<string, string> = {
  sitting: 'sitting gracefully, hands resting naturally, relaxed elegant posture, natural expression',
  standing: 'standing confidently, full body shot, natural elegant stance, warm genuine smile',
  lying_down: 'lying down comfortably, relaxed pose, intimate angle, soft bedding visible, dreamy expression',
  walking: 'caught in motion, natural walking pose, candid street style, hair flowing, bright smile',
  dancing: 'mid-dance movement, flowing dress/hair, graceful dynamic pose, joyful expression',
  close_up: 'intimate close-up portrait, face filling frame, detailed features, warm genuine expression, sparkling eyes',
};

const ENV_TAGS: Record<string, string> = {
  bedroom: 'cozy bedroom setting, soft bed sheets, warm lamp light, intimate indoor atmosphere, warm vibrant colors',
  beach: 'sunny beach background, ocean waves, golden sand, natural sunlight, seaside breeze, vibrant summer colors',
  garden: 'lush garden setting, blooming flowers, green foliage, soft dappled sunlight, warm romantic atmosphere',
  city: 'urban cityscape, modern architecture, street lights, city vibe background, vibrant energetic atmosphere',
  cozy_room: 'warm cozy indoor space, comfortable furniture, soft lighting, homey atmosphere, warm inviting glow',
  outdoor: 'natural outdoor setting, open sky, scenic landscape, fresh air ambiance, bright warm sunlight',
};

/**
 * Fallback: generate image using RunPod directly (no Coze SDK)
 */
async function generateWithRunPod(
  prompt: string,
  negativePrompt: string,
  referenceImage?: string,
): Promise<string> {
  const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
  const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
  const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

  const seed = Math.floor(Math.random() * 2147483647);
  const workflow: Record<string, any> = {
    '1': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 28,
        cfg: 3.5,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: referenceImage ? 0.65 : 1,
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
      },
    },
    '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 1] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['2', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1024, batch_size: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };

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

async function uploadToStorage(base64Data: string): Promise<string> {
  const dataUrl = `data:image/png;base64,${base64Data}`;
  // 上传到 OSS，返回 key（数据库存 key，读取侧通过 image_url 转签名 URL）
  const key = await uploadDataUrl(dataUrl, 'chat_photos/photo');
  return key;
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 限流：RunPod FLUX GPU 烧钱，防脚本刷
  const rl = await checkRateLimitAsync(`chat-img-gen:${user.id}`, IMAGE_GEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, IMAGE_GEN_LIMIT) },
    );
  }

  const { girlfriend_id, mood, pose, environment } = await request.json();
  if (!girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Get girlfriend appearance + portrait
  const { data: gf } = await client
    .from('girlfriends')
    .select('name, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, appearance_race, portrait_url')
    .eq('id', girlfriend_id)
    .eq('user_id', user.id)
    .single();

  if (!gf) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Build appearance description
  const appearanceDesc = [
    gf.appearance_race ? gf.appearance_race : '',
    gf.appearance_hair_color && gf.appearance_hair ? `${gf.appearance_hair_color} ${gf.appearance_hair}` : '',
    gf.appearance_eyes ? `${gf.appearance_eyes} eyes` : '',
    gf.appearance_body ? `${gf.appearance_body} body type` : '',
    gf.appearance_style ? `wearing ${gf.appearance_style}` : '',
  ].filter(Boolean).join(', ');

  // Map presets to tags
  const moodTag = mood ? MOOD_TAGS[mood] || mood : 'warm expression, natural smile';
  const poseTag = pose ? POSE_TAGS[pose] || pose : 'natural pose';
  const envTag = environment ? ENV_TAGS[environment] || environment : 'soft clean background';

  // Build a rich photorealistic prompt — 强调美女/女友/性感
  const prompt = `Stunningly beautiful gorgeous young woman ${gf.name}, ${appearanceDesc}. ${poseTag}. ${envTag}. ${moodTag}. Intimate selfie-style photo, looking at camera, ultra photorealistic, shot on Canon EOS R5 85mm f/1.4, ultra high quality, 8K, sharp focus, natural skin texture, professional photography, warm vibrant colors, radiant glowing skin, magazine cover quality, captivating presence.`;

  const negativePrompt = 'nsfw, nude, explicit, cartoon, anime, illustration, painting, 3d render, low quality, blurry, distorted, bad anatomy, extra limbs, ugly, deformed, watermark, text, signature, logo, stiff, unnatural, plastic, artificial, dead eyes, blank expression, gloomy, depressing, dark shadows';

  try {
    let imageUrl: string | null = null;

    // If RunPod is configured, use it with character consistency
    if (runpodClient.isConfigured && gf.portrait_url) {
      try {
        // Use img2img with girlfriend's portrait for character consistency
        const [generatedUrl] = await runpodClient.generateAndUpload(
          {
            prompt,
            negative_prompt: negativePrompt,
            input_image: gf.portrait_url,
            denoising_strength: 0.65, // Keep character identity while allowing new pose/env
            width: 768,
            height: 1024,
            num_images: 1,
            num_inference_steps: 28,
            guidance_scale: 7.0,
          },
        );
        if (generatedUrl) imageUrl = generatedUrl;
      } catch (err) {
        logger.warn('[Chat Generate Image] RunPod failed, falling back to direct RunPod:', { err });
      }
    }

    // Fallback: use direct RunPod API
    if (!imageUrl) {
      const base64 = await generateWithRunPod(prompt, negativePrompt, gf.portrait_url || undefined);
      imageUrl = await uploadToStorage(base64);
    }

    if (!imageUrl) throw new Error('Failed to generate image');

    const message = `${gf.name} sends you a photo ✨ [${[mood, pose, environment].filter(Boolean).join(', ')}]`;

    // Save as chat message
    await client.from('chat_messages').insert({
      user_id: user.id,
      girlfriend_id,
      role: 'assistant',
      content: message,
      media_url: imageUrl,
    });

    return NextResponse.json({ imageUrl, message });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Chat Generate Image] Error:', { data: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
   }
}
