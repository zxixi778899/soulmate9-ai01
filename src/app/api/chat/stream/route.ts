import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { analyzeAndRoute } from '@/lib/llm-router';
import { streamTextSmart } from '@/lib/llm-service';
import { logModelUsage, estimateTokens, estimateCost } from '@/lib/model-usage';
import { checkAchievements } from '@/lib/achievement-checker';
import { quickEmotion, normalizeEmotion } from '@/lib/emotion';
import { logger } from '@/lib/logger';
import {
  loadAiModules,
  resolveChatCall,
  invokeChatAsSseStream,
  type MembershipTier,
} from '@/lib/ai-modules';
import {
  buildCharacterPrompt,
  safetySuffix,
  userMessageWrapper,
} from '@/lib/chat-character-prompt';
import {
  languageLockInstruction,
  resolveReplyLocale,
  type ReplyLocale,
} from '@/lib/chat-locale';
import {
  sanitizeAssistantReply,
  sanitizeHistoryContent,
} from '@/lib/chat-reply-sanitize';
import { moderateText, type ContentMode } from '@/lib/content-moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Emotion detection is inlined below using quickEmotion() + LLM fallback
// (saves ~1 LLM call per message + 2-5s latency on every chat).

// Extract meaningful memories from user messages using LLM (replaces weak regex).
// Falls back to keyword extraction if LLM fails.
async function extractMemories(
  client: SupabaseClient,
  userId: string,
  girlfriendId: string,
  message: string,
  gfName: string,
) {
  const { extractMemoriesLLM } = await import('@/lib/memory-extract');
  const { embed } = await import('@/lib/memory-rag');

  // 1) LLM extraction (more accurate than regex)
  const recent = (await client
    .from('chat_messages')
    .select('role, content')
    .eq('girlfriend_id', girlfriendId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(6)
  ).data || [];

  const llmMems = await extractMemoriesLLM([{ role: 'user', content: message }, ...recent.slice(0, 5)]);

  for (const m of llmMems) {
    const { data: existing } = await client
      .from('memories')
      .select('id')
      .eq('girlfriend_id', girlfriendId)
      .eq('user_id', userId)
      .ilike('content', `%${m.content.slice(0, 30)}%`)
      .limit(1);
    if (existing && existing.length > 0) continue;

    // Compute embedding in background (fire-and-forget for response latency)
    const inserted = await client.from('memories').insert({
      user_id: userId,
      girlfriend_id: girlfriendId,
      content: `${gfName} remembers: ${m.content}${m.content.endsWith('.') ? '' : '.'}`,
      type: m.type,
      category: m.category,
    }).select('id').single();

    if (inserted?.data?.id) {
      void embed(m.content).then((vec) => {
        if (vec) {
          const embeddingLiteral = `[${vec.join(',')}]`;
          void client
            .from('memories')
            .update({ embedding: embeddingLiteral })
            .eq('id', inserted.data.id)
            .then(({ error }: { error: { message: string } | null }) => {
              if (error) {
                logger.warn('chat/stream: memory embedding write failed', {
                  memoryId: inserted.data.id,
                  error: error.message,
                });
              }
            });
        }
      });
    }
  }
}

async function getLoreContext(client: SupabaseClient, girlfriend_id: string, message: string): Promise<string> {
  try {
    const { data: loreEntries } = await client
      .from('world_lore')
      .select('keys, content')
      .eq('girlfriend_id', girlfriend_id)
      .eq('active', true)
      .order('insertion_order', { ascending: true });

    if (!loreEntries || loreEntries.length === 0) return '';

    const msgLower = message.toLowerCase();
    const matchedLore: string[] = [];

    for (const entry of loreEntries) {
      const hasMatch = entry.keys?.some((key: string) => msgLower.includes(key.toLowerCase()));
      if (hasMatch && entry.content) {
        matchedLore.push(entry.content);
      }
    }

    if (matchedLore.length === 0) return '';

    return matchedLore.map((content, i) => `[Lore ${i + 1}]: ${content}`).join('\n');
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting: 60 requests/minute per user
  const { data: profile } = await client
    .from('profiles')
    .select('membership_tier, credits_remaining, newbie_expires_at, preferred_locale, locale, subscription_tier, plan')
    .eq('user_id', user.id)
    .single();

  const isNewbieTrial = profile?.newbie_expires_at && new Date(profile.newbie_expires_at) > new Date();

  if (!isNewbieTrial) {
    const rl = rateLimitMiddleware(`chat:${user.id}`, RATE_LIMITS.chat);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429, headers: rl.headers });
    }
  }

  const isFree = profile?.membership_tier === 'free';

  // Daily message limit for free users (skip for newbie trial)
  if (isFree && !isNewbieTrial) {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await client
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', today);

    const FREE_DAILY_LIMIT = 50;
    if (count && count >= FREE_DAILY_LIMIT) {
      return NextResponse.json({
        error: `You've reached your daily message limit (${FREE_DAILY_LIMIT}). Upgrade to Pro for unlimited chats!`
      }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const {
    message,
    girlfriend_id,
    mood,
    pose,
    environment,
    locale: bodyLocale,
    media_url: rawMediaUrl,
    media_type: rawMediaType,
  } = body as {
    message?: string;
    girlfriend_id?: string;
    mood?: string;
    pose?: string;
    environment?: string;
    locale?: string;
    media_url?: string;
    media_type?: string;
  };
  const mediaUrl =
    typeof rawMediaUrl === 'string' && rawMediaUrl.trim().startsWith('http')
      ? rawMediaUrl.trim().slice(0, 2000)
      : typeof rawMediaUrl === 'string' && rawMediaUrl.trim().startsWith('data:')
        ? rawMediaUrl.trim().slice(0, 2_500_000)
        : null;
  const mediaType =
    mediaUrl &&
    (rawMediaType === 'image' || rawMediaType === 'audio' || rawMediaType === 'video'
      ? rawMediaType
      : mediaUrl.startsWith('data:audio') || /\.(mp3|wav|m4a|ogg|webm)(\?|$)/i.test(mediaUrl)
        ? 'audio'
        : mediaUrl.startsWith('data:video') || /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)
          ? 'video'
          : 'image');

  if ((!message && !mediaUrl) || !girlfriend_id) {
    return NextResponse.json(
      { error: 'message or media_url, and girlfriend_id are required' },
      { status: 400 },
    );
  }

  const contentMode: ContentMode = process.env.CONTENT_MODE === 'adult' ? 'adult' : 'sfw';
  const moderation = moderateText(String(message || ''), contentMode);
  if (!moderation.allowed) {
    logger.warn('chat/stream: message blocked by safety policy', {
      userId: user.id,
      reason: moderation.reason,
      nsfwLevel: moderation.nsfwLevel,
      contentMode,
    });
    return NextResponse.json(
      {
        error: contentMode === 'sfw'
          ? 'This content is unavailable in the current experience.'
          : 'This request violates the content policy.',
        code: moderation.reason || 'CONTENT_BLOCKED',
      },
      { status: 422 },
    );
  }

  // Build presets object
  const presets = { mood, pose, environment };

  // AI modules config (chat / language routing)
  const aiModules = await loadAiModules(client);
  const profileAny = profile as Record<string, unknown> | null;
  const membershipRaw = String(
    profileAny?.membership_tier || profileAny?.subscription_tier || profileAny?.plan || 'free',
  ).toLowerCase();
  let membershipTier: MembershipTier = 'free';
  if (membershipRaw.includes('unlimit') || membershipRaw === 'admin') membershipTier = 'unlimited';
  else if (membershipRaw.includes('pro') || membershipRaw.includes('plus') || membershipRaw.includes('premium'))
    membershipTier = 'pro';

  // Legacy router kept for task logging / image intent
  const routing = analyzeAndRoute(String(message || ''), {
    userTier: membershipTier === 'unlimited' ? 'admin' : membershipTier === 'pro' ? 'pro' : 'free',
  });

  // Pre-resolve needs intimacy; fetch DB first with provisional context limit
  const provisionalCtx = Math.max(
    aiModules.chat.tiers.free.context_messages,
    aiModules.chat.tiers.pro.context_messages,
    aiModules.chat.tiers.unlimited.context_messages,
    20,
  );

  // Run independent DB queries in parallel
  const [girlfriendResult, intimacyResult, recentMessagesResult] = await Promise.all([
    client
      .from('girlfriends')
      .select('*')
      .eq('id', girlfriend_id)
      .eq('user_id', user.id)
      .single(),
    client
      .from('intimacy_scores')
      .select('level')
      .eq('girlfriend_id', girlfriend_id)
      .eq('user_id', user.id)
      .single(),
    client
      .from('chat_messages')
      .select('content, role')
      .eq('girlfriend_id', girlfriend_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(provisionalCtx),
  ]);

  const gf = girlfriendResult.data;
  if (!gf) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Get intimacy level
  let intimacyLevel = 1;
  if (intimacyResult.data) {
    intimacyLevel = intimacyResult.data.level;
  }

  const messageText = String(message ?? '').trim() || (mediaUrl ? '[media]' : '');

  const usageDayStart = new Date();
  usageDayStart.setUTCHours(0, 0, 0, 0);
  const { data: dailyUsageRows } = await client
    .from('ai_model_usage_logs')
    .select('cost_usd')
    .eq('user_id', user.id)
    .gte('created_at', usageDayStart.toISOString())
    .limit(1000);
  const dailyCostUsd = (dailyUsageRows || []).reduce(
    (sum: number, row: { cost_usd?: number | string | null }) => sum + Number(row.cost_usd || 0), 0,
  );

  // Reply language follows PAGE UI locale (zh UI → Chinese, en UI → English).
  // Do NOT auto-detect from message content — that caused mixed/garbled bilingual replies.
  const chatLocale: ReplyLocale = resolveReplyLocale({
    message: messageText,
    uiLocale: bodyLocale || null,
    profileLocale:
      (profileAny?.preferred_locale as string) || (profileAny?.locale as string) || null,
    defaultLocale: aiModules.language.default_locale || 'en',
    // Detectable message language wins; media/emoji-only turns use page locale.
    autoDetect: true,
  });

  let chatResolved = resolveChatCall(aiModules, {
    tier: membershipTier,
    intimacyLevel,
    message: messageText,
    locale: chatLocale,
  });

  // Apply configured daily limit from modules (override hard-coded free limit when present)
  const tierRoute = aiModules.chat.tiers[
    membershipTier === 'unlimited' ? 'unlimited' : membershipTier === 'pro' ? 'pro' : 'free'
  ];
  if (tierRoute.daily_message_limit != null && !isNewbieTrial) {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await client
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', today);
    if (count && count >= tierRoute.daily_message_limit) {
      return NextResponse.json(
        {
          error: `You've reached your daily message limit (${tierRoute.daily_message_limit}). Upgrade for more chats!`,
          localized_error: chatLocale === 'zh'
            ? `今日消息次数已用完（${tierRoute.daily_message_limit} 条），请升级套餐后继续聊天。`
            : `You've reached your daily message limit (${tierRoute.daily_message_limit}). Upgrade for more chats!`,
          code: 'daily_message_limit',
        },
        { status: 403 },
      );
    }
  }

  let recentMessages = recentMessagesResult.data || [];
  if (recentMessages.length > chatResolved.contextMessages) {
    recentMessages = recentMessages.slice(0, chatResolved.contextMessages);
  }
  // RAG: pull top-5 most relevant memories for this user message
  const { retrieveMemories } = await import('@/lib/memory-rag');
  const memories = await retrieveMemories(client, user.id, girlfriend_id, messageText, 5);

  // Re-resolve after memory retrieval so long-term continuity can upgrade the model.
  chatResolved = resolveChatCall(aiModules, {
    tier: membershipTier, userId: user.id,
    rolloutPercent: Number(process.env.AI_GATEWAY_V2_ROLLOUT_PERCENT || 10), intimacyLevel, message: messageText, locale: chatLocale,
    memoryCount: memories.length, contextMessageCount: recentMessages.length, dailyCostUsd,
    adultCharacterVerified: Number((gf as { age?: number | string } | null)?.age || 18) >= 18,
  });

  // Emotion: keyword-only (never block chat on a second LLM round-trip)
  const [detectedEmotion, loreContext] = await Promise.all([
    Promise.resolve(normalizeEmotion(quickEmotion(messageText) || 'neutral')),
    getLoreContext(client, girlfriend_id, messageText),
  ]);

  // Build system prompt: character + hard language lock from this turn's message
  const zhChat = chatLocale === 'zh';
  const langLock = languageLockInstruction(chatLocale);
  const systemPrompt =
    buildCharacterPrompt({
      gf,
      intimacyLevel,
      detectedEmotion,
      memories: memories || [],
      loreContext,
      presets,
      locale: chatLocale,
      allowNsfw: chatResolved.allowNsfw,
      nsfwChannel: chatResolved.channel === 'nsfw',
    }) +
    `\n\n${langLock}` +
    (chatResolved.systemLanguageSuffix ? `\n\n${chatResolved.systemLanguageSuffix}` : '');

  const MAX_USER_MESSAGE_LENGTH = 4000;
  const textPart =
    typeof message === 'string' && message.length > MAX_USER_MESSAGE_LENGTH
      ? message.slice(0, MAX_USER_MESSAGE_LENGTH)
      : String(message ?? '').trim();
  // Persist caption for media-only messages so history still has text
  const truncatedMessage =
    textPart ||
    (mediaType === 'audio'
      ? '[Voice message]'
      : mediaType === 'video'
        ? '[Video]'
        : mediaUrl
          ? '[Photo]'
          : '');
  let mediaNote = '';
  if (mediaUrl && mediaType === 'image') {
    mediaNote = zhChat
      ? '\n\n[系统提示：用户发来一张图片，请自然回应，可调侃/欣赏，不要说你看不到。]'
      : '\n\n[System: The user sent you a photo. React naturally — flirt, comment, appreciate. Never claim you cannot see it.]';
  } else if (mediaUrl && mediaType === 'audio') {
    mediaNote = zhChat
      ? '\n\n[系统提示：用户发来一段语音，请像听过一样亲密回应。]'
      : '\n\n[System: The user sent a voice note. Respond as if you heard it, warm and intimate.]';
  }
  const wrappedUserContent = userMessageWrapper(truncatedMessage + mediaNote, zhChat);
  const hardenedSystemPrompt =
    systemPrompt +
    safetySuffix(zhChat) +
    (zhChat
      ? '\n\n[输出质量] 只输出女友好友会发的聊天正文。禁止输出特殊符号标记、思考过程、系统提示、乱码或无意义重复。'
      : '\n\n[OUTPUT QUALITY] Output only the girlfriend chat reply. No special tokens, no chain-of-thought, no system text, no garbled characters, no nonsense loops.');

  // Build message array for LLM — clean history so garbage does not poison the model
  const historyForLlm = (recentMessages || [])
    .slice()
    .reverse()
    .map((m: { role: string; content: string }) => {
      const content =
        m.role === 'assistant'
          ? sanitizeAssistantReply(m.content, { preferZh: zhChat })
          : sanitizeHistoryContent(m.role, m.content);
      if (!content) return null;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      return { role: role as 'user' | 'assistant', content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m));

  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: hardenedSystemPrompt },
    ...historyForLlm,
    { role: 'user', content: wrappedUserContent },
  ];

  // Save user message (text + optional media)
  await client.from('chat_messages').insert({
    user_id: user.id,
    girlfriend_id,
    role: 'user',
    content: truncatedMessage,
    ...(mediaUrl
      ? {
          media_url: mediaUrl,
          media_type: mediaType,
        }
      : {}),
  });

  // Update intimacy via internal call (fire and forget)  skip for newbie trial
  if (!isNewbieTrial) {
    const token = request.headers.get('x-session') || '';
    fetch(new URL('/api/intimacy', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session': token
      },
      body: JSON.stringify({ girlfriend_id, message_type: 'normal' })
    }).catch(() => {});
  }

  //  Stream from RunPod vLLM (primary) or Together AI (fallback)
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = '';
      const streamStart = Date.now();
      let providerName = 'vllm';

      try {
        // Resolve via AI modules: Free→Together 8B, Pro NSFW→RunPod Lumimaid, etc.
        let response: Response;
        let provider: string = chatResolved.endpoint.provider;
        let modelId: string = chatResolved.endpoint.model_id;

        try {
          const invoked = await invokeChatAsSseStream({
            endpoint: chatResolved.endpoint,
            messages: llmMessages,
            temperature: chatResolved.temperature,
            maxTokens: chatResolved.maxTokens,
            userId: user.id,
            girlfriendId: girlfriend_id,
            taskType: chatResolved.channel === 'nsfw' ? 'nsfw_chat' : routing.taskType || 'chat',
            membershipTier,
            scene: chatResolved.channel === 'nsfw' ? 'adult_roleplay' : 'chat',
            routeReason: chatResolved.routeReason,
            locale: chatLocale,
          });
          response = invoked.response;
          provider = invoked.provider;
          modelId = invoked.model;
        } catch (primaryErr) {
          logger.warn('chat/stream: module invoke failed, fallback streamTextSmart', {
            err: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
          });
          const fallback = await streamTextSmart({
            messages: llmMessages,
            temperature: chatResolved.temperature,
            maxTokens: chatResolved.maxTokens,
            intimacyLevel,
            nsfwOptIn: gf?.adult_content_enabled ?? false,
          });
          response = fallback.response;
          provider = fallback.provider;
          modelId = fallback.model;
        }

        providerName = provider;

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body from LLM');

        const decoder = new TextDecoder();
        let sseBuf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuf += decoder.decode(value, { stream: true });
          const parts = sseBuf.split('\n');
          sseBuf = parts.pop() || '';

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);

              // Skip reasoning_content / thinking leaks
              const reasoningContent =
                parsed?.choices?.[0]?.delta?.reasoning_content ||
                parsed?.choices?.[0]?.delta?.reasoning;
              if (reasoningContent && !parsed?.choices?.[0]?.delta?.content) continue;

              const delta = parsed?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length) {
                fullResponse += delta;
              }
            } catch { /* skip malformed */ }
          }
        }

        // Final sanitize (tokens / mojibake / empty garbage / wrong-language blocks)
        const cleaned = sanitizeAssistantReply(fullResponse, { preferZh: zhChat });
        fullResponse = cleaned || sanitizeAssistantReply(fullResponse || '…', { preferZh: zhChat });
        // Never stream unvalidated model tokens to the browser. Emit only the
        // fully language-checked reply so garbage cannot flash or persist.
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: '', replace: fullResponse })}\n\n`),
        );

        // Save assistant message
        if (fullResponse) {
          await client.from('chat_messages').insert({
            user_id: user.id,
            girlfriend_id,
            role: 'assistant',
            content: fullResponse,
          });
        }

        // Log model usage (fire and forget)
        const latencyMs = Date.now() - streamStart;
        const inputTok = estimateTokens(systemPrompt + truncatedMessage);
        const outputTok = estimateTokens(fullResponse);
        logModelUsage({
          provider: providerName,
          model_id: modelId,
          task_type: routing.taskType === 'image_generation' ? 'image_prompt' : routing.taskType,
          user_id: user.id,
          girlfriend_id,
          input_tokens: inputTok,
          output_tokens: outputTok,
          latency_ms: latencyMs,
          cost_usd: estimateCost(inputTok, outputTok, 0.0003, 0.0006),
          success: true,
        }).catch(() => {});

        // Extract and persist memories before the stream closes.
        if (messageText && messageText !== '[media]') {
          // Await persistence before a serverless runtime can freeze after stream close.
          await extractMemories(client, user.id, girlfriend_id, messageText, gf.name).catch(
            (memoryError: unknown) => {
              logger.warn('chat/stream: memory extraction failed', {
                err: memoryError instanceof Error ? memoryError.message : String(memoryError),
              });
            },
          );
        }

        // Check achievements (fire and forget)
        checkAchievements(client, user.id).catch(() => {});

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[chat-stream] streaming failed', { err: errMsg.slice(0, 200) });
        const soft =
          "I'm still here... my signal glitched for a second. Tap send again and I'll reply right away~";
        fullResponse = soft;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: soft })}\n\n`));
        try {
          await client.from('chat_messages').insert({
            user_id: user.id,
            girlfriend_id,
            role: 'assistant',
            content: soft,
          });
        } catch {
          /* ignore persist errors */
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-AI-Channel': chatResolved.channel,
      'X-AI-Model': chatResolved.endpoint.model_id,
      'X-AI-Endpoint': chatResolved.endpoint.id,
      'X-AI-Provider': chatResolved.endpoint.provider,
      'X-AI-Allow-NSFW': chatResolved.allowNsfw ? '1' : '0',
      'X-AI-Reply-Locale': chatLocale,
      ...(chatResolved.blockedReason
        ? { 'X-AI-Blocked-Reason': chatResolved.blockedReason }
        : {}),
    },
  });
}
