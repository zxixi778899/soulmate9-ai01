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
import { CHARACTERS as MARKETING_CHARACTERS } from '@/data/marketing-characters';
import {
  resolveBucketName,
  extractKeyFromUrl,
  deleteFile,
  toPublicUrl,
} from '@/lib/storage';
import {
  assembleGirlfriendFromRow,
  GIRLFRIEND_NEGATIVE_FLUX,
  type GirlfriendSceneId,
} from '@/lib/prompt/girlfriend';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro 

//  RunPod  30 //superadmin
const GEN_CARD_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

//  Build a slug → character index from the single source of truth
// (src/data/marketing-characters.ts → landing-page gallery + this route share it).
const BY_SLUG = new Map(MARKETING_CHARACTERS.map((c) => [c.slug, c]));
const ALL_SLUGS = MARKETING_CHARACTERS.map((c) => c.slug);

//  sceneSlug → scene description kept local to this route for now.
// The DSL in src/lib/prompt/girlfriend.ts has its own scene recipes —
// we map our 6 marketing scene slugs to DSL scenes in Phase C.

const SUPABASE_URL =
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_KEY =
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

//  marketing sceneSlug  (6)  DSL  (12)
// : , , , ,
const SCENE_SLUG_TO_DSL: Record<string, GirlfriendSceneId> = {
  'moonlit-bedroom': 'pink_bedroom',
  'infinity-pool-night': 'city_apartment',
  'boutique-gym': 'studio_clean',
  'rooftop-lounge': 'rooftop_night',
  'onsen-spa': 'pink_bedroom',
  'penthouse-window': 'city_apartment',
};

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
  const marketingChar = BY_SLUG.get(slug);
  // Convert marketing-character record (traits: string[]) to the legacy flat shape
  // (traits: comma-joined string) so the rest of the route — buildPrompt,
  // assemble call, rename block — can stay untouched in this phase.
  const character = marketingChar
    ? {
        name: marketingChar.name,
        age: marketingChar.age,
        traits: marketingChar.traits.join(', '),
        sceneSlug: marketingChar.sceneSlug,
      }
    : undefined;

  if (!character) {
    return NextResponse.json(
      { error: `Unknown slug: ${slug}. Valid: ${ALL_SLUGS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    // 1) Build prompt via the FLUX DSL (subject → pose → outfit → env → light → quality).
    // The legacy buildPrompt is no longer used — see PR description for reasoning.
    const dslSceneId = SCENE_SLUG_TO_DSL[character.sceneSlug] ?? 'pink_bedroom';
    // Build a row in the shape subjectFromGirlfriendRow() expects. We supply
    // name + personality (from traits) + sceneId; the rest defaults.
    const dslRow = {
      name: character.name,
      age: character.age,
      personality: character.traits,
      sceneId: dslSceneId,
    };
    const assembled = assembleGirlfriendFromRow(dslRow, '', { sceneId: dslSceneId });
    const prompt = assembled.positive;
    // Override the DSL default to the FLUX-safe short negative; flips with marketing
    // character, prevents the long-SD-style collapse.
    const negative = assembled.negative || GIRLFRIEND_NEGATIVE_FLUX;

    const result = await runpodClient.generateAndUpload(
      { prompt, negative_prompt: negative, width: 768, height: 1024, num_inference_steps: 28, guidance_scale: 3.5 },
      `cards/${slug}`,
    );
    const generatedUrl = result[0];

    // 2) Extract the auto-generated storage key. extractKeyFromUrl handles both
    // /object/public/ and /object/sign/ URL shapes; previously this route
    // hard-split on /object/sign/ which never matched the public URL returned
    // by uploadFile — so the rename never ran.
    const sourceKey = extractKeyFromUrl(generatedUrl);
    if (!sourceKey) {
      return NextResponse.json({
        status: 'partial',
        slug,
        url: generatedUrl,
        note: 'Could not parse storage key from generatedUrl — check uploadFile return shape.',
      });
    }
    const targetKey = `cards/${slug}.png`;

    // 3) Copy to canonical cards/{slug}.png via Supabase Storage REST.
    const bucket = resolveBucketName();
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json({
        status: 'partial',
        slug,
        generatedKey: sourceKey,
        generatedUrl,
        note: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — cannot copy/rename.',
      });
    }
    const copyRes = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: bucket,
        sourceKey,
        destinationKey: targetKey,
      }),
    });
    if (!copyRes.ok) {
      return NextResponse.json({
        status: 'partial',
        slug,
        generatedKey: sourceKey,
        generatedUrl,
        note: `Storage copy failed (${copyRes.status}) — rename cards/{slug}.png manually.`,
      });
    }

    // 4) Delete the original (ts_rand_) key via storage helper.
    await deleteFile(sourceKey).catch((e) =>
      logger.warn('admin/generate-cards: cleanup deleteFile failed', { key: sourceKey, err: e?.message }),
    );

    // 5) Final public URL via toPublicUrl (honors SUPABASE_STORAGE_BUCKET).
    return NextResponse.json({
      status: 'ok',
      slug,
      key: targetKey,
      url: toPublicUrl(targetKey),
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
    slugs: ALL_SLUGS,
    total: ALL_SLUGS.length,
    endpoint: 'POST /api/admin/generate-cards with body { slug: string }',
  });
}