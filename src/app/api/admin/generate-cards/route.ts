/**
 * Admin: 批量生成女友卡图（RunPod + 上传到 cards/{slug}.png）
 *
 * 用法（需要 superadmin 权限）：
 *   POST /api/admin/generate-cards
 *   Body: { slugs?: string[] }  // 不传则用全部 CHARACTERS
 *
 * 行为：
 *   - 每个角色 prompt 由 CHARACTERS traits + sceneSlug 推导
 *   - 同步调用 runpodClient.generateAndUpload（每张 ~30s+）
 *   - 返回每张卡图的 public URL
 *
 * 注意：
 *   - Vercel Hobby timeout = 10s；Pro = 60s — 14 张会超时
 *   - 建议：用 Vercel cron（Pro）或本地 Node 脚本调用
 *   - 失败时返回 partial 数组，已成功的会保留在 storage
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { runpodClient } from '@/lib/runpod';

// CHARACTERS 数据复制（与 page.tsx 同步）
// 修改 page.tsx CHARACTERS 时必须同步这里
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

const SCENES = {
  'moonlit-bedroom': 'cozy bedroom at night, moonlight streaming through curtains, soft purple lighting, dreamy atmosphere',
  'infinity-pool-night': 'luxury rooftop pool at night, neon city skyline reflection, cinematic Tokyo night vibe',
  'boutique-gym': 'modern minimalist gym, warm natural light through big windows, fitness studio aesthetic',
  'rooftop-lounge': 'rooftop lounge at sunset, golden hour, city skyline background, luxurious outdoor furniture',
  'onsen-spa': 'traditional Japanese onsen, red lanterns, wooden architecture, peaceful steam atmosphere',
  'penthouse-window': 'penthouse floor-to-ceiling window, city night lights, luxurious modern interior',
};

function buildPrompt(c: { name: string; age: number; traits: string; sceneSlug: string }): string {
  const scene = SCENES[c.sceneSlug as keyof typeof SCENES] || SCENES['moonlit-bedroom'];
  return `Stunningly beautiful gorgeous young woman named ${c.name}, age ${c.age}, ${c.traits}, wearing elegant outfit that flatters her figure, pose: standing naturally looking at viewer with warm smile, environment: ${scene}, full body shot from head to toe, upper body composition, expression: confident and approachable, photorealistic, shot on Sony A7IV 85mm f/1.4, soft cinematic lighting, hyperrealistic, 8k uhd, magazine cover quality`;
}

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 分钟（Vercel Pro 上限）

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  if (!runpodClient.isConfigured) {
    return NextResponse.json(
      { error: 'RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const targetSlugs: string[] = Array.isArray(body.slugs) && body.slugs.length > 0
    ? body.slugs
    : CHARACTERS.map((c) => c.slug);

  const targets = CHARACTERS.filter((c) => targetSlugs.includes(c.slug));
  if (targets.length === 0) {
    return NextResponse.json({ error: 'No matching slugs' }, { status: 400 });
  }

  const results: Array<{ slug: string; status: 'ok' | 'failed'; url?: string; error?: string }> = [];

  for (const c of targets) {
    try {
      const prompt = buildPrompt(c);
      // 768x1024 竖图（适合卡 3:4 比例）
      const result = await runpodClient.generateAndUpload(
        { prompt, width: 768, height: 1024, num_inference_steps: 28, guidance_scale: 3.5 },
        `cards/${c.slug}`,
      );
      // uploadFile 返回的 url 是带 ts_rand_ 前缀的，这里取第一张
      // 上传后 storage key 是 cards/{ts}_{rand}_runpod_{i}.png
      // 注意：runpodClient.generateAndUpload 会自动加 ts_rand_ 前缀，
      // 真实路径是 cards/{ts}_{rand}_runpod_0.png，不是 cards/{slug}.png
      results.push({
        slug: c.slug,
        status: 'ok',
        url: result[0],
      });
    } catch (e: any) {
      results.push({
        slug: c.slug,
        status: 'failed',
        error: e?.message ?? 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    total: targets.length,
    succeeded: results.filter((r) => r.status === 'ok').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
    note: '生成完成后需要手动将上传的图移动到固定路径 cards/{slug}.png（当前 storage 加了 ts_rand_ 前缀）',
  });
}