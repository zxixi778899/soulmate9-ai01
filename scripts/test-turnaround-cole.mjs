/**
 * Reproduce the production identity-turnaround for a MALE companion (Cole) to
 * diagnose ghosting/multiple-exposure vs clean three-panel output.
 *
 * Mirrors route.ts + buildFluxWorkflow txt2img+IP-Adapter path exactly:
 *   prompt  = preset.scene + ", " + buildCompanionIdentityBrief(row)
 *   negative= turnaround negative (truncated to 300)
 *   size    = 1344x768 (enforced production preset)
 *   IP-Adapter weight configurable, end_percent 0.85
 *   28 steps, cfg 1, euler, simple
 *
 * Config via env:
 *   REF     path to IP-Adapter reference image (default: Cole waist-up avatar)
 *   WEIGHT  IP-Adapter weight (default 0.82)
 *   SEED    sampler seed (default 777)
 *   OUT     output png path
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

const REF = process.env.REF || 'C:/Users/71489/.qoderworkcn/workspace/ms9csrjg10vnkbl9/cole_avatar.png';
const WEIGHT = Number(process.env.WEIGHT ?? 0.82);
const END = Number(process.env.END ?? 0.85);
const SEED = Number(process.env.SEED ?? 777);
const OUT = process.env.OUT || path.join(__dirname, '../cole_turnaround_result.png');

// ── Exact production prompt (character-asset-production.ts identity-turnaround) ──
const scene = 'A single wide horizontal contact sheet divided into exactly three equal vertical panels. Show the same adult character exactly three times at identical scale and baseline: left panel full-body front view, center panel strict left-side profile, right panel full-body back view. Every figure is visible head to toe with space above the head and below the feet, wearing the same simple fitted white outfit, standing naturally against one plain light-gray studio background with flat neutral lighting. No close-up, no portrait crop, no repeated camera angle.';
// buildCompanionIdentityBrief(Cole): 28yo man, Slavic, Platinum blonde Medium wavy hair, Dark and intense eyes, Broad-shouldered build
const brief = '28-year-old man, Slavic, Platinum blonde Medium wavy hair, Dark and intense eyes, Broad-shouldered build, 185cm';
const prompt = `${scene}, ${brief}`;
// route.ts identity-turnaround negative
const negative = '3D render, CG, mannequin, doll, plastic skin, wireframe, single view, one view only, headshot, half-body, portrait, collage, overlapping figures, bokeh, blurry';

console.log('endpoint', EP, '| ref', path.basename(REF), '| weight', WEIGHT, '| end', END, '| seed', SEED);

const refBuf = fs.readFileSync(REF);
const refB64 = refBuf.toString('base64');
const refName = 'ipadapter_ref.png';

const wf = {
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
  '3': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: 1344, height: 768, batch_size: 1 } },
  '30': { class_type: 'ApplyIPAdapterFlux', inputs: { model: ['1', 0], ipadapter_flux: ['31', 0], image: ['33', 0], weight: WEIGHT, start_percent: 0.0, end_percent: END } },
  '31': { class_type: 'IPAdapterFluxLoader', inputs: { ipadapter: 'ip-adapter.bin', clip_vision: 'google/siglip-so400m-patch14-384', provider: 'cuda' } },
  '33': { class_type: 'LoadImage', inputs: { image: refName } },
  '5': { class_type: 'KSampler', inputs: { seed: SEED, steps: 28, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0, model: ['30', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'cole_turnaround', images: ['6', 0] } },
};

const sub = await fetch(`${BASE}/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${API}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { prompt: wf, workflow: wf, images: [{ name: refName, image: refB64 }] } }),
});
const subJ = await sub.json();
console.log('submit', sub.status, 'id=', subJ.id, 'status=', subJ.status);
if (!subJ.id) { console.error('SUBMIT_FAIL', JSON.stringify(subJ).slice(0, 500)); process.exit(1); }
const id = subJ.id;
const t0 = Date.now();

for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await fetch(`${BASE}/status/${id}`, { headers: { Authorization: `Bearer ${API}` } }).then((r) => r.json());
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  if (st.status === 'COMPLETED') {
    const img = st.output?.images?.[0];
    if (img?.data) {
      const buf = Buffer.from(img.data, 'base64');
      fs.writeFileSync(OUT, buf);
      console.log(`[${el}s] SUCCESS png_bytes=${buf.length} saved=${OUT}`);
    } else {
      console.log(`[${el}s] COMPLETED_NO_IMAGE output=`, JSON.stringify(st.output).slice(0, 600));
    }
    process.exit(0);
  }
  if (st.status === 'FAILED') {
    const details = st.output?.details;
    console.error(`[${el}s] FAILED:`, st.error || '', details ? JSON.stringify(details).slice(0, 800) : JSON.stringify(st.output).slice(0, 800));
    process.exit(2);
  }
  if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') console.log(`[${el}s] ${st.status}`);
  else if (i % 5 === 0) console.log(`[${el}s] ${st.status}`);
}
console.error('TIMEOUT'); process.exit(3);
