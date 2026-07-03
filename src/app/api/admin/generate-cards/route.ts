/**
 * Admin: 单张生成女友卡图（Vercel compatible）
 *
 * 用法：
 *   POST /api/admin/generate-cards
 *   Body: { slug: string }  // 单张角色 slug
 *
 * 行为：
 *   - 单张调用 RunPod + 上传，约 30-60s
 *   - Vercel Pro 60s timeout 够单张；Hobby 30s 接近边缘
 *   - 重复 POST 同一 slug 会覆盖 storage cards/{slug}.png
 *   - 配合前端 admin 页面循环调用 14 次
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { runpodClient } from '@/lib/runpod';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro 上限

// 与 page.tsx CHARACTERS 同步
const CHARACTERS: Record<string, { name: string; age: number; traits: string; sceneSlug: string }> = {
  luna: { name: 'Luna', age: 24, traits: 'Poetic, Tender, Soft-spoken', sceneSlug: 'moonlit-bedroom' },
  ruby: { name: 'Ruby', age: 22, traits: 'Playful, Spicy, Polyglot', sceneSlug: 'infinity-pool-night' },
  summer: { name: 'Summer', age: 25, traits: 'Sunny, Athletic, Adventurous', sceneSlug: 'boutique-gym' },
  scarlet: { name: 'Scarlet', age: 23, traits: 'Elegant, Mysterious, Cultured', sceneSlug: 'onsen-spa' },
  mira: { name: 'Mira', age: 23, traits: 'Creative, Curious, Dramatic', sceneSlug: 'infinity-pool-night' },
  aria: { name: 'Aria', age: 25, traits: 'Melodic, Romantic, Charming', sceneSlug: 'rooftop-lounge' },
  nova: { name: 'Nova', age: 22, traits: 'Mysterious, Dreamy, Sweet', sceneSlug: 'moonlit-bedroom' },
  kira: { name: 'Kira', age: 26, traits: 'Strong, Loyal, Disciplined', sceneSlug: 'onsen-spa' },
  lyra: { name: 'Lyra', age: 24, traits: 'Elegant, Sensitive, Artistic', sceneSlug: 'penthouse-window' },
  sage: { name: 'Sage', age: 27, traits: 'Calm, Wise, Grounded', sceneSlug: 'boutique-gym' },
  ember: { name: 'Ember', age: 23, traits: 'Bold, Adventurous, Passionate', sceneSlug: 'rooftop-lounge' },
  jasmine: { name: 'Jasmine', age: 22, traits: 'Sweet, Clumsy, Warm', sceneSlug: 'moonlit-bedroom' },
  morgana: { name: 'Morgana', age: 28, traits: 'Clever, Mysterious, Confident', sceneSlug: 'infinity-pool-night' },
  wren: { name: 'Wren', age: 21, traits: 'Creative, Free, Vulnerable', sceneSlug: 'penthouse-window' },
};

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

const SUPABASE_URL =
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_KEY =
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  if (!runpodClient.isConfigured) {
    return NextResponse.json(
      { error: 'RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID on Vercel.' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const character = CHARACTERS[slug];

  if (!character) {
    return NextResponse.json(
      { error: `Unknown slug: ${slug}. Valid: ${Object.keys(CHARACTERS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    // 1) RunPod 生成
    const prompt = buildPrompt(character);
    const result = await runpodClient.generateAndUpload(
      { prompt, width: 768, height: 1024, num_inference_steps: 28, guidance_scale: 3.5 },
      `cards/${slug}`,
    );
    const generatedUrl = result[0];

    // 2) 移动到固定路径 cards/{slug}.png（用 service_role 重命名）
    // result[0] 是带签名 URL，提取 key
    const urlObj = new URL(generatedUrl);
    const pathParts = urlObj.pathname.split('/storage/v1/object/sign/');
    if (pathParts.length < 2 || !SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({
        status: 'partial',
        slug,
        url: generatedUrl,
        note: '生成成功但无法自动重命名 — 请到 Supabase Storage 手动把 cards/{ts}_*_runpod_0.png 重命名为 cards/{slug}.png',
      });
    }

    // 提取源 key（去掉签名参数）
    const sourceSignedKey = pathParts[1].split('?')[0];
    // 解码（如果 URL encoded）
    const sourceKey = decodeURIComponent(sourceSignedKey);
    const targetKey = `cards/${slug}.png`;

    // 3) 复制到目标 key
    const copyRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/copy`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucketId: 'portraits',
          sourceKey,
          destinationKey: targetKey,
        }),
      },
    );

    if (!copyRes.ok) {
      return NextResponse.json({
        status: 'partial',
        slug,
        generatedKey: sourceKey,
        generatedUrl,
        note: '生成成功但复制到 cards/{slug}.png 失败 — 请到 Supabase Storage 手动重命名',
      });
    }

    // 4) 删除原 generated key
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/portraits/${sourceKey}`,
      {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );

    return NextResponse.json({
      status: 'ok',
      slug,
      key: targetKey,
      url: `${SUPABASE_URL}/storage/v1/object/public/portraits/${targetKey}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: 'failed', slug, error: e?.message ?? 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  // 返回所有 slugs 列表（前端 admin 页面循环调用时知道顺序）
  return NextResponse.json({
    slugs: Object.keys(CHARACTERS),
    total: Object.keys(CHARACTERS).length,
    endpoint: 'POST /api/admin/generate-cards with body { slug: string }',
  });
}