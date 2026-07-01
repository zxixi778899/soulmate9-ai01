import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { createCharacterCardPNG, type ParsedCharacterCard } from '@/lib/sillytavern/png-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/girlfriends/[id]/export
 * Export a girlfriend as a SillyTavern-compatible PNG character card
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Fetch girlfriend data
  const { data: gf, error } = await client
    .from('girlfriends')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !gf) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Build character card data
  const card: Omit<ParsedCharacterCard, 'version' | 'raw'> = {
    name: gf.name,
    description: gf.backstory || gf.short_description || '',
    personality: gf.personality || '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    system_prompt: '',
    tags: gf.tags || [],
  };

  const pngBuffer = createCharacterCardPNG(card);
  const blob = new Blob([pngBuffer as BlobPart], { type: 'image/png' });

  // Return as file download
  const filename = `${gf.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
  return new NextResponse(blob, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}