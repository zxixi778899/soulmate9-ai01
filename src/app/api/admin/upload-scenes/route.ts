import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

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

// 允许的 bgDir 白名单根目录。POST 传入的 bgDir 必须 resolve 到以下任一前缀下，
// 防止路径穿越（用户控制 bgDir → readFile /etc/...）。
const ALLOWED_BG_ROOTS = [
  '/sessions/peaceful-confident-dijkstra/mnt/runpod-handler/backgrounds',
  '/var/tmp/backgrounds',
  process.env.UPLOAD_SCENES_BG_DIR || '',
].filter(Boolean);

const SCENES = [
  'moonlit-bedroom',
  'infinity-pool-night',
  'boutique-gym',
  'rooftop-lounge',
  'onsen-spa',
  'penthouse-window',
];

const UPLOAD_SCENES_LIMIT = { maxRequests: 20, windowMs: 60 * 60 * 1000 }; // 20/h/admin

function isPathInside(child: string, parent: string): boolean {
  // 防止 /foo/barbaz 误判为 /foo/bar 子路径：标准化后必须含分隔符
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isAllowedBgDir(bgDir: string): boolean {
  const abs = path.resolve(bgDir);
  return ALLOWED_BG_ROOTS.some((root) => isPathInside(abs, path.resolve(root)));
}

export async function POST(req: NextRequest) {
  // 双层防御：仅 admin+ 可访问
  const guard = await requireAdmin(req, 'admin');
  if (guard.error) return guard.error;

  // 限流：防脚本批量上传
  const rl = await checkRateLimitAsync(`upload-scenes:${guard.user!.id}`, UPLOAD_SCENES_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many upload requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, UPLOAD_SCENES_LIMIT) },
    );
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'SUPABASE env not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedBgDir: string = typeof body.bgDir === 'string' ? body.bgDir : ALLOWED_BG_ROOTS[0] || '';
  // 路径白名单校验：把 bgDir resolve 为绝对路径，验证必须落在 ALLOWED_BG_ROOTS 任一根目录下
  if (!requestedBgDir || !isAllowedBgDir(requestedBgDir)) {
    return NextResponse.json(
      { error: 'bgDir not allowed', allowed_roots: ALLOWED_BG_ROOTS },
      { status: 400 },
    );
  }
  const bgDir = requestedBgDir;
  const requested = Array.isArray(body.scenes) && body.scenes.length ? body.scenes : SCENES;

  const results: any[] = [];
  for (const name of requested) {
    // 二次防穿越：场景名只允许 kebab-case（a-z0-9-）
    if (typeof name !== 'string' || !/^[a-z0-9-]{1,64}$/.test(name)) {
      results.push({ name, ok: false, error: 'invalid scene name' });
      continue;
    }
    const localPath = path.resolve(path.join(bgDir, `${name}.png`));
    // 双重校验：单文件路径仍必须在 bgDir 下
    if (!isPathInside(localPath, path.resolve(bgDir))) {
      results.push({ name, ok: false, error: 'path traversal blocked' });
      continue;
    }
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

export async function GET(req: NextRequest) {
  // 同样加 admin 守卫（之前 GET 也是裸的）
  const guard = await requireAdmin(req, 'admin');
  if (guard.error) return guard.error;

  return NextResponse.json({
    info: 'POST { bgDir?, scenes? } to upload backgrounds',
    allowed_bg_roots: ALLOWED_BG_ROOTS,
    scenes: SCENES,
  });
}