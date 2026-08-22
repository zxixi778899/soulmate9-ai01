/**
 * POST /api/gen/start — unified generation gateway entry.
 *
 * Body: { kind, idempotency_key?, ...legacy params }
 * Delegates to the matching legacy pipeline via gen-hub while recording an
 * idempotent job row. Rate limiting is enforced inside the delegated routes
 * (shared IMAGE_GEN_RATE_KEY), so this route does not double-count limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { canAccessGeneration, canGenerateVideo } from '@/lib/constants';
import { detectRequestedNsfwLevel } from '@/lib/content-rating';
import { getIntimacyGenerationPolicy } from '@/lib/intimacy-policy';
import { runGenerationJob, type GenDelegate } from '@/lib/gen-hub';
import type { GenJobKind } from '@/lib/gen-hub';
import {
  isGenPresetCategory,
  resolveCatalogPromptFragment,
} from '@/lib/gen-presets/catalog';
import { getGlobalNsfwEnabled } from '@/lib/gen-monitor';
// Static handler imports (gateway delegation map). These routes import only
// the leaf helpers of gen-hub, so no module cycle is introduced.
import { POST as chatGenerateImagePost } from '@/app/api/chat/generate-image/route';
import { POST as generateVideoPost } from '@/app/api/generate-video/route';
import { POST as generatePortraitPost } from '@/app/api/girlfriends/generate-portrait/route';
import { POST as wardrobeTryOnPost } from '@/app/api/wardrobe/try-on/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const VALID_KINDS: GenJobKind[] = ['image', 'video', 'portrait', 'tryon', 'chat_image'];

/** kind → legacy pipeline delegation map (built once at module load). */
const KIND_DELEGATES: Record<GenJobKind, GenDelegate> = {
  image: { path: '/api/chat/generate-image', handler: chatGenerateImagePost },
  chat_image: { path: '/api/chat/generate-image', handler: chatGenerateImagePost },
  video: { path: '/api/generate-video', handler: generateVideoPost },
  portrait: { path: '/api/girlfriends/generate-portrait', handler: generatePortraitPost },
  tryon: { path: '/api/wardrobe/try-on', handler: wardrobeTryOnPost },
};

export async function POST(request: NextRequest) {
  const sessionToken = request.headers.get('x-session') || '';
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const kind = String((body as { kind?: string }).kind || '').trim() as GenJobKind;
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `Invalid kind. Expected one of: ${VALID_KINDS.join(', ')}` },
      { status: 400 },
    );
  }

  // Membership redesign: generation surfaces are paid-tier only. Responses
  // carry structured codes so the frontend renders an upgrade guide instead
  // of a raw error.
  const { data: tierProfile } = await client
    .from('profiles')
    .select('membership_tier')
    .eq('user_id', user.id)
    .maybeSingle();
  const memberTier = String((tierProfile as { membership_tier?: unknown } | null)?.membership_tier || 'free');
  if (!canAccessGeneration(memberTier)) {
    return NextResponse.json(
      {
        error: 'Generation requires a membership plan.',
        code: 'membership_required',
        upgrade_url: '/pricing',
      },
      { status: 403 },
    );
  }
  if (kind === 'video' && !canGenerateVideo(memberTier)) {
    return NextResponse.json(
      {
        error: 'Video generation requires Premium or Unlimited.',
        code: 'video_requires_premium',
        upgrade_url: '/pricing',
      },
      { status: 403 },
    );
  }

  const rawKey = (body as { idempotency_key?: unknown }).idempotency_key;
  const idempotencyKey =
    typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim().slice(0, 128) : null;

  // Forward everything except the gateway envelope to the legacy pipeline.
  const params: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  delete params.kind;
  delete params.idempotency_key;

  // Structured preset selection (PresetPicker): resolve the catalog fragment
  // server-side, capped by the intimacy policy so a locked preset can never
  // escalate content. The fragment is injected into the scene text that every
  // delegated pipeline already consumes.
  const presetCategory = String(params.preset_category || '').toLowerCase();
  const presetSlug = String(params.preset_slug || '').trim();
  delete params.preset_category;
  delete params.preset_slug;
  if (isGenPresetCategory(presetCategory) && presetSlug) {
    const girlfriendId = typeof params.girlfriend_id === 'string' ? params.girlfriend_id : '';
    let maxNsfwLevel = 2;
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
      maxNsfwLevel = policy.adultAllowed ? policy.nsfwIntensity : 2;
    }
    // Site-wide kill switch caps preset fragments at the SFW band.
    if (!(await getGlobalNsfwEnabled(client))) {
      maxNsfwLevel = Math.min(maxNsfwLevel, 2);
    }
    const preset = await resolveCatalogPromptFragment(
      client,
      presetCategory,
      presetSlug,
      maxNsfwLevel,
    );
    if (preset?.prompt_fragment) {
      const sceneKey = typeof params.scene === 'string' ? 'scene' : null;
      const base = String(params.user_request || params.prompt || params.message || params.scene || '');
      const merged = base.trim()
        ? `${base.trim()}, ${preset.prompt_fragment}`
        : preset.prompt_fragment;
      if (sceneKey) {
        params.scene = merged;
      } else if (params.user_request !== undefined) {
        params.user_request = merged;
      } else if (params.prompt !== undefined) {
        params.prompt = merged;
      } else {
        params.user_request = merged;
      }
      params.preset_applied = `${presetCategory}:${presetSlug}`;
    }
  }

  // Audit-level NSFW detection from free-text fields (pre-cap, for logging).
  const text = String(params.user_request || params.prompt || params.message || '');
  const nsfwLevel = detectRequestedNsfwLevel(text);

  const { response } = await runGenerationJob({
    client,
    userId: user.id,
    sessionToken,
    kind,
    idempotencyKey,
    girlfriendId: typeof params.girlfriend_id === 'string' ? params.girlfriend_id : null,
    params,
    nsfwLevel,
    delegate: KIND_DELEGATES[kind],
  });

  return response;
}
