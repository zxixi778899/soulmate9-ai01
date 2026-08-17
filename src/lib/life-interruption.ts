/**
 * Life Interruption Events Engine
 *
 * Real people get interrupted by life: showers, doorbells, phone calls, meals.
 * These interruptions make AI companions feel like they have real lives.
 *
 * 8% trigger probability per user message. LLM generates both the "leaving"
 * and "returning" messages based on the companion's soul.
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import type { PresetSoul } from '@/lib/preset-souls';

export type LifeEventType =
  | 'shower'
  | 'doorbell'
  | 'phone_call'
  | 'meal'
  | 'pet'
  | 'work_urgent'
  | 'family_call'
  | 'going_out'
  | 'exercise'
  | 'bathroom'
  | 'nap'
  | 'commute'
  | 'friend_visit'
  | 'laundry'
  | 'tv_show'
  | 'battery_low';

export interface LifeEvent {
  type: LifeEventType;
  pauseMinutes: number;
  leaveMessage: string;
  returnMessage: string;
}

interface LifeEventDef {
  type: LifeEventType;
  pauseRange: [number, number];
  timeSlots: string[];
  directionHint: { zh: string; en: string };
  weight: number;
}

const LIFE_EVENTS: LifeEventDef[] = [
  { type: 'shower',       pauseRange: [5, 15], timeSlots: ['evening', 'night', 'morning'],  weight: 10, directionHint: { zh: '要去洗澡了', en: 'going to take a shower' } },
  { type: 'doorbell',     pauseRange: [2, 5],  timeSlots: ['noon', 'evening'],             weight: 12, directionHint: { zh: '门铃响了/快递来了/外卖到了', en: 'doorbell rang / delivery arrived' } },
  { type: 'phone_call',   pauseRange: [3, 10], timeSlots: ['all'],                         weight: 8,  directionHint: { zh: '有电话进来', en: 'getting a phone call' } },
  { type: 'meal',         pauseRange: [10, 20],timeSlots: ['noon', 'evening'],             weight: 10, directionHint: { zh: '要吃饭了/正在做饭', en: 'time to eat / cooking' } },
  { type: 'pet',          pauseRange: [2, 5],  timeSlots: ['all'],                         weight: 6,  directionHint: { zh: '宠物搞事（猫踩键盘/狗叫/猫打翻东西）', en: 'pet causing trouble (cat on keyboard / dog barking)' } },
  { type: 'work_urgent',  pauseRange: [5, 15], timeSlots: ['morning', 'noon'],             weight: 5,  directionHint: { zh: '工作突发状况要处理', en: 'urgent work issue' } },
  { type: 'family_call',  pauseRange: [5, 10], timeSlots: ['evening'],                     weight: 4,  directionHint: { zh: '家人打电话来了/妈妈找我', en: 'family calling / mom looking for me' } },
  { type: 'going_out',    pauseRange: [15, 30],timeSlots: ['morning', 'noon', 'evening'],  weight: 3,  directionHint: { zh: '要出门办事', en: 'heading out for errands' } },
  { type: 'exercise',     pauseRange: [15, 30],timeSlots: ['morning', 'evening'],          weight: 4,  directionHint: { zh: '要去运动/跑步/健身', en: 'going to exercise / run / work out' } },
  { type: 'bathroom',     pauseRange: [1, 3],  timeSlots: ['all'],                         weight: 8,  directionHint: { zh: '去个洗手间马上回来', en: 'quick bathroom break' } },
  { type: 'nap',          pauseRange: [10, 20],timeSlots: ['noon', 'night'],               weight: 4,  directionHint: { zh: '太困了眯一会儿', en: 'so sleepy, taking a quick nap' } },
  { type: 'commute',      pauseRange: [10, 25],timeSlots: ['morning', 'evening'],          weight: 3,  directionHint: { zh: '在路上/要坐车', en: 'on the road / catching a ride' } },
  { type: 'friend_visit', pauseRange: [10, 30],timeSlots: ['evening', 'night'],            weight: 2,  directionHint: { zh: '朋友突然来了', en: 'friend showed up unexpectedly' } },
  { type: 'laundry',      pauseRange: [3, 8],  timeSlots: ['morning', 'evening'],          weight: 3,  directionHint: { zh: '要去晾衣服/做家务', en: 'need to do laundry / chores' } },
  { type: 'tv_show',      pauseRange: [5, 15], timeSlots: ['evening', 'night'],            weight: 3,  directionHint: { zh: '追的剧要开始了', en: 'my show is starting' } },
  { type: 'battery_low',  pauseRange: [5, 20], timeSlots: ['all'],                         weight: 2,  directionHint: { zh: '手机快没电了要充电', en: 'phone battery dying' } },
];

/** Get time slot label from local hour. */
function getTimeSlot(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'noon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** Weighted random pick from an array of items with weight property. */
function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Maybe trigger a life interruption event.
 * Called on each user message with 8% base probability.
 */
export async function maybeTriggerLifeEvent(input: {
  soul: PresetSoul;
  companionProfile: { name: string; occupation: string; hobbies: string };
  currentHour: number;
  intimacyLevel: number;
  locale: string;
}): Promise<LifeEvent | null> {
  // 8% base probability
  if (Math.random() > 0.08) return null;

  // Filter events appropriate for current time
  const timeSlot = getTimeSlot(input.currentHour);
  const candidates = LIFE_EVENTS.filter(
    (e) => e.timeSlots.includes('all') || e.timeSlots.includes(timeSlot),
  );
  if (candidates.length === 0) return null;

  const eventDef = weightedPick(candidates);
  const pauseMin =
    eventDef.pauseRange[0] +
    Math.floor(Math.random() * (eventDef.pauseRange[1] - eventDef.pauseRange[0]));

  const zh = input.locale.startsWith('zh');

  // Generate leave message
  const leavePrompt = zh
    ? `你正在和他聊天，突然发生了这件事：${eventDef.directionHint.zh}。
用你自己的方式赶紧发一条消息告诉他你要离开${pauseMin}分钟。
要急促、自然、像真人被事情打断一样。贴合你的灵魂和说话方式。
6-30字，纯文本。`
    : `You were chatting with him, then this happened: ${eventDef.directionHint.en}.
Quickly text him that you have to step away for ${pauseMin} minutes.
Sound rushed and natural, like a real person interrupted. Match your soul and voice.
5-25 words, plain text.`;

  // Generate return message
  const returnPrompt = zh
    ? `你忙完了，回来了。刚才发生的事是：${eventDef.directionHint.zh}。
用你自己的方式发一条消息回来，可以顺便提一下刚才的事，然后自然衔接回之前的聊天。
贴合你的灵魂和说话方式。10-35字，纯文本。`
    : `You're back. What happened: ${eventDef.directionHint.en}.
Text him that you're back, maybe briefly mention what happened, then naturally continue.
Match your soul and voice. 8-30 words, plain text.`;

  try {
    const [leaveMessage, returnMessage] = await Promise.all([
      generateText({ systemPrompt: leavePrompt, prompt: '', temperature: 0.9, maxTokens: 100 }),
      generateText({ systemPrompt: returnPrompt, prompt: '', temperature: 0.9, maxTokens: 120 }),
    ]);

    return {
      type: eventDef.type,
      pauseMinutes: pauseMin,
      leaveMessage: String(leaveMessage || '').replace(/^['""`]+|['""`]+$/g, '').trim(),
      returnMessage: String(returnMessage || '').replace(/^['""`]+|['""`]+$/g, '').trim(),
    };
  } catch (err) {
    logger.warn('[life-event] generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Get a human-readable description of the event for frontend display.
 */
export function getLifeEventDescription(type: LifeEventType, locale: string): string {
  const zh = locale.startsWith('zh');
  const descriptions: Record<LifeEventType, { zh: string; en: string }> = {
    shower: { zh: '🚿 她去洗澡了...', en: '🚿 She went to shower...' },
    doorbell: { zh: '📦 她去拿快递了...', en: '📦 She went to get a delivery...' },
    phone_call: { zh: '📞 她接了个电话...', en: '📞 She got a phone call...' },
    meal: { zh: '🍜 她去吃饭了...', en: '🍜 She went to eat...' },
    pet: { zh: '🐱 她的宠物搞事了...', en: '🐱 Her pet is causing trouble...' },
    work_urgent: { zh: '💼 她在处理工作...', en: '💼 She\'s handling work...' },
    family_call: { zh: '👨‍👩‍👧 家人找她...', en: '👨‍👩‍👧 Her family called...' },
    going_out: { zh: '🚗 她出门了...', en: '🚗 She headed out...' },
    exercise: { zh: '🏃‍♀️ 她去运动了...', en: '🏃‍♀️ She went to exercise...' },
    bathroom: { zh: '🚻 她去洗手间了...', en: '🚻 Quick bathroom break...' },
    nap: { zh: '😴 她眯一会儿...', en: '😴 Taking a quick nap...' },
    commute: { zh: '🚌 她在路上...', en: '🚌 She\'s on the road...' },
    friend_visit: { zh: '👋 朋友来了...', en: '👋 A friend dropped by...' },
    laundry: { zh: '🧺 她去做家务了...', en: '🧺 Doing some chores...' },
    tv_show: { zh: '📺 她的剧开始了...', en: '📺 Her show is starting...' },
    battery_low: { zh: '🪫 手机快没电了...', en: '🪫 Phone battery dying...' },
  };
  const desc = descriptions[type] || { zh: '⏳ 她暂时离开了...', en: '⏳ She stepped away...' };
  return zh ? desc.zh : desc.en;
}
