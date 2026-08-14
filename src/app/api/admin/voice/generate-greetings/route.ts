﻿import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { uploadFile } from '@/lib/storage';
import {
  getVoiceForCompanionV2,
  synthesizeSpeech,
} from '@/lib/tts-service';
import { generateGreetingLLM } from '@/lib/greeting-generator';
import { buildCompanionGreeting } from '@/lib/companion-greeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for batch processing

/**
 * Generate a personalized greeting for a companion.
 * 1. Try LLM (personalized by profile + intimacy)
 * 2. Fallback to rule-based generation
 */
async function generateGreetingForCompanion(
  companion: {
    id: string;
    name: string;
    personality?: string;
    backstory?: string;
    appearance_race?: string;
    appearance_hair?: string;
    appearance_hair_color?: string;
    appearance_eyes?: string;
    appearance_body?: string;
    appearance_style?: string;
    character_card?: Record<string, unknown>;
  },
  companionLang: 'zh' | 'en',
): Promise<{ text: string; source: string }> {
  try {
    const card =
      companion.character_card && typeof companion.character_card === 'object'
        ? (companion.character_card as Record<string, unknown>)
        : {};
    const hobbies = Array.isArray(card.hobbies) ? card.hobbies.map(String) : [];

    // Try LLM generation
    const greeting = await generateGreetingLLM({
      name: companion.name,
      personality: companion.personality,
      backstory: companion.backstory,
      occupation: card.occupation ? String(card.occupation) : undefined,
      hobbies,
      appearance: {
        race: companion.appearance_race,
        hair: companion.appearance_hair,
        hair_color: companion.appearance_hair_color,
        eyes: companion.appearance_eyes,
        body: companion.appearance_body,
        style: companion.appearance_style,
      },
      locale: companionLang,
    });

    if (greeting) {
      const text = companionLang === 'zh' ? greeting.text_zh : greeting.text_en;
      if (text) return { text, source: 'llm' };
    }
  } catch (err) {
    logger.warn('greeting LLM failed, falling back to rule-based', {
      err: err instanceof Error ? err.message : String(err),
      companion_id: companion.id,
    });
  }

  // Fallback: rule-based
  const ruleBased = buildCompanionGreeting({
    name: companion.name,
    personality: companion.personality,
  });
  return {
    text: companionLang === 'zh' ? ruleBased.text_zh : ruleBased.text_en,
    source: 'rule',
  };
}

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 50, 200);
    const language = String(body.language || 'auto');
    const forceRegenerate = body.force === true;

    // Get all approved, public companions
    const { data: companions, error } = await supabase
      .from('girlfriends')
      .select(
        'id, name, personality, backstory, slug, language, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, character_card',
      )
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!companions?.length) {
      return NextResponse.json({ success: true, generated: 0, message: 'No approved companions found' });
    }

    const results: Array<{ id: string; name: string; status: string; greeting?: string; audio_url?: string; error?: string }> = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const companion of companions) {
      try {
        // Skip if greeting audio already exists (unless force regenerate)
        const { data: existing } = await supabase
          .from('girlfriends')
          .select('greeting_audio, greeting_text')
          .eq('id', companion.id)
          .single();

        if (!forceRegenerate && existing?.greeting_audio) {
          skipped++;
          results.push({ id: companion.id, name: companion.name, status: 'skipped' });
          continue;
        }

        // Determine language for this companion
        const companionLang = language === 'auto'
          ? (companion.language === 'zh' ? 'zh' : 'en')
          : language;
        const companionLangTyped: 'zh' | 'en' = companionLang === 'zh' ? 'zh' : 'en';

        // Generate personalized greeting (LLM with rule-based fallback)
        const { text: greetingText, source: greetingSource } =
          await generateGreetingForCompanion(
            companion as Parameters<typeof generateGreetingForCompanion>[0],
            companionLangTyped,
          );

        // Get personality-aware voice profile (auto-assigns the archetype-matched voice)
        const card = companion.character_card && typeof companion.character_card === 'object'
          ? (companion.character_card as Record<string, unknown>)
          : {};
        const voice = await getVoiceForCompanionV2(
          {
            id: companion.id,
            name: companion.name,
            personality: companion.personality || '',
            backstory: companion.backstory || '',
            language: companion.language || 'en',
            occupation: String(card.occupation || ''),
            voice: String(card.voice || ''),
          },
          supabase,
        );
        if (!voice) {
          failed++;
          results.push({ id: companion.id, name: companion.name, status: 'failed', error: 'No voice profile' });
          continue;
        }

        // Synthesize speech
        const tts = await synthesizeSpeech(greetingText, voice);
        if (!tts?.audio_base64) {
          failed++;
          results.push({ id: companion.id, name: companion.name, status: 'failed', error: 'No audio output' });
          continue;
        }

        // Upload to Supabase Storage
        const buffer = Buffer.from(tts.audio_base64, 'base64');
        const key = `greetings/${companion.id}/${Date.now()}.${tts.format || 'mp3'}`;
        const { url } = await uploadFile(buffer, key, `audio/${tts.format || 'mpeg'}`, '');

        // Update the companion record
        await supabase
          .from('girlfriends')
          .update({
            greeting_audio: url,
            greeting_text: greetingText,
            updated_at: new Date().toISOString(),
          })
          .eq('id', companion.id);

        generated++;
        results.push({
          id: companion.id,
          name: companion.name,
          status: 'generated',
          greeting: greetingText,
          audio_url: url,
        });

        logger.info('[admin/greetings] generated', {
          companion_id: companion.id,
          name: companion.name,
          voice: voice.voice_id,
          bytes: buffer.length,
          greeting_source: greetingSource,
        });

        // Rate limit: small delay between generations to avoid overwhelming Edge TTS
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('[admin/greetings] error', {
          companion_id: companion.id,
          err: errMsg,
        });
        results.push({ id: companion.id, name: companion.name, status: 'failed', error: errMsg });
      }
    }

    return NextResponse.json({
      success: true,
      total: companions.length,
      generated,
      skipped,
      failed,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[admin/greetings] fatal error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
