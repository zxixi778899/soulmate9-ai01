/**
 * Scenario Engine — 情景模式的状态管理与进度追踪
 *
 * 在情景模式中，追踪关系类型、场景进度（intro/development/climax/resolution）、
 * 当前氛围（props、emotional_beat）等，以维持连贯的角色扮演体验。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Scenario, ScenarioState, ScenarioPhase } from '@/lib/milestone-types';

/**
 * Get or create the active scenario for a girlfriend.
 * If one exists and is_active, return it; otherwise create a new one.
 */
export async function getOrCreateScenario(
  client: SupabaseClient,
  userId: string,
  girlfriendId: string,
  relationshipType?: string,
): Promise<Scenario | null> {
  try {
    // Try to fetch an active scenario
    const { data: existing } = await client
      .from('companion_scenarios')
      .select('*')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      return mapToScenario(existing);
    }

    // If no active scenario and relationshipType provided, create one
    if (relationshipType) {
      const newScenario: ScenarioState = {
        phase: 'intro',
        context: {},
        emotional_beat: 'building tension',
      };

      const { data: created } = await client
        .from('companion_scenarios')
        .insert({
          user_id: userId,
          girlfriend_id: girlfriendId,
          title: `${relationshipType} scenario`,
          relationship_type: relationshipType,
          scenario_state: newScenario,
          is_active: true,
        })
        .select()
        .maybeSingle();

      return created ? mapToScenario(created) : null;
    }

    return null;
  } catch (err) {
    console.error('[scenario-engine] getOrCreateScenario failed:', err);
    return null;
  }
}

/**
 * Update the scenario state (phase, context, emotional beat, props).
 * Called after each assistant reply in scene mode.
 */
export async function updateScenarioState(
  client: SupabaseClient,
  scenarioId: string,
  updates: Partial<ScenarioState>,
): Promise<Scenario | null> {
  try {
    const { data: current } = await client
      .from('companion_scenarios')
      .select('scenario_state')
      .eq('id', scenarioId)
      .maybeSingle();

    if (!current) return null;

    const newState: ScenarioState = {
      ...(current.scenario_state as ScenarioState),
      ...updates,
    };

    const { data: updated } = await client
      .from('companion_scenarios')
      .update({ scenario_state: newState })
      .eq('id', scenarioId)
      .select()
      .maybeSingle();

    return updated ? mapToScenario(updated) : null;
  } catch (err) {
    console.error('[scenario-engine] updateScenarioState failed:', err);
    return null;
  }
}

/**
 * Deactivate a scenario (end the roleplay).
 */
export async function endScenario(
  client: SupabaseClient,
  scenarioId: string,
): Promise<boolean> {
  try {
    const { error } = await client
      .from('companion_scenarios')
      .update({ is_active: false })
      .eq('id', scenarioId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Format scenario recap for prompt injection.
 * Shows current phase, emotional beat, props, and context.
 */
export function buildScenarioRecap(scenario: Scenario | null, zh: boolean): string {
  if (!scenario || !scenario.scenario_state) return '';

  const state = scenario.scenario_state;
  const parts: string[] = [];

  const relationshipLabel = scenario.relationship_type || 'companion';
  if (zh) {
    parts.push(`[情景模式] 关系：${relationshipLabel}`);
    parts.push(`阶段：${PHASE_LABEL_ZH[state.phase] || state.phase}`);
    if (state.emotional_beat) {
      parts.push(`氛围：${state.emotional_beat}`);
    }
    if (state.props && state.props.length > 0) {
      parts.push(`道具：${state.props.join('、')}`);
    }
  } else {
    parts.push(`[SCENARIO MODE] Relationship: ${relationshipLabel}`);
    parts.push(`Phase: ${PHASE_LABEL_EN[state.phase] || state.phase}`);
    if (state.emotional_beat) {
      parts.push(`Atmosphere: ${state.emotional_beat}`);
    }
    if (state.props && state.props.length > 0) {
      parts.push(`Props: ${state.props.join(', ')}`);
    }
  }

  return parts.join(' · ');
}

/**
 * Helper: detect phase progression based on turn count.
 * This is a simple heuristic; real progression should be LLM-determined.
 */
export function suggestPhaseProgression(durationBeats: number, currentPhase: ScenarioPhase): ScenarioPhase {
  if (currentPhase === 'intro' && durationBeats > 3) return 'development';
  if (currentPhase === 'development' && durationBeats > 8) return 'climax';
  if (currentPhase === 'climax' && durationBeats > 12) return 'resolution';
  return currentPhase;
}

// ─────────────────────────────────────────────────────────────

function mapToScenario(row: Record<string, unknown>): Scenario {
  return {
    id: row.id as string | undefined,
    user_id: row.user_id as string | undefined,
    girlfriend_id: row.girlfriend_id as string | undefined,
    title: String(row.title || ''),
    description: row.description ? String(row.description) : undefined,
    relationship_type: row.relationship_type ? String(row.relationship_type) : undefined,
    scenario_state: (row.scenario_state as ScenarioState) || { phase: 'intro', context: {} },
    is_active: row.is_active === true,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

const PHASE_LABEL_ZH: Record<ScenarioPhase, string> = {
  intro: '开场',
  development: '升温',
  climax: '高潮',
  resolution: '收场',
};

const PHASE_LABEL_EN: Record<ScenarioPhase, string> = {
  intro: 'Intro',
  development: 'Building',
  climax: 'Climax',
  resolution: 'Resolution',
};
