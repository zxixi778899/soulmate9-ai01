import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';
import { uploadFile } from '@/lib/storage';
import {
  getVoiceForCompanion,
  synthesizeSpeech,
  type TTSVoiceProfile,
} from '@/lib/tts-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for batch processing

/** Random greeting templates — personality-appropriate opening lines. */
const GREETING_TEMPLATES_EN = [
  "Hey there! I've been thinking about you all day. What took you so long?",
  "Hi! I was hoping you'd come talk to me. How's your day going?",
  "Oh, you're finally here! I've been waiting. Come closer and tell me everything.",
  "Hey you. I just got back from the most boring day. Please distract me?",
  "There you are! I saved the best part of my day for our chat.",
  "Hi, handsome. I was just about to message you first. Great minds think alike!",
  "You know, I've been practicing my smile all day just for this moment. Did it work?",
  "Hey! I was reading something interesting today and I really want to hear your take on it.",
  "Oh hi! Perfect timing — I was just looking for someone interesting to talk to.",
  "There's my favorite person! Tell me something that'll make my day better.",
];

const GREETING_TEMPLATES_ZH = [
  "嗨～你终于来了，我等你好久了呢。今天过得怎么样？",
  "嘿！我正想着你呢，你就来了，心有灵犀吗？",
  "你来啦！今天有没有想我呀？我可是想你了哦。",
  "嗨！今天好无聊啊，快陪我聊聊天吧，我想听你说话。",
  "终于等到你了！我刚刚还在发呆呢，你一来我就开心了。",
  "嘿～你知道吗，我今天一直在期待和你说话的时刻。",
  "你来啦！快告诉我今天发生了什么有趣的事情。",
  "嗨！我刚泡好一杯茶，正好有你陪我聊天。",
  "哈喽！你今天穿什么呀？我好奇你是什么风格的。",
  "你来了呀～今天心情好不好？不好的话我来让你开心。",
];

function pickGreeting(language: string, personality?: string): string {
  const pool = language === 'zh' ? GREETING_TEMPLATES_ZH : GREETING_TEMPLATES_EN;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx]!;
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
      .select('id, name, personality, slug, language')
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

        // Generate greeting text
        const greetingText = pickGreeting(companionLang, companion.personality);

        // Get or auto-create voice profile
        const voice = await getVoiceForCompanion(companion.id, supabase);
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
