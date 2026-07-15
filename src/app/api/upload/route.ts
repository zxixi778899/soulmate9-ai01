import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { uploadFile } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

const UPLOAD_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const { user } = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedFolder = String(formData.get('folder') || 'uploads')
      .replace(/\\/g, '/')
      .replace(/\.\./g, '')
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 120);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name || 'upload.bin';
    const ext = fileName.includes('.')
      ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
      : '';
    // Some browsers omit codecs in type (audio/webm;codecs=opus)
    // SVGA often has empty type or application/octet-stream
    const baseType = (file.type || '').split(';')[0].trim().toLowerCase();
    const isSvga =
      ext === '.svga' ||
      baseType === 'application/octet-stream' && fileName.toLowerCase().endsWith('.svga') ||
      baseType === 'application/x-svga';
    const isImage =
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(baseType) ||
      ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const isAudio =
      baseType.startsWith('audio/') ||
      ['.webm', '.ogg', '.mp3', '.m4a', '.wav', '.mp4'].includes(ext) &&
        !isImage &&
        !isSvga;

    const adminFolder = /^(?:admin|gifts|girlfriends|batch-portraits)(?:\/|$)/i.test(requestedFolder);
    if (adminFolder || isSvga) {
      const admin = await requireAdmin(request);
      if (admin.error) return admin.error;
    }

    const limit = await checkRateLimitAsync(`media-upload:${user.id}`, UPLOAD_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, UPLOAD_LIMIT) },
      );
    }

    if (!isImage && !isAudio && !isSvga) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || ext || 'unknown'}. Allowed: images, SVGA, short voice notes.`,
        },
        { status: 400 },
      );
    }

    const maxSize = isSvga ? 20 * 1024 * 1024 : isAudio ? 8 * 1024 * 1024 : 12 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))}MB.`,
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // SVGA is zip-based; prefer application/zip so image-only buckets accept it
    // (uploadFile will also retry octet-stream / x-svga if needed)
    const contentType = isSvga
      ? 'application/zip'
      : file.type || (isImage ? 'image/png' : 'application/octet-stream');
    const safeName = isSvga && !fileName.toLowerCase().endsWith('.svga')
      ? `${fileName}.svga`
      : fileName;
    const uploadFolder = adminFolder || isSvga
      ? isSvga
        ? requestedFolder.includes('gift')
          ? requestedFolder
          : 'gifts/svga'
        : requestedFolder
      : `users/${user.id}/${isAudio ? 'voice' : 'images'}`;
    const result = await uploadFile(buffer, safeName, contentType, uploadFolder);

    return NextResponse.json({
      key: result.key,
      url: result.url,
      fileName: safeName,
      fileSize: file.size,
      fileType: contentType,
      kind: isSvga ? 'svga' : isAudio ? 'audio' : 'image',
    });
  } catch (error) {
    logger.error('Upload error:', { data: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
