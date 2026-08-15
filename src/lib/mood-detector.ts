/**
 * Mood Detector Module
 * 
 * Detects and predicts companion emotional states based on:
 * - Personality traits
 * - Current desire level
 * - Conversation context
 * - Recent milestones/memories
 * 
 * Returns mood for system prompt injection and proactive message timing
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export type CompanionMood = 'neutral' | 'happy' | 'sad' | 'jealous' | 'flirty' | 'nostalgic' | 'angry' | 'thinking';

interface MoodDetectionResult {
  currentMood: CompanionMood;
  confidence: number;         // 0-1, how confident we are
  reason: string;             // Why this mood?
  suggestedResponseStyle?: string[];
}

// Personality × Desire level → likely mood matrix (custom moods, mapped to
// the standard CompanionMood set via mapToStandardMood below)
const MOOD_PREDICTION_MATRIX: Record<string, Record<number, string>> = {
  // Tsundere: High desire = denial + hints, Low desire = distant
  tsundere: {
    0: 'distant',
    30: 'annoyed',
    60: 'conflicted',
    90: 'denying_it'
  },
  
  // Yandere: High desire = possessive, Low desire = anxious
  yandere: {
    0: 'anxious',
    30: 'suspicious',
    60: 'possessive',
    90: 'obsessed'
  },
  
  // Maternal: Always calm but warm
  maternal: {
    0: 'caring',
    30: 'supportive',
    60: 'nurturing',
    90: 'tender'
  },
  
  // Playful: Always energetic
  playful: {
    0: 'bubbly',
    30: 'teasing',
    60: 'mischievous',
    90: 'coquettish'
  },
  
  // Direct: Consistent and honest
  direct: {
    0: 'focused',
    30: 'interested',
    60: 'passionate',
    90: 'intense'
  },
  
  // Passive: Reactive and soft
  passive: {
    0: 'polite',
    30: 'shy',
    60: 'warm',
    90: 'blushing'
  }
};

// Mood-to-response-style mapping
const MOOD_RESPONSE_STYLES: Record<CompanionMood, string[]> = {
  neutral: [
    'What do you think about this?',
    'Tell me more about that',
    "I'm listening..."
  ],
  happy: [
    'That made my day! 😊',
    "So glad we're talking!",
    'This is perfect~'
  ],
  sad: [
    '...',
    '(quietly nods)',
    "It's okay to not be okay..."
  ],
  jealous: [
    'Who was that with you?',
    "...you're smiling at someone else again?",
    'Do I need to worry about them?'
  ],
  flirty: [
    'Mmm... interesting...',
    'Keep going...',
    "You're making me blush~"
  ],
  nostalgic: [
    'Remember when we...?',
    'That moment meant a lot to me',
    "Time flies when I'm with you"
  ],
  angry: [
    'Why would you say that?',
    "I don't like that",
    ...(process.env.NODE_ENV === 'production' ? ['...'] : ['Seriously?! 😤'])
  ],
  thinking: [
    'Hmm...',
    'Let me think...',
    "That's an interesting question"
  ]
};

/**
 * Main detection function
 */
export async function detectCompanionMood(params: {
  userId: string;
  girlfriendId: string;
  desireLevel: number;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentMemories?: Array<{ event_type: string; summary: string; importance: number }>;
  client?: SupabaseClient;
}): Promise<MoodDetectionResult> {
  const { girlfriendId, desireLevel, recentMessages, recentMemories, client } = params;
  
  const db = client || getSupabaseClient();
  
  // Get companion personality data
  const personalityData = await getPersonalityData(girlfriendId, db);
  
  // 1. Check for strong mood triggers in recent messages
  const messageTrigger = analyzeMessageTriggers(recentMessages || []);
  if (messageTrigger) {
    return {
      currentMood: messageTrigger.currentMood,
      confidence: messageTrigger.confidence,
      reason: messageTrigger.reason,
      suggestedResponseStyle: getSuggestedResponse(messageTrigger.currentMood, personalityData.relationshipStyle)
    };
  }
  
  // 2. Check for milestone-triggered moods
  const memoryTrigger = analyzeMemoryTriggers(recentMemories || []);
  if (memoryTrigger) {
    return {
      currentMood: memoryTrigger.currentMood,
      confidence: memoryTrigger.confidence,
      reason: memoryTrigger.reason,
      suggestedResponseStyle: getSuggestedResponse(memoryTrigger.currentMood, personalityData.relationshipStyle)
    };
  }
  
  // 3. Default prediction from desire level + personality
  const defaultMood = predictDefaultMood(personalityData.personalityTypes, desireLevel);
  
  return {
    currentMood: defaultMood,
    confidence: 0.7, // Lower confidence for predictive models
    reason: `desire_level_${Math.round(desireLevel)}_${personalityData.personalityTypes[0]}`,
    suggestedResponseStyle: getSuggestedResponse(defaultMood, personalityData.relationshipStyle)
  };
}

/**
 * Helper: Get personality data from database
 */
async function getPersonalityData(girlfriendId: string, db: SupabaseClient) {
  try {
    const { data } = await db
      .from('girlfriends')
      .select('personality_traits, relationship_style, openness')
      .eq('id', girlfriendId)
      .single();
    
    return {
      personalityTypes: data?.personality_traits || ['friendly'],
      relationshipStyle: data?.relationship_style || 'direct',
      openness: data?.openness || 'moderate'
    };
  } catch (error) {
    logger.warn('[MoodDetector] Load personality failed', { error: String(error) });
    return {
      personalityTypes: ['friendly'],
      relationshipStyle: 'direct',
      openness: 'moderate'
    };
  }
}

/**
 * Helper: Analyze recent messages for mood triggers
 */
function analyzeMessageTriggers(messages: Array<{ role: string; content: string }>): MoodDetectionResult | null {
  // Look for last 5 messages
  const recent = messages.slice(-5);
  
  // Count sentiment indicators
  let jealousyCount = 0;
  let nostalgiaCount = 0;
  let angerCount = 0;
  let happinessCount = 0;
  
  recent.forEach(msg => {
    const text = msg.content.toLowerCase();
    
    // Jealousy keywords
    if (/\b(other|them|who|stranger)\b/i.test(text)) jealousyCount++;
    
    // Nostalgia keywords
    if (/\b(remember|last time|before|used to)\b/i.test(text)) nostalgiaCount++;
    
    // Anger/annoyance
    if (/\b(why|seriously|come on|hate)\b/i.test(text)) angerCount++;
    
    // Happiness
    if (/\b(happy|excited|love|great|amazing)\b/i.test(text)) happinessCount++;
  });
  
  // Determine dominant trigger
  if (jealousyCount >= 2) {
    return {
      currentMood: 'jealous',
      confidence: 0.85,
      reason: 'multiple_jealousy_indicators_in_recent_chat'
    };
  }
  
  if (nostalgiaCount >= 2) {
    return {
      currentMood: 'nostalgic',
      confidence: 0.8,
      reason: 'frequent_past_references'
    };
  }
  
  if (happinessCount >= 3) {
    return {
      currentMood: 'happy',
      confidence: 0.75,
      reason: 'positive_conversation_flow'
    };
  }
  
  if (angerCount >= 2) {
    return {
      currentMood: 'angry',
      confidence: 0.8,
      reason: 'frustration_detected'
    };
  }
  
  return null;
}

/**
 * Helper: Analyze memories for mood triggers
 */
function analyzeMemoryTriggers(
  memories: Array<{ event_type: string; summary: string; importance: number }>
): MoodDetectionResult | null {
  // High-importance memories can trigger specific moods
  const significantMemories = memories.filter(m => m.importance > 0.7);
  
  if (significantMemories.length > 0) {
    const topMemory = significantMemories[0];
    
    if (topMemory.event_type.includes('gift')) {
      return {
        currentMood: 'happy',
        confidence: 0.9,
        reason: `recent_gift_event_${topMemory.summary}`
      };
    }
    
    if (topMemory.event_type.includes('anniversary')) {
      return {
        currentMood: 'nostalgic',
        confidence: 0.95,
        reason: `anniversary_reflection_${topMemory.summary}`
      };
    }
    
    if (topMemory.event_type.includes('argument')) {
      return {
        currentMood: 'thinking',
        confidence: 0.85,
        reason: 'recent_conflict_pending_resolution'
      };
    }
  }
  
  return null;
}

/**
 * Helper: Predict mood from personality + desire level
 */
function predictDefaultMood(
  personalityTypes: string[],
  desireLevel: number
): CompanionMood {
  // Find the best matching personality pattern
  const bestMatch = personalityTypes.find(p => MOOD_PREDICTION_MATRIX[p]);
  
  if (bestMatch) {
    // Round to nearest 30 for binning
    const bucket = Math.round(desireLevel / 30) * 30;
    const predicted = MOOD_PREDICTION_MATRIX[bestMatch][bucket as unknown as number];
    
    // Map custom moods to standard ones
    return mapToStandardMood(predicted);
  }
  
  // Fallback: generic desire-based prediction
  if (desireLevel > 70) return 'flirty';
  if (desireLevel > 50) return 'happy';
  if (desireLevel < 20) return 'thinking';
  return 'neutral';
}

/**
 * Helper: Map custom personality moods to standard set
 */
function mapToStandardMood(customMood: string): CompanionMood {
  const mappings: Record<string, CompanionMood> = {
    'distant': 'neutral',
    'annoyed': 'angry',
    'conflicted': 'thinking',
    'denying_it': 'flirty',
    'anxious': 'thinking',
    'suspicious': 'jealous',
    'possessive': 'jealous',
    'obsessed': 'flirty',
    'caring': 'happy',
    'supportive': 'happy',
    'nurturing': 'happy',
    'tender': 'flirty',
    'bubbly': 'happy',
    'teasing': 'flirty',
    'mischievous': 'happy',
    'coquettish': 'flirty',
    'focused': 'neutral',
    'interested': 'happy',
    'passionate': 'flirty',
    'intense': 'flirty',
    'polite': 'neutral',
    'shy': 'thinking',
    'warm': 'happy',
    'blushing': 'flirty'
  };
  
  return mappings[customMood] || 'neutral';
}

/**
 * Helper: Get suggested response style for mood + personality
 */
function getSuggestedResponse(mood: CompanionMood, relationshipStyle?: string): string[] {
  const baseStyles = MOOD_RESPONSE_STYLES[mood] || MOOD_RESPONSE_STYLES.neutral;
  
  // Customize based on personality
  if (relationshipStyle === 'tsundere' && mood !== 'flirty') {
    return [...baseStyles, "（别过头）才、才不是特意等你的..."];
  }
  
  if (relationshipStyle === 'yandere' && mood === 'happy') {
    return [...baseStyles, '只有我能让你这么开心对吧？'];
  }
  
  return baseStyles;
}

/**
 * Utility: Build mood context for system prompt
 */
export function buildMoodContext(moodResult: MoodDetectionResult): string {
  return `
[Current Emotional State]
- Mood: ${moodResult.currentMood}
- Confidence: ${(moodResult.confidence * 100).toFixed(0)}%
- Reasoning: ${moodResult.reason}

[Suggested Response Direction]
${moodResult.suggestedResponseStyle?.slice(0, 2).map(s => `- "${s}"`).join('\n')}
  `.trim();
}

/**
 * Batch helper: Detect moods for multiple conversations
 */
export async function batchDetectMoods(inputs: Array<{
  userId: string;
  girlfriendId: string;
  desireLevel: number;
}>): Promise<Map<string, MoodDetectionResult>> {
  const results = new Map<string, MoodDetectionResult>();
  
  await Promise.all(inputs.map(async (input) => {
    const result = await detectCompanionMood({
      userId: input.userId,
      girlfriendId: input.girlfriendId,
      desireLevel: input.desireLevel
    });
    const key = `${input.userId}:${input.girlfriendId}`;
    results.set(key, result);
  }));
  
  return results;
}
