import { NextRequest, NextResponse } from 'next/server';
import { loadCharacterParts } from '@/lib/character-parts-loader';
import {
  PART_CATEGORY_LABELS,
  PART_CATEGORY_ORDER,
  partsByCategory,
  type CharacterPart,
  type PartCategory,
} from '@/lib/character-parts';

/**
 * Character parts pool (零件库). The creator forge combines one part per
 * category into a unique persona — 千人千面. DB-first with typed fallback.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gender = String(searchParams.get('gender') || '');

  const { parts, source } = await loadCharacterParts();
  const filtered =
    gender === 'Male' || gender === 'Transgender' || gender === 'Female'
      ? parts.filter((p) => p.genders.includes(gender))
      : parts;
  const grouped = partsByCategory(filtered);
  const categories: Record<string, CharacterPart[]> = {};
  for (const category of PART_CATEGORY_ORDER) {
    categories[category] = grouped[category as PartCategory] || [];
  }

  return NextResponse.json(
    { categories, labels: PART_CATEGORY_LABELS, order: PART_CATEGORY_ORDER, source },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
