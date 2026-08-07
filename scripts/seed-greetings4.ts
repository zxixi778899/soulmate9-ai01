/**
 * 为所有伴侣补齐符合角色的开场白（中英双语文本），写入 character_card.greeting。
 * Usage: node node_modules/tsx/dist/cli.mjs scripts/seed-greetings4.ts
 */
import fs from 'node:fs';
import { buildCompanionGreeting } from '@/lib/companion-greeting';

async function main() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const get = (key: string): string | null => {
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };

  const BASE = get('COZE_SUPABASE_URL')!;
  const KEY = get('COZE_SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const listRes = await fetch(`${BASE}/rest/v1/girlfriends?select=id,name,gender,relationship,occupation,personality,age,character_card&limit=1000`, { headers });
  const girls = await listRes.json() as Array<Record<string, unknown>>;
  console.log('total:', girls.length);

  let updated = 0;
  let skipped = 0;
  for (const gf of girls) {
    const card = (gf.character_card && typeof gf.character_card === 'object')
      ? gf.character_card as Record<string, unknown>
      : {};
    const oldGreeting = card.greeting && typeof card.greeting === 'object'
      ? card.greeting as Record<string, unknown>
      : null;
    const greeting = buildCompanionGreeting({
      name: String(gf.name || ''),
      age: gf.age != null ? Number(gf.age) : undefined,
      gender: String(gf.gender || ''),
      relationship: String(gf.relationship || ''),
      occupation: String(gf.occupation || ''),
      personality: String(gf.personality || ''),
    });
    const next = {
      text_zh: greeting.text_zh,
      text_en: greeting.text_en,
      audio_url: oldGreeting && typeof oldGreeting.audio_url === 'string' ? oldGreeting.audio_url : null,
    };
    const res = await fetch(`${BASE}/rest/v1/girlfriends?id=eq.${gf.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ character_card: { ...card, greeting: next }, updated_at: new Date().toISOString() }),
    });
    if (res.ok) {
      updated++;
    } else {
      skipped++;
      console.log('PATCH fail', gf.id, res.status, (await res.text()).slice(0, 120));
    }
  }

  console.log('updated:', updated, '| skipped:', skipped);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
