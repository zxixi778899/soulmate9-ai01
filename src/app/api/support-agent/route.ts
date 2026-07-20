import { NextRequest, NextResponse } from 'next/server';
import { buildSupportSystemPrompt } from '@/lib/support-knowledge';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/support-agent
 *
 * AI customer support agent — uses Together AI (SFW, no RunPod needed).
 * Accepts a conversation history and returns a streamed response.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 20 requests per minute per IP
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const rl = rateLimitMiddleware(`support:${ip}`, {
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: rl.headers },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, locale } = body as {
    messages?: Array<{ role: string; content: string }>;
    locale?: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
  }

  const isZh = locale === 'zh';
  const systemPrompt = buildSupportSystemPrompt(locale || 'en', isZh);

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-10), // Keep last 10 messages for context
  ];

  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    // Fallback: return a static response if Together AI is not configured
    return NextResponse.json({
      content: isZh
        ? '抱歉，客服系统暂时不可用。请稍后再试，或发送邮件至 support@ozmate.love'
        : 'Sorry, the support system is temporarily unavailable. Please try again later or email support@ozmate.love',
    });
  }

  try {
    const res = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.TOGETHER_CHAT_MODEL || 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        messages: apiMessages,
        max_tokens: 512,
        temperature: 0.5,
        top_p: 0.9,
        stream: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error('[support-agent] Together API error', { status: res.status, body: errText.slice(0, 200) });
      return NextResponse.json({
        content: isZh
          ? '抱歉，我现在无法回答。请稍后再试。'
          : 'Sorry, I cannot answer right now. Please try again later.',
      });
    }

    // Stream the response back as SSE
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`),
                  );
                }
              } catch {
                // skip malformed SSE
              }
            }
          }
        } catch (err) {
          logger.error('[support-agent] stream error', {
            err: err instanceof Error ? err.message : String(err),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    logger.error('[support-agent] failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      content: isZh
        ? '抱歉，出现了错误。请稍后再试。'
        : 'Sorry, an error occurred. Please try again later.',
    });
  }
}
