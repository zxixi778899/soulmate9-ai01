/**
 * Profile Field Extractor
 *
 * Extracts structured user profile fields from conversation messages using LLM.
 * Works in tandem with ProfileCollectionStrategy — the strategy decides *when* to ask,
 * this extractor captures the answer from the user's reply.
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import type { UserProfile } from '@/lib/profile-collection-strategy';

/** Fields that can be extracted from a single message turn. */
interface ExtractedField {
  field: string;
  value: string | string[] | number;
  confidence: number;
}

const EXTRACTION_PROMPT = `You are a data extraction assistant. Given the latest user message in a chat,
extract any personal information the user revealed about themselves.

Extract ONLY facts about the USER (the human), never about the AI companion.

Return a JSON array. Each item: { "field": "<field_name>", "value": "<value>", "confidence": <0.0-1.0> }

Valid field names and what to extract:
- nickname: what he wants to be called (string)
- real_name: his actual name (string)
- age: his age (number)
- gender: his gender (string)
- city: where he lives (string)
- occupation: his job or profession (string)
- work_schedule: his daily routine / work hours (string)
- hobbies: his hobbies or interests (array of strings)
- food_preferences: foods he likes or dislikes (array of strings)
- pets: pets he owns (array of strings)
- love_language: how he expresses/receives love (string)
- pet_peeves: things that annoy him (array of strings)
- family: family members mentioned (array of strings)
- communication_style: how he prefers to communicate (string)
- relationship_status: his relationship status (string)

Rules:
- Only extract NEW information explicitly stated in this message
- confidence >= 0.7 for clear statements, 0.4-0.6 for implied
- Return [] if no new personal info revealed
- Never extract information about the AI/companion, only the human user

User message: "%s"`;

/**
 * Extract profile fields from a user message using LLM.
 */
export async function extractProfileFields(
  userMessage: string,
  existingProfile: UserProfile,
): Promise<ExtractedField[]> {
  if (!userMessage || userMessage.length < 3) return [];

  const prompt = EXTRACTION_PROMPT.replace('%s', userMessage.slice(0, 500));

  try {
    const text = await generateText({ prompt, temperature: 0.2, maxTokens: 300 });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return [];

    const collected = new Set(existingProfile._fields_collected || []);

    return (arr as Array<Record<string, unknown>>)
      .filter((item): item is Record<string, string | number> =>
        item != null &&
        typeof item.field === 'string' &&
        item.value != null &&
        typeof item.confidence === 'number' &&
        item.confidence >= 0.5 &&
        !collected.has(item.field as string),
      )
      .map((item) => ({
        field: String(item.field),
        value: typeof item.value === 'number'
          ? item.value
          : Array.isArray(item.value)
            ? (item.value as unknown[]).map(String)
            : String(item.value),
        confidence: Number(item.confidence),
      }));
  } catch (err) {
    logger.debug('[profile-extractor] extraction failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Merge extracted fields into the existing user profile.
 * Returns the updated profile (does not mutate the input).
 */
export function mergeProfileFields(
  existing: UserProfile,
  extracted: ExtractedField[],
): UserProfile {
  if (extracted.length === 0) return existing;

  const updated = { ...existing };
  const collected = new Set(updated._fields_collected || []);

  for (const item of extracted) {
    if (collected.has(item.field)) continue;

    // Type-safe assignment based on field name
    const key = item.field as keyof UserProfile;
    if (key === '_fields_collected' || key === '_last_asked_field' || key === '_last_asked_at') continue;

    // For array fields, merge rather than replace
    if (Array.isArray(item.value) && Array.isArray(updated[key])) {
      const existingArr = updated[key] as string[];
      const newArr = item.value as string[];
      (updated as Record<string, unknown>)[key] = [...new Set([...existingArr, ...newArr])];
    } else {
      (updated as Record<string, unknown>)[key] = item.value;
    }

    collected.add(item.field);
  }

  updated._fields_collected = Array.from(collected);
  updated._last_asked_at = new Date().toISOString();

  return updated;
}

/**
 * Save updated user profile to the database.
 */
export async function saveUserProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
  profile: UserProfile,
): Promise<void> {
  try {
    await client
      .from('companion_profiles_ext')
      .update({ user_profile: profile })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);
  } catch (err) {
    logger.warn('[profile-extractor] save failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
