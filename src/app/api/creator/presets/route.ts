import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  DEFAULT_CREATOR_PRESETS,
  normalizeCreatorPreset,
  type CreatorPreset,
} from '@/lib/creator-presets';
import { PRESET_VIBE_LABELS } from '@/lib/preset-library';

interface CreatorOption {
  id: string;
  category: string;
  value: string;
  label_en: string;
  label_zh: string;
  extra?: Record<string, string>;
  sort_order: number;
}

interface CreatorPresetResponse {
  presets?: CreatorPreset[];
  options?: Record<string, CreatorOption[]>;
  source?: 'database' | 'built-in';
  /** Vibe filter labels for the preset wall (M2) */
  vibes?: typeof PRESET_VIBE_LABELS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeOption(value: unknown): CreatorOption | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = typeof row.id === 'string' ? row.id : '';
  const category = typeof row.category === 'string' ? row.category : '';
  const optionValue = typeof row.value === 'string' ? row.value : '';
  if (!id || !category || !optionValue) return null;
  return {
    id,
    category,
    value: optionValue,
    label_en: typeof row.label_en === 'string' ? row.label_en : optionValue,
    label_zh: typeof row.label_zh === 'string' ? row.label_zh : optionValue,
    extra: asRecord(row.extra) as Record<string, string> | undefined,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 100,
  };
}

/**
 * Public creator catalog. Built-in presets keep companion creation usable when
 * the optional catalog tables have not been seeded or are temporarily down.
 */
export async function GET(req: NextRequest): Promise<NextResponse<CreatorPresetResponse>> {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section');
  const includePresets = !section || section === 'all' || section === 'presets';
  const includeOptions = !section || section === 'all' || section === 'options';
  const result: CreatorPresetResponse = {};

  try {
    const client = getSupabaseClient();

    if (includePresets) {
      const { data, error } = await client
        .from('character_presets')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      const databasePresets = (data || [])
        .map((row: unknown) => asRecord(row))
        .filter((row): row is Record<string, unknown> => row !== null)
        .map(normalizeCreatorPreset)
        .filter((preset): preset is CreatorPreset => preset !== null);
      if (error) logger.warn('[creator/presets] preset query failed; using built-ins', { err: error.message });

      // Attach the shared portrait-cache URL (preset-portraits/{slug}.png) so the
      // creator page can render preset cards with their actual artwork.
      if (databasePresets.length) {
        const slugs = databasePresets
          .map((preset) => preset.slug)
          .filter((slug): slug is string => Boolean(slug));
        if (slugs.length) {
          try {
            const { data: stats, error: statsError } = await client
              .from('preset_portrait_stats')
              .select('slug, portrait_url')
              .eq('cached', true)
              .in('slug', slugs);
            if (statsError) {
              logger.warn('[creator/presets] portrait stats query failed', { err: statsError.message });
            } else {
              const urlBySlug = new Map<string, string>();
              for (const row of stats || []) {
                const stat = asRecord(row);
                if (!stat) continue;
                const slug = typeof stat.slug === 'string' ? stat.slug : '';
                const url = typeof stat.portrait_url === 'string' ? stat.portrait_url : '';
                if (slug && url) urlBySlug.set(slug, url);
              }
              for (const preset of databasePresets) {
                const url = preset.slug ? urlBySlug.get(preset.slug) : undefined;
                if (url) preset.portrait_url = url;
              }
            }
          } catch (statsErr) {
            logger.warn('[creator/presets] portrait stats lookup threw', {
              err: statsErr instanceof Error ? statsErr.message : String(statsErr),
            });
          }
        }
      }

      result.presets = databasePresets.length ? databasePresets : [...DEFAULT_CREATOR_PRESETS];
      result.source = databasePresets.length ? 'database' : 'built-in';
      result.vibes = PRESET_VIBE_LABELS;
    }

    if (includeOptions) {
      const { data, error } = await client
        .from('creator_option_pool')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) logger.warn('[creator/presets] option query failed', { err: error.message });
      const grouped: Record<string, CreatorOption[]> = {};
      const seen = new Map<string, Set<string>>();
      for (const raw of data || []) {
        const option = normalizeOption(raw);
        if (!option) continue;
        const categorySeen = seen.get(option.category) || new Set<string>();
        const key = option.value.trim().toLowerCase();
        if (categorySeen.has(key)) continue;
        categorySeen.add(key);
        seen.set(option.category, categorySeen);
        (grouped[option.category] ||= []).push(option);
      }
      result.options = grouped;
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    logger.error('[creator/presets] unexpected error; using built-ins', {
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      ...(includePresets ? { presets: [...DEFAULT_CREATOR_PRESETS], source: 'built-in' as const } : {}),
      ...(includeOptions ? { options: {} } : {}),
    });
  }
}
