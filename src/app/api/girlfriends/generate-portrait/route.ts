import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl, resolveImageUrl, toPublicUrl } from '@/lib/storage';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PORTRAIT_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

function hairColorName(hexOrName: string): string {
  const v = (hexOrName || '').trim();
  if (!v.startsWith('#')) return v || 'brown';
  const map: Record<string, string> = {
    '#000000': 'black',
    '#4a3728': 'dark brown',
    '#6b3a2a': 'brown',
    '#d4a574': 'blonde',
    '#f5d742': 'golden blonde',
    '#e84393': 'pink',
    '#d946ef': 'magenta',
    '#8b5cf6': 'purple',
    '#3b82f6': 'blue',
    '#ef4444': 'red',
    '#ffffff': 'white',
  };
  return map[v.toLowerCase()] || 'colored';
}

function buildPortraitPrompt(input: {
  name?: string;
  visual_style?: string;
  ethnicity?: string;
  gender?: string;
  face_shape?: string;
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  body_type?: string;
  fashion_style?: string;
  appearance_prompt?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  bodyType?: string;
  style?: string;
  personality?: string;
}): string {
  const name = (input.name || 'a beautiful young woman').trim();
  const ethnicity = input.ethnicity || 'mixed';
  const gender = input.gender || 'Female';
  const face = input.face_shape || 'oval';
  const hairStyle = input.hair_style || input.hairStyle || 'long flowing';
  const hairColor = hairColorName(input.hair_color || input.hairColor || 'brown');
  const eyeColor = input.eye_color || input.eyeColor || 'brown';
  const bodyType = input.body_type || input.bodyType || 'slim';
  const fashion = input.fashion_style || input.style || 'casual';
  const visual = (input.visual_style || 'realistic').toLowerCase();
  const extra = sanitizeBlurKeywords(
    [input.appearance_prompt, input.personality].filter(Boolean).join(', '),
  );

  const medium =
    visual === 'anime'
      ? 'high quality anime illustration, clean line art, vibrant colors'
      : 'photorealistic three-quarter portrait, natural skin texture, 8k ultra photorealistic';

  const parts = [
    medium,
    `gorgeous young adult ${gender.toLowerCase()} age 22-28 named ${name}`,
    `${ethnicity} features, ${face} face shape`,
    `${hairStyle} ${hairColor} hair`,
    `${eyeColor} eyes looking at viewer`,
    `${bodyType} figure, large breasts, wide hips, hourglass silhouette`,
    `wearing flattering ${fashion} outfit`,
    extra.slice(0, 180),
    'bright clear lighting, sharp detailed face and eyes, soft smile, magazine quality',
  ].filter(Boolean);

  let prompt = parts.join(', ').replace(/\s{2,}/g, ' ').trim();
  if (prompt.length > 900) {
    prompt = prompt.slice(0, 900);
    const lastComma = prompt.lastIndexOf(',');
    if (lastComma > 700) prompt = prompt.slice(0, lastComma);
  }
  return prompt;
}

function buildWorkflow(prompt: string): Record<string, unknown> {
  const seed = Math.floor(Math.random() * 2147483647);
  return {
    '1': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 28,
        cfg: 1.0,
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
        text: '',
        clip: ['2', 1],
      },
    },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };
}

async function generateImage(prompt: string): Promise<string> {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    throw new Error('RunPod is not configured');
  }
  const workflow = buildWorkflow(prompt);
  const submitRes = await fetch(`${RUNPOD_BASE_URL}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { workflow, prompt: workflow, positive_prompt: prompt } }),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`RunPod submit failed: ${errText.slice(0, 200)}`);
  }
  const submitData = (await submitRes.json()) as { id?: string };
  const jobId = submitData.id;
  if (!jobId) throw new Error('No RunPod job ID');

  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as {
      status?: string;
      error?: string;
      output?: { images?: Array<string | { data?: string }> };
    };
    if (status.status === 'COMPLETED') {
      const images = status.output?.images || [];
      if (!images.length) throw new Error('No images in output');
      const first = images[0];
      if (typeof first === 'string') return first;
      if (first?.data) return first.data;
      throw new Error('Invalid image payload');
    }
    if (status.status === 'FAILED') throw new Error(`RunPod error: ${status.error || 'unknown'}`);
  }
  throw new Error('RunPod timeout');
}

async function uploadToStorage(base64Data: string, name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'companion';
  const dataUrl = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/png;base64,${base64Data}`;
  const key = await uploadDataUrl(dataUrl, `portraits/${safeName}_${Date.now()}`);
  const resolved = (await resolveImageUrl(key)) || toPublicUrl(key) || key;
  return resolved;
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many portrait generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, PORTRAIT_GEN_LIMIT) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || 'Companion');
    const prompt = buildPortraitPrompt({
      name,
      visual_style: body.visual_style as string | undefined,
      ethnicity: body.ethnicity as string | undefined,
      gender: body.gender as string | undefined,
      face_shape: body.face_shape as string | undefined,
      hair_style: body.hair_style as string | undefined,
      hair_color: body.hair_color as string | undefined,
      eye_color: body.eye_color as string | undefined,
      body_type: body.body_type as string | undefined,
      fashion_style: body.fashion_style as string | undefined,
      appearance_prompt: body.appearance_prompt as string | undefined,
      hairStyle: body.hairStyle as string | undefined,
      hairColor: body.hairColor as string | undefined,
      eyeColor: body.eyeColor as string | undefined,
      bodyType: body.bodyType as string | undefined,
      style: body.style as string | undefined,
      personality: body.personality as string | undefined,
    });

    logger.info('[Generate Portrait] Generating', { name, promptLen: prompt.length });
    const base64 = await generateImage(prompt);
    const imageUrl = await uploadToStorage(base64, name);

    return NextResponse.json({
      success: true,
      imageUrl,
      portrait_url: imageUrl,
      url: imageUrl,
      key: null,
      optimizedPrompt: prompt,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Generate Portrait] Error', { data: errMsg });
    return NextResponse.json({ error: errMsg, success: false }, { status: 500 });
  }
}
