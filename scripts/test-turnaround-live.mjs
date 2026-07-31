/**
 * Live verification: does the production turnaround recipe produce a wide
 * three-panel contact sheet now that dimensions are forced to 1344x768?
 * Mirrors src/lib/runpod.ts buildFluxWorkflow IP-Adapter txt2img path with the
 * exact production identity-turnaround parameters (prompt/negative/size/steps).
 * Reads creds from .env.local. Saves result PNG to repo root.
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

const API = process.env.RUNPOD_API_KEY;
const EP = process.env.RUNPOD_ENDPOINT_ID;
const BASE = `https://api.runpod.ai/v2/${EP}`;
console.log('endpoint', EP);

// 1. Fetch a clear face portrait -> base64 (IP-Adapter identity reference)
const faceUrl = 'https://randomuser.me/api/portraits/women/44.jpg';
const faceBuf = Buffer.from(await (await fetch(faceUrl)).arrayBuffer());
const faceB64 = faceBuf.toString('base64');
console.log('face bytes', faceBuf.length);

// Production identity-turnaround prompt (scene preset + brief identity)
const prompt =
  'A single wide horizontal contact sheet divided into exactly three equal vertical panels. ' +
  'Show the same adult character exactly three times at identical scale and baseline: ' +
  'left panel full-body front view, center panel strict left-side profile, right panel full-body back view. ' +
  'Every figure is visible head to toe with space above the head and below the feet, ' +
  'wearing the same simple fitted white outfit, standing naturally against one plain light-gray studio background with flat neutral lighting. ' +
  'No close-up, no portrait crop, no repeated camera angle. ' +
  'A young woman in her mid-20s, long blonde hair, fair skin, slim figure.';

// Production identity-turnaround negative (under FLUX 300-char cap)
const negative =
  '3D render, CG, mannequin, doll, plastic skin, wireframe, single view, one view only, headshot, half-body, portrait, collage, overlapping figures, bokeh, blurry';

// 2. Build IP-Adapter txt2img workflow — EXACT production turnaround params:
//    1344x768 landscape, 28 steps, cfg 1.0, euler/simple, IP-Adapter weight 0.82
const wf = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: 1344, height: 768, batch_size: 1 } },
  '30': { class_type: 'ApplyIPAdapterFlux', inputs: { model: ['1', 0], ipadapter_flux: ['31', 0], image: ['33', 0], weight: 0.82, start_percent: 0.0, end_percent: 0.85 } },
  '31': { class_type: 'IPAdapterFluxLoader', inputs: { ipadapter: 'ip-adapter.bin', clip_vision: 'google/siglip-so400m-patch14-384', provider: 'cuda' } },
  '33': { class_type: 'LoadImage', inputs: { image: 'ipadapter_face.png' } },
  '5': { class_type: 'KSampler', inputs: { seed: 777, steps: 28, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0, model: ['30', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'turnaround_live_test', images: ['6', 0] } },
};

// 3. Submit (comfy_dual strategy + images payload, same as production)
const sub = await fetch(`${BASE}/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${API}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { prompt: wf, workflow: wf, images: [{ name: 'ipadapter_face.png', image: faceB64 }] } }),
});
const subJ = await sub.json();
console.log('submit', sub.status, 'id=', subJ.id, 'status=', subJ.status);
if (!subJ.id) { console.error('SUBMIT_FAIL', JSON.stringify(subJ).slice(0, 500)); process.exit(1); }
const id = subJ.id;
const t0 = Date.now();

// 4. Poll
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await fetch(`${BASE}/status/${id}`, { headers: { Authorization: `Bearer ${API}` } }).then((r) => r.json());
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  if (st.status === 'COMPLETED') {
    const img = st.output?.images?.[0];
    if (img?.data) {
      const buf = Buffer.from(img.data, 'base64');
      const out = path.join(__dirname, '../turnaround_live_result.png');
      fs.writeFileSync(out, buf);
      console.log(`[${el}s] SUCCESS png_bytes=${buf.length} magic=${buf.slice(0, 4).toString('hex')} saved=${out}`);
    } else {
      console.log(`[${el}s] COMPLETED_NO_IMAGE output=`, JSON.stringify(st.output).slice(0, 600));
    }
    process.exit(0);
  }
  if (st.status === 'FAILED') {
    console.error(`[${el}s] FAILED:`, st.error || JSON.stringify(st.output).slice(0, 1000));
    // Surface the real error from output.details[] (RunPod generalizes st.error)
    const details = st.output?.details;
    if (Array.isArray(details)) console.error('details:', JSON.stringify(details).slice(0, 1500));
    process.exit(2);
  }
  if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') console.log(`[${el}s] ${st.status}`);
  else if (i % 5 === 0) console.log(`[${el}s] ${st.status}`);
}
console.error('TIMEOUT'); process.exit(3);
