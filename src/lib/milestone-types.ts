/**
 * 千人千面 · 关键节点与情景系统类型定义
 *
 * 关键节点（Milestone）：结构化事件存储，按关键词触发回忆
 * 情景（Scenario）：角色扮演的状态机
 */

export type MilestoneEventType =
  | 'movie'
  | 'restaurant'
  | 'gift'
  | 'anniversary'
  | 'conversation'
  | 'date'
  | 'game'
  | 'travel'
  | 'shopping'
  | 'cooking'
  | 'music'
  | 'sport'
  | 'work'
  | 'study'
  | 'party'
  | 'confession'
  | 'promise'
  | 'fight'
  | 'makeup'
  | 'intimate'
  | 'custom';

export type EmotionalContext =
  | 'happy'
  | 'romantic'
  | 'sad'
  | 'playful'
  | 'intimate'
  | 'serious'
  | 'funny'
  | 'angry'
  | 'anxious'
  | 'nostalgic'
  | 'surprising'
  | 'sweet'
  | 'bittersweet';

export type ScenarioPhase = 'intro' | 'development' | 'climax' | 'resolution';

export type ScenarioRelationshipType =
  | 'teacher'
  | 'sister'
  | 'younger_sister'
  | 'family'
  | 'boss'
  | 'neighbor'
  | 'stranger'
  | 'bestie'
  | 'coworker'
  | 'roommate'
  | 'maid'
  | 'princess'
  | 'rival';

export interface StructuredMilestone {
  id?: string;
  user_id?: string;
  girlfriend_id?: string;
  event_type: MilestoneEventType | string;
  title: string;
  description?: string;
  event_date?: string; // ISO date string
  participants?: string[];
  location?: string;
  emotional_context?: EmotionalContext | string;
  keywords: string[];
  importance: number; // 1-5
  created_at?: string;
  updated_at?: string;
}

export interface MilestoneExtractionResult {
  milestones: Omit<StructuredMilestone, 'id' | 'user_id' | 'girlfriend_id' | 'created_at' | 'updated_at'>[];
}

export interface MilestoneRecall {
  milestone: StructuredMilestone;
  relevance_score: number; // 0-1
  recall_text: string; // Natural language sentence to inject into prompt
}

export interface ScenarioState {
  phase: ScenarioPhase;
  current_scene?: string;
  context: Record<string, unknown>;
  emotional_beat?: string;
  props?: string[]; // props/items in the scene
  duration_beats?: number; // How many exchange turns this scenario has been active
}

export interface Scenario {
  id?: string;
  user_id?: string;
  girlfriend_id?: string;
  title: string;
  description?: string;
  relationship_type?: ScenarioRelationshipType | string;
  scenario_state: ScenarioState;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationMode {
  mode: 'scene' | 'dialogue';
  active_scenario_id?: string;
  started_at?: string;
}

/**
 * Format a milestone into a natural recall sentence for prompt injection.
 */
export function formatMilestoneRecall(milestone: StructuredMilestone, zh: boolean): string {
  const dateStr = milestone.event_date
    ? milestone.event_date.slice(0, 10)
    : '';
  const datePart = dateStr
    ? (zh ? `${dateStr}` : `on ${dateStr}`)
    : '';
  const who = milestone.participants && milestone.participants.length > 1
    ? (zh
        ? `你和${milestone.participants.filter(p => p !== 'me' && p !== 'user').join('、')}`
        : `you and ${milestone.participants.filter(p => p !== 'me' && p !== 'user').join(' and ')}`)
    : (zh ? '你们' : 'you two');

  if (zh) {
    const emotion = milestone.emotional_context
      ? `，当时${EMOTION_LABEL_ZH[milestone.emotional_context] || '很开心'}`
      : '';
    return `还记得${datePart}${datePart ? ' ' : ''}${who}一起${milestone.title}${emotion}吗？${milestone.description ? milestone.description + '。' : ''}`.trim();
  }

  const emotion = milestone.emotional_context
    ? `, it was ${milestone.emotional_context}`
    : '';
  return `Remember ${datePart}${datePart ? ' ' : ''}when ${who} ${milestone.title}${emotion}? ${milestone.description ? milestone.description + '.' : ''}`.trim();
}

const EMOTION_LABEL_ZH: Record<string, string> = {
  happy: '特别开心',
  romantic: '很浪漫',
  sad: '有点难过',
  playful: '特别好玩',
  intimate: '很亲密',
  serious: '很认真',
  funny: '特别搞笑',
  angry: '有点生气',
  anxious: '有点紧张',
  nostalgic: '让人怀念',
  surprising: '很惊喜',
  sweet: '很甜蜜',
  bittersweet: '又甜又酸',
};