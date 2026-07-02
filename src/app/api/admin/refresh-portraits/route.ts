import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl } from '@/lib/storage';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ============================================================
// Admin — 批量刷新 4 个角色立绘
// Body: { adminSecret: string, characters?: [{slug, prompt, seed, ...}] }
// 不传 characters 则用默认 Luna/Ruby/Summer/Scarlet prompt
// ============================================================

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_COZE_SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

interface CharacterConfig {
  slug: string;
  prompt: string;
  seed: number;
}

const DEFAULT_CHARACTERS: CharacterConfig[] = [
  {
    slug: 'luna',
    seed: 12345,
    prompt:
      'professional portrait photograph of a beautiful 24-year-old European woman named Luna, ' +
      'silver-blonde hair flowing past shoulders, piercing ice-blue eyes, porcelain fair skin with soft freckles, ' +
      'wearing a silk lilac slip dress with delicate jewelry, upper body shot from chest up, ' +
      'expression: gentle warm smile, background: moonlit bedroom with soft violet bokeh, ' +
      'shot on Sony A7IV 85mm f/1.4 lens, soft cinematic lighting, photorealistic, hyperdetailed, sharp focus, ' +
      '8k uhd, magazine cover quality',
  },
  {
    slug: 'ruby',
    seed: 12345,
    prompt:
      'professional portrait photograph of a beautiful 22-year-old Japanese woman named Ruby, ' +
      'short pastel-pink bob haircut with blunt bangs, bright violet eyes, pale porcelain skin, ' +
      'wearing a holographic iridescent techwear jacket over black mesh top, upper body shot from chest up, ' +
      'expression: cool mysterious smirk, background: tokyo neon cyberpunk street at night with rain reflections, ' +
      'shot on Sony A7IV 85mm f/1.4 lens, soft cinematic lighting, photorealistic, hyperdetailed, sharp focus, ' +
      '8k uhd, magazine cover quality',
  },
  {
    slug: 'summer',
    seed: 12345,
    prompt:
      'professional portrait photograph of a beautiful 25-year-old Latin woman named Summer, ' +
      'long wavy chestnut-brown hair sun-kissed highlights, hazel-green eyes, sun-tanned olive skin, ' +
      'wearing a flowing white linen crop top with gold hoops, upper body shot from chest up, ' +
      'expression: playful radiant laugh, background: golden hour beach sunset with palm trees, ' +
      'shot on Sony A7IV 85mm f/1.4 lens, soft cinematic lighting, photorealistic, hyperdetailed, sharp focus, ' +
      '8k uhd, magazine cover quality',
  },
  {
    slug: 'scarlet',
    seed: 12345,
    prompt:
      'professional portrait photograph of a beautiful 23-year-old Chinese woman named Scarlet, ' +
      'long jet-black hair in a side braid, deep brown eyes, warm ivory skin, ' +
      'wearing a crimson silk qipao dress with gold embroidery and high collar, upper body shot from chest up, ' +
      'expression: confident serene smile, background: traditional courtyard with red lanterns and blossoms, ' +
      'shot on Sony A7IV 85mm f/1.4 lens, soft cinematic lighting, photorealistic, hyperdetailed, sharp focus, ' +
      '8k uhd, magazine cover quality',
  },
];

function buildWorkflow(prompt: string, seed: number) {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text:
          'blurry, lowres, jpeg artifacts, watermark, signature, text, logo, deformed, ugly, duplicate, ' +
          'morbid, mutilated, extra fingers, mutated hands, poorly drawn face, bad anatomy, bad proportions, ' +
          'cropped, worst quality, low quality, child, minor',
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 832, height: 1216, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 28,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'portrait', images: ['6', 0] },
    },
  };
}

async function generateImage(prompt: string, seed: number): Promise<string> {
  const workflow = buildWorkflow(prompt, seed);
  const res = await fetch(`${RUNPOD_BASE_URL}/runsync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { workflow } }),
  });
  if (!res.ok) throw new Error(`RunPod HTTP ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  if (json.status !== 'COMPLETED') throw new Error(`RunPod status=${json.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const images = json.images || json.output?.images || [];
  if (!images.length) throw new Error('No images in RunPod response');
  return images[0].data || images[0];
}

async function refreshOne(supabase: any, char: CharacterConfig) {
  console.log(`[${char.slug}] generating portrait seed=${char.seed}...`);
  const base64 = await generateImage(char.prompt, char.seed);
  console.log(`[${char.slug}] generated, uploading to OSS...`);

  const dataUrl = `data:image/png;base64,${base64}`;
  const key = await uploadDataUrl(dataUrl, `portraits/${char.slug}`);
  console.log(`[${char.slug}] OSS key=${key}`);

  const { data, error } = await supabase
    .from('girlfriends')
    .update({ portrait_url: key, updated_at: new Date().toISOString() })
    .eq('slug', char.slug)
    .select('id,name,slug,portrait_url');

  if (error) throw new Error(`DB update failed: ${error.message}`);
  console.log(`[${char.slug}] DB updated:`, JSON.stringify(data));
  return { slug: char.slug, key, row: data?.[0] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminSecret = body.adminSecret || request.headers.get('x-admin-secret') || '';
    const expected = process.env.ADMIN_REFRESH_SECRET || 'soulmate-refresh-2026';
    if (adminSecret !== expected) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const debugEnv = {
      has_SUPABASE_URL: !!SUPABASE_URL,
      has_SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      has_COZE_SUPABASE_SERVICE_ROLE_KEY: !!process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
      has_COZE_SUPABASE_URL: !!process.env.COZE_SUPABASE_URL,
      has_NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_RUNPOD_API_KEY: !!RUNPOD_API_KEY,
      has_RUNPOD_ENDPOINT_ID: !!RUNPOD_ENDPOINT_ID,
    };
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return NextResponse.json({ error: 'Supabase env not configured', debug: debugEnv }, { status: 500 });
    }
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      return NextResponse.json({ error: 'RunPod env not configured', debug: debugEnv }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const characters: CharacterConfig[] = Array.isArray(body.characters) && body.characters.length
      ? body.characters
      : DEFAULT_CHARACTERS;

    const results = [];
    for (const char of characters) {
      try {
        const r = await refreshOne(supabase, char);
        results.push({ ok: true, ...r });
      } catch (e: any) {
        console.error(`[${char.slug}] FAILED:`, e?.message);
        results.push({ ok: false, slug: char.slug, error: e?.message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error('refresh-portraits error:', e);
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint with { adminSecret } to refresh 4 character portraits.',
    example: {
      adminSecret: 'soulmate-refresh-2026',
      // optional characters override
    },
  });
}