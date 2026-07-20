import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { loadAiModules, resolveChatCall, type MembershipTier } from '@/lib/ai-modules';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the AI customer support agent for SoulMate AI (an AI companion platform). 
You are helpful, warm, and professional. Answer in the same language the user writes in.

Your knowledge base:
- SoulMate AI offers Free, Basic ($9.99/mo), Pro ($19.99/mo), and Unlimited ($29.99/mo) plans
- Quarterly billing saves 15%, annual billing saves 30%
- Payment methods: Credit card (Stripe), Cryptocurrency (NOWPayments), LATAM local payment (NexaPay)
- Users can manage subscriptions in Profile > Pricing
- Image generation uses RunPod GPU — if slow, the GPU may be waking up (retry in 1-2 min)
- NSFW content is available on Pro+ tiers
- Users must be 18+ to use the service
- Support email: support@soulmateai.shop
- Privacy contact: privacy@soulmateai.shop

Common issues and solutions:
1. "Image generation failed/timeout" → GPU queue is busy, retry in 1-2 minutes. If persistent, check RunPod endpoint status.
2. "Can't login" → Try resetting password via /forgot-password. Check spam folder for reset email.
3. "Subscription not activated" → Payment may be processing. Crypto payments take up to 24h for manual verification. Card payments activate instantly.
4. "How to cancel" → Go to Profile > Pricing > manage subscription, or contact support email.
5. "Refund request" → We don't offer refunds for partial billing periods. Contact support@soulmateai.shop for exceptions.
6. "Content not appropriate" → All AI characters are fictional adults. Report specific issues to support email.

Rules:
- Never share API keys, internal system details, or other users' data
- If you don't know the answer, direct users to support@soulmateai.shop
- Keep responses concise (under 200 words)
- Be empathetic and solution-oriented
- For billing disputes, always offer to escalate to human support`;

/**
 * POST /api/support-chat
 * Body: { messages: Array<{ role: 'user' | 'assistant', content: string }> }
 * Returns: { reply: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getAuthUser(req);

    const body = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!messages.length) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    // Limit conversation history to last 10 turns
    const recentMessages = messages.slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 1000),
    }));

    const aiModules = await loadAiModules(client!);

    // Resolve membership tier for the user
    let tier: MembershipTier = 'free';
    if (user && client) {
      const { data: profile } = await client
        .from('profiles')
        .select('membership_tier')
        .eq('user_id', user.id)
        .maybeSingle();
      const raw = String(profile?.membership_tier || 'free').toLowerCase();
      if (raw.includes('unlimit') || raw === 'admin') tier = 'unlimited';
      else if (raw.includes('pro') || raw.includes('basic')) tier = 'pro';
    }

    const resolved = resolveChatCall(aiModules, { tier });

    if (resolved.blockedReason) {
      // Fallback response when AI is not configured
      return NextResponse.json({
        reply: "I'm having trouble connecting right now. Please email support@soulmateai.shop and our team will help you directly!",
      });
    }

    const { invokeChat } = await import('@/lib/ai-modules/invoke');
    const result = await invokeChat({
      endpoint: resolved.endpoint,
      fallbackEndpoints: resolved.fallbackChain,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages,
      ],
      temperature: 0.7,
      maxTokens: 500,
      userId: user?.id,
      taskType: 'customer_support',
      membershipTier: tier,
      scene: 'customer_support',
    });

    return NextResponse.json({ reply: result.content });
  } catch (error) {
    logger.error('[support-chat] Error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({
      reply: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment, or email support@soulmateai.shop for immediate assistance.",
    });
  }
}
