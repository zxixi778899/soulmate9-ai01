import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { resolveReplyLocale } from '@/lib/chat-locale';
import { defaultQuickReplies } from '@/lib/proactive-templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/chat/quick-replies
 * Returns 3 short user-side reply chips to boost retention.
 */
export async function POST(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`quick-replies:${user.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      girlfriend_id?: string;
      last_assistant?: string;
      last_user?: string;
      locale?: string;
    };
    const girlfriendId = String(body.girlfriend_id || '').trim();
    const lastAssistant = String(body.last_assistant || '').trim().slice(0, 600);
    const lastUser = String(body.last_user || '').trim().slice(0, 400);
    if (!girlfriendId) {
      return NextResponse.json({ error: 'girlfriend_id required' }, { status: 400 });
    }

    const locale = resolveReplyLocale({
      message: lastAssistant || lastUser || '',
      uiLocale: body.locale || null,
      defaultLocale: 'en',
      autoDetect: false,
    });
    const zh = locale === 'zh';

    // Cheap path: no last assistant → static defaults
    if (!lastAssistant) {
      return NextResponse.json({
        replies: defaultQuickReplies(locale),
        source: 'defaults',
      });
    }

    let replies: string[] = [];
    try {
      const prompt = zh
        ? `你是约会 App 的文案助手。根据伴侣刚说的话，生成用户可一键发送的 3 条短回复。
要求：
- 每条 6–22 个中文字，口语像情侣微信
- 有情绪、好点开（关心/调情/好奇）
- 不要编号、不要引号、不要解释
- 输出严格 3 行，一行一条

伴侣说：
${lastAssistant}

${lastUser ? `用户上一句：${lastUser}` : ''}`
        : `You write dating-app quick replies. Based on what the girlfriend just said, produce 3 short replies the USER can tap to send.
Rules:
- Each line 4–14 words, natural couple texting
- Emotional hooks: care / flirt / curiosity
- No numbering, no quotes, no explanation
- Exactly 3 lines, one reply per line

Girlfriend said:
${lastAssistant}

${lastUser ? `User's previous message: ${lastUser}` : ''}`;

      const raw = await generateText({
        prompt,
        systemPrompt: zh
          ? '只输出 3 行中文快捷回复，不要其它内容。'
          : 'Output exactly 3 lines of English quick replies only.',
        temperature: 0.85,
        maxTokens: 120,
      });

      replies = String(raw || '')
        .split(/\r?\n/)
        .map((l) =>
          l
            .replace(/^\s*[\d]+[\.\)\:\-\、]\s*/, '')
            .replace(/^["'「」]|["'「」]$/g, '')
            .trim(),
        )
        .filter((l) => l.length >= 2 && l.length <= 80)
        .slice(0, 3);
    } catch (err) {
      logger.warn('[quick-replies] llm failed, using defaults', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (replies.length < 3) {
      const fallback = defaultQuickReplies(locale, lastAssistant);
      while (replies.length < 3 && fallback.length) {
        const next = fallback.shift()!;
        if (!replies.includes(next)) replies.push(next);
      }
    }

    // Language safety: if locale is en strip lines that are mostly Chinese
    if (locale === 'en') {
      replies = replies.map((r) => {
        const han = (r.match(/[\u4e00-\u9fff]/g) || []).length;
        return han >= 2 ? defaultQuickReplies('en', lastAssistant)[0] : r;
      });
      // dedupe after replace
      replies = [...new Set(replies)].slice(0, 3);
      while (replies.length < 3) {
        const fb = defaultQuickReplies('en', lastAssistant);
        for (const x of fb) {
          if (!replies.includes(x)) replies.push(x);
          if (replies.length >= 3) break;
        }
      }
    }

    return NextResponse.json({
      replies: replies.slice(0, 3),
      source: 'ai',
      locale,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('[quick-replies] error', { err: msg });
    return NextResponse.json({
      replies: defaultQuickReplies('en'),
      source: 'defaults',
    });
  }
}
