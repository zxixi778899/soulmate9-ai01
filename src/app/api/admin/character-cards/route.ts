import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { parseCharacterCard } from '@/lib/sillytavern/png-parser';

export const runtime = 'nodejs';

/**
 * POST /api/admin/character-cards
 * Upload a SillyTavern PNG character card, parse it, and create a girlfriend
 * Expects multipart/form-data with file field "card"
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user, profile } = adminCheck;

  try {
    const formData = await request.formData();
    const file = formData.get('card') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded (field: card)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse the character card
    let card;
    try {
      card = parseCharacterCard(buffer);
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : 'Parse failed';
      let userMsg: string;
      if (msg.includes('No character data')) {
        userMsg = 'This PNG does not appear to be a valid SillyTavern character card. Please ensure you are uploading a .png file exported from SillyTavern or TavernAI with embedded character data.';
      } else if (msg.includes('missing required')) {
        userMsg = 'The character card data was found but appears incomplete. Please check that the card has at least a name field.';
      } else {
        userMsg = `Could not parse character card: ${msg}`;
      }
      return NextResponse.json({ error: userMsg }, { status: 400 });
    }

    // Map to girlfriend fields
    const baseSlug = card.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const uniqueSuffix = Date.now().toString(36);
    const slug = `${baseSlug}-${uniqueSuffix}`;

    // Create the girlfriend in the database
    const { data: gf, error: insertError } = await supabase
      .from('girlfriends')
      .insert({
        user_id: user.id,
        name: card.name,
        slug,
        personality: card.personality || 'Friendly and engaging',
        short_description: card.description?.slice(0, 200) || `A character named ${card.name}`,
        backstory: card.description || '',
        tags: card.tags?.length ? card.tags : ['imported'],
        avatar_url: null,
        portrait_url: null,
        is_public: false,
        review_status: 'draft',
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: `Failed to create girlfriend: ${insertError.message}` }, { status: 500 });
    }

    // If there's a first message, create it as a chat starter
    if (card.first_mes && gf) {
      // We'll store it in the character_card field or as a system note
      // Store the system prompt and first message in the backstory for now
      let enrichedBackstory = card.description || '';
      if (card.scenario) enrichedBackstory += `\n\nScenario: ${card.scenario}`;
      if (card.first_mes) enrichedBackstory += `\n\nFirst Message: ${card.first_mes}`;
      if (card.system_prompt) enrichedBackstory += `\n\nSystem: ${card.system_prompt}`;

      await supabase
        .from('girlfriends')
        .update({ backstory: enrichedBackstory })
        .eq('id', gf.id);
    }

    // Create initial intimacy score
    await supabase
      .from('intimacy_scores')
      .insert({
        user_id: user.id,
        girlfriend_id: gf.id,
        level: 1,
        score: 0,
      });

    return NextResponse.json({
      success: true,
      girlfriend: {
        id: gf.id,
        name: card.name,
        slug,
        version: card.version,
        tags: card.tags,
        hasFirstMessage: !!card.first_mes,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}