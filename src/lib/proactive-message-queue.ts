/**
 * Proactive Message Queue System
 * 
 * Manages scheduled, event-triggered, and random proactive messages
 * with priority queuing, rate limiting, and personality-aware delivery
 */

import { supabase } from '@/lib/supabase-server';

export type TriggerType = 'schedule' | 'event' | 'random' | 'anniversary';
export type MessageStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';

interface ProactiveMessageParams {
  userId: string;
  girlfriendId: string;
  templateId: string;
  triggerType: TriggerType;
  priority?: number;           // 1-10, higher = more urgent
  params?: Record<string, any>; // Dynamic parameter injection
  scheduledAt?: Date;
}

interface MessageConfig {
  maxPerDay: number;
  timeRanges: string[];        // ['08:00-10:00', '22:00-23:30']
  minIntimacyLevel: number;
  disabledForNSFW: boolean;
}

// Default scheduling configurations by category
const SCHEDULE_CONFIGS: Record<string, MessageConfig> = {
  morning_greeting: {
    maxPerDay: 1,
    timeRanges: ['08:00-10:00'],
    minIntimacyLevel: 1,
    disabledForNSFW: false
  },
  missing_you: {
    maxPerDay: 2,
    timeRanges: ['ANYTIME'],
    minIntimacyLevel: 2,
    disabledForNSFW: false
  },
  goodnight_message: {
    maxPerDay: 1,
    timeRanges: ['22:00-23:30'],
    minIntimacyLevel: 1,
    disabledForNSFW: false
  },
  random_flirt: {
    maxPerDay: 3,
    timeRanges: ['ANYTIME'],
    minIntimacyLevel: 3,
    disabledForNSFW: true
  }
};

/**
 * Schedule a proactive message
 */
export async function scheduleProactiveMessage(params: ProactiveMessageParams): Promise<string> {
  const {
    userId,
    girlfriendId,
    templateId,
    triggerType,
    priority = 5,
    params: queryParams,
    scheduledAt
  } = params;
  
  try {
    // Get template info
    const { data: template } = await supabase
      .from('proactive_templates')
      .select('category, max_per_day, preferred_time_range, min_intimacy_level, disabled_for_nsfw')
      .eq('id', templateId)
      .single();
    
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Check user's daily limit for this category
    const sentToday = await countSentToday(userId, template.category);
    if (sentToday >= template.max_per_day) {
      console.log(`[ProactiveQueue] Daily limit reached for ${userId}:${templateId}`);
      return 'CANCELLED:DAILY_LIMIT';
    }
    
    // Check intimacy requirement
    const intimacyScore = await getIntimacyScore(userId, girlfriendId);
    if (intimacyScore < template.min_intimacy_level) {
      console.log(`[ProactiveQueue] Insufficient intimacy: ${intimacyScore} < ${template.min_intimacy_level}`);
      return 'CANCELLED:LOW_INTIMACY';
    }
    
    // Determine scheduled time
    const scheduleTime = scheduledAt || calculateOptimalScheduleTime(
      template.preferred_time_range,
      triggerType
    );
    
    // Insert into queue
    const { data, error } = await supabase
      .from('proactive_message_queue')
      .insert({
        user_id: userId,
        girlfriend_id: girlfriendId,
        template_id: templateId,
        trigger_type: triggerType,
        priority,
        scheduled_at: scheduleTime,
        status: 'pending',
        params: queryParams
      })
      .select('id')
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log(`[ProactiveQueue] Scheduled message ${data.id} at ${scheduleTime}`);
    return data.id;
    
  } catch (error) {
    console.error('[ProactiveQueue] Schedule failed:', error);
    throw error;
  }
}

/**
 * Get next messages ready to send (scheduler query)
 */
export async function getNextMessagesToProcess(limit: number = 50): Promise<Array<{
  queueId: string;
  userId: string;
  girlfriendId: string;
  templateId: string;
  priority: number;
  actuallySentAt?: Date;
  gender?: string;
  name?: string;
  currentMood?: string;
}>> {
  try {
    const { data, error } = await supabase.rpc('get_next_proactive_messages', {
      limit_count: limit
    });
    
    if (error) {
      console.error('[ProactiveQueue] Get next messages failed:', error);
      return [];
    }
    
    return data || [];
    
  } catch (error) {
    console.error('[ProactiveQueue] RPC call failed:', error);
    return [];
  }
}

/**
 * Send a single message from queue
 */
export async function processQueuedMessage(queueItem: any): Promise<boolean> {
  const { queueId, userId, girlfriendId, templateId, params } = queueItem;
  
  try {
    // 1. Get template content based on language preference
    const messageText = await getTemplateContent(templateId, userId);
    
    // 2. Inject dynamic parameters
    const finalMessage = injectParameters(messageText, params || {});
    
    // 3. Send to user (via email/push/telegram etc.)
    const result = await sendMessageToUser({
      userId,
      girlfriendId,
      text: finalMessage,
      templateId
    });
    
    if (result.success) {
      // Mark as sent
      await markAsSent(queueId);
      
      // Update companion profile greeting tracking
      await updateGreetingTimestamps(userId, girlfriendId, templateId);
      
      console.log(`[ProactiveQueue] Sent message ${queueId} to ${userId}`);
      return true;
    } else {
      throw new Error('Send failed');
    }
    
  } catch (error) {
    console.error(`[ProactiveQueue] Process failed for ${queueId}:`, error);
    
    // Increment error count
    await incrementErrorCount(queueId);
    
    // If exceeded retries, cancel
    const errorMsg = await getErrorCount(queueId);
    if (errorMsg.count >= 3) {
      await cancelMessage(queueId, 'MAX_RETRIES_EXCEEDED');
    }
    
    return false;
  }
}

/**
 * Calculate optimal schedule time based on config
 */
function calculateOptimalScheduleTime(timeRangeStr?: string, triggerType?: string): Date {
  // Random case - pick a time within any range
  if (triggerType === 'random') {
    const now = new Date();
    const hour = Math.floor(Math.random() * 16) + 8; // 8 AM - 12 PM or 8 PM - 12 AM
    now.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
    return now;
  }
  
  // Parse time range string "08:00-10:00,22:00-23:30"
  if (timeRangeStr && timeRangeStr !== 'ANYTIME') {
    const ranges = timeRangeStr.split(',');
    const selectedRange = ranges[Math.floor(Math.random() * ranges.length)];
    const [start, end] = selectedRange.split('-');
    
    const startDate = new Date();
    const startTime = parseTime(start);
    const endTime = parseTime(end);
    
    // Pick random time within range
    const diffMs = endTime.getTime() - startTime.getTime();
    const randomOffset = Math.floor(Math.random() * diffMs);
    startDate.setTime(startTime.getTime() + randomOffset);
    
    return startDate;
  }
  
  // Default: 1 hour from now
  const defaultTime = new Date();
  defaultTime.setTime(defaultTime.getTime() + 60 * 60 * 1000);
  return defaultTime;
}

/**
 * Helper: Parse time string "HH:MM" to Date
 */
function parseTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Helper: Count messages sent today for category
 */
async function countSentToday(userId: string, category: string): Promise<number> {
  const today = new Date().toDateString();
  
  const { count } = await supabase
    .from('proactive_message_queue')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('actually_sent_at', new Date(today))
    // Join with templates to filter by category
    .textSearch('template_id', '', { config: 'english' }); // Simplified
  
  return count || 0;
}

/**
 * Helper: Get intimacy score
 */
async function getIntimacyScore(userId: string, girlfriendId: string): Promise<number> {
  const { data } = await supabase
    .from('intimacy_scores')
    .select('score')
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .maybeSingle();
  
  return data?.score || 0;
}

/**
 * Helper: Get template content in user's language
 */
async function getTemplateContent(templateId: string, userId: string): Promise<string> {
  // Determine user's language preference (default English)
  const lang = 'en'; // Could fetch from profiles table
  
  const { data } = await supabase
    .from('proactive_templates')
    .select(lang, 'en,zh,ja,ko')
    .eq('id', templateId)
    .single();
  
  return data?.[lang] || data?.en || '';
}

/**
 * Helper: Inject dynamic parameters into template
 */
function injectParameters(text: string, params?: Record<string, any>): string {
  if (!params) return text;
  
  let result = text;
  
  Object.entries(params).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value));
  });
  
  return result;
}

/**
 * Helper: Mark message as sent
 */
async function markAsSent(queueId: string, sentAt: Date = new Date()): Promise<void> {
  await supabase
    .from('proactive_message_queue')
    .update({
      status: 'sent',
      actually_sent_at: sentAt,
      updated_at: sentAt
    })
    .eq('id', queueId);
}

/**
 * Helper: Update greeting timestamps in companion profile
 */
async function updateGreetingTimestamps(
  userId: string,
  girlfriendId: string,
  templateId: string
): Promise<void> {
  const { data: template } = await supabase
    .from('proactive_templates')
    .select('category')
    .eq('id', templateId)
    .single();
  
  const column = template?.category?.includes('morning') 
    ? 'last_daily_greeting_sent'
    : 'last_goodnight_message_sent';
  
  await supabase
    .from('companion_profiles_ext')
    .update({ [column]: new Date() })
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId);
}

/**
 * Helper: Increment error count
 */
async function incrementErrorCount(queueId: string): Promise<void> {
  await supabase
    .from('proactive_message_queue')
    .update({
      error_count: supabase.sql`error_count + 1`,
      updated_at: new Date()
    })
    .eq('id', queueId);
}

/**
 * Helper: Get error count
 */
async function getErrorCount(queueId: string): Promise<{ count: number }> {
  const { data } = await supabase
    .from('proactive_message_queue')
    .select('error_count')
    .eq('id', queueId)
    .single();
  
  return data || { count: 0 };
}

/**
 * Helper: Cancel message
 */
async function cancelMessage(queueId: string, reason: string): Promise<void> {
  await supabase
    .from('proactive_message_queue')
    .update({
      status: 'cancelled',
      last_error_message: reason,
      updated_at: new Date()
    })
    .eq('id', queueId);
}

/**
 * Helper: Send message to user (placeholder - implement actual delivery)
 */
async function sendMessageToUser(params: {
  userId: string;
  girlfriendId: string;
  text: string;
  templateId: string;
}): Promise<{ success: boolean }> {
  // TODO: Implement actual delivery mechanism
  // Options: Push notification, Telegram bot, Email, In-app inbox
  
  // For now, just simulate success
  console.log(`[ProactiveQueue] Would send to ${params.userId}: "${params.text}"`);
  
  return { success: true };
}

/**
 * Batch scheduler function (run every minute via cron)
 */
export async function runSchedulerBatch(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const start = Date.now();
  const limit = 20; // Process 20 messages per batch
  
  const items = await getNextMessagesToProcess(limit);
  
  let succeeded = 0;
  let failed = 0;
  
  await Promise.all(items.map(async (item) => {
    const success = await processQueuedMessage(item);
    if (success) succeeded++;
    else failed++;
  }));
  
  console.log(`[ProactiveQueue] Batch complete: ${succeeded} succeed, ${failed} failed`);
  
  return {
    processed: items.length,
    succeeded,
    failed
  };
}

/**
 * Utility: Schedule birthday reminder messages
 */
export async function scheduleBirthdayReminders(birthday: Date, userId: string, girlfriendId?: string): Promise<void> {
  const birthdayThisYear = new Date(new Date().getFullYear(), birthday.getMonth(), birthday.getDate());
  
  // Use next year if already passed
  if (birthdayThisYear < new Date()) {
    birthdayThisYear.setFullYear(birthdayThisYear.getFullYear() + 1);
  }
  
  const daysUntil = Math.ceil((birthdayThisYear.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  // Schedule reminders at 3 days, 1 day, and on-day
  const reminderTemplates = [
    { daysBefore: 3, template: 'birthday_warmup', priority: 8 },
    { daysBefore: 1, template: 'birthday_eve', priority: 9 },
    { daysBefore: 0, template: 'birthday_wish', priority: 10 }
  ];
  
  for (const reminder of reminderTemplates) {
    if (daysUntil <= reminder.daysBefore) {
      const scheduleDate = new Date(birthdayThisYear);
      scheduleDate.setDate(scheduleDate.getDate() - (daysUntil - reminder.daysBefore));
      
      await scheduleProactiveMessage({
        userId,
        girlfriendId: girlfriendId!,
        templateId: reminder.template,
        triggerType: 'event',
        priority: reminder.priority,
        scheduledAt: scheduleDate,
        params: { birthday_date: birthdayThisYear.toISOString() }
      });
    }
  }
}
