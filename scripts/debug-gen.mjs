import { config } from 'dotenv';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

// Use dynamic import of compiled-ish ts via tsx register is messy in mjs;
// call RunPod + storage with raw fetch + @supabase/supabase-js instead.

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const SUPABASE_URL = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'portraits';

console.log('endpoint', RUNPOD_ENDPOINT_ID);
console.log('supabase', SUPABASE_URL);
console.log('has key', !!RUNPOD_API_KEY, !!SERVICE_KEY);

function buildWorkflow(prompt) {
  const seed = 42;
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 20,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 512, height: 768, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '', clip: ['4', 1] },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'soulmate', images: ['8', 0] },
    },
  };
}

function shapeOf(out) {
  if (!out || typeof out !== 'object') return String(out);
  const acc = {};
  for (const [k, v] of Object.entries(out)) {
    if (v == null) acc[k] = 'null';
    else if (typeof v === 'string') acc[k] = `str:${v.length}:${v.slice(0, 60)}`;
    else if (Array.isArray(v)) {
      acc[k] = `arr:${v.length}`;
      if (v[0] != null) {
        if (typeof v[0] === 'string') acc[`${k}[0]`] = `str:${v[0].length}:${v[0].slice(0, 80)}`;
        else if (typeof v[0] === 'object') acc[`${k}[0]`] = `obj:${Object.keys(v[0]).join(',')}`;
      }
    } else if (typeof v === 'object') acc[k] = `obj:${Object.keys(v).join(',')}`;
    else acc[k] = typeof v;
  }
  return acc;
}

async function main() {
  const base = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;
  const prompt = 'photorealistic portrait of a young woman, sharp focus, well lit';
  const workflow = buildWorkflow(prompt);

  const strategies = [
    { name: 'comfy_dual', input: { prompt: workflow, workflow } },
    { name: 'comfy_prompt', input: { prompt: workflow } },
    { name: 'comfy_workflow', input: { workflow } },
  ];

  for (const s of strategies) {
    console.log('\n=== strategy', s.name, '===');
    const submitRes = await fetch(`${base}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: s.input }),
    });
    const submitText = await submitRes.text();
    console.log('submit', submitRes.status, submitText.slice(0, 200));
    if (!submitRes.ok) continue;
    let id;
    try {
      id = JSON.parse(submitText).id;
    } catch {
      continue;
    }
    if (!id) continue;

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const stRes = await fetch(`${base}/status/${id}`, {
        headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
      });
      const st = await stRes.json();
      console.log(`[${i}] status=${st.status}`);
      if (st.status === 'COMPLETED') {
        console.log('output shape', JSON.stringify(shapeOf(st.output), null, 2));
        // try extract image
        const out = st.output || {};
        let raw = null;
        const imgs = out.images || out.image || out?.output?.images;
        if (Array.isArray(imgs) && imgs[0]) {
          const first = imgs[0];
          if (typeof first === 'string') raw = first;
          else if (first && typeof first === 'object') {
            raw = first.data || first.image || first.base64 || first.url || null;
            console.log('first image object keys', Object.keys(first));
            if (first.filename) console.log('filename', first.filename);
            if (first.type) console.log('type', first.type);
            if (typeof raw === 'string') console.log('payload len', raw.length, 'head', raw.slice(0, 40));
          }
        } else if (typeof imgs === 'string') {
          raw = imgs;
        }
        if (!raw && typeof out.message === 'string') {
          console.log('message head', out.message.slice(0, 100));
        }

        if (raw && /^https?:/.test(raw)) {
          const r = await fetch(raw);
          console.log('remote image fetch', r.status, r.headers.get('content-type'));
        } else if (raw && typeof raw === 'string') {
          let b64 = raw;
          if (b64.startsWith('data:')) b64 = b64.split(',')[1] || '';
          b64 = b64.replace(/\s+/g, '');
          const buf = Buffer.from(b64, 'base64');
          console.log('decoded bytes', buf.length, 'magic', buf.slice(0, 8).toString('hex'), 'ascii', buf.slice(0, 40).toString('utf8').replace(/[^\x20-\x7E]/g, '.'));
          if (buf.length > 100 && SERVICE_KEY) {
            const { createClient } = await import('@supabase/supabase-js');
            const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
            const key = `debug/e2e_${Date.now()}.png`;
            const up = await sb.storage.from(BUCKET).upload(key, buf, { contentType: 'image/png', upsert: true });
            console.log('upload', up.error?.message || 'ok');
            const pub = sb.storage.from(BUCKET).getPublicUrl(key);
            const url = pub.data.publicUrl;
            console.log('publicUrl', url);
            const fr = await fetch(url);
            console.log('public fetch', fr.status, fr.headers.get('content-type'));
          }
        } else {
          console.log('NO extractable image payload');
        }
        return;
      }
      if (st.status === 'FAILED') {
        console.log('FAILED', JSON.stringify(st).slice(0, 500));
        break;
      }
    }
  }
  console.log('all strategies exhausted');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
