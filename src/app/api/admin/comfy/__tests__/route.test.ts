import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

// Controllable mocks shared between vi.mock factories and test bodies.
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadComfyConfig: vi.fn(),
  saveComfyConfig: vi.fn(),
  invalidateComfyCache: vi.fn(),
  getVerifiedInstalledLoraSet: vi.fn(),
  catalogToLoraAssets: vi.fn(),
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/comfy-console/store', () => ({
  loadComfyConfig: mocks.loadComfyConfig,
  saveComfyConfig: mocks.saveComfyConfig,
  invalidateComfyCache: mocks.invalidateComfyCache,
}));

vi.mock('@/lib/runpod-loras', () => ({
  sanitizeLoraForVolume: vi.fn(),
  verifyLoraHealth: vi.fn(),
  checkLoraAuthenticity: vi.fn(),
  getVerifiedInstalledLoraSet: mocks.getVerifiedInstalledLoraSet,
  getInstalledLoraSet: vi.fn().mockReturnValue(new Set()),
  LORA_REGISTRY: [],
}));

vi.mock('@/lib/comfy-console/defaults', () => ({
  createDefaultComfyConfig: vi.fn().mockReturnValue({ loras: [] }),
}));

vi.mock('@/lib/comfy-console/lora-catalog', () => ({
  LORA_CATALOG: {
    version: 'test',
    base_model: 'flux',
    target_volume: 'vol',
    region: 'us',
    notes: '',
    categories: [],
    stacking_tips: '',
    apply_recipes: [],
  },
  catalogToLoraAssets: mocks.catalogToLoraAssets,
  groupLorasByCategory: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/comfy-console/studio-profile', () => ({
  loraUsageZh: vi.fn().mockReturnValue(''),
  buildStudioPromptEnhancement: vi.fn().mockReturnValue(''),
  compactFluxPrompt: vi.fn((v: string) => v),
  ensureStudioFluxPrompt: vi.fn((v: string) => v),
  recommendedStudioLoras: vi.fn().mockReturnValue([]),
  studioLoraStrengthScale: vi.fn().mockReturnValue(1),
  studioNegativePrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('@/lib/runpod', () => ({
  runpodClient: { isConfigured: false },
}));

vi.mock('@/lib/storage', () => ({
  uploadImageBase64: vi.fn(),
  deleteFile: vi.fn(),
  resolveImageUrl: vi.fn().mockResolvedValue(''),
  extractKeyFromUrl: vi.fn().mockReturnValue(''),
  toPublicUrl: vi.fn((key: string) => `https://cdn/${key}`),
  resolveBucketName: vi.fn().mockReturnValue('assets'),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/ai-modules/store', () => ({ loadAiModules: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/ai-modules/resolve', () => ({ resolveChatCall: vi.fn() }));
vi.mock('@/lib/ai-modules/invoke', () => ({ invokeChat: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 99,
    resetAt: Date.now() + 60_000,
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/companion-category', () => ({
  COMPANION_CATEGORIES: [],
  normalizeCompanionCategory: vi.fn((v: unknown) => v),
}));

vi.mock('@/lib/image-generation-routing', () => ({
  resolveImageGenerationRoute: vi.fn(),
  specialistModelsReadyFromEnv: vi.fn().mockReturnValue(false),
  TASK_DENOISE_DEFAULTS: { outfit: 0.72, pose: 0.62, background: 0.5, portrait: 0.55 },
}));

vi.mock('@/lib/image-scene-semantics', () => ({
  classifyImageScene: vi.fn(),
  normalizeLlmImageScene: vi.fn(),
}));

vi.mock('@/lib/model-lora-routing', () => ({ resolveModelLoraPlan: vi.fn() }));
vi.mock('@/lib/lora-scope', () => ({ isLoraAllowedForContext: vi.fn().mockReturnValue(true) }));

vi.mock('@/lib/reference-generation-plan', () => ({
  buildReferenceGenerationPlan: vi.fn(),
  companionIdentityAssets: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/character-asset-production', () => ({
  getCharacterProductionPreset: vi.fn(),
  identityReferenceRolePriority: vi.fn(),
  identityTurnaroundDenoise: vi.fn(),
  normalizeCharacterAssetRole: vi.fn((v: unknown) => String(v || 'identity')),
}));

vi.mock('@/lib/companion-generation', () => ({
  buildCompanionAgeNegativePrompt: vi.fn().mockReturnValue(''),
  buildCompanionIdentityBrief: vi.fn().mockReturnValue(''),
  buildIdentityAnchorPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('@/lib/identity-kit', () => ({
  resolveIpAdapterWeight: vi.fn().mockReturnValue(0.7),
  resolveIpAdapterSchedule: vi.fn(),
  resolveIdentityKit: vi.fn(),
}));

vi.mock('@/lib/comfy-console/generation-profiles', () => ({
  resolveGenerationProfile: vi.fn(),
}));

vi.mock('@/lib/comfy-console/enhancer-config', () => ({
  assertEnhancersReady: vi.fn(),
  getEnhancerStatuses: vi.fn().mockReturnValue([]),
}));

import { GET, PATCH, POST } from '@/app/api/admin/comfy/route';

function makeReq(method: string, body?: unknown, url = 'http://localhost/api/admin/comfy'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

describe('admin/comfy auth gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedInstalledLoraSet.mockReturnValue(new Set());
    mocks.catalogToLoraAssets.mockReturnValue([]);
  });

  it('GET returns the requireAdmin error without loading config when unauthorized', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ error: authError(401, 'Unauthorized') });

    const response = await GET(makeReq('GET') as never);

    expect(response.status).toBe(401);
    expect(mocks.loadComfyConfig).not.toHaveBeenCalled();
  });

  it('GET returns 403 when the caller lacks the admin role', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ error: authError(403, 'Forbidden: Admin access required') });

    const response = await GET(makeReq('GET') as never);

    expect(response.status).toBe(403);
    expect(mocks.loadComfyConfig).not.toHaveBeenCalled();
  });

  it('PATCH surfaces the requireAdmin error and never persists config', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ error: authError(403, 'Forbidden: Admin access required') });

    const response = await PATCH(makeReq('PATCH', { config: { loras: [] } }) as never);

    expect(response.status).toBe(403);
    expect(mocks.saveComfyConfig).not.toHaveBeenCalled();
    expect(mocks.invalidateComfyCache).not.toHaveBeenCalled();
  });

  it('POST surfaces the requireAdmin error before dispatching any action', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ error: authError(401, 'Unauthorized') });

    const response = await POST(makeReq('POST', { action: 'reset_config' }) as never);

    expect(response.status).toBe(401);
    expect(mocks.loadComfyConfig).not.toHaveBeenCalled();
  });
});

describe('admin/comfy GET config view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVerifiedInstalledLoraSet.mockReturnValue(new Set());
    mocks.catalogToLoraAssets.mockReturnValue([]);
  });

  it('returns merged config once the admin gate passes', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: { id: 'admin-1' },
      profile: { role: 'admin' },
      supabase: { from: vi.fn() },
    });
    mocks.loadComfyConfig.mockResolvedValueOnce({ loras: [], network_volume: {} });

    const response = await GET(makeReq('GET') as never);

    expect(response.status).toBe(200);
    expect(mocks.loadComfyConfig).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toHaveProperty('config');
    expect(body.runpod_configured).toBe(false);
    // mergeInstalledLoras always injects the "(不使用 LoRA)" sentinel entry.
    expect(body.config.loras[0].id).toBe('none');
  });
});

describe('admin/comfy PATCH config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an invalid JSON body with 400', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: { id: 'admin-1' },
      profile: { role: 'admin' },
      supabase: { from: vi.fn() },
    });
    const req = new Request('http://localhost/api/admin/comfy', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });

    const response = await PATCH(req as never);

    expect(response.status).toBe(400);
    expect(mocks.saveComfyConfig).not.toHaveBeenCalled();
  });

  it('persists a merged config and invalidates the cache', async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      user: { id: 'admin-1' },
      profile: { role: 'admin' },
      supabase: { from: vi.fn() },
    });
    mocks.loadComfyConfig.mockResolvedValueOnce({ loras: [], network_volume: { name: 'old' } });
    mocks.saveComfyConfig.mockResolvedValueOnce({ source: 'file' });

    const response = await PATCH(makeReq('PATCH', { config: { network_volume: { name: 'new' } } }) as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.source).toBe('file');
    expect(mocks.saveComfyConfig).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateComfyCache).toHaveBeenCalledTimes(1);
    // Merge keeps existing keys and applies the incoming partial.
    expect(mocks.saveComfyConfig.mock.calls[0][0].network_volume.name).toBe('new');
    expect(mocks.saveComfyConfig.mock.calls[0][0].loras).toEqual([]);
  });
});
