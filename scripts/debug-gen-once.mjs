/**
 * One-shot: generate via official workflow shape + upload + print public URL.
 * Uses same strategies as src/lib/runpod.ts (simplified).
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

const API = process.env.RUNPOD_API_KEY;
const EP = process.env.RUNPOD_ENDPOINT_ID;
const BASE = `https://api.runpod.ai/v2/${EP}`;
const SB_URL = process.env.COZE_SUPABASE_URL;
const SB_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'portraits';

function workflow(prompt) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 768, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: 12345,
        steps: 20,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1.0,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'soulmate', images: ['6', 0] } },
  };
}

async function main() {
  const prompt =
    'RAW photo, photorealistic portrait of Claire Edwards, young woman, black high ponytail, aquamarine eyes, sharp focus, well-lit';
  const wf = workflow(prompt);
  console.log('submit comfy_dual…');
  const sub = await fetch(`${BASE}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { prompt: wf, workflow: wf } }),
  });
  const subJ = await sub.json();
  console.log('submit', sub.status, subJ.id, subJ.status);
  if (!subJ.id) {
    console.error(subJ);
    process.exit(1);
  }
  const id = subJ.id;
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(`${BASE}/status/${id}`, {
      headers: { Authorization: `Bearer ${API}` },
    }).then((r) => r.json());
    if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') {
      console.log(`[${i}] ${st.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } else if (i % 5 === 0) {
      console.log(`[${i}] ${st.status} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    if (st.status === 'COMPLETED') {
      const img = st.output?.images?.[0];
      if (!img?.data) {
        console.error('no data', JSON.stringify(st.output).slice(0, 300));
        process.exit(1);
      }
      const buf = Buffer.from(img.data, 'base64');
      console.log('png bytes', buf.length, 'magic', buf.slice(0, 4).toString('hex'));
      const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
      const key = `girlfriends/e2e_claire_${Date.now()}.png`;
      const up = await sb.storage.from(BUCKET).upload(key, buf, {
        contentType: 'image/png',
        upsert: true,
      });
      if (up.error) {
        console.error('upload fail', up.error.message);
        process.exit(1);
      }
      const url = sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
      console.log('PUBLIC_URL', url);
      const fr = await fetch(url);
      console.log('fetch', fr.status, fr.headers.get('content-type'));
      // also patch claire row for real preview in admin
      const { data: rows } = await sb
        .from('girlfriends')
        .select('id,name')
        .ilike('name', '%Claire%')
        .limit(3);
      console.log('claire rows', rows);
      if (rows?.[0]?.id) {
        const { error } = await sb
          .from('girlfriends')
          .update({ portrait_url: url, avatar_url: url, name: 'Claire Edwards' })
          .eq('id', rows[0].id);
        console.log('db update', error?.message || 'ok', rows[0].id);
      }
      console.log('DONE');
      return;
    }
    if (st.status === 'FAILED') {
      console.error('FAILED', st.error || st.output);
      process.exit(1);
    }
  }
  console.error('timeout');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
