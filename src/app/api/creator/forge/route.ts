import { NextRequest, NextResponse } from 'next/server';
import { loadCharacterParts } from '@/lib/character-parts-loader';
import { forgeMany, type PartGender } from '@/lib/character-parts';

/**
 * Forge fresh persona combinations from the parts pool (千人千面).
 *
 * GET /api/creator/forge?count=8&gender=Female&seed=xxx
 * Every call with a fresh seed yields a brand-new batch of combinations —
 * no two users need to see the same preset. Each combination carries its
 * genome, identity, traits and greeting; the portrait generated from it
 * becomes the companion's identity reference for later album photos.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const count = Math.min(12, Math.max(1, Number(searchParams.get('count')) || 8));
  const genderRaw = String(searchParams.get('gender') || 'Female');
  const gender: PartGender =
    genderRaw === 'Male' || genderRaw === 'Transgender' ? genderRaw : 'Female';
  const seed = String(searchParams.get('seed') || '') || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

  const { parts, source } = await loadCharacterParts();
  const combinations = forgeMany({ parts, count, gender, seed });

  return NextResponse.json(
    { combinations, seed, source },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
