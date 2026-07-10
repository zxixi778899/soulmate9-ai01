import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGE_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 }; // 10/h/user  RunPod FLUX 

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

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RunPod FLUX GPU 
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

  // Build a rich photorealistic prompt  //
  const prompt = `Stunningly beautiful gorgeous young woman ${gf.name}, ${appearanceDesc}. ${poseTag}. ${envTag}. ${moodTag}. Intimate selfie-style photo, looking at camera, ultra photorealistic, shot on Canon EOS R5 85mm f/1.4, ultra high quality, 8K, sharp focus, natural skin texture, professional photography, warm vibrant colors, radiant glowing skin, magazine cover quality, captivating presence.`;

  const negativePrompt = 'nsfw, nude, explicit, cartoon, anime, illustration, painting, 3d render, low quality, blurry, distorted, bad anatomy, extra limbs, ugly, deformed, watermark, text, signature, logo, stiff, unnatural, plastic, artificial, dead eyes, blank expression, gloomy, depressing, dark shadows';

  try {
    if (!runpodClient.isConfigured) {
      return NextResponse.json(
        { error: 'Image generation is not configured' },
        { status: 503 },
      );
    }

    // Resolve signed URL so RunPod can download the portrait for img2img
    let referenceImage: string | undefined;
    if (gf.portrait_url) {
      try {
        referenceImage = (await resolveImageUrl(gf.portrait_url)) || gf.portrait_url;
      } catch {
        referenceImage = gf.portrait_url;
      }
    }

    // Always go through runpodClient — it builds LoadImage→VAEEncode img2img
    // when input_image is set, and attaches the base64 blob for the worker.
    const [generatedUrl] = await runpodClient.generateAndUpload(
      {
        prompt,
        negative_prompt: negativePrompt,
        input_image: referenceImage,
        denoising_strength: referenceImage ? 0.62 : 1,
        width: 768,
        height: 1024,
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
      `chat_photos/${girlfriend_id}`,
    );

    if (!generatedUrl) throw new Error('Failed to generate image');

    const message = `${gf.name} sends you a photo  [${[mood, pose, environment].filter(Boolean).join(', ')}]`;

    await client.from('chat_messages').insert({
      user_id: user.id,
      girlfriend_id,
      role: 'assistant',
      content: message,
      media_url: generatedUrl,
    });

    return NextResponse.json({ imageUrl: generatedUrl, image_url: generatedUrl, message });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Chat Generate Image] Error:', { data: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
