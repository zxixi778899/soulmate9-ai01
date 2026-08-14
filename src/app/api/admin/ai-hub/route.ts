/**
 * Admin API: AI Hub - Unified AI management dashboard
 *
 * GET  /api/admin/ai-hub - aggregated status of all AI capabilities
 * POST /api/admin/ai-hub - actions: test_chat, test_image, reset_circuit, toggle_endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  loadProviderRoutes,
  saveProviderRoutes,
  type LlmRouteConfig,
} from '@/lib/provider-routes-store';
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

  // Chat status
  const enabledLlm = config.llm_routes.filter((r) => r.enabled);
  const primaryLlm = [...enabledLlm].sort((a, b) => a.priority - b.priority)[0];
  const chatStatus = enabledLlm.length > 0 ? 'healthy' : 'degraded';

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

  // Simplified LLM routes
  const llmRoutes = config.llm_routes.map((r) => ({
    id: r.id,
    label: r.label,
    provider: r.provider,
    model_id: r.model_id,
    enabled: r.enabled,
    priority: r.priority,
    nsfw_capable: r.nsfw_capable,
    tiers: r.tiers,
    channel: r.channel,
  }));

  return NextResponse.json({
    chat: {
      primary_model: primaryLlm?.label || 'N/A',
      primary_model_id: primaryLlm?.model_id || '',
      status: chatStatus,
      today_messages: todayMessages,
      endpoints_count: config.llm_routes.length,
      enabled_count: enabledLlm.length,
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
    llm_routes: llmRoutes,
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
      case 'test_chat': {
        const { route_id } = body as { route_id: string };
        const config = await loadProviderRoutes();
        const route = config.llm_routes.find((r) => r.id === route_id);
        if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });

        const apiBase = route.api_base_url || (route.api_base_env ? process.env[route.api_base_env] : '');
        const apiKey = route.api_key_env ? process.env[route.api_key_env] : '';
        if (!apiBase) return NextResponse.json({ success: false, error: 'API base URL not configured', latency_ms: 0 });
        if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured', latency_ms: 0 });

        const started = Date.now();
        const res = await fetch(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: route.model_id,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 32,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const latency = Date.now() - started;
        const data = await res.json().catch(() => ({}));
        const reply =
          (data as { choices?: Array<{ message?: { content?: string } }> })
            ?.choices?.[0]?.message?.content || '';

        return NextResponse.json({ success: res.ok, latency_ms: latency, reply: reply.slice(0, 200), status: res.status });
      }

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
        const { route_id, type, enabled } = body as { route_id: string; type: 'llm' | 'image'; enabled: boolean };
        const config = await loadProviderRoutes();
        if (type === 'llm') {
          const route = config.llm_routes.find((r) => r.id === route_id);
          if (!route) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
          route.enabled = Boolean(enabled);
        } else {
          const route = config.image_routes.find((r) => r.id === route_id);
          if (!route) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
          route.enabled = Boolean(enabled);
        }
        await saveProviderRoutes(config, settingsDb);
        return NextResponse.json({ success: true, route_id, enabled });
      }

      case 'reorder_llm': {
        const { ordered_ids } = body as { ordered_ids: string[] };
        if (!Array.isArray(ordered_ids)) return NextResponse.json({ error: 'ordered_ids array required' }, { status: 400 });
        const config = await loadProviderRoutes();
        config.llm_routes.sort((a, b) => ordered_ids.indexOf(a.id) - ordered_ids.indexOf(b.id));
        config.llm_routes.forEach((r, i) => { r.priority = (i + 1) * 10; });
        await saveProviderRoutes(config, settingsDb);
        return NextResponse.json({ success: true });
      }

      case 'add_llm_route': {
        const { route } = body as { route: Partial<LlmRouteConfig> | undefined };
        if (!route?.id || !route?.label) {
          return NextResponse.json({ error: 'route with id and label required' }, { status: 400 });
        }
        const config = await loadProviderRoutes();
        if (config.llm_routes.some((r) => r.id === route.id)) {
          return NextResponse.json({ error: `Route '${route.id}' already exists` }, { status: 409 });
        }
        config.llm_routes.push({
          id: route.id!,
          label: route.label!,
          provider: route.provider || 'openrouter',
          model_id: route.model_id || '',
          enabled: route.enabled ?? true,
          priority: route.priority || (config.llm_routes.length + 1) * 10,
          nsfw_capable: route.nsfw_capable ?? false,
          tiers: route.tiers || ['pro', 'unlimited'],
          channel: route.channel || 'both',
          timeout_ms: route.timeout_ms || 25000,
          failure_threshold: route.failure_threshold || 3,
          reset_ms: route.reset_ms || 60000,
          api_base_url: route.api_base_url,
          api_base_env: route.api_base_env,
          api_key_env: route.api_key_env,
          notes: route.notes,
        });
        await saveProviderRoutes(config, settingsDb);
        return NextResponse.json({ success: true, route });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[admin/ai-hub] error', { action, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

