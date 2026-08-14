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

import { supabase } from '@/lib/supabase-server';

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
  const { userId, girlfriendId, topicSentiment, messageType = 'chat', context } = input;
  
  // Get current state from database
  const currentState = await getCurrentCompanionState(userId, girlfriendId);
  
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
    timestamp: new Date()
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
async function getCurrentCompanionState(userId: string, girlfriendId: string) {
  try {
    // First query companion profile extension
    const { data: profile, error: profileError } = await supabase
      .from('companion_profiles_ext')
      .select('desire_level, current_mood, mood_updated_at, girlfriend_id')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }
    
    // Get girlfriend basic data for openness field
    const { data: gfData } = await supabase
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
}): Promise<void> {
  const { userId, girlfriendId, newLevel, trend, timestamp } = params;
  
  try {
    await supabase
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
 * Utility: Get desire gradient for NSFW language generation
 * Returns the appropriate language style for the given desire level and openness
 */
export function getDesireLanguageGradient(desireLevel: number, openness?: string): {
  theme: string;
  examples: string[];
  nsfwThreshold: number;
} {
  const opennessModifier = getOpennessModifier(openness);
  
  // Adjust thresholds based on openness
  const lowRange = desireLevel / opennessModifier < 30 ? 30 : desireLevel;
  const midRange = desireLevel / opennessModifier < 60 ? 60 : desireLevel;
  
  if (lowRange < 30) {
    return {
      theme: 'subtle_ambiguity',
      examples: ['今天好累，想被你抱抱', '你离我好近...'],
      nsfwThreshold: 0.3
    };
  } else if (midRange < 60) {
    return {
      theme: 'physical_hinting',
      examples: ['别动...让我闻闻你洗发水', '其实我想吻你'],
      nsfwThreshold: 0.5
    };
  } else if (lowRange < 80) {
    return {
      theme: 'direct_suggestion',
      examples: ['今晚穿那件睡衣好吗？', '过来，床够大'],
      nsfwThreshold: 0.7
    };
  } else {
    return {
      theme: 'explicit_expression',
      examples: ['现在就想你', '想要更多'],
      nsfwThreshold: 0.9
    };
  }
}
