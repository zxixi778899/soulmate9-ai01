import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { uploadFile } from '@/lib/storage';
import { generateVoicePromo } from '@/lib/voice-promo-generator';
import { getArchetypeForPersonality } from '@/lib/voice-personality';
import {
  getVoiceForCompanionV2,
  listVoiceProfiles,
  saveVoiceProfile,
  synthesizeSpeech,
  type TTSVoiceProfile,
  type CompanionVoiceInput,
} from '@/lib/tts-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for batch processing

/**
 * POST /api/admin/voice/generate-promos
 *
 * Batch-generate voice promos for all approved companions.
 * Each promo is a self-introduction + hook, synthesized with the
 * companion's personality-aware voice (auto-assigned if needed).
 *
 * Body (optional):
 *   limit: number (default 50, max 200)
 *   language: 'zh' | 'en' | 'auto' (default: auto — per companion)
 *   force: boolean (default false — re-generate even if promo exists)
 *   companion_id: string (optional — single companion only)
 */
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 50, 200);
    const language = String(body.language || 'auto');
    const forceRegenerate = body.force === true;
    const singleCompanionId = body.companion_id ? String(body.companion_id).trim() : null;

    // Build query
    let query = supabase
      .from('girlfriends')
      .select(
        'id, name, personality, backstory, slug, language, occupation, hobbies, character_card',
      )
      .eq('is_public', true)
      .eq('review_status', 'approved');

    if (singleCompanionId) {
      query = query.eq('id', singleCompanionId);
    }

    const { data: companions, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!companions?.length) {
      return NextResponse.json({
        success: true,
        generated: 0,
        message: 'No approved companions found',
      });
    }

    const results: Array<{
      id: string;
      name: string;
      status: string;
      promo_text?: string;
      audio_url?: string;
      archetype?: string;
      voice?: string;
      error?: string;
    }> = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const companion of companions) {
      try {
        // Check if promo already exists (unless force regenerate)
        const existingProfiles = await listVoiceProfiles(supabase);
        const existingProfile = existingProfiles.find(
          (p) => p.companion_id === companion.id,
        );

        if (
          !forceRegenerate &&
          existingProfile?.voice_promo_url &&
          existingProfile?.voice_promo_text
        ) {
          skipped++;
          results.push({
            id: companion.id,
            name: companion.name,
            status: 'skipped',
            promo_text: existingProfile.voice_promo_text,
            audio_url: existingProfile.voice_promo_url,
          });
          continue;
        }

        // Extract companion data for voice assignment
        const card =
          companion.character_card &&
          typeof companion.character_card === 'object'
            ? (companion.character_card as Record<string, unknown>)
            : {};

        const hobbies = Array.isArray(card.hobbies)
          ? card.hobbies.map(String)
          : [];

        // Determine language for this companion
        const companionLang =
          language === 'auto'
            ? companion.language === 'zh'
              ? 'zh'
              : 'en'
            : language;
        const companionLangTyped: 'zh' | 'en' =
          companionLang === 'zh' ? 'zh' : 'en';

        // 1. Assign personality-aware voice (or get existing)
        const voiceInput: CompanionVoiceInput = {
          id: companion.id,
          name: companion.name,
          personality: companion.personality || '',
          backstory: companion.backstory || '',
          language: companion.language || 'en',
          occupation: String(card.occupation || ''),
          voice: String(card.voice || ''),
        };

        const voice = await getVoiceForCompanionV2(voiceInput, supabase);
        if (!voice) {
          failed++;
          results.push({
            id: companion.id,
            name: companion.name,
            status: 'failed',
            error: 'No voice profile could be created',
          });
          continue;
        }

        // 2. Determine archetype for promo generation
        const archetype = getArchetypeForPersonality(
          companion.personality || '',
          companion.backstory || '',
          String(card.occupation || ''),
        );

        // 3. Generate voice promo text
        const promo = await generateVoicePromo(
          {
            name: companion.name,
            personality: companion.personality || '',
            occupation: String(card.occupation || ''),
            backstory: companion.backstory || '',
            hobbies,
            locale: companionLangTyped,
          },
          archetype.id,
        );

        // 4. Synthesize speech
        const tts = await synthesizeSpeech(promo.text, {
          ...voice,
          language: companionLangTyped,
        });

        if (!tts?.audio_base64) {
          failed++;
          results.push({
            id: companion.id,
            name: companion.name,
            status: 'failed',
            error: 'No audio output from synthesis',
          });
          continue;
        }

        // 5. Upload to Supabase Storage
        const buffer = Buffer.from(tts.audio_base64, 'base64');
        const key = `voice-promos/${companion.id}/${Date.now()}.${tts.format || 'mp3'}`;
        const { url: audioUrl } = await uploadFile(
          buffer,
          key,
          `audio/${tts.format || 'mpeg'}`,
          '',
        );

        // 6. Update voice profile with promo data
        const updatedProfile: TTSVoiceProfile = {
          ...voice,
          voice_promo_url: audioUrl,
          voice_promo_text: promo.text,
        };
        await saveVoiceProfile(updatedProfile, supabase);

        generated++;
        results.push({
          id: companion.id,
          name: companion.name,
          status: 'generated',
          promo_text: promo.text,
          audio_url: audioUrl,
          archetype: archetype.id,
          voice: voice.edge_voice || voice.voice_id,
        });

        logger.info('[admin/voice-promos] generated', {
          companion_id: companion.id,
          name: companion.name,
          archetype: archetype.id,
          voice: voice.edge_voice,
          promo_source: promo.source,
          bytes: buffer.length,
        });

        // Rate limit: small delay to avoid overwhelming Edge TTS
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('[admin/voice-promos] error', {
          companion_id: companion.id,
          err: errMsg,
        });
        results.push({
          id: companion.id,
          name: companion.name,
          status: 'failed',
          error: errMsg,
        });
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
    logger.error('[admin/voice-promos] fatal error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/admin/voice/generate-promos — preview what promos would look like
 * without actually synthesizing them. Useful for testing.
 */
export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const { searchParams } = new URL(req.url);
    const companionId = searchParams.get('companion_id');

    let query = supabase
      .from('girlfriends')
      .select('id, name, personality, backstory, slug, language, occupation, character_card')
      .eq('is_public', true)
      .eq('review_status', 'approved');

    if (companionId) {
      query = query.eq('id', companionId);
    }

    const { data: companions, error } = await query.limit(10);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const previews = companions.map((c) => {
      const card =
        c.character_card && typeof c.character_card === 'object'
          ? (c.character_card as Record<string, unknown>)
          : {};
      const archetype = getArchetypeForPersonality(
        c.personality || '',
        c.backstory || '',
        String(card.occupation || ''),
      );
      return {
        id: c.id,
        name: c.name,
        personality: c.personality?.slice(0, 100),
        archetype: archetype.id,
        archetype_label: archetype.label,
        voice: archetype.edge_voices,
        quality: archetype.quality,
      };
    });

    return NextResponse.json({
      total: previews.length,
      previews,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[admin/voice-promos] preview error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}