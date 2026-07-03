/**
 * 一次性生成 14 张女友卡图（用 tsx 跑）
 *
 * 用法（项目根目录）：
 *   npx tsx scripts/generate-cards-standalone.ts
 *
 * 必须有真 .env.local（RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, SUPABASE_*）
 */
import * as dotenv from 'dotenv';
import * as path from 'node:path';

// 加载 .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
const SUPABASE_URL =
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_SERVICE_KEY =
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  console.error('❌ RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID missing in .env.local');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Supabase URL or service key missing');
  process.exit(1);
}

const CHARACTERS = [
  { slug: 'luna', name: 'Luna', age: 24, sceneSlug: 'moonlit-bedroom',
    traits: 'Poetic, Tender, Soft-spoken' },
  { slug: 'ruby', name: 'Ruby', age: 22, sceneSlug: 'infinity-pool-night',
    traits: 'Playful, Spicy, Polyglot' },
  { slug: 'summer', name: 'Summer', age: 25, sceneSlug: 'boutique-gym',
    traits: 'Sunny, Athletic, Adventurous' },
  { slug: 'scarlet', name: 'Scarlet', age: 23, sceneSlug: 'onsen-spa',
    traits: 'Elegant, Mysterious, Cultured' },
  { slug: 'mira', name: 'Mira', age: 23, sceneSlug: 'infinity-pool-night',
    traits: 'Creative, Curious, Dramatic' },
  { slug: 'aria', name: 'Aria', age: 25, sceneSlug: 'rooftop-lounge',
    traits: 'Melodic, Romantic, Charming' },
  { slug: 'nova', name: 'Nova', age: 22, sceneSlug: 'moonlit-bedroom',
    traits: 'Mysterious, Dreamy, Sweet' },
  { slug: 'kira', name: 'Kira', age: 26, sceneSlug: 'onsen-spa',
    traits: 'Strong, Loyal, Disciplined' },
  { slug: 'lyra', name: 'Lyra', age: 24, sceneSlug: 'penthouse-window',
    traits: 'Elegant, Sensitive, Artistic' },
  { slug: 'sage', name: 'Sage', age: 27, sceneSlug: 'boutique-gym',
    traits: 'Calm, Wise, Grounded' },
  { slug: 'ember', name: 'Ember', age: 23, sceneSlug: 'rooftop-lounge',
    traits: 'Bold, Adventurous, Passionate' },
  { slug: 'jasmine', name: 'Jasmine', age: 22, sceneSlug: 'moonlit-bedroom',
    traits: 'Sweet, Clumsy, Warm' },
  { slug: 'morgana', name: 'Morgana', age: 28, sceneSlug: 'infinity-pool-night',
    traits: 'Clever, Mysterious, Confident' },
  { slug: 'wren', name: 'Wren', age: 21, sceneSlug: 'penthouse-window',
    traits: 'Creative, Free, Vulnerable' },
];

const SCENES: Record<string, string> = {
  'moonlit-bedroom': 'cozy bedroom at night, moonlight through curtains, soft purple lighting',
  'infinity-pool-night': 'luxury rooftop pool at night, neon city skyline, Tokyo night vibe',
  'boutique-gym': 'modern minimalist gym, warm natural light, fitness studio aesthetic',
  'rooftop-lounge': 'rooftop lounge at sunset, golden hour, city skyline',
  'onsen-spa': 'traditional Japanese onsen, red lanterns, wooden architecture, peaceful steam',
  'penthouse-window': 'penthouse floor-to-ceiling window, city night lights, modern interior',
};

function buildPrompt(c: { name: string; age: number; traits: string; sceneSlug: string }): string {
  const scene = SCENES[c.sceneSlug] ?? SCENES['moonlit-bedroom'];
  return `Stunningly beautiful gorgeous young woman named ${c.name}, age ${c.age}, ${c.traits}, wearing elegant outfit that flatters her figure, pose: standing naturally looking at viewer with warm smile, environment: ${scene}, full body shot, upper body composition, expression: confident and approachable, photorealistic, shot on Sony A7IV 85mm f/1.4, soft cinematic lighting, hyperrealistic, 8k uhd, magazine cover quality`;
}

// ───── RunPod 客户端（简化版，只用 fetch）─────
async function runpodGenerate(prompt: string): Promise<string> {
  // FLUX workflow（与 src/lib/runpod.ts 同步）
  const workflow = {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "flux1-dev-fp8.safetensors" } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["4", 1] } },
    "6": { class_type: "CLIPTextEncode", inputs: {
      text: 'blurry, low quality, deformed, distorted, ugly, bad anatomy, watermark, text, signature, logo, nsfw, lowres, bad proportions, stiff, unnatural, plastic, artificial, dead eyes, blank expression, gloomy, depressing',
      clip: ["4", 1] } },
    "7": { class_type: "EmptyLatentImage", inputs: { width: 768, height: 1024, batch_size: 1 } },
    "8": { class_type: "KSampler", inputs: {
      seed: Math.floor(Math.random() * 2 ** 32),
      steps: 28, cfg: 3.5,
      sampler_name: 'euler', scheduler: 'simple',
      denoise: 1,
      model: ["4", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0] } },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["4", 2] } },
    "10": { class_type: "SaveImage", inputs: { filename_prefix: "card", images: ["9", 0] } },
  };

  const baseUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;
  const headers = {
    Authorization: `Bearer ${RUNPOD_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // 1) submit
  const submitRes = await fetch(`${baseUrl}/run`, {
    method: 'POST', headers,
    body: JSON.stringify({ input: { workflow } }),
  });
  if (!submitRes.ok) throw new Error(`submit failed: ${submitRes.status}`);
  const { id } = await submitRes.json() as { id: string };
  console.log(`  → RunPod job ${id} submitted`);

  // 2) poll
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${baseUrl}/status/${id}`, { headers });
    if (!statusRes.ok) throw new Error(`status failed: ${statusRes.status}`);
    const status = await statusRes.json() as { status: string; output?: { images?: { data: string }[] }; error?: string };
    if (status.status === 'COMPLETED') {
      const img = status.output?.images?.[0];
      if (!img) throw new Error('no image in output');
      return img.data; // base64
    }
    if (status.status === 'FAILED') throw new Error(status.error ?? 'failed');
    process.stdout.write('.');
  }
  throw new Error('timeout');
}

// ───── Supabase storage 上传（用 service_role）─────
async function uploadToSupabase(filename: string, base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/portraits/cards/${filename}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: buffer,
    },
  );
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`upload failed ${uploadRes.status}: ${text}`);
  }
  // 上传后删除默认 bucket public 检查（portraits 是 public bucket）
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/portraits/cards/${filename}`;
  return publicUrl;
}

// ───── 主流程 ──────
async function main() {
  console.log(`🎨 开始生成 ${CHARACTERS.length} 张女友卡图...\n`);
  const results: Array<{ slug: string; url?: string; error?: string }> = [];

  for (const c of CHARACTERS) {
    process.stdout.write(`[${c.slug}] ${c.name} ... `);
    try {
      const base64 = await runpodGenerate(buildPrompt(c));
      console.log(' generated');
      const url = await uploadToSupabase(`${c.slug}.png`, base64);
      console.log(`  → uploaded: ${url}`);
      results.push({ slug: c.slug, url });
    } catch (e: any) {
      console.log(` ✗ ${e?.message}`);
      results.push({ slug: c.slug, error: e?.message });
    }
  }

  console.log('\n=== 结果 ===');
  const ok = results.filter((r) => r.url);
  const fail = results.filter((r) => r.error);
  console.log(`成功 ${ok.length} / 失败 ${fail.length}`);
  for (const r of results) {
    console.log(`  ${r.url ? '✓' : '✗'} ${r.slug}${r.url ? ` → ${r.url}` : ''}${r.error ? ` (${r.error})` : ''}`);
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});