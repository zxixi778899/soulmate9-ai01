import { NextRequest, NextResponse } from 'next/server';
import { buildSupportSystemPrompt } from '@/lib/support-knowledge';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/support-agent
 *
 * AI customer support agent. Uses the shared llm-service multi-provider chain
 * (DashScope -> RunPod vLLM -> Together) so it keeps answering even when a
 * single provider is down or unconfigured. Always responds as SSE in the
 * `{ content }` shape the SupportAgent client parses, so the bubble never
 * renders empty.
 */

function sse(content: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('data: ' + JSON.stringify({ content }) + '\n\n'));
        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
        ctrl.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}

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
  ] as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;

  try {
    const content = await generateText({
      messages: apiMessages,
      temperature: 0.5,
      maxTokens: 512,
      topP: 0.9,
    });
    const reply =
      content ||
      (isZh
        ? '抱歉，我暂时没想到合适的答案。你可以发邮件到 support@oxmate-ai.com。'
        : "Sorry, I don't have a good answer right now. You can email support@oxmate-ai.com.");
    return sse(reply);
  } catch (err) {
    logger.error('[support-agent] generate failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return sse(
      isZh
        ? '抱歉，客服系统暂时繁忙，请稍后再试，或发邮件到 support@oxmate-ai.com。'
        : 'Sorry, support is busy right now. Please try again later or email support@oxmate-ai.com.',
    );
  }
}
