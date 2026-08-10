/**
 * Milestone Extractor — 从对话中提取结构化关键节点
 *
 * 使用 LLM 从聊天记录中提取结构化事件（电影、餐厅、礼物、约会等），
 * 回退到关键词提取，确保系统在 LLM 不可用时仍能工作。
 */

import { generateText } from '@/lib/llm-service';
import type { StructuredMilestone, MilestoneEventType, EmotionalContext } from '@/lib/milestone-types';

const VALID_EVENT_TYPES = new Set([
  'movie', 'restaurant', 'gift', 'anniversary', 'conversation', 'date', 'game',
  'travel', 'shopping', 'cooking', 'music', 'sport', 'work', 'study', 'party',
  'confession', 'promise', 'fight', 'makeup', 'intimate', 'custom',
]);

const VALID_EMOTIONS = new Set([
  'happy', 'romantic', 'sad', 'playful', 'intimate', 'serious', 'funny',
  'angry', 'anxious', 'nostalgic', 'surprising', 'sweet', 'bittersweet',
]);

const EXTRACT_MILESTONES_PROMPT = `Extract structured milestone events from this conversation between an AI companion and her user.

A milestone is a meaningful shared experience worth remembering — like watching a movie together, going on a date, receiving a gift, having a deep conversation, or making a promise.

Return ONLY a JSON array of milestones. Each milestone object:
{
  "event_type": "<type>",
  "title": "<short title, max 40 chars>",
  "description": "<one sentence description, max 200 chars>",
  "event_date": "<ISO date string if mentioned, otherwise null>",
  "participants": ["<list of people involved>"],
  "location": "<location if mentioned, otherwise null>",
  "emotional_context": "<emotion tag>",
  "keywords": ["<3-5 keyword phrases for recall>"],
  "importance": <1-5 integer>
}

Event types: movie, restaurant, gift, anniversary, conversation, date, game, travel, shopping, cooking, music, sport, work, study, party, confession, promise, fight, makeup, intimate, custom
Emotion tags: happy, romantic, sad, playful, intimate, serious, funny, angry, anxious, nostalgic, surprising, sweet, bittersweet

Rules:
- Only extract things that are clearly stated as shared experiences between the user and companion
- Include the user's name in participants if mentioned
- Keywords should be the actual objects/activities mentioned (e.g., ["movie", "sci-fi", "cinema", "date night"])
- Importance: 1 = minor passing mention, 3 = notable shared experience, 5 = life-changing moment
- event_date should be the date mentioned in the conversation, not the current date
- Return [] if nothing memorable

Conversation:
"""%s"""`;

const BATCH_SIZE = 10; // last N messages to scan

/**
 * Extract structured milestones from recent conversation messages.
 * Returns array of milestone objects, empty array if nothing found.
 */
export async function extractMilestones(
  messages: { role: string; content: string }[],
): Promise<Omit<StructuredMilestone, 'id' | 'user_id' | 'girlfriend_id' | 'created_at' | 'updated_at'>[]> {
  if (messages.length === 0) return [];

  const last = messages.slice(-BATCH_SIZE);
  const flat = last.map((m) => `[${m.role}] ${m.content}`).join('\n');
  const prompt = EXTRACT_MILESTONES_PROMPT.replace('%s', flat);

  try {
    const text = await generateText({ prompt, temperature: 0.2, maxTokens: 1024 });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return extractMilestonesFallback(last.find((m) => m.role === 'user')?.content || '');

    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return extractMilestonesFallback(last.find((m) => m.role === 'user')?.content || '');

    const milestones = arr
      .filter((m: any) => m && typeof m.title === 'string' && m.title.length > 2)
      .map((m: any) => ({
        event_type: VALID_EVENT_TYPES.has(m.event_type) ? m.event_type : 'custom',
        title: String(m.title).slice(0, 60),
        description: m.description ? String(m.description).slice(0, 300) : undefined,
        event_date: typeof m.event_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(m.event_date)
          ? m.event_date.slice(0, 10)
          : undefined,
        participants: Array.isArray(m.participants)
          ? m.participants.map(String).slice(0, 10)
          : [],
        location: typeof m.location === 'string' && m.location ? m.location.slice(0, 100) : undefined,
        emotional_context: VALID_EMOTIONS.has(m.emotional_context) ? m.emotional_context : undefined,
        keywords: Array.isArray(m.keywords)
          ? m.keywords.map(String).filter(Boolean).slice(0, 10)
          : [],
        importance: Math.max(1, Math.min(5, Number(m.importance) || 3)),
      }));

    return milestones.length > 0
      ? milestones
      : extractMilestonesFallback(last.find((m) => m.role === 'user')?.content || '');
  } catch {
    return extractMilestonesFallback(last.find((m) => m.role === 'user')?.content || '');
  }
}

/**
 * Deterministic fallback milestone extraction when LLM is unavailable.
 * Uses simple regex patterns to find common event types.
 */
export function extractMilestonesFallback(
  message: string,
): Omit<StructuredMilestone, 'id' | 'user_id' | 'girlfriend_id' | 'created_at' | 'updated_at'>[] {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (text.length < 4 || text.length > 800) return [];

  const results: Omit<StructuredMilestone, 'id' | 'user_id' | 'girlfriend_id' | 'created_at' | 'updated_at'>[] = [];

  // Movie detection
  const movieMatch = text.match(
    /(?:看(?:了|完)?|watch(?:ed)?|saw|seen)\s*(?:过|了一部|一部)?\s*(?:电影|影片|movie|film)\s*[，。,.!?]?\s*(?:叫|named|called|「|『)?\s*[《]?\s*([^《》「」的，。,.!?]{2,30})/i,
  );
  if (movieMatch) {
    results.push({
      event_type: 'movie',
      title: `watched ${movieMatch[1].trim()}`,
      description: `Watched the movie "${movieMatch[1].trim()}" together`,
      keywords: ['movie', 'film', movieMatch[1].trim().toLowerCase()],
      importance: 3,
    });
  }

  // Restaurant / eating out
  const foodMatch = text.match(
    /(?:去|吃|eat|ate|visit|visit(?:ed)?)\s*(?:了|过)?\s*(?:一[家顿间个])?\s*(?:餐厅|饭店|火锅|restaurant|cafe|饭馆|小吃)\s*[，。,.!?]?\s*(?:叫|named|called|「|『)?\s*([^，。,.!?]{2,30})/i,
  );
  if (foodMatch) {
    results.push({
      event_type: 'restaurant',
      title: `dined at ${foodMatch[1].trim()}`,
      description: `Had a meal at ${foodMatch[1].trim()}`,
      keywords: ['restaurant', 'dining', 'food', foodMatch[1].trim().toLowerCase()],
      importance: 3,
    });
  }

  // Gift detection
  const giftMatch = text.match(
    /(?:送|give|gave|bought|buy)\s*(?:了|给|给了我)?\s*(?:一个|一份|一件|个)?\s*([^，。,.!?]{2,30})\s*(?:礼物|gift|present|surprise)/i,
  );
  if (giftMatch) {
    results.push({
      event_type: 'gift',
      title: `gave ${giftMatch[1].trim()}`,
      description: `Gave ${giftMatch[1].trim()} as a gift`,
      keywords: ['gift', 'present', giftMatch[1].trim().toLowerCase()],
      importance: 4,
    });
  }

  // Date / outing
  const dateMatch = text.match(
    /(?:昨天|今天|明天|上周|上次|last time|yesterday|today|weekend|约会|date|hang(?:ed)? out)\s*[^。.!?]{4,60}/i,
  );
  if (dateMatch) {
    results.push({
      event_type: 'date',
      title: dateMatch[0].trim().slice(0, 50),
      description: dateMatch[0].trim().slice(0, 120),
      keywords: ['date', 'outing', 'time together'],
      importance: 3,
    });
  }

  // Conversation topic
  const topicMatch = text.match(
    /(?:聊到|聊了|talked about|discussed|mentioned|说起|提到)\s*[^。.!?]{4,80}/i,
  );
  if (topicMatch) {
    results.push({
      event_type: 'conversation',
      title: topicMatch[0].trim().slice(0, 50),
      description: topicMatch[0].trim().slice(0, 120),
      keywords: ['conversation', 'talk', 'topic'],
      importance: 2,
    });
  }

  return results;
}