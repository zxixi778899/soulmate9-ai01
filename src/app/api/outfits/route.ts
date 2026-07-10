import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { OUTFIT_CATALOG } from '@/lib/outfit-catalog';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const tier = searchParams.get('tier');

    let result = [...OUTFIT_CATALOG];

    if (category) result = result.filter((o) => o.category === category);
    if (tier) result = result.filter((o) => o.tier === tier);

    return NextResponse.json({ outfits: result });
  } catch (error) {
    logger.error('[Outfits API] Error:', { data: error });
    return NextResponse.json({ error: 'Failed to fetch outfits' }, { status: 500 });
  }
}
