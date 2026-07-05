import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl } from '@/lib/storage';
import { queryPg } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 4 张 GPU 图，限制 10 次/小时/superadmin
const REFRESH_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

// ============================================================
// Admin — 批量刷新 4 个角色立绘
// 鉴权：仅 superadmin（双层防御，与 ENABLE_DEBUG_ROUTES 互不替代）
// Body: { characters?: [{slug, prompt, seed, ...}] }
// 不传 characters 则用默认 Luna/Ruby/Summer/Scarlet prompt
// ============================================================

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

// 优先用专用 env vars（绕开 Coze Supabase proxy 的 schema cache 问题）
const SUPABASE_URL =
  process.env.SUPABASE_URL_FOR_REFRESH ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_COZE_SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_KEY_FOR_REFRESH ||
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

async function refreshOne(char: CharacterConfig) {
  logger.info(`[${char.slug}] generating portrait seed=${char.seed}...`);
  const base64 = await generateImage(char.prompt, char.seed);
  logger.info(`[${char.slug}] generated (${(base64.length * 3 / 4 / 1024).toFixed(0)} KB), uploading...`);

  // 优先 Supabase Storage（service_role 直接有权限）
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'portraits';
  const filePath = `portraits/${char.slug}_${Date.now()}.png`;
  let publicUrl = '';
  let lastError = '';

  // 自动确保 bucket 存在（首次调用时建）
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: bucket, public: true, file_size_limit: 5242880 }),
    });
  } catch {}

  // 上传到 Supabase Storage
  try {
    const buffer = Buffer.from(base64, 'base64');
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'image/png',
          'x-upsert': 'true',
        },
        body: buffer,
      }
    );
    if (uploadRes.ok) {
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
      logger.info(`[${char.slug}] Supabase Storage OK: ${publicUrl}`);
    } else {
      const errText = await uploadRes.text();
      lastError = `Supabase Storage ${uploadRes.status}: ${errText.slice(0, 300)}`;
      logger.warn(`[${char.slug}] ${lastError}`);
    }
  } catch (e: any) {
    lastError = `Supabase Storage exception: ${e?.message}`;
    logger.warn(`[${char.slug}] ${lastError}`);
  }

  // fallback Coze OSS（如果 Supabase 失败）
  if (!publicUrl) {
    try {
      const dataUrl = `data:image/png;base64,${base64}`;
      const key = await uploadDataUrl(dataUrl, `portraits/${char.slug}`);
      publicUrl = key;
      logger.info(`[${char.slug}] Coze OSS fallback key=${key}`);
    } catch (e: any) {
      lastError += ` | Coze OSS: ${e?.message}`;
    }
  }

  if (!publicUrl) {
    throw new Error(lastError || 'No upload succeeded');
  }

  const { rows: cols } = await queryPg<{ id: string; name: string }>(
    `UPDATE girlfriends
        SET portrait_url = $1, { data: updated_at = NOW( })
      WHERE slug = $2
      RETURNING id, name`,
    [publicUrl, char.slug],
  );
  const row = cols?.[0] || null;
  if (!row) throw new Error(`DB update failed: no girlfriend with slug=${char.slug}`);
  logger.info(`[${char.slug}] DB updated`, { slug: char.slug, row });
  return { slug: char.slug, url: publicUrl, row };
}

export async function POST(request: NextRequest) {
  // 双层防御：仅 superadmin 可访问；与 ENABLE_DEBUG_ROUTES 互不替代。
  const guard = await requireAdmin(request, 'superadmin');
  if (guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-refresh-portraits:${guard.user!.id}`, REFRESH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many refresh requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, REFRESH_LIMIT) },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));

    const debugEnv = {
      has_RUNPOD_API_KEY: !!RUNPOD_API_KEY,
      has_RUNPOD_ENDPOINT_ID: !!RUNPOD_ENDPOINT_ID,
      has_COZE_SUPABASE_DB_URL: !!process.env.COZE_SUPABASE_DB_URL,
      has_COZE_SUPABASE_URL: !!process.env.COZE_SUPABASE_URL,
      bucket: process.env.SUPABASE_STORAGE_BUCKET || 'public',
    };
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      return NextResponse.json({ error: 'RunPod env not configured', debug: debugEnv }, { status: 500 });
    }
    if (!process.env.COZE_SUPABASE_DB_URL) {
      return NextResponse.json({ error: 'COZE_SUPABASE_DB_URL not configured', debug: debugEnv }, { status: 500 });
    }

    const characters: CharacterConfig[] = Array.isArray(body.characters) && body.characters.length
      ? body.characters
      : DEFAULT_CHARACTERS;

    const results = [];
    for (const char of characters) {
      try {
        const r = await refreshOne(char);
        results.push({ ok: true, ...r });
      } catch (e: any) {
        logger.error(`refresh-portraits: ${char.slug} FAILED`, { err: e?.message });
        results.push({ ok: false, slug: char.slug, error: e?.message });
      }
    }

    return NextResponse.json({ ok: true, results, debug: debugEnv });
  } catch (e: any) {
    logger.error('refresh-portraits error', { err: e?.message });
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // 双层防御：仅 superadmin 可访问；与 ENABLE_DEBUG_ROUTES 互不替代。
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  return NextResponse.json({
    message: 'POST to this endpoint with optional { characters: [...] } to refresh character portraits.',
  });
}
