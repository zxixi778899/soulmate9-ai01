import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { analyzeAndRoute } from '@/lib/llm-router';
import { generateText, streamTextSmart } from '@/lib/llm-service';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
//  LLM call helper (non-streaming) — uses RunPod vLLM / Together AI
// ============================================================

async function callLLM(
  messages: { role: string; content: string }[],
  options?: { temperature?: number },
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsg = messages.find((m) => m.role === 'user');
  const prompt = userMsg?.content || systemMsg?.content || messages[0]?.content || '';
  return generateText({
    prompt,
    systemPrompt: userMsg ? systemMsg?.content : undefined,
    temperature: options?.temperature ?? 0.7,
    maxTokens: 1024,
  });
}

function resolveChatLocale(profileAny: Record<string, unknown> | null, fallback: string): string {
  const raw = String(
    profileAny?.preferred_locale || profileAny?.locale || fallback || 'en',
  ).toLowerCase();
  if (raw.startsWith('zh') || raw === 'cn') return 'zh';
  return 'en';
}

// Emotion detection is inlined below using quickEmotion() + LLM fallback
// (saves ~1 LLM call per message + 2-5s latency on every chat).

// Extract meaningful memories from user messages using LLM (replaces weak regex).
// Falls back to keyword extraction if LLM fails.
async function extractMemories(
  client: any,
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
          // pgvector embedding write — uses raw SQL via service-role client
          void fetch('/api/admin/embed-memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inserted.data.id, embedding: vec }),
          }).catch(() => {});
        }
      });
    }
  }
}

async function getLoreContext(client: any, user_id: string, girlfriend_id: string, message: string): Promise<string> {
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
  const { user, client, error: authError } = await getAuthUser(request);
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
  const isPro = profile?.membership_tier === 'pro';

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

  const body = await request.json();
  const { message, girlfriend_id, mood, pose, environment, locale: bodyLocale } = body;
  if (!message || !girlfriend_id) {
    return NextResponse.json({ error: 'message and girlfriend_id are required' }, { status: 400 });
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
  const routing = analyzeAndRoute(message, {
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
  const [girlfriendResult, intimacyResult, recentMessagesResult, memoriesResult] = await Promise.all([
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
    client
      .from('memories')
      .select('content, type')
      .eq('girlfriend_id', girlfriend_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
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

  // Prefer client UI locale (matches Language switcher), then profile, then default.
  // Critical for Nordic EN users: EN UI → English-only girlfriend replies.
  const chatLocale = bodyLocale
    ? resolveChatLocale({ preferred_locale: bodyLocale } as Record<string, unknown>, 'en')
    : resolveChatLocale(profileAny, aiModules.language.default_locale || 'en');

  const chatResolved = resolveChatCall(aiModules, {
    tier: membershipTier,
    intimacyLevel,
    message: String(message),
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
  const memories = await retrieveMemories(client, user.id, girlfriend_id, message, 5);

  // Emotion: keyword-only (never block chat on a second LLM round-trip)
  const [detectedEmotion, loreContext] = await Promise.all([
    Promise.resolve(normalizeEmotion(quickEmotion(message) || 'neutral')),
    getLoreContext(client, user.id, girlfriend_id, message),
  ]);

  // Build system prompt from character card + locale (EN pure / ZH pure) + module suffix
  const zhChat = chatLocale === 'zh';
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
    (chatResolved.systemLanguageSuffix ? `\n\n${chatResolved.systemLanguageSuffix}` : '');

  const MAX_USER_MESSAGE_LENGTH = 4000;
  const truncatedMessage =
    typeof message === 'string' && message.length > MAX_USER_MESSAGE_LENGTH
      ? message.slice(0, MAX_USER_MESSAGE_LENGTH)
      : String(message ?? '');
  const wrappedUserContent = userMessageWrapper(truncatedMessage, zhChat);
  const hardenedSystemPrompt = systemPrompt + safetySuffix(zhChat);

  // Build message array for LLM
  const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: hardenedSystemPrompt },
    ...(recentMessages || []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user', content: wrappedUserContent }
  ];

  // Save user message truncated message wrapper
  await client.from('chat_messages').insert({
    user_id: user.id,
    girlfriend_id,
    role: 'user',
    content: truncatedMessage,
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);

              // Skip reasoning_content
              const reasoningContent = parsed?.choices?.[0]?.delta?.reasoning_content;
              if (reasoningContent) continue;

              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`));
              }
            } catch { /* skip malformed */ }
          }
        }

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

        // Extract memories from user message (fire and forget)
        extractMemories(client, user.id, girlfriend_id, message, gf.name).catch(() => {});

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
      ...(chatResolved.blockedReason
        ? { 'X-AI-Blocked-Reason': chatResolved.blockedReason }
        : {}),
    },
  });
}
