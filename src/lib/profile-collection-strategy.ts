/**
 * Profile Collection Strategy Engine
 *
 * Progressive data collection through natural conversation.
 * The system gradually learns about the user by asking questions
 * at appropriate moments — not interrogation, but natural social exchange.
 */

import type { LifecyclePhase } from '@/lib/conversation-lifecycle';
import { isPhaseReached } from '@/lib/conversation-lifecycle';

/** User profile schema — stored in companion_profiles_ext.user_profile JSONB. */
export interface UserProfile {
  nickname?: string;
  real_name?: string;
  age?: number;
  gender?: string;
  city?: string;
  occupation?: string;
  work_schedule?: string;
  hobbies?: string[];
  food_preferences?: string[];
  pets?: string[];
  communication_style?: string;
  pet_peeves?: string[];
  love_language?: string;
  relationship_status?: string;
  family?: string[];
  _fields_collected: string[];
  _last_asked_field?: string;
  _last_asked_at?: string;
}

export const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  nickname:           { zh: '怎么称呼他', en: 'what to call him' },
  real_name:          { zh: '真名', en: 'real name' },
  age:                { zh: '年龄', en: 'age' },
  gender:             { zh: '性别', en: 'gender' },
  city:               { zh: '所在城市', en: 'city' },
  occupation:         { zh: '职业', en: 'occupation' },
  work_schedule:      { zh: '作息习惯', en: 'work schedule' },
  hobbies:            { zh: '爱好', en: 'hobbies' },
  food_preferences:   { zh: '饮食偏好', en: 'food preferences' },
  pets:               { zh: '宠物', en: 'pets' },
  love_language:      { zh: '爱的语言', en: 'love language' },
  pet_peeves:         { zh: '雷点', en: 'pet peeves' },
  family:             { zh: '家庭情况', en: 'family' },
  communication_style:{ zh: '交流偏好', en: 'communication style' },
  relationship_status:{ zh: '感情状态', en: 'relationship status' },
};

interface CollectionPriority {
  field: keyof Omit<UserProfile, '_fields_collected' | '_last_asked_field' | '_last_asked_at'>;
  phase: LifecyclePhase;
  naturalTrigger: { zh: string; en: string };
  askProbability: number;
}

/** Collection priorities — when to ask about what. */
const COLLECTION_PRIORITIES: CollectionPriority[] = [
  // first_add / intro_phase (ice-breaking)
  { field: 'nickname',        phase: 'first_add',        naturalTrigger: { zh: '开场白结尾', en: 'end of opening message' }, askProbability: 1.0 },
  { field: 'real_name',       phase: 'intro_phase',      naturalTrigger: { zh: '聊到名字相关话题时', en: 'when names come up' }, askProbability: 0.8 },
  { field: 'occupation',      phase: 'intro_phase',      naturalTrigger: { zh: '聊到工作/白天做什么时', en: 'when work / daytime activities come up' }, askProbability: 0.7 },
  { field: 'city',            phase: 'intro_phase',      naturalTrigger: { zh: '聊到天气/地方/旅行时', en: 'when weather / places / travel come up' }, askProbability: 0.6 },
  { field: 'age',             phase: 'intro_phase',      naturalTrigger: { zh: '聊到年龄/生日/星座时', en: 'when age / birthday / zodiac come up' }, askProbability: 0.5 },

  // daily_engagement (flirting)
  { field: 'hobbies',         phase: 'daily_engagement',  naturalTrigger: { zh: '聊到周末做什么/兴趣时', en: 'when weekend / interests come up' }, askProbability: 0.7 },
  { field: 'food_preferences',phase: 'daily_engagement',  naturalTrigger: { zh: '聊到吃饭/做饭/餐厅时', en: 'when food / cooking / restaurants come up' }, askProbability: 0.6 },
  { field: 'pets',            phase: 'daily_engagement',  naturalTrigger: { zh: '聊到动物/宠物/可爱时', en: 'when animals / pets / cute things come up' }, askProbability: 0.5 },
  { field: 'work_schedule',   phase: 'daily_engagement',  naturalTrigger: { zh: '聊到作息/早起/熬夜时', en: 'when schedule / early rising / staying up come up' }, askProbability: 0.5 },

  // deepening (passionate)
  { field: 'love_language',   phase: 'deepening',         naturalTrigger: { zh: '聊到感情/表达爱的方式时', en: 'when feelings / expressing love come up' }, askProbability: 0.4 },
  { field: 'pet_peeves',      phase: 'deepening',         naturalTrigger: { zh: '聊到讨厌什么/不喜欢时', en: 'when dislikes / annoyances come up' }, askProbability: 0.5 },
  { field: 'family',          phase: 'deepening',         naturalTrigger: { zh: '聊到家人/家庭/童年时', en: 'when family / childhood come up' }, askProbability: 0.4 },
  { field: 'communication_style', phase: 'deepening',     naturalTrigger: { zh: '聊到交流偏好时', en: 'when communication preferences come up' }, askProbability: 0.3 },
];

/**
 * Determine if the companion should ask about a field in this conversation turn.
 */
export function shouldCollectField(input: {
  userProfile: UserProfile;
  currentPhase: LifecyclePhase;
  messagesSinceLastAsk: number;
  conversationTopic?: string;
  locale: string;
}): { shouldAsk: boolean; field?: string; triggerHint: string } {
  const profile = input.userProfile;
  const collected = new Set(profile._fields_collected || []);
  const zh = input.locale.startsWith('zh');

  // Cooldown: at least 3 messages between questions
  if (input.messagesSinceLastAsk < 3) return { shouldAsk: false, triggerHint: '' };

  // Filter candidates for current phase that haven't been collected
  const candidates = COLLECTION_PRIORITIES.filter(
    (c) => !collected.has(c.field) && isPhaseReached(c.phase, input.currentPhase),
  );
  if (candidates.length === 0) return { shouldAsk: false, triggerHint: '' };

  // Priority: match current conversation topic
  for (const c of candidates) {
    const trigger = zh ? c.naturalTrigger.zh : c.naturalTrigger.en;
    if (input.conversationTopic && matchesTrigger(trigger, input.conversationTopic)) {
      if (Math.random() < c.askProbability) {
        return { shouldAsk: true, field: c.field, triggerHint: trigger };
      }
    }
  }

  // No topic match → 15% random pick
  if (Math.random() < 0.15) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const trigger = zh ? pick.naturalTrigger.zh : pick.naturalTrigger.en;
    return { shouldAsk: true, field: pick.field, triggerHint: trigger };
  }

  return { shouldAsk: false, triggerHint: '' };
}

/** Simple topic-trigger matching. */
function matchesTrigger(trigger: string, topic: string): boolean {
  const keywords = trigger.split(/[\/,、]/).map((k) => k.trim().toLowerCase());
  const topicLower = topic.toLowerCase();
  return keywords.some((k) => k.length > 1 && topicLower.includes(k));
}

/**
 * Build the prompt instruction telling the LLM what to collect.
 */
export function buildCollectionPromptInstruction(input: {
  userProfile: UserProfile;
  fieldToCollect?: string;
  triggerHint: string;
  zh: boolean;
}): string {
  if (!input.fieldToCollect) return '';

  const known = Object.entries(input.userProfile)
    .filter(([k, v]) => !k.startsWith('_') && v)
    .map(([k, v]) => {
      const label = (FIELD_LABELS[k]?.[input.zh ? 'zh' : 'en']) || k;
      const value = Array.isArray(v) ? v.join(', ') : String(v);
      return `${label}: ${value}`;
    })
    .join(', ');

  const fieldLabel = (FIELD_LABELS[input.fieldToCollect]?.[input.zh ? 'zh' : 'en']) || input.fieldToCollect;

  return input.zh
    ? `\n【你对他的了解】${known || '还不太了解他'}
【本次对话】你可以自然地问一下他的${fieldLabel}。${input.triggerHint}。记住用你自己的方式问，不要生硬。如果他回答了，记住这个信息。`
    : `\n[What you know about him] ${known || 'Not much yet'}
[This turn] You can naturally ask about his ${fieldLabel}. ${input.triggerHint}. Ask in your own voice, not mechanically. If he answers, remember it.`;
}

/**
 * Build the "what you already know" prompt injection for every conversation.
 */
export function buildKnownUserProfilePrompt(profile: UserProfile, zh: boolean): string {
  const entries = Object.entries(profile).filter(([k, v]) => !k.startsWith('_') && v);
  if (entries.length === 0) return '';

  const items = entries
    .map(([k, v]) => {
      const label = (FIELD_LABELS[k]?.[zh ? 'zh' : 'en']) || k;
      const value = Array.isArray(v) ? v.join(', ') : String(v);
      return `- ${label}: ${value}`;
    })
    .join('\n');

  return zh
    ? `\n【你了解的他】\n${items}\n\n请在对话中自然地使用这些信息，比如用他喜欢的称呼叫他，提到他的爱好时表现出记得。不要刻意罗列这些信息。`
    : `\n[What you know about him]\n${items}\n\nUse this naturally — call him by his preferred name, show you remember his interests. Don't list these out mechanically.`;
}
