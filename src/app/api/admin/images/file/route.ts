import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  extractKeyFromUrl,
  resolveBucketName,
  resolveImageUrl,
} from '@/lib/storage';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/images/file?url=... | ?key=...
 * Streams image bytes for admin preview (avoids private-bucket / CORS issues).
 */
export async function GET(req: NextRequest) {
  // <img> cannot send x-session header — also accept ?token= for same-origin preview
  const { searchParams } = new URL(req.url);
  const tokenQ = searchParams.get('token') || '';
  let authReq: Request = req;
  if (tokenQ && !req.headers.get('x-session')) {
    const headers = new Headers(req.headers);
    headers.set('x-session', tokenQ);
    authReq = new Request(req.url, { method: 'GET', headers });
  }

  const guard = await requireAdmin(authReq);
  if (guard.error) return guard.error;

  const rawUrl = searchParams.get('url') || '';
  const rawKey = searchParams.get('key') || '';

  let key = rawKey.trim();
  if (!key && rawUrl) {
    if (rawUrl.startsWith('data:image/')) {
      // pass-through data URL body
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(rawUrl);
      if (!m) {
        return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
      }
      const buf = Buffer.from(m[2], 'base64');
      return new NextResponse(buf, {
        headers: {
          'Content-Type': m[1],
          'Cache-Control': 'private, max-age=300',
        },
      });
    }
    key = extractKeyFromUrl(rawUrl) || '';
  }

  if (!key && rawUrl.startsWith('http')) {
    // Remote fetch as admin proxy
    try {
      const res = await fetch(rawUrl, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Upstream ${res.status}` },
          { status: 502 },
        );
      }
      const ct = res.headers.get('content-type') || 'image/png';
      if (!ct.startsWith('image/')) {
        return NextResponse.json(
          { error: `Not an image: ${ct}` },
          { status: 415 },
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return new NextResponse(buf, {
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'private, max-age=300',
        },
      });
    } catch (e) {
      logger.error('[admin/images/file] fetch failed', { e });
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    }
  }

  if (!key) {
    return NextResponse.json({ error: 'Missing url or key' }, { status: 400 });
  }

  // Reject prompt-like keys (spaces / very long natural language)
  if (key.includes(' ') || key.length > 400 || !/\.(png|jpe?g|webp|gif)$/i.test(key)) {
    // still try if it looks like a path without extension
    if (key.includes(' ') || key.length > 400) {
      return NextResponse.json(
        { error: 'Invalid storage key (looks like text/prompt, not a file path)' },
        { status: 400 },
      );
    }
  }

  try {
    const serviceKey =
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '';
    const supabaseUrl =
      process.env.COZE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      '';
    if (!serviceKey || !supabaseUrl) {
      // Fall back to redirect to public URL
      const publicUrl = await resolveImageUrl(key);
      if (publicUrl.startsWith('http')) {
        return NextResponse.redirect(publicUrl, 302);
      }
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const bucket = resolveBucketName();
    const { data, error } = await sb.storage.from(bucket).download(key);
    if (error || !data) {
      logger.warn('[admin/images/file] download failed', { key, err: error?.message });
      return NextResponse.json(
        { error: error?.message || 'Not found' },
        { status: 404 },
      );
    }

    const buf = Buffer.from(await data.arrayBuffer());
    const lower = key.toLowerCase();
    const ct = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : 'image/png';

    // Reject non-image payloads that were uploaded as "png"
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isRiff = buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'RIFF';
    if (!isPng && !isJpg && !isRiff) {
      return NextResponse.json(
        {
          error: 'Stored object is not a valid image (wrong magic bytes). Re-generate.',
          key,
          size: buf.length,
        },
        { status: 422 },
      );
    }

    return new NextResponse(buf, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'private, max-age=600',
        'X-Storage-Key': key,
      },
    });
  } catch (e) {
    logger.error('[admin/images/file] error', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500 },
    );
  }
}
