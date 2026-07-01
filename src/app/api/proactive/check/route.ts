import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

// Holiday detection
function getCurrentHoliday(): string | null {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Christmas
  if (month === 12 && day >= 24 && day <= 26) return 'christmas';
  // New Year
  if ((month === 12 && day >= 31) || (month === 1 && day === 1)) return 'newyear';
  // Valentine's Day
  if (month === 2 && day === 14) return 'valentine';

  return null;
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6; // Friday or Saturday
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all user's girlfriends with intimacy scores
  const { data: girlfriends, error: gfError } = await client
    .from('girlfriends')
    .select('*')
    .eq('user_id', user.id);

  if (gfError) {
    return NextResponse.json({ error: gfError.message }, { status: 500 });
  }

  const { data: scores } = await client
    .from('intimacy_scores')
    .select('*')
    .eq('user_id', user.id);

  // Determine current time slot
  const hour = new Date().getHours();
  let currentSlot = '';
  if (hour >= 8 && hour < 11) currentSlot = 'morning';
  else if (hour >= 12 && hour < 15) currentSlot = 'noon';
  else if (hour >= 17 && hour < 20) currentSlot = 'evening';
  else if (hour >= 21 || hour < 1) currentSlot = 'night';

  if (!currentSlot) {
    return NextResponse.json({ messages: [] });
  }

  // Detect holiday / weekend
  const holiday = getCurrentHoliday();
  const weekend = isWeekend();

  // Build time slot list to check (primary + holiday/weekend overrides)
  const slotsToCheck = [currentSlot];
  if (holiday) slotsToCheck.push(holiday);
  if (weekend && (currentSlot === 'evening' || currentSlot === 'night')) {
    slotsToCheck.push('weekend');
  }

  // Get templates for relevant slots
  const { data: allTemplates } = await client
    .from('proactive_message_templates')
    .select('*')
    .in('time_slot', slotsToCheck);

  if (!allTemplates || allTemplates.length === 0) {
    return NextResponse.json({ messages: [] });
  }

  // Check which girlfriends haven't received a greeting in this slot today
  const today = new Date().toISOString().split('T')[0];
  const newMessages: Array<{ girlfriend_id: string; content: string; girlfriend_name: string }> = [];

  // Also check last user message time for "miss you" triggers
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  for (const gf of girlfriends || []) {
    const { data: existingLog } = await client
      .from('proactive_message_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('girlfriend_id', gf.id)
      .eq('time_slot', currentSlot)
      .gte('sent_at', today)
      .limit(1);

    if (existingLog && existingLog.length > 0) continue;

    // Check intimacy requirement
    const score = (scores || []).find(s => s.girlfriend_id === gf.id);
    const intimacyLevel = score?.score || 0;

    // Check if user has been away >12 hours (for "miss you" messages)
    const { data: lastUserMsg } = await client
      .from('chat_messages')
      .select('created_at')
      .eq('girlfriend_id', gf.id)
      .eq('user_id', user.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasBeenAway = !lastUserMsg || lastUserMsg.length === 0 ||
      new Date(lastUserMsg[0].created_at) < new Date(twelveHoursAgo);

    // Collect eligible templates: default slot templates + miss-you if away + holiday if applicable
    let eligibleTemplates = allTemplates.filter(t => {
      if (t.time_slot === currentSlot) return t.min_intimacy <= intimacyLevel;
      if (hasBeenAway && t.time_slot === currentSlot && t.min_intimacy <= intimacyLevel) {
        // Also check for "miss you" themed messages
        return t.template.toLowerCase().includes('miss');
      }
      if (t.time_slot === holiday || t.time_slot === 'weekend') {
        return t.min_intimacy <= intimacyLevel;
      }
      return false;
    });

    if (hasBeenAway) {
      const missTemplates = allTemplates.filter(t =>
        t.template.toLowerCase().includes('miss') &&
        t.min_intimacy <= intimacyLevel
      );
      eligibleTemplates = [...eligibleTemplates, ...missTemplates];
    }

    if (eligibleTemplates.length === 0) continue;

    const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];
    const content = template.template.replace('{name}', gf.name);

    // Create message in chat
    const { data: message } = await client
      .from('chat_messages')
      .insert({
        user_id: user.id,
        girlfriend_id: gf.id,
        role: 'assistant',
        content,
        is_proactive: true,
      })
      .select()
      .single();

    // Log the proactive message
    if (message) {
      await client
        .from('proactive_message_log')
        .insert({
          user_id: user.id,
          girlfriend_id: gf.id,
          message_id: message.id,
          time_slot: currentSlot,
        });

      newMessages.push({
        girlfriend_id: gf.id,
        content,
        girlfriend_name: gf.name,
      });
    }
  }

  return NextResponse.json({ messages: newMessages });
}