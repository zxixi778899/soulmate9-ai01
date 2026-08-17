/**
 * POST /api/friend/add — Generate opening message after adding a companion.
 *
 * Called by the frontend immediately after a successful POST /api/friends.
 * Generates a soul-driven opening message using the Opening Message Engine,
 * saves it to chat_messages, and returns it for immediate display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { generateOpeningMessage } from '@/lib/opening-message-engine';
import { resolveReplyLocale } from '@/lib/chat-locale';
import type { PresetSoul } from '@/lib/preset-souls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { girlfriend_id } = body as { girlfriend_id?: string };
  if (!girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Check friendship exists
  const { data: friendRow } = await client
    .from('user_friends')
    .select('id, opening_sent')
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriend_id)
    .maybeSingle();

  if (!friendRow) {
    return NextResponse.json({ error: 'Friendship not found' }, { status: 404 });
  }

  // Skip if opening already sent
  if (friendRow.opening_sent) {
    // Return the existing opening message
    const { data: existingMsg } = await client
      .from('chat_messages')
      .select('content')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriend_id)
      .eq('is_proactive', true)
      .order('created_at', { ascending: true })
      .limit(1);

    return NextResponse.json({
      opening_message: existingMsg?.[0]?.content || 'Hey!',
      already_sent: true,
    });
  }

  // Load girlfriend data
  const { data: gf } = await client
    .from('girlfriends')
    .select('name, personality, character_card, occupation, hobbies, backstory')
    .eq('id', girlfriend_id)
    .maybeSingle();

  if (!gf) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Extract soul from character_card
  const cardRaw = (gf as { character_card?: unknown }).character_card;
  const card = cardRaw && typeof cardRaw === 'object' ? (cardRaw as Record<string, unknown>) : null;
  const soulRaw = card?.soul;
  const soul = (soulRaw && typeof soulRaw === 'object' ? soulRaw : null) as PresetSoul | null;

  // Determine locale from recent chat or user profile
  const { data: profile } = await client
    .from('profiles')
    .select('preferred_locale, locale')
    .eq('user_id', user.id)
    .maybeSingle();

  const locale = resolveReplyLocale({
    message: '',
    autoDetect: false,
    contextMessages: [],
    defaultLocale: String(
      (profile as { preferred_locale?: string } | null)?.preferred_locale
      || (profile as { locale?: string } | null)?.locale
      || 'en',
    ),
  });

  // Parse personality tags
  const personalityRaw = String((gf as { personality?: string }).personality || '');
  const personalityTags = personalityRaw.split(',').map((t) => t.trim()).filter(Boolean);

  // Generate opening message
  const openingMessage = await generateOpeningMessage({
    name: String(gf.name || 'Your companion'),
    occupation: String((gf as { occupation?: string }).occupation || ''),
    hobbies: String((gf as { hobbies?: string }).hobbies || ''),
    backstory: String((gf as { backstory?: string }).backstory || ''),
    personalityTags,
    soul,
    locale,
  });

  // Save opening message to chat
  await client.from('chat_messages').insert({
    user_id: user.id,
    girlfriend_id,
    role: 'assistant',
    content: openingMessage,
    is_proactive: true,
    metadata: {
      is_opening: true,
      source: 'friend_add',
    },
  });

  // Mark opening as sent
  await client
    .from('user_friends')
    .update({ opening_sent: true, opening_sent_at: new Date().toISOString() })
    .eq('id', friendRow.id);

  // Initialize companion_profiles_ext if not exists
  try {
    const { data: existingProfile } = await client
      .from('companion_profiles_ext')
      .select('id')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriend_id)
      .maybeSingle();

    if (!existingProfile) {
      await client.from('companion_profiles_ext').insert({
        user_id: user.id,
        girlfriend_id,
        lifecycle_phase: 'first_add',
        opening_message_sent: true,
        user_profile: { _fields_collected: [] },
      });
    } else {
      await client
        .from('companion_profiles_ext')
        .update({ lifecycle_phase: 'first_add', opening_message_sent: true })
        .eq('id', existingProfile.id);
    }
  } catch (err) {
    logger.warn('[friend/add] profile ext init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('[friend/add] opening message generated', {
    userId: user.id,
    girlfriendId: girlfriend_id,
    locale,
  });

  return NextResponse.json({
    opening_message: openingMessage,
    already_sent: false,
  });
}
