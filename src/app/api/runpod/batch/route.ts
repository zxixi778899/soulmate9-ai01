import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/require-admin';
import { uploadFile } from '@/lib/storage';

//  RunPod credentials  MUST come from environment variables 
const API_KEY = process.env.RUNPOD_API_KEY || '';
const ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const BASE_URL = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const HEADERS = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

//  Generation parameters interface 
interface GenParams {
  steps: number;
  cfg_scale: number;
  seed: number;
  width: number;
  height: number;
  sampler: string;
  scheduler: string;
}

const DEFAULT_PARAMS: GenParams = {
  steps: 28,
  cfg_scale: 3.5,
  seed: 0,
  width: 768,
  height: 1024,
  sampler: 'euler',
  scheduler: 'simple',
};

function buildWorkflow(
  prompt: string,
  negativePrompt: string,
  params: GenParams
) {
  const seed = params.seed <= 0 ? Math.floor(Math.random() * 2147483647) : params.seed;
  return {
    '2': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 1] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['2', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: params.width, height: params.height, batch_size: 1 } },
    '1': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: params.steps,
        cfg: params.cfg_scale,
        sampler_name: params.sampler,
        scheduler: params.scheduler,
        denoise: 1,
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };
}

//  Style direction pool for variety 
const STYLE_DIRECTIONS = [
  'soft natural lighting, sunlit, warm tones, candid',
  'dramatic film noir, high contrast, deep shadows, gritty',
  'golden hour glow, warm backlight, bokeh, dreamy',
  'studio fashion photography, softbox, clean background, sharp',
  'cyberpunk neon at night, purple/pink city lights, futuristic',
  'vintage polaroid style, faded, nostalgic, analog grain',
  'cozy indoor setting, warm lamp light, intimate, soft',
  'moody overcast day, muted tones, melancholic, ethereal',
  'elegant high fashion, sharp focus, magazine quality, runway',
  'romantic garden, soft bloom, dreamy atmosphere, pastel',
];

function generateCharacterPrompt(
  character: { name?: string; personality?: string },
  params: GenParams
): { prompt: string; negativePrompt: string; seed: number } {
  const name = character.name || 'a character';
  const personality = character.personality || 'mysterious';
  const styleDir = STYLE_DIRECTIONS[Math.floor(Math.random() * STYLE_DIRECTIONS.length)];
  const seed = params.seed > 0 ? params.seed : Math.floor(Math.random() * 2147483647);

  const prompt = `masterpiece filmic portrait of ${name}, ${personality} expression, ${styleDir}, photorealistic, ultra detailed, 8k, sharp focus on eyes, natural skin texture, subtle makeup, elegant attire, ambient lighting, cinematic composition, shallow depth of field, raw photo style, candid expression, asymmetrical, organic`;
  const negativePrompt = `blurry, low quality, cartoon, anime, illustration, painting, distorted face, bad anatomy, extra fingers, deformed hands, watermark, text, signature, oversaturated, overexposed, monochrome, sepia, zombie, skeleton, horror, scary, fat, obese, double chin, acne, blemish, doll, mannequin, plastic, unrealistic, artificial, smooth skin, airbrushed, porcelain, wax, symmetrical face, generic, duplicate, same face`;

  return { prompt, negativePrompt, seed };
}

//  Single image generation via RunPod (async polling) 
async function generateImage(
  prompt: string,
  negativePrompt: string,
  params: GenParams,
  sendLog?: (type: string, msg: string) => void
): Promise<string> {
  const workflow = buildWorkflow(prompt, negativePrompt, params);
  const body = JSON.stringify({
    input: { workflow, prompt: workflow, positive_prompt: prompt },
  });

  const submitRes = await fetch(`${BASE_URL}/run`, { method: 'POST', headers: HEADERS, body });
  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Submit failed: ${submitRes.status} ${errText}`);
  }
  const submitData = await submitRes.json();
  const jobId = submitData.id;
  if (!jobId) throw new Error(`No job id in response: ${JSON.stringify(submitData)}`);

  sendLog?.('info', `Submitted (job: ${jobId.substring(0, 8)}...)`);

  for (let attempt = 0; attempt < 200; attempt++) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${BASE_URL}/status/${jobId}`, { headers: HEADERS });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();

    if (status.status === 'COMPLETED') {
      const images = status.output?.images || [];
      if (images.length === 0) throw new Error('No images in COMPLETED output');
      const data = images[0].data || images[0];
      if (typeof data !== 'string') throw new Error('Image data is not string');
      return data;
    }

    if (attempt % 5 === 0) sendLog?.('info', `Status: ${status.status} (${attempt * 4}s)`);

    if (status.status === 'FAILED') {
      throw new Error(`Worker error: ${status.error || 'unknown'}`);
    }
  }
  throw new Error(`RunPod generation timed out after 800s (GPU queue congestion)`);
}

//  SSE helpers 
function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  // Admin-only: this endpoint scans and mutates the entire girlfriends table
  // and consumes billable GPU time, not scoped to the caller's own data.
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const auth = await getAuthUser(req);
  if (!auth.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const supabase = auth.client;

  // Read generation parameters from request body
  let params = { ...DEFAULT_PARAMS };
  try {
    const body = await req.json();
    if (body.params) {
      params = { ...DEFAULT_PARAMS, ...body.params };
    }
  } catch {}

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;
  const stream = new ReadableStream({
    start(c) { controller = c; },
  });

  // Background processing
  (async () => {
    try {
      const send = (event: string, data: unknown) => {
        if (controller) {
          try { controller.enqueue(encoder.encode(sseEvent(event, data))); } catch {}
        }
      };

      send('log', { type: 'info', message: `Params: steps=${params.steps} cfg=${params.cfg_scale} sampler=${params.sampler} scheduler=${params.scheduler} size=${params.width}x${params.height}` });
      send('log', { type: 'info', message: 'Scanning database for items needing images...' });

      // Query girlfriends that need image generation (with limit to prevent timeout)
      const MAX_BATCH_SIZE = 20; // Limit to prevent Vercel timeout
      const { data: girlfriends, error } = await supabase
        .from('girlfriends')
        .select('id, name, personality, avatar_url')
        .limit(MAX_BATCH_SIZE);

      if (error) throw new Error(`DB query failed: ${error.message}`);

      const items = girlfriends || [];
      send('log', { type: 'info', message: `Found ${items.length} items (max batch: ${MAX_BATCH_SIZE})` });

      let completed = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const label = item.name || `#${item.id}`;
        send('log', { type: 'info', message: `[${i + 1}/${items.length}] Generating: ${label}...` });

        try {
          const { prompt, negativePrompt, seed } = generateCharacterPrompt(item, params);
          send('log', { type: 'prompt', message: `Prompt: ${prompt.substring(0, 80)}...` });
          send('log', { type: 'prompt', message: `Seed: ${seed}` });

          const itemSendLog = (type: string, msg: string) => send('log', { type, message: `${label}: ${msg}` });

          const imageBase64 = await generateImage(prompt, negativePrompt, params, itemSendLog);

          // Upload to object storage
          const buffer = Buffer.from(imageBase64, 'base64');
          const filename = `girlfriend_${item.id}_${Date.now()}.png`;
          const folder = `girlfriends/${item.id}`;
          const { url } = await uploadFile(buffer, filename, 'image/png', folder);

          // Update DB
          await supabase.from('girlfriends').update({ avatar_url: url }).eq('id', item.id);

          completed++;
          send('log', { type: 'success', message: ` ${label}: Generation complete + DB updated` });
          send('complete', { id: item.id, name: item.name, avatar_url: url });
        } catch (e: any) {
          failed++;
          send('log', { type: 'error', message: ` ${label}: ${e.message}` });
        }
      }

      send('log', { type: 'done', message: `All done. ${completed} succeeded, ${failed} failed.` });
      send('done', { completed, failed });
    } catch (e: any) {
      const ctrl = controller!;
      try { ctrl.enqueue(encoder.encode(sseEvent('error', { message: e.message }))); } catch {}
    } finally {
      const ctrl = controller!;
      try { ctrl.close(); } catch {}
    }
  })();

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}