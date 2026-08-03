import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  CHARACTER_PARTS,
  normalizeCharacterPart,
  type CharacterPart,
} from '@/lib/character-parts';

/**
 * Load the active character parts pool: DB-first (character_parts table,
 * migration 0023), typed in-code fallback when the table is missing/down.
 * Server-only — never import from client components.
 */
export async function loadCharacterParts(): Promise<{
  parts: CharacterPart[];
  source: 'database' | 'built-in';
}> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('character_parts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      logger.warn('[character-parts] load failed; using built-ins', { err: error.message });
    } else if (data) {
      const rows = (data as unknown[])
        .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : null))
        .filter((row): row is Record<string, unknown> => row !== null)
        .map(normalizeCharacterPart)
        .filter((p): p is CharacterPart => p !== null);
      if (rows.length) return { parts: rows, source: 'database' };
    }
  } catch (e) {
    logger.warn('[character-parts] unexpected error; using built-ins', {
      err: e instanceof Error ? e.message : String(e),
    });
  }
  return { parts: [...CHARACTER_PARTS], source: 'built-in' };
}
