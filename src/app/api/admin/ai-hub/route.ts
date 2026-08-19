/**
 * Admin API: AI Hub - Unified AI capabilities dashboard
 *
 * GET  /api/admin/ai-hub - aggregated status (chat via ai-modules, image/voice/video)
 * POST /api/admin/ai-hub - actions: test_image, reset_circuit, toggle_endpoint(image)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  loadProviderRoutes,
  saveProviderRoutes,
} from '@/lib/provider-routes-store';
import { loadAiModules } from '@/lib/ai-modules';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { getImageProviderHealth, invalidateImageRouteCache } from '@/lib/image-router';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- GET: Aggregated AI status ---

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  // Use default cache/file path to avoid SiteSettingsClient type instantiation depth
  const config = await loadProviderRoutes();
  const imageHealth = getImageProviderHealth();

  // Chat status — sourced from ai-modules (the live chat routing config)
  const aiModules = await loadAiModules();
  const proTier = aiModules.chat.tiers.pro;
  const primaryEp = aiModules.endpoints.find((e) => e.id === proTier.sfw_endpoint_id);
  const referencedEndpointIds = new Set<string>(
    [
      aiModules.chat.fallback_endpoint_id,
      ...(['free', 'basic', 'pro', 'unlimited'] as const).flatMap((t) => {
        const r = aiModules.chat.tiers[t];
        return [r.sfw_endpoint_id, r.nsfw_endpoint_id].filter(Boolean) as string[];
      }),
    ],
  );
  const chatStatus = aiModules.chat.enabled ? 'healthy' : 'degraded';

  let todayMessages = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin.supabase
      .from('ai_model_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('usage_type', 'chat')
      .gte('created_at', `${today}T00:00:00Z`);
    todayMessages = count || 0;
  } catch { /* table may not exist */ }

  // Image status
  const enabledImage = config.image_routes.filter((r) => r.enabled);
  const primaryImage = [...enabledImage].sort((a, b) => a.priority - b.priority)[0];
  const anyCircuitOpen = imageHealth.some((h) => h.circuit_open && h.enabled);
  const imageStatus = enabledImage.length === 0 ? 'degraded' : anyCircuitOpen ? 'degraded' : 'healthy';

  let todayImages = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await admin.supabase
      .from('ai_model_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('usage_type', 'image')
      .gte('created_at', `${today}T00:00:00Z`);
    todayImages = count || 0;
  } catch { /* table may not exist */ }

  // Voice status
  const voiceConfigured = Boolean(process.env.RUNPOD_TTS_ENDPOINT_ID);
  let voiceProfiles = 0;
  try {
    const { data: settingsRow } = await admin.supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'voice_profiles')
      .single();
    const profiles = settingsRow?.value?.profiles || {};
    voiceProfiles = Object.keys(profiles).length;
  } catch { /* settings key may not exist */ }

  // Video status
  const videoConfigured = !!(process.env.RUNWAY_API_KEY || process.env.KLING_API_KEY);

  // Circuit breakers summary
  const circuitBreakers: Record<string, { open: boolean; failures: number }> = {};
  for (const h of imageHealth) {
    circuitBreakers[h.id] = { open: h.circuit_open, failures: h.failures };
  }

  return NextResponse.json({
    chat: {
      primary_model: primaryEp?.label || 'N/A',
      primary_model_id: primaryEp?.model_id || '',
      status: chatStatus,
      today_messages: todayMessages,
      endpoints_count: aiModules.endpoints.length,
      enabled_count: referencedEndpointIds.size,
    },
    image: {
      endpoint: primaryImage?.id || 'none',
      endpoint_label: primaryImage?.label || 'N/A',
      status: imageStatus,
      today_images: todayImages,
      routes_count: config.image_routes.length,
      enabled_count: enabledImage.length,
    },
    voice: { configured: voiceConfigured, profiles_count: voiceProfiles },
    video: { configured: videoConfigured },
    image_health: imageHealth,
    circuit_breakers: circuitBreakers,
  });
}

// --- POST: Actions ---

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  // Same TS2589 workaround as GET: narrow to the duck-typed settings client.
  const settingsDb = admin.supabase as unknown as SiteSettingsClient;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body as { action: string };

  try {
    switch (action) {
      case 'test_image': {
        const started = Date.now();
        const health = getImageProviderHealth();
        const available = health.filter((h) => h.enabled && h.configured && !h.circuit_open);
        if (!available.length) {
          return NextResponse.json({ success: false, error: 'No image providers available', latency_ms: 0 });
        }
        return NextResponse.json({
          success: true,
          latency_ms: Date.now() - started,
          providers_available: available.map((h) => h.id),
          message: `${available.length} provider(s) ready`,
        });
      }

      case 'reset_circuit': {
        const { route_id } = body as { route_id: string };
        invalidateImageRouteCache();
        logger.info('[ai-hub] circuit breaker reset', { route_id, admin: admin.user.id });
        return NextResponse.json({ success: true, message: `Circuit reset for ${route_id || 'all'}` });
      }

      case 'toggle_endpoint': {
        const { route_id, type, enabled } = body as { route_id: string; type: 'image'; enabled: boolean };
        if (type !== 'image') {
          return NextResponse.json(
            { error: 'LLM routing is managed on /admin/ai (ai-modules)' },
            { status: 400 },
          );
        }
        const config = await loadProviderRoutes();
        const route = config.image_routes.find((r) => r.id === route_id);
        if (!route) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        route.enabled = Boolean(enabled);
        await saveProviderRoutes(config, settingsDb);
        return NextResponse.json({ success: true, route_id, enabled });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[admin/ai-hub] error', { action, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

