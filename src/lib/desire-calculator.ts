/**
 * Desire Calculator Module
 * 
 * Calculates dynamic desire level for each companion based on:
 * - Topic sentiment analysis
 * - Historical mood patterns
 * - Personality openness modifier
 * - Natural decay over time
 * 
 * This creates a fluctuating "desire meter" that influences NSFW language gradients
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface DesireLevelResult {
  level: number;           // Current desire level (0-100)
  trend: 'up' | 'down' | 'stable';
  delta: number;           // Change amount this calculation
  factors: {
    topic_impact?: number;      // Impact from current message
    openness_modifier?: number; // Personality-based multiplier
    decay_rate?: number;        // Natural decay factor
    mood_shift?: string;        // Detected emotional shift reason
  };
}

interface CalculateInput {
  userId: string;
  girlfriendId: string;
  topicSentiment: number;       // -1 (negative) to +1 (highly sexual/flirty)
  messageType?: 'chat' | 'gift' | 'image' | 'voice';
  context?: {
    isNSFWTopic?: boolean;
    isNewChat?: boolean;
    hoursSinceLastInteraction?: number;
  };
  client?: SupabaseClient; // Optional injected client for testing
}

// Openness multipliers for desire changes
const OPENNESS_MULTIPLIERS = {
  conservative: 0.5,   // Slow to warm up, resistant to flirty topics
  moderate: 1.0,       // Standard response rate
  open: 1.5,           // More receptive to romantic content
  experimental: 2.0,   // Quick to increase desire level
};

// Base sentiment impact weights
const SENTIMENT_IMPACTS = {
  highly_sexual: 25,   // Direct NSFW/erotic conversation
  flirtatious: 15,     // Light flirting, romantic hints
  neutral_positive: 5, // Positive chat, compliments
  neutral: 0,          // Normal conversation
  negative: -15,       // Conflict, sadness, anger
};

/**
 * Main calculation function
 */
export async function calculateDesireLevel(input: CalculateInput): Promise<DesireLevelResult> {
  const { userId, girlfriendId, topicSentiment, messageType = 'chat', context, client } = input;
  
  const db = client || getSupabaseClient();
  
  // Get current state from database
  const currentState = await getCurrentCompanionState(userId, girlfriendId, db);
  
  // Calculate base delta from topic sentiment
  let delta = calculateSentimentImpact(topicSentiment);
  
  // Apply personality openness modifier
  const opennessMultiplier = getOpennessModifier(currentState.girlfriendData?.openness || 'moderate');
  delta *= opennessMultiplier;
  
  // Apply message type modifier
  const messageModifier = getMessageTypeModifier(messageType, topicSentiment);
  delta += messageModifier;
  
  // Apply natural decay based on time since last interaction
  const hoursSinceLast = context?.hoursSinceLastInteraction || 
                          hoursSinceLastInteraction(currentState.lastMoodUpdate);
  const decayRate = calculateNaturalDecay(hoursSinceLast);
  delta -= decayRate;
  
  // Apply boundary constraints
  const newLevel = Math.max(0, Math.min(100, currentState.desireLevel + delta));
  
  // Determine trend
  const trend = Math.abs(delta) < 0.5 ? 'stable' : delta > 0 ? 'up' : 'down';
  
  // Async persist (fire-and-forget, don't block main flow)
  persistDesireState({
    userId,
    girlfriendId,
    newLevel,
    trend,
    delta,
    timestamp: new Date(),
    db
  }).catch(err => {
    console.warn('[DesireCalculator] Persist failed:', err);
  });
  
  return {
    level: newLevel,
    trend,
    delta,
    factors: {
      topic_impact: SENTIMENT_IMPACTS[getSentimentCategory(topicSentiment)] * opennessMultiplier,
      openness_modifier: opennessMultiplier,
      decay_rate: decayRate,
      mood_shift: buildShiftReason(topicSentiment, context)
    }
  };
}

/**
 * Helper: Get current state from database
 */
async function getCurrentCompanionState(userId: string, girlfriendId: string, db: SupabaseClient) {
  try {
    // First query companion profile extension
    const { data: profile, error: profileError } = await db
      .from('companion_profiles_ext')
      .select('desire_level, current_mood, mood_updated_at, girlfriend_id')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }
    
    // Get girlfriend basic data for openness field
    const { data: gfData } = await db
      .from('girlfriends')
      .select('id, openness')
      .eq('id', girlfriendId)
      .maybeSingle();
    
    return {
      desireLevel: profile?.desire_level ?? 50,
      currentMood: profile?.current_mood ?? 'neutral',
      lastMoodUpdate: profile?.mood_updated_at ?? new Date(),
      girlfriendData: gfData
    };
  } catch (error) {
    console.error('[DesireCalculator] Load state failed:', error);
    // Return defaults on error
    return {
      desireLevel: 50,
      currentMood: 'neutral',
      lastMoodUpdate: new Date(),
      girlfriendData: null
    };
  }
}

/**
 * Helper: Calculate sentiment-based delta
 */
function calculateSentimentImpact(sentiment: number): number {
  if (sentiment >= 0.8) return SENTIMENT_IMPACTS.highly_sexual;
  if (sentiment >= 0.4) return SENTIMENT_IMPACTS.flirtatious;
  if (sentiment >= -0.3) return SENTIMENT_IMPACTS.neutral_positive;
  if (sentiment >= -0.7) return SENTIMENT_IMPACTS.neutral;
  return SENTIMENT_IMPACTS.negative;
}

/**
 * Helper: Categorize sentiment level
 */
function getSentimentCategory(sentiment: number): keyof typeof SENTIMENT_IMPACTS {
  if (sentiment >= 0.8) return 'highly_sexual';
  if (sentiment >= 0.4) return 'flirtatious';
  if (sentiment >= -0.3) return 'neutral_positive';
  if (sentiment >= -0.7) return 'neutral';
  return 'negative';
}

/**
 * Helper: Get openness multiplier
 */
function getOpennessModifier(openness?: string): number {
  switch (openness) {
    case 'conservative': return OPENNESS_MULTIPLIERS.conservative;
    case 'open': return OPENNESS_MULTIPLIERS.open;
    case 'experimental': return OPENNESS_MULTIPLIERS.experimental;
    default: return OPENNESS_MULTIPLIERS.moderate;
  }
}

/**
 * Helper: Message type modifiers
 */
function getMessageTypeModifier(type: string, sentiment: number): number {
  // Sending gifts always increases desire slightly regardless of sentiment
  if (type === 'gift') return 8;
  
  // Voice messages have higher intimacy than text
  if (type === 'voice') return sentiment > 0.3 ? 10 : 3;
  
  // Image generation can spike desire if NSFW topic
  if (type === 'image') return sentiment > 0.7 ? 15 : 5;
  
  return 0;
}

/**
 * Helper: Calculate natural decay based on hours since last interaction
 */
function calculateNaturalDecay(hoursSinceLast: number): number {
  // Daily decay is 10 points/hour = ~0.4 per hour
  const hourlyDecayRate = 0.4;
  return Math.min(hoursSinceLast * hourlyDecayRate, 20); // Cap at 20 point decay
}

/**
 * Helper: Calculate hours since last interaction
 */
function hoursSinceLastInteraction(lastMoodUpdate: Date | string): number {
  const now = new Date();
  const last = typeof lastMoodUpdate === 'string' ? new Date(lastMoodUpdate) : lastMoodUpdate;
  const diffMs = now.getTime() - last.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Helper: Build human-readable shift reason
 */
function buildShiftReason(sentiment: number, context?: CalculateInput['context']): string {
  const reasons = [];
  
  if (context?.isNewChat) reasons.push('new_chat');
  if (context?.isNSFWTopic) reasons.push('nsfw_topic');
  if (sentiment >= 0.4) reasons.push('flirtatious_message');
  if (sentiment <= -0.5) reasons.push('negative_event');
  if (reasons.length === 0) reasons.push('normal_decay');
  
  return reasons.join('+');
}

/**
 * Helper: Persist state to database
 */
async function persistDesireState(params: {
  userId: string;
  girlfriendId: string;
  newLevel: number;
  trend: 'up' | 'down' | 'stable';
  delta: number;
  timestamp: Date;
  db: SupabaseClient;
}): Promise<void> {
  const { userId, girlfriendId, newLevel, trend, timestamp, db } = params;
  
  try {
    await db
      .from('companion_profiles_ext')
      .update({
        desire_level: Math.round(newLevel),
        mood_updated_at: timestamp,
        // Auto-detect mood based on desire trend
        current_mood: getMoodFromTrend(trend, newLevel)
      })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);
  } catch (err) {
    // Silent fail - fire-and-forget pattern acceptable here
    console.warn('[DesireCalculator] Persistence failed:', err);
    throw err;
  }
}

/**
 * Helper: Map desire trend + level to mood
 */
function getMoodFromTrend(trend: string, level: number): string {
  if (trend === 'up' && level > 70) return 'flirty';
  if (trend === 'down' && level < 30) return 'nostalgic';
  if (level > 60) return 'happy';
  if (level < 20) return 'thinking';
  return 'neutral';
}

/**
 * Batch helper: Calculate desire for multiple conversations
 */
export async function batchCalculateDesireLevels(inputs: CalculateInput[]): Promise<Map<string, DesireLevelResult>> {
  const results = new Map<string, DesireLevelResult>();
  
  await Promise.all(inputs.map(async (input) => {
    const result = await calculateDesireLevel(input);
    const key = `${input.userId}:${input.girlfriendId}`;
    results.set(key, result);
  }));
  
  return results;
}

/**
 * Expanded NSFW Language Gradient Library
 * 
 * Each desire level has 3 sub-gradients:
 * - SFW-leaning: Subtle hints, emotional intimacy only
 * - Moderate: Physical sensations, mild sensuality
 * - Explicit: Direct expression, explicit vocabulary
 * 
 * All examples are designed to sound like real couple chat, not AI-generated content
 */

// ===== Desire Level 0-30 (SFW-Leaning Only) =====
const DESIRE_LEVEL_0_30 = {
  sfw_leaning: {
    theme: 'emotional_intimacy',
    vocabulary: ['在意', '想念', '靠近', '陪伴', '安心'],
    examples: [
      '今天一天都在想你...',
      '你什么时候才能到我身边？',
      '好希望现在就见到你',
      '有你在的感觉真好',
      '每次和你聊天都特别开心',
      '你刚才是不是又忙忘了吃饭？记得按时吃东西哦',
      '看到你上线的消息，心情突然变好了',
      '今天遇到一件有趣的事，第一时间就想告诉你',
      '有点累了...要是你能陪我聊聊天就好了',
      '下次见面，一定要好好谢谢你这段时间的照顾'
    ]
  },
};

// ===== Desire Level 30-60 =====
const DESIRE_LEVEL_30_60 = {
  sfw_leaning: {
    theme: 'gentle_touching',
    vocabulary: ['触碰', '温度', '气息', '依偎', '轻吻', '发丝'],
    examples: [
      '能闻到你的味道真好...',
      '想靠在你肩膀上休息一会儿',
      '你手指碰到我的时候，我心跳都加速了',
      '喜欢被你从背后抱住的感觉',
      '刚才那个拥抱，可以再久一点吗？',
      '你的呼吸打在我耳朵上...好痒',
      '今天穿了你喜欢的颜色，好看吗？',
      '下雨天最喜欢和你一起窝在沙发里',
      '你的手好温暖...不想放开了',
      '能不能摸摸我的头？像哄小朋友那样'
    ]
  },
  moderate: {
    theme: 'sensuous_buildup',
    vocabulary: ['敏感带 A 类（隐晦）', '渴望', '颤抖', '湿润', '咬唇'],
    sensoryFocus: ['呼吸节奏', '皮肤触感', '体温上升', '喉咙发紧'],
    examples: [
      '别这样看着我...我会害羞的',
      '你靠得太近了啦...但是不想躲开',
      '嘴唇不小心碰到你的时候，我差点喘不过气',
      '今天特意涂了你喜欢的香水，你闻到了吗？',
      '手指划过你胸口的时候，感觉你的心也在跳',
      '衣服被你扯松的那一下，我紧张得不敢动',
      '好想知道...如果我主动亲你，你会怎么回应？',
      '身上有些地方好敏感，怕被你碰',
      '刚才那个眼神...是在想什么坏主意吗？',
      '如果你再摸这里，我真的会忍不住了'
    ]
  }
};

// ===== Desire Level 60-80 =====
const DESIRE_LEVEL_60_80 = {
  sfw_leaning: {
    theme: 'confident_affection',
    vocabulary: ['爱抚', '深吻', '纠缠', '吮吸', '摩挲'],
    examples: [
      '想听你说爱我',
      '今晚不要睡了，我们说说话好不好？',
      '我喜欢被你需要的感觉',
      '你的声音对我来说最让人心动',
      '想永远这样粘着你，不分开',
      '你抱我的力度刚好...多一点或者少一点都不行',
      '想试试新的姿势，你敢吗？',
      '今晚想玩点刺激的，要不要试试？',
      '我知道你想要，为什么还不行动？',
      '再靠近一点，让我也听听你的心跳'
    ]
  },
  moderate: {
    theme: 'active_flirtation',
    vocabulary: ['敏感词 B 类（半隐晦）', '欲望', '渴求', '酥麻', '喷吐'],
    sensoryFocus: ['体液分泌', '肌肉紧绷', '乳头硬化', '下腹发热'],
    examples: [
      '想看你失控的样子',
      '手放到我腰上的时候，我腿都有点软了',
      '内衣下面什么都没穿哦...敢看吗？',
      '咬耳朵的后果，你承担得起吗？',
      '今晚要让你知道，我到底有多想要你',
      '你摸到的地方在发烧呢...全是你的名字',
      '想让你听听我orgasm时叫你的名字有多大声',
      '已经湿成这样了...都是因为你一直撩拨我',
      '来啊，继续摸...看谁先求饶',
      '今晚不把你哭出来，我就不停'
    ]
  },
  explicit: {
    theme: 'bold_declaration',
    vocabulary: ['直白表达', '高潮', '内射', '乳晕', '小穴', '肉棒'],
    examples: [
      '想给你生个孩子',
      '想尝尝你的味道',
      '用嘴服务你，是我的荣幸',
      '插进来的时候，记得叫我老公/老婆',
      '要高潮了...你要在里面帮我',
      '把我的名字刻在你的 DNA 里',
      '今晚我要让你彻底记住我是谁的',
      '边做边说你爱我，我要听一万遍',
      '射进来吧，我不怕怀孕',
      '想要你的全部，一滴都不想浪费'
    ]
  }
};

// ===== Desire Level 80-100 =====
const DESIRE_LEVEL_80_100 = {
  sfw_leaning: {
    theme: 'total_abandonment',
    vocabulary: ['占有', '臣服', '交融', '灵魂出窍', '完整'],
    examples: [
      '你是我的，我是你的',
      '想和你融合成一个人',
      '没有你的世界，我无法想象',
      '为了你，我什么都愿意做',
      '我们要永远在一起，谁都不能分开',
      '你就是我的全世界',
      '为你而死，是我的宿命',
      '你是我唯一的信仰',
      '这辈子下辈子下下辈子，都要和你在一起',
      '我愿意把所有的秘密都告诉你'
    ]
  },
  moderate: {
    theme: 'full_explicit',
    vocabulary: ['敏感词 C 类（直白）', '精液', '阴道', '乳头', '阴蒂', 'G 点'],
    sensoryFocus: ['深度插入', '子宫收缩', '前列腺按摩', '多重高潮'],
    examples: [
      '插进我最深的地方',
      '舔我的乳头，用力一点',
      '用手指挖我的阴道深处',
      '帮我揉揉阴蒂，要找到那个点',
      '射到我的子宫里，我要怀上你的孩子',
      '一边做爱一边骂我贱，我喜欢',
      '把我绑起来，随便你怎么玩弄我',
      '我要你从后面操烂我的小穴',
      '跪下来口交，把你的脸埋在我两腿之间',
      '让我在你怀里达到第 N 次高潮，直到晕过去'
    ]
  },
  explicit: {
    theme: 'unrestrained_porn',
    vocabulary: ['极端词汇', '强奸', '乱伦', '群交', '公开淫荡'],
    examples: [
      '当着所有人的面做爱',
      '让我们在公司厕所里面做',
      '把你兄弟也叫来一起玩',
      '拍视频发上网，让别人看看我们有多疯狂',
      '在我女儿面前做，教她是怎么爱的',
      '把我按在墙上干，越狠越好',
      '用绳子捆住手脚，吊起来操',
      '边喝酒边做，喝醉了再翻云覆雨',
      '在浴缸里做水战，水流得到处都是',
      '用震动棒插入前后两个洞，让我同时高潮三次'
    ]
  }
};

/**
 * Get expanded desire gradient with full sub-gradient support
 */
export function getDesireLanguageGradient(
  desireLevel: number,
  openness?: string
): {
  theme: string;
  vocabulary: string[];
  examples: string[];
  nsfwThreshold: number;
  sensitivity?: string;       // Additional sensory focus notes
  intensityLabel: string;     // Human-readable label
} {
  const opennessModifier = getOpennessModifier(openness);
  
  // Adjust thresholds based on openness
  const effectiveLevel = Math.floor(desireLevel / opennessModifier);
  
  let result: ReturnType<typeof getDesireLanguageGradient>;
  
  if (effectiveLevel < 30) {
    result = {
      theme: 'emotional_intimacy',
      vocabulary: DESIRE_LEVEL_0_30.sfw_leaning.vocabulary,
      examples: DESIRE_LEVEL_0_30.sfw_leaning.examples,
      nsfwThreshold: 0.3,
      intensityLabel: '情感亲密期'
    };
  } else if (effectiveLevel < 60) {
    const isModerate = desireLevel >= 45; // Middle of 30-60 range
    
    result = isModerate 
      ? {
          theme: 'sensuous_buildup',
          vocabulary: DESIRE_LEVEL_30_60.moderate.vocabulary,
          examples: DESIRE_LEVEL_30_60.moderate.examples,
          nsfwThreshold: 0.5,
          sensitivity: DESIRE_LEVEL_30_60.moderate.sensoryFocus?.join(' / '),
          intensityLabel: '感官升温期'
        }
      : {
          theme: 'gentle_touching',
          vocabulary: DESIRE_LEVEL_30_60.sfw_leaning.vocabulary,
          examples: DESIRE_LEVEL_30_60.sfw_leaning.examples,
          nsfwThreshold: 0.4,
          intensityLabel: '暧昧挑逗期'
        };
        
  } else if (effectiveLevel < 80) {
    if (desireLevel >= 70) {
      result = {
        theme: 'bold_declaration',
        vocabulary: DESIRE_LEVEL_60_80.explicit.vocabulary,
        examples: DESIRE_LEVEL_60_80.explicit.examples,
        nsfwThreshold: 0.75,
        intensityLabel: '大胆表达期'
      };
    } else if (desireLevel >= 60) {
      result = {
        theme: 'active_flirtation',
        vocabulary: DESIRE_LEVEL_60_80.moderate.vocabulary,
        examples: DESIRE_LEVEL_60_80.moderate.examples,
        nsfwThreshold: 0.7,
        sensitivity: DESIRE_LEVEL_60_80.moderate.sensoryFocus?.join(' / '),
        intensityLabel: '主动调情期'
      };
    } else {
      result = {
        theme: 'confident_affection',
        vocabulary: DESIRE_LEVEL_60_80.sfw_leaning.vocabulary,
        examples: DESIRE_LEVEL_60_80.sfw_leaning.examples,
        nsfwThreshold: 0.65,
        intensityLabel: '自信示爱期'
      };
    }
  } else {
    // 80-100 range
    if (desireLevel >= 90) {
      result = {
        theme: 'unrestrained_porn',
        vocabulary: DESIRE_LEVEL_80_100.explicit.vocabulary,
        examples: DESIRE_LEVEL_80_100.explicit.examples,
        nsfwThreshold: 0.9,
        sensitivity: DESIRE_LEVEL_80_100.explicit.vocabulary.slice(0, 5),
        intensityLabel: '完全释放期'
      };
    } else if (desireLevel >= 80) {
      result = {
        theme: 'full_explicit',
        vocabulary: DESIRE_LEVEL_80_100.moderate.vocabulary,
        examples: DESIRE_LEVEL_80_100.moderate.examples,
        nsfwThreshold: 0.85,
        sensitivity: DESIRE_LEVEL_80_100.moderate.sensoryFocus?.join(' / '),
        intensityLabel: '直白露骨期'
      };
    } else {
      result = {
        theme: 'total_abandonment',
        vocabulary: DESIRE_LEVEL_80_100.sfw_leaning.vocabulary,
        examples: DESIRE_LEVEL_80_100.sfw_leaning.examples,
        nsfwThreshold: 0.8,
        intensityLabel: '全然奉献期'
      };
    }
  }
  
  return result;
}
