/**
 * 为已生成开场白文本的伴侣批量合成语音（保留各自音色），写入 character_card.greeting.audio_url。
 * 依赖 RUNPOD_TTS_ENDPOINT_ID / RUNPOD_TTS_API_KEY（缺省回落 RUNPOD_API_KEY）。
 * TTS worker 冷启动时任务会排队，可多次运行：已完成的不重复合成。
 *
 * Usage: node node_modules/tsx/dist/cli.mjs scripts/synth-greetings.ts [--limit 20] [--dry]
 */
import fs from 'node:fs';
import { synthesizeSpeech } from '@/lib/tts-service';
import { uploadFile } from '@/lib/storage';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 0 : 0;
const DRY = args.includes('--dry');

async function main() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const get = (key: string): string | null => {
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  const BASE = get('COZE_SUPABASE_URL')!;
  const KEY = get('COZE_SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const listRes = await fetch(`${BASE}/rest/v1/girlfriends?select=id,name,character_card&limit=1000`, { headers });
  const girls = await listRes.json() as Array<Record<string, unknown>>;
  console.log('total:', girls.length, '| dry:', DRY);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const gf of girls) {
    if (LIMIT > 0 && done + skipped + failed >= LIMIT) break;
    const id = String(gf.id);
    const card = (gf.character_card && typeof gf.character_card === 'object')
      ? gf.character_card as Record<string, unknown>
      : {};
    const greeting = card.greeting && typeof card.greeting === 'object'
      ? card.greeting as Record<string, unknown>
      : null;
    if (!greeting) { skipped++; continue; }
    if (greeting.audio_url) { skipped++; continue; }
    const textZh = String(greeting.text_zh || '').trim();
    const textEn = String(greeting.text_en || '').trim();
    const text = textZh || textEn;
    if (!text) { skipped++; continue; }

    const name = String(gf.name || 'companion');
    if (DRY) {
      console.log('[dry]', name, '->', text.slice(0, 40));
      done++;
      continue;
    }

    try {
      const tts = await synthesizeSpeech(text, {
        id: `vp_${id}`,
        companion_id: id,
        name,
        engine: 'fish-speech',
        language: textZh ? 'zh' : 'en',
      });
      const buffer = Buffer.from(tts.audio_base64, 'base64');
      const key = `voices/greetings/${id}.opus`;
      const { url } = await uploadFile(buffer, key, 'audio/ogg', '');
      const next = { ...greeting, audio_url: url };
      const res = await fetch(`${BASE}/rest/v1/girlfriends?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ character_card: { ...card, greeting: next }, updated_at: new Date().toISOString() }),
      });
      if (res.ok) {
        done++;
        console.log('OK', name, tts.duration_ms + 'ms', url.slice(0, 80));
      } else {
        failed++;
        console.log('PATCH fail', name, res.status, (await res.text()).slice(0, 100));
      }
    } catch (e) {
      failed++;
      console.log('TTS fail', name, e instanceof Error ? e.message.slice(0, 140) : String(e));
    }
  }
  console.log('done:', done, '| skipped:', skipped, '| failed:', failed);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
