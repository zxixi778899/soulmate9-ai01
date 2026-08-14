/**
 * Admin API: Provider Routes Management
 *
 * GET  /api/admin/provider-routes — list all routes + health
 * POST /api/admin/provider-routes — update routes config
 *
 * Actions (POST body.action):
 *   - save_config: full config save
 *   - toggle_image_route: { route_id, enabled }
 *   - toggle_llm_route: { route_id, enabled }
 *   - update_image_route: { route_id, ...patch }
 *   - update_llm_route: { route_id, ...patch }
 *   - add_image_route: { route: ImageRouteConfig }
 *   - add_llm_route: { route: LlmRouteConfig }
 *   - remove_image_route: { route_id }
 *   - remove_llm_route: { route_id }
 *   - reorder: { type: 'image'|'llm', ordered_ids: string[] }
 *   - test_route: { route_id, type: 'image'|'llm' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  loadProviderRoutes,
  saveProviderRoutes,
  type ProviderRoutesConfig,
  type LlmRouteConfig,
} from '@/lib/provider-routes-store';
import { getImageProviderHealth, type ImageRouteConfig } from '@/lib/image-router';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET: List routes + health ───────────────────────────────

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const config = await loadProviderRoutes(admin.supabase);
  const imageHealth = getImageProviderHealth();

  return NextResponse.json({
    config,
    image_health: imageHealth,
    env_status: {
      RUNPOD_API_KEY: !!process.env.RUNPOD_API_KEY,
      RUNPOD_VLLM_API_KEY: !!process.env.RUNPOD_VLLM_API_KEY,
      RUNPOD_PRO_CHAT_URL: !!process.env.RUNPOD_PRO_CHAT_URL,
      RUNPOD_UNLIMITED_CHAT_URL: !!process.env.RUNPOD_UNLIMITED_CHAT_URL,
      RUNPOD_DC2_CHAT_URL: !!process.env.RUNPOD_DC2_CHAT_URL,
      RUNPOD_ENDPOINT_ID: !!process.env.RUNPOD_ENDPOINT_ID,
      RUNPOD_ENDPOINT_ID_DC2: !!process.env.RUNPOD_ENDPOINT_ID_DC2,
      FAL_KEY: !!process.env.FAL_KEY,
      TOGETHER_API_KEY: !!process.env.TOGETHER_API_KEY,
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    },
  });
}

// ─── POST: Modify routes ─────────────────────────────────────

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String((body as { action?: string }).action || 'save_config');
  const config = await loadProviderRoutes(admin.supabase);

  try {
    switch (action) {
      case 'save_config': {
        const newConfig = (body as { config?: ProviderRoutesConfig }).config;
        if (!newConfig) return NextResponse.json({ error: 'config required' }, { status: 400 });
        const { source } = await saveProviderRoutes(newConfig, admin.supabase);
        return NextResponse.json({ success: true, source });
      }

      case 'toggle_image_route': {
        const { route_id, enabled } = body as { route_id: string; enabled: boolean };
        const route = config.image_routes.find((r) => r.id === route_id);
        if (!route) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        route.enabled = Boolean(enabled);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route });
      }

      case 'toggle_llm_route': {
        const { route_id, enabled } = body as { route_id: string; enabled: boolean };
        const route = config.llm_routes.find((r) => r.id === route_id);
        if (!route) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        route.enabled = Boolean(enabled);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route });
      }

      case 'update_image_route': {
        const { route_id, ...patch } = body as { route_id: string } & Partial<ImageRouteConfig>;
        const idx = config.image_routes.findIndex((r) => r.id === route_id);
        if (idx === -1) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        config.image_routes[idx] = { ...config.image_routes[idx], ...patch, id: route_id };
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route: config.image_routes[idx] });
      }

      case 'update_llm_route': {
        const { route_id, ...patch } = body as { route_id: string } & Partial<LlmRouteConfig>;
        const idx = config.llm_routes.findIndex((r) => r.id === route_id);
        if (idx === -1) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        config.llm_routes[idx] = { ...config.llm_routes[idx], ...patch, id: route_id };
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route: config.llm_routes[idx] });
      }

      case 'add_image_route': {
        const route = (body as { route?: ImageRouteConfig }).route;
        if (!route?.id) return NextResponse.json({ error: 'route with id required' }, { status: 400 });
        if (config.image_routes.some((r) => r.id === route.id)) {
          return NextResponse.json({ error: `Route '${route.id}' already exists` }, { status: 409 });
        }
        config.image_routes.push(route);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route });
      }

      case 'add_llm_route': {
        const route = (body as { route?: LlmRouteConfig }).route;
        if (!route?.id) return NextResponse.json({ error: 'route with id required' }, { status: 400 });
        if (config.llm_routes.some((r) => r.id === route.id)) {
          return NextResponse.json({ error: `Route '${route.id}' already exists` }, { status: 409 });
        }
        config.llm_routes.push(route);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, route });
      }

      case 'remove_image_route': {
        const { route_id } = body as { route_id: string };
        const idx = config.image_routes.findIndex((r) => r.id === route_id);
        if (idx === -1) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        const [removed] = config.image_routes.splice(idx, 1);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, removed });
      }

      case 'remove_llm_route': {
        const { route_id } = body as { route_id: string };
        const idx = config.llm_routes.findIndex((r) => r.id === route_id);
        if (idx === -1) return NextResponse.json({ error: `Route '${route_id}' not found` }, { status: 404 });
        const [removed] = config.llm_routes.splice(idx, 1);
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source, removed });
      }

      case 'reorder': {
        const { type, ordered_ids } = body as { type: 'image' | 'llm'; ordered_ids: string[] };
        if (!Array.isArray(ordered_ids)) return NextResponse.json({ error: 'ordered_ids array required' }, { status: 400 });
        if (type === 'image') {
          config.image_routes.sort((a, b) => ordered_ids.indexOf(a.id) - ordered_ids.indexOf(b.id));
          config.image_routes.forEach((r, i) => { r.priority = (i + 1) * 10; });
        } else {
          config.llm_routes.sort((a, b) => ordered_ids.indexOf(a.id) - ordered_ids.indexOf(b.id));
          config.llm_routes.forEach((r, i) => { r.priority = (i + 1) * 10; });
        }
        const { source } = await saveProviderRoutes(config, admin.supabase);
        return NextResponse.json({ success: true, source });
      }

      case 'test_route': {
        const { route_id, type } = body as { route_id: string; type: 'image' | 'llm' };
        const started = Date.now();
        try {
          if (type === 'llm') {
            const route = config.llm_routes.find((r) => r.id === route_id);
            if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
            const apiBase = route.api_base_url || (route.api_base_env ? process.env[route.api_base_env] : '');
            const apiKey = route.api_key_env ? process.env[route.api_key_env] : '';
            if (!apiBase) return NextResponse.json({ success: false, error: 'API base URL not configured', latency_ms: 0 });
            if (!apiKey) return NextResponse.json({ success: false, error: 'API key not configured', latency_ms: 0 });
            const res = await fetch(`${apiBase.replace(/\/$/, '')}/models`, {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(10000),
            });
            const latency = Date.now() - started;
            return NextResponse.json({ success: res.ok, status: res.status, latency_ms: latency });
          }
          // Image route test — just check env vars
          const route = config.image_routes.find((r) => r.id === route_id);
          if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
          const configured =
            route.provider === 'fal' ? !!process.env.FAL_KEY :
            route.provider === 'runpod' ? !!process.env.RUNPOD_API_KEY :
            route.provider === 'runpod_dc2' ? !!(route.endpoint_env && process.env[route.endpoint_env]) :
            false;
          return NextResponse.json({ success: configured, configured, latency_ms: Date.now() - started });
        } catch (e) {
          return NextResponse.json({ success: false, error: String(e), latency_ms: Date.now() - started });
        }
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[admin/provider-routes] error', { action, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
