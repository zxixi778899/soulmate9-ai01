import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getCozeAccessToken, COZE_API_BASE } from '@/lib/coze-auth';
import { uploadDataUrl, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

const IMAGE_GEN_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 }; // 10/h/user

export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 限流：Coze doubao 图像生成也按配额计费
  const rl = await checkRateLimitAsync(`gen-img:${user.id}`, IMAGE_GEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many image generation requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, IMAGE_GEN_LIMIT) },
    );
  }

  try {
    const body = await request.json();
    const { prompt, size = '1024x1024' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const token = await getCozeAccessToken();

    // Call Coze API directly via HTTP (no SDK, no OpenAI dependency)
    const genRes = await fetch(`${COZE_API_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'doubao-seed-2-0-pro-260215',
        prompt,
        n: 1,
        size: String(size),
      }),
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      return NextResponse.json(
        { error: `Image generation API failed (${genRes.status}): ${errText}` },
        { status: 502 }
      );
    }

    const genData = await genRes.json();
    const rawImages = (genData.data || []) as Array<{ url?: string }>;

    // 持久化到 OSS：下载临时 URL → 转 data URL → 上传 OSS → 返回签名 URL
    const images = await Promise.all(
      rawImages.map(async (item) => {
        const tempUrl = item.url || '';
        if (!tempUrl) {
          return { url: '', prompt };
        }
        try {
          const imgRes = await fetch(tempUrl);
          if (!imgRes.ok) {
            console.error('Failed to fetch generated image:', imgRes.status);
            return { url: '', prompt };
          }
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const ct = imgRes.headers.get('content-type') || 'image/png';
          const dataUrl = `data:${ct};base64,${buf.toString('base64')}`;
          const key = await uploadDataUrl(dataUrl, 'chat-images');
          const signed = await resolveImageUrl(key);
          return { url: signed, key, prompt };
        } catch (e) {
          console.error('OSS upload failed for generated image:', e);
          return { url: '', prompt };
        }
      })
    );

    return NextResponse.json({ images });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image generation failed' },
      { status: 500 }
    );
  }
}