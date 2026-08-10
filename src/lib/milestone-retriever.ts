/**
 * Milestone Retriever — 关键词触发的关键节点回忆
 *
 * 根据用户消息中的关键词，检索 companion_milestones 表中匹配的节点，
 * 返回按相关性排序的回忆结果，可直接注入 prompt。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StructuredMilestone, MilestoneRecall } from '@/lib/milestone-types';
import { formatMilestoneRecall } from '@/lib/milestone-types';

/**
 * Tokenize text into searchable keywords (Chinese + English).
 */
function tokens(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9一-鿿]{2,}/g) || [];
}

/**
 * Compute keyword overlap ratio between query and milestone keywords.
 */
function keywordOverlap(queryTokens: string[], milestoneKeywords: string[]): number {
  if (queryTokens.length === 0 || milestoneKeywords.length === 0) return 0;

  const querySet = new Set(queryTokens);
  const keywordSet = new Set(milestoneKeywords.map((k) => k.toLowerCase()));

  let hits = 0;
  for (const token of querySet) {
    // Direct match
    if (keywordSet.has(token)) {
      hits++;
      continue;
    }
    // Partial match (e.g., "movie" matches "movie" in milestone)
    for (const kw of keywordSet) {
      if (kw.includes(token) || token.includes(kw)) {
        hits++;
        break;
      }
    }
  }

  // Also check if any milestone keyword is a substring of the query
  for (const kw of keywordSet) {
    for (const token of querySet) {
      if (token.includes(kw) || kw.includes(token)) {
        hits++;
        break;
      }
    }
  }

  return hits / Math.max(queryTokens.length, milestoneKeywords.length);
}

/**
 * Retrieve top-k milestones matching the query keywords.
 * Strategy: 1) Keyword overlap → 2) Event type match → 3) Recent important milestones
 */
export async function retrieveMilestones(
  client: SupabaseClient,
  userId: string,
  girlfriendId: string,
  query: string,
  k = 3,
): Promise<MilestoneRecall[]> {
  if (!query || query.trim().length < 2) return [];

  const queryTokens = tokens(query);
  const queryLower = query.toLowerCase();

  // Fetch recent milestones (up to 50) for this girlfriend
  const { data, error } = await client
    .from('companion_milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  const scored: MilestoneRecall[] = [];

  for (const row of data) {
    const milestone: StructuredMilestone = {
      id: row.id,
      user_id: row.user_id,
      girlfriend_id: row.girlfriend_id,
      event_type: row.event_type,
      title: row.title,
      description: row.description || undefined,
      event_date: row.event_date || undefined,
      participants: row.participants || [],
      location: row.location || undefined,
      emotional_context: row.emotional_context || undefined,
      keywords: row.keywords || [],
      importance: row.importance || 3,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    // 1) Keyword overlap score
    const keywords = Array.isArray(row.keywords) ? row.keywords.map(String) : [];
    const kwScore = keywords.length > 0
      ? keywordOverlap(queryTokens, keywords)
      : 0;

    // 2) Event type match
    const eventTypeScore = queryLower.includes(row.event_type.toLowerCase()) ? 0.6 : 0;

    // 3) Title/content match
    const titleMatch = queryLower.includes(row.title.toLowerCase()) ? 0.5 : 0;
    const contentMatch = row.description && queryLower.includes(row.description.toLowerCase().slice(0, 40))
      ? 0.3
      : 0;

    // 4) Importance boost
    const importanceBoost = (row.importance - 1) * 0.1; // 0.2 for importance 3, 0.4 for importance 5

    // 5) Recency boost
    const ageDays = row.created_at
      ? (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const recencyBoost = Math.max(0, 1 - ageDays / 365) * 0.2; // up to 0.2 for recent, decaying over a year

    const totalScore = kwScore + eventTypeScore + titleMatch + contentMatch + importanceBoost + recencyBoost;

    if (totalScore > 0.15) {
      // Determine if the milestone is in Chinese or English context
      const zh = query.match(/[一-鿿]/) !== null;
      const recallText = formatMilestoneRecall(milestone, zh);

      scored.push({
        milestone,
        relevance_score: Math.min(1, totalScore),
        recall_text: recallText,
      });
    }
  }

  // Sort by relevance score descending, deduplicate by id
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .filter((r) => {
      if (seen.has(r.milestone.id || '')) return false;
      seen.add(r.milestone.id || '');
      return true;
    })
    .slice(0, k);
}