import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/creator/presets
 * Returns active character presets + option pool for the creator.
 * No auth required — presets are public catalog data.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section'); // 'presets' | 'options' | 'all' (default)

  try {
    const client = getSupabaseClient();
    const result: { presets?: any[]; options?: Record<string, any[]> } = {};

    // Fetch presets
    if (!section || section === 'all' || section === 'presets') {
      const { data: presets, error: presetErr } = await client
        .from('character_presets')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (presetErr) {
        console.warn('[creator/presets] presets query failed', presetErr.message);
        result.presets = [];
      } else {
        result.presets = presets || [];
      }
    }

    // Fetch option pool grouped by category
    if (!section || section === 'all' || section === 'options') {
      const { data: options, error: optErr } = await client
        .from('creator_option_pool')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (optErr) {
        console.warn('[creator/presets] options query failed', optErr.message);
        result.options = {};
      } else {
        // Group by category
        const grouped: Record<string, any[]> = {};
        for (const opt of options || []) {
          const cat = opt.category;
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(opt);
        }
        result.options = grouped;
      }
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('[creator/presets] unexpected error', String(err));
    return NextResponse.json({ presets: [], options: {} }, { status: 500 });
  }
}
