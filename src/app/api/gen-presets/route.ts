/**
 * GET /api/gen-presets?category=scene&girlfriend_id=...
 *
 * Preset picker source for the chat UI. Returns display metadata only —
 * prompt fragments never reach the client (gen/start resolves them
 * server-side). Presets above the caller's intimacy-derived NSFW cap stay
 * listed but flagged `locked` so the UI can render the blur + lock badge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getIntimacyGenerationPolicy } from '@/lib/intimacy-policy';
import {
  GEN_PRESET_CATEGORIES,
  getGenPresets,
  isGenPresetCategory,
  type GenPresetCategory,
} from '@/lib/gen-presets/catalog';
import { getGlobalNsfwEnabled } from '@/lib/gen-monitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** SFW callers (no companion context) never see anything above lingerie. */
const DEFAULT_MAX_NSFW_LEVEL = 2;

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const categoryParam = String(
    request.nextUrl.searchParams.get('category') || 'scene',
  ).toLowerCase();
  if (!isGenPresetCategory(categoryParam)) {
    return NextResponse.json(
      { error: `Invalid category. Expected one of: ${GEN_PRESET_CATEGORIES.join(', ')}` },
      { status: 400 },
    );
  }
  const category: GenPresetCategory = categoryParam;

  // Intimacy gate: a companion context unlocks NSFW levels per the policy;
  // without one the cap stays at SFW/lingerie territory.
  let maxNsfwLevel = DEFAULT_MAX_NSFW_LEVEL;
  const girlfriendId = String(request.nextUrl.searchParams.get('girlfriend_id') || '').trim();
  if (girlfriendId) {
    const { data: intimacyRow } = await client
      .from('intimacy_scores')
      .select('score')
      .eq('girlfriend_id', girlfriendId)
      .eq('user_id', user.id)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle();
    const policy = getIntimacyGenerationPolicy(Number(intimacyRow?.score || 0));
    maxNsfwLevel = policy.adultAllowed ? policy.nsfwIntensity : DEFAULT_MAX_NSFW_LEVEL;
  }
  // Site-wide kill switch re-locks everything above the SFW band.
  const nsfwGloballyOn = await getGlobalNsfwEnabled(client);
  if (!nsfwGloballyOn) {
    maxNsfwLevel = Math.min(maxNsfwLevel, DEFAULT_MAX_NSFW_LEVEL);
  }

  const presets = await getGenPresets(client, category, { maxNsfwLevel: 5 });

  // Optional matrix filters (Studio): gender / style_family. Rows without the
  // 0042 columns keep passing through so legacy presets remain visible.
  const genderParam = String(request.nextUrl.searchParams.get('gender') || '').toLowerCase();
  const styleParam = String(request.nextUrl.searchParams.get('style_family') || '').toLowerCase();
  const filtered = presets.filter((preset) => {
    if (genderParam && preset.gender && preset.gender !== 'all' && preset.gender !== genderParam) return false;
    if (styleParam && preset.style_family && preset.style_family !== styleParam) return false;
    return true;
  });

  return NextResponse.json({
    category,
    max_nsfw_level: maxNsfwLevel,
    presets: filtered.map((preset) => ({
      category: preset.category,
      slug: preset.slug,
      label_en: preset.label_en,
      label_zh: preset.label_zh,
      i18n_key: `presets.${preset.category}.${preset.slug}`,
      preview_url: preset.preview_url,
      nsfw_level: preset.nsfw_level,
      tier: preset.tier,
      locked: preset.nsfw_level > maxNsfwLevel,
      gender: preset.gender ?? null,
      style_family: preset.style_family ?? null,
      pose_reference: preset.pose_reference ?? null,
      workflow_flags: preset.workflow_flags ?? null,
    })),
  });
}
