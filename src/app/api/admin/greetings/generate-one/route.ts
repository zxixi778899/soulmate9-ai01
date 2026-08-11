import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { generateGreetingLLM } from '@/lib/greeting-generator';
import { buildCompanionGreeting } from '@/lib/companion-greeting';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/greetings/generate-one
 * Generate a personalized greeting for a single companion (for editing UI).
 *
 * Body: { girlfriend_id, use_milestone, intimacy_level? }
 */
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdmin(req);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const body = await req.json().catch(() => ({}));
    const { girlfriend_id, use_milestone } = body as {
      girlfriend_id?: string;
      use_milestone?: boolean;
    };

    if (!girlfriend_id) {
      return NextResponse.json(
        { error: 'girlfriend_id is required' },
        { status: 400 },
      );
    }

    // Fetch the full companion record
    const { data: gf, error } = await supabase
      .from('girlfriends')
      .select('*')
      .eq('id', girlfriend_id)
      .maybeSingle();

    if (error || !gf) {
      return NextResponse.json(
        { error: 'Girlfriend not found' },
        { status: 404 },
      );
    }

    const card =
      gf.character_card && typeof gf.character_card === 'object'
        ? (gf.character_card as Record<string, unknown>)
        : {};
    const hobbies = Array.isArray(card.hobbies) ? card.hobbies.map(String) : [];

    // Optional: fetch the most recent shared milestone for a personal touch
    let lastMilestoneText: string | undefined;
    if (use_milestone && gf.user_id) {
      try {
        const { retrieveMilestones } = await import('@/lib/milestone-retriever');
        const recalls = await retrieveMilestones(
          supabase,
          String(gf.user_id),
          girlfriend_id,
          '最近',
          1,
        );
        if (recalls.length > 0) {
          lastMilestoneText = recalls[0].recall_text;
        }
      } catch (err) {
        logger.warn('generate-one: milestone retrieval failed (non-fatal)', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Try LLM generation
    const greeting = await generateGreetingLLM({
      name: String(gf.name || ''),
      age: gf.age ? Number(gf.age) : undefined,
      gender: gf.gender === 'Male' ? 'Male' : 'Female',
      personality: gf.personality ? String(gf.personality) : undefined,
      backstory: gf.backstory ? String(gf.backstory) : undefined,
      occupation: card.occupation ? String(card.occupation) : undefined,
      hobbies,
      last_milestone: lastMilestoneText,
    });

    if (greeting) {
      return NextResponse.json({
        success: true,
        greeting: {
          text_zh: greeting.text_zh,
          text_en: greeting.text_en,
          source: greeting.source,
        },
        last_milestone: lastMilestoneText,
      });
    }

    // Fallback: rule-based
    const ruleGreeting = buildCompanionGreeting({
      name: String(gf.name || ''),
      personality: gf.personality ? String(gf.personality) : undefined,
      occupation: card.occupation ? String(card.occupation) : undefined,
    });

    return NextResponse.json({
      success: true,
      greeting: {
        text_zh: ruleGreeting.text_zh,
        text_en: ruleGreeting.text_en,
        source: 'rule',
      },
      last_milestone: lastMilestoneText,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('generate-one greeting error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
