/**
 * Admin: Vercel compatible
 *
 * 
 *   POST /api/admin/generate-cards
 *   Body: { slug: string }  //  slug
 *
 * 
 *   -  RunPod +  30-60s
 *   - Vercel Pro 60s timeout Hobby 30s 
 *   -  POST  slug  storage cards/{slug}.png
 *   -  admin  14 
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { runpodClient } from '@/lib/runpod';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro 

//  RunPod  30 //superadmin
const GEN_CARD_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

//  page.tsx CHARACTERS 
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

  const rl = await checkRateLimitAsync(`admin-gen-card:${guard.user!.id}`, GEN_CARD_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many generate-card requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, GEN_CARD_LIMIT) },
    );
  }

  if (!runpodClient.isConfigured) {
    return NextResponse.json(
      { error: 'RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID on Vercel.' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  // { slug: 'luna' }
  // { slugs: ['luna', 'ruby', ...] } fetch
  //  route  1  Vercel 60s timeout
  //  slugs  admin UI  POST
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const character = CHARACTERS[slug];

  if (!character) {
    return NextResponse.json(
      { error: `Unknown slug: ${slug}. Valid: ${Object.keys(CHARACTERS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    // 1) RunPod 
    const prompt = buildPrompt(character);
    const result = await runpodClient.generateAndUpload(
      { prompt, width: 768, height: 1024, num_inference_steps: 28, guidance_scale: 3.5 },
      `cards/${slug}`,
    );
    const generatedUrl = result[0];

    // 2)  cards/{slug}.png service_role 
    // result[0]  URL key
    const urlObj = new URL(generatedUrl);
    const pathParts = urlObj.pathname.split('/storage/v1/object/sign/');
    if (pathParts.length < 2 || !SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({
        status: 'partial',
        slug,
        url: generatedUrl,
        note: '   Supabase Storage  cards/{ts}_*_runpod_0.png  cards/{slug}.png',
      });
    }

    //  key
    const sourceSignedKey = pathParts[1].split('?')[0];
    //  URL encoded
    const sourceKey = decodeURIComponent(sourceSignedKey);
    const targetKey = `cards/${slug}.png`;

    // 3)  key
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
        note: ' cards/{slug}.png    Supabase Storage ',
      });
    }

    // 4)  generated key
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
    logger.error('admin/generate-cards failed', { slug, err: e?.message });
    return NextResponse.json(
      { status: 'failed', slug, error: e?.message ?? 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  //  slugs  admin 
  return NextResponse.json({
    slugs: Object.keys(CHARACTERS),
    total: Object.keys(CHARACTERS).length,
    endpoint: 'POST /api/admin/generate-cards with body { slug: string }',
  });
}