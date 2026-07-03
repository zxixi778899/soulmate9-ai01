import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.SUPABASE_URL_FOR_REFRESH ||
  process.env.COZE_SUPABASE_URL ||
  '';
const SUPABASE_KEY =
  process.env.SUPABASE_KEY_FOR_REFRESH ||
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

// Linux sandbox path (where scripts write when run from this session)
const SANDBOX_BG_DIR = '/sessions/peaceful-confident-dijkstra/mnt/runpod-handler/backgrounds';

const SCENES = [
  'moonlit-bedroom',
  'infinity-pool-night',
  'boutique-gym',
  'rooftop-lounge',
  'onsen-spa',
  'penthouse-window',
];

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'SUPABASE env not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const bgDir: string = body.bgDir || SANDBOX_BG_DIR;
  const requested = Array.isArray(body.scenes) && body.scenes.length ? body.scenes : SCENES;

  const results: any[] = [];
  for (const name of requested) {
    const localPath = path.join(bgDir, `${name}.png`);
    if (!existsSync(localPath)) {
      results.push({ name, ok: false, error: `file missing: ${localPath}` });
      continue;
    }
    try {
      const buf = await readFile(localPath);
      const url = `${SUPABASE_URL}/storage/v1/object/portraits/scenes/${name}.png`;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
          'Content-Type': 'image/png',
          'x-upsert': 'true',
        },
        body: buf,
      });
      const respBody = await r.text();
      results.push({
        name,
        ok: r.ok,
        status: r.status,
        public_url: `${SUPABASE_URL}/storage/v1/object/public/portraits/scenes/${name}.png`,
        body: respBody.slice(0, 200),
      });
    } catch (e: any) {
      results.push({ name, ok: false, error: e?.message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ bgDir, ok, total: results.length, results });
}

export async function GET() {
  return NextResponse.json({
    info: 'POST { bgDir?, scenes? } to upload backgrounds',
    default_bgDir: SANDBOX_BG_DIR,
    scenes: SCENES,
  });
}