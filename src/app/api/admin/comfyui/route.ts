import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { runpodClient, resolveInputImageBase64, RunPodPendingError } from '@/lib/runpod';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import {
  CONSOLE_PRESETS,
  DEFAULT_RAW_GRAPH,
  type ConsoleWorkflowPreset,
} from '@/lib/comfyui-console/console-presets';
import { validateRawGraph } from '@/lib/comfyui-console/workflow-controls';
import { buildAutoLoraStack, buildKeywordLoras } from '@/lib/auto-lora';
import { invokeChat } from '@/lib/ai-modules/invoke';
import { loadAiModules } from '@/lib/ai-modules';
import { pickImagePromptEndpoint, sanitizeLlmPrompt } from '@/lib/image-prompt-llm';
import { compactFluxPrompt, studioIntensityDirection } from '@/lib/comfy-console/studio-profile';
import { normalizeCompanionCategory } from '@/lib/companion-category';
import { uploadImageBase64, uploadFile, extractKeyFromUrl } from '@/lib/storage';
import { sanitizeLoraForVolume, getVerifiedInstalledLoraSet } from '@/lib/runpod-loras';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const GEN_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 };

function comfyEndpoint(): string {
  return process.env.RUNPOD_ENDPOINT_ID || 'wozrrlcdipyl3p';
}
function wanEndpoint(): string {
  return process.env.RUNPOD_WAN_VIDEO_ENDPOINT || 'vb3mqlf5cleuvq';
}
function runpodApiKey(): string {
  return process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
}

const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

function jobFolder(workflowKey?: string | null): string {
  const safe = String(workflowKey || 'raw').replace(/[^a-z0-9-_]/gi, '-').slice(0, 40) || 'raw';
  return `comfyui/${safe}`;
}

function modelFamilyFromCheckpoint(ckpt?: string | null): 'flux' | 'pony' | 'illustrious' | 'sdxl' {
  const c = String(ckpt || '').toLowerCase();
  if (c.includes('pony')) return 'pony';
  if (c.includes('illustrious') || c.includes('waimature')) return 'illustrious';
  if (c.includes('sdxl')) return 'sdxl';
  return 'flux';
}

/** 工作流 → 伴侣资源库资产 role（character-asset-production 的目录约定） */
function girlfriendAssetRole(workflowKey: string): string {
  switch (workflowKey) {
    case 'wf-character':
      return 'identity-full';
    case 'wf-portrait':
      return 'character-art';
    case 'wf-scene':
      return 'scene';
    case 'wf-outfit':
      return 'outfit';
    case 'wf-pose':
      return 'pose-reference';
    case 'wf-tryon':
    case 'wf-bgswap':
      return 'character-art';
    default:
      return 'album';
  }
}

function workflowCategory(workflowKey: string): string {
  switch (workflowKey) {
    case 'wf-scene':
      return 'scene';
    case 'wf-outfit':
      return 'outfit';
    case 'wf-dynamic':
    case 'raw':
      return 'public';
    default:
      return 'photo';
  }
}

/** 从 girlfriends 行拼装人物描述（用于提示词一键预填） */
function buildGirlfriendDescription(gf: Record<string, unknown>): string {
  const explicit = String(gf.image_prompt || '').trim();
  if (explicit) return explicit;
  const parts: string[] = [];
  const name = String(gf.name || '').trim();
  const age = Number(gf.age);
  if (name) parts.push(`${name}`);
  if (Number.isFinite(age) && age > 0) parts.push(`${age} year old woman`);
  const lookPairs: Array<[string, string]> = [
    ['appearance_race', 'race'],
    ['appearance_hair_color', 'hair color'],
    ['appearance_hair', 'hair'],
    ['appearance_eyes', 'eyes'],
    ['appearance_face', 'face'],
    ['appearance_body', 'body'],
    ['appearance_skin', 'skin'],
    ['appearance_style', 'style'],
  ];
  const look: string[] = [];
  for (const [col] of lookPairs) {
    const v = String(gf[col] || '').trim();
    if (v) look.push(v);
  }
  if (look.length) parts.push(look.join(', '));
  const occ = String(gf.occupation || '').trim();
  if (occ) parts.push(occ);
  return parts.join(', ');
}

/** 下载/转换任意媒体（URL / dataURL / base64）并持久化到公开桶 */
async function persistMedia(
  src: string,
  folder: string,
  kind: 'image' | 'video',
): Promise<{ url: string; key: string | null }> {
  if (!src) throw new Error('empty media');
  const isOurStorage = src.includes('/storage/v1/object/');

  if (src.startsWith('http') && isOurStorage) {
    return { url: src, key: extractKeyFromUrl(src) };
  }

  if (src.startsWith('http')) {
    const res = await fetch(src, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`media download ${res.status}`);
    const ct = res.headers.get('content-type') || (kind === 'video' ? 'video/mp4' : 'image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    if (kind === 'video') {
      const { url, key } = await uploadFile(buf, `video_${Date.now()}.mp4`, ct, folder);
      return { url, key };
    }
    const { url, key } = await uploadImageBase64(
      `data:${ct};base64,${buf.toString('base64')}`,
      folder,
      ct,
    );
    return { url, key };
  }

  if (kind === 'video') {
    const b64 = src.startsWith('data:') ? String(src.split(',').pop() || '') : src;
    const buf = Buffer.from(b64, 'base64');
    const { url, key } = await uploadFile(buf, `video_${Date.now()}.mp4`, 'video/mp4', folder);
    return { url, key };
  }
  const { url, key } = await uploadImageBase64(src, folder);
  return { url, key };
}

/** 从 RunPod 任务输出里收集媒体字符串（图片 / 视频 URL / base64） */
function collectMediaFromOutput(
  out: unknown,
  acc: Array<{ value: string; kind: 'image' | 'video' }>,
  depth = 0,
): void {
  if (depth > 6 || out == null) return;
  if (typeof out === 'string') {
    const s = out.trim();
    if (!s) return;
    if (/^https?:\/\//i.test(s)) {
      const kind = /\.(mp4|webm|mov)(\?|$)/i.test(s) || s.includes('video') ? 'video' : 'image';
      if (s.length < 2000) acc.push({ value: s, kind });
      return;
    }
    if (s.startsWith('data:video/')) {
      acc.push({ value: s, kind: 'video' });
      return;
    }
    if (s.startsWith('data:image/')) {
      acc.push({ value: s, kind: 'image' });
      return;
    }
    const compact = s.replace(/\s/g, '');
    // mp4 ftyp box base64 以 AAAA 开头
    if (compact.length > 20000 && /^AAAA[A-Za-z0-9+/]+/.test(compact.slice(0, 64))) {
      acc.push({ value: compact, kind: 'video' });
      return;
    }
    if (
      compact.length > 500 &&
      (/^iVBOR/.test(compact) || /^\/9j\//.test(compact) || /^UklGR/.test(compact))
    ) {
      acc.push({ value: compact, kind: 'image' });
    }
    return;
  }
  if (Array.isArray(out)) {
    for (const item of out.slice(0, 12)) collectMediaFromOutput(item, acc, depth + 1);
    return;
  }
  if (typeof out === 'object') {
    for (const value of Object.values(out as Record<string, unknown>)) {
      collectMediaFromOutput(value, acc, depth + 1);
      if (acc.length >= 12) return;
    }
  }
}

/** 预设种子：表为空时写入 9 大预设 */
async function ensurePresetsSeeded(supabase: ReturnType<typeof getSupabaseClient>) {
  try {
    // Re-seed when a preset is missing or its schema is out of date (e.g. new
    // fields like the NSFW intensity selector), so code changes propagate to
    // existing databases without admins manually resetting presets.
    const presetKeys = new Set(CONSOLE_PRESETS.map((p) => p.key));
    const { data: existing } = await supabase
      .from('comfyui_workflows')
      .select('key, params_schema')
      .eq('is_preset', true)
      .limit(100);
    const existingRows = (existing || []) as Array<{ key: string; params_schema?: unknown }>;
    const existingKeys = new Set(existingRows.map((r) => String(r.key)));
    const stale = existingRows.some((r) => {
      if (!presetKeys.has(String(r.key))) return false;
      const schema = Array.isArray(r.params_schema)
        ? (r.params_schema as Array<Record<string, unknown>>)
        : [];
      const defaults = (r as { defaults?: Record<string, unknown> }).defaults || {};
      const promptDefault = String(defaults.prompt || '');
      return (
        !schema.some((f) => f?.key === 'intensity') ||
        !/natural skin texture/i.test(promptDefault)
      );
    });
    if (existingKeys.size === presetKeys.size && !stale) return;
    const rows = CONSOLE_PRESETS.map((p) => ({
      key: p.key,
      name: p.name,
      category: p.category,
      engine: p.engine,
      description: p.description,
      icon: p.icon,
      workflow_json: p.workflow_json ?? null,
      params_schema: p.params_schema,
      defaults: p.defaults,
      sort_order: p.sort_order,
      is_preset: true,
      is_active: true,
    }));
    const { error } = await supabase.from('comfyui_workflows').upsert(rows, { onConflict: 'key' });
    if (error) logger.warn('[comfyui] seed presets failed', { err: error.message });
  } catch (e) {
    logger.warn('[comfyui] seed check failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** raw 引擎：把 LoadImage 的 URL/dataURL 引用转成 worker 文件名 + images payload */
async function prepareRawGraph(
  graphIn: Record<string, unknown>,
  promptOverride?: string,
): Promise<{ graph: Record<string, unknown>; images: Array<{ name: string; image: string }> }> {
  const graph = JSON.parse(JSON.stringify(graphIn)) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  const images: Array<{ name: string; image: string }> = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    const cls = String(node?.class_type || '');
    if (!/LoadImage/i.test(cls) || !node.inputs) continue;
    const value = node.inputs.image;
    if (typeof value !== 'string') continue;
    if (!value.startsWith('http') && !value.startsWith('data:image/')) continue;
    const resolved = await resolveInputImageBase64(value);
    if (!resolved) continue;
    const name = `ref_${nodeId.replace(/[^a-z0-9]/gi, '_')}.${resolved.name.split('.').pop() || 'png'}`;
    node.inputs.image = name;
    images.push({ name, image: resolved.base64 });
  }
  // Unlock the prompt: if a prompt override is provided, write it into the
  // positive CLIPTextEncode node (skip nodes whose text looks like a negative
  // list) so edited prompts actually reach the text encoder.
  const override = String(promptOverride || '').trim();
  if (override) {
    let best: { node: Record<string, unknown>; len: number } | null = null;
    for (const node of Object.values(graph)) {
      const cls = String((node as { class_type?: string }).class_type || '');
      if (cls !== 'CLIPTextEncode') continue;
      const text = String(
        ((node as { inputs?: Record<string, unknown> }).inputs as Record<string, unknown> | undefined)?.text || '',
      );
      if (/watermark|underage|child|deformed|lowres|blurry/i.test(text)) continue;
      if (!best || text.length > best.len) best = { node: node as Record<string, unknown>, len: text.length };
    }
    if (best) {
      ((best.node as { inputs: Record<string, unknown> }).inputs as Record<string, unknown>).text = override;
    }
  }
  return { graph: graph as Record<string, unknown>, images };
}

async function submitRawComfy(
  endpointId: string,
  graph: Record<string, unknown>,
  images: Array<{ name: string; image: string }>,
): Promise<string> {
  const key = runpodApiKey();
  if (!key) throw new Error('RUNPOD_API_KEY 未配置');
  const base = `https://api.runpod.ai/v2/${endpointId}`;
  const imagesPayload = images.length ? { images } : {};
  const strategies: Array<Record<string, unknown>> = [
    { prompt: graph, workflow: graph, ...imagesPayload },
    { prompt: graph, ...imagesPayload },
    { workflow: graph, ...imagesPayload },
  ];
  let lastErr = '';
  for (const input of strategies) {
    try {
      const res = await fetch(`${base}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`;
        continue;
      }
      const j = (await res.json()) as { id?: string };
      if (j?.id) return String(j.id);
      lastErr = 'submit 未返回 job id';
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`raw 工作流提交失败: ${lastErr}`);
}

/** WAN 端点提交 */
async function submitWan(params: Record<string, unknown>): Promise<string> {
  const key = runpodApiKey();
  if (!key) throw new Error('RUNPOD_API_KEY 未配置');
  const endpointId = wanEndpoint();
  const prompt = String(params.prompt || '').trim();
  if (!prompt) throw new Error('视频动作描述不能为空');

  const seed = Number(params.seed ?? -1);
  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: String(params.negative || '').trim() || undefined,
    width: clampNum(params.width, 320, 1280, 832),
    height: clampNum(params.height, 320, 1280, 480),
    num_frames: clampNum(params.num_frames, 16, 161, 81),
    fps: clampNum(params.fps, 8, 24, 16),
    num_inference_steps: clampNum(params.steps, 10, 60, 30),
    guidance_scale: clampNum(params.guidance, 1, 12, 5),
    seed: Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : undefined,
  };
  const image = String(params.image || '').trim();
  if (image) {
    if (image.startsWith('data:image/')) {
      const b64 = String(image.split(',').pop() || '');
      input.image = b64;
      input.image_base64 = b64;
    } else {
      input.image = image;
    }
  }

  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 240);
    throw new Error(
      `WAN 端点提交失败 HTTP ${res.status}: ${text}（端点 ${endpointId} 可能处于 standby，请到 RunPod 控制台扩容 worker）`,
    );
  }
  const j = (await res.json()) as { id?: string };
  if (!j?.id) throw new Error('WAN 端点未返回 job id');
  return String(j.id);
}

/** 单次状态探测（wan 引擎用） */
async function fetchJobStatusRaw(
  endpointId: string,
  runpodJobId: string,
): Promise<{ status: string; output?: unknown; error?: string; execution_time?: number }> {
  const key = runpodApiKey();
  const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${runpodJobId}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`status HTTP ${res.status}`);
  return (await res.json()) as {
    status: string;
    output?: unknown;
    error?: string;
    execution_time?: number;
  };
}

/**
 * GET /api/admin/comfyui
 *  ?view=console | jobs
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const view = new URL(req.url).searchParams.get('view') || 'console';

  if (view === 'jobs') {
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || 60), 200);
    // Stale-job recovery: IN_PROGRESS/IN_QUEUE jobs untouched for 20+ min are
    // treated as lost (RunPod may purge the job) and auto-failed so the UI
    // never shows a forever-spinning generation.
    const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    await admin.supabase
      .from('comfyui_jobs')
      .update({
        status: 'FAILED',
        error: '生成超时：任务超过 20 分钟未完成（RunPod 任务可能已丢失），请重新生成。',
        updated_at: new Date().toISOString(),
      })
      .in('status', ['IN_PROGRESS', 'IN_QUEUE'])
      .lt('updated_at', staleCutoff);
    const { data, error } = await admin.supabase
      .from('comfyui_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: data || [] });
  }

  await ensurePresetsSeeded(admin.supabase);
  const { data: workflows, error: wfError } = await admin.supabase
    .from('comfyui_workflows')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);
  const { data: jobs } = await admin.supabase
    .from('comfyui_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(12);

  const cfg = await loadComfyConfig(admin.supabase);
  let installed: string[] = [];
  try {
    installed = [...getVerifiedInstalledLoraSet()].sort();
  } catch {
    installed = [];
  }

  // 伴侣联动上下文
  const sp = new URL(req.url).searchParams;
  const girlfriendId = (sp.get('girlfriend_id') || sp.get('girlfriendId') || '').trim();
  let girlfriend: Record<string, unknown> | null = null;
  let girlfriendAssets: Array<Record<string, unknown>> = [];
  if (girlfriendId) {
    const { data: gfRow } = await admin.supabase
      .from('girlfriends')
      .select(
        'id, name, age, gender, portrait_url, avatar_url, face_reference_url, image_prompt, short_description, occupation, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, appearance_face, appearance_skin',
      )
      .eq('id', girlfriendId)
      .maybeSingle();
    if (gfRow) {
      const rec = gfRow as Record<string, unknown>;
      girlfriend = {
        id: rec.id,
        name: rec.name,
        age: rec.age,
        portrait_url: rec.portrait_url || rec.avatar_url || null,
        face_reference_url: rec.face_reference_url || rec.portrait_url || rec.avatar_url || null,
        description: buildGirlfriendDescription(rec),
      };
    }
    const { data: assetRows } = await admin.supabase
      .from('generation_assets')
      .select('id, url, storage_key, kind, prompt, meta, created_at')
      .eq('girlfriend_id', girlfriendId)
      .order('created_at', { ascending: false })
      .limit(48);
    girlfriendAssets = (assetRows || []).map((a) => {
      const rec = a as Record<string, unknown>;
      const meta = rec.meta && typeof rec.meta === 'object' ? (rec.meta as Record<string, unknown>) : {};
      return {
        id: rec.id,
        url: rec.url,
        storage_key: rec.storage_key,
        workflow_key: meta.workflow_key || null,
        media_kind: meta.media_kind || 'image',
        created_at: rec.created_at,
      };
    });
  }
  const { data: gfRows } = await admin.supabase
    .from('girlfriends')
    .select('id, name, avatar_url, portrait_url')
    .order('updated_at', { ascending: false })
    .limit(50);
  const girlfriends = (gfRows || []).map((g) => {
    const rec = g as Record<string, unknown>;
    return {
      id: rec.id,
      name: rec.name,
      image: rec.avatar_url || rec.portrait_url || null,
    };
  });

  return NextResponse.json({
    workflows: workflows || [],
    warning: wfError ? wfError.message : undefined,
    jobs: jobs || [],
    girlfriend,
    girlfriend_assets: girlfriendAssets,
    girlfriends,
    config: {
      loras: cfg.loras,
      checkpoints: cfg.checkpoints,
      endpoints: cfg.endpoints,
      network_volume: cfg.network_volume,
      installed_loras: installed,
    },
    runpod: {
      configured: runpodClient.isConfigured,
      comfy_endpoint: comfyEndpoint(),
      wan_endpoint: wanEndpoint(),
      wan_env_set: !!process.env.RUNPOD_WAN_VIDEO_ENDPOINT,
      ipadapter_installed: process.env.RUNPOD_IPADAPTER_INSTALLED === '1',
    },
  });
}

/**
 * POST /api/admin/comfyui
 * action: submit | poll | cancel | save_workflow | delete_workflow | toggle_workflow
 *       | reset_presets | endpoint_health
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, 'admin');
  if (admin.error) return admin.error;
  /** 中文/日韩等非英文提示词 -> 英文（仅翻译润色，保留全部概念；失败/无中文返回 null 走原文） */
  const translateToEnglish = async (
    text: string,
    intensity: number,
    mode: 'positive' | 'negative',
  ): Promise<string | null> => {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const cjkMatches = raw.match(
      /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g,
    );
    if (!cjkMatches || cjkMatches.length < 2) return null;
    const channel: 'sfw' | 'nsfw' = intensity >= 3 ? 'nsfw' : 'sfw';
    try {
      const aiModules = await loadAiModules(admin.supabase);
      const picked = pickImagePromptEndpoint(aiModules, channel);
      if (!picked.primary) return null;
      const boundary =
        channel === 'nsfw'
          ? `Consensual adult content allowed at intensity ${intensity}. ` +
            (intensity === 3
              ? 'Full nudity, no sexual act.'
              : intensity === 4
                ? 'Solo masturbation before climax, no visible fluids.'
                : 'Explicit consensual adult action with coherent anatomy.')
          : intensity === 2
            ? 'Lingerie/nightwear only, nipples and genitals covered, no sexual act.'
            : 'Fully clothed, no nudity, no explicit content.';
      const system =
        mode === 'positive'
          ? 'You are a translation engine for FLUX/WAN image prompts. Translate the RAW PROMPT into a fluent English image-generation prompt as comma-separated descriptive clauses. Keep every concept, keyword and intent exactly; NEVER invent or add new subjects, scenes, outfits, poses, actions or objects. Keep identity consistent when a reference is used. Respect the CONTENT BOUNDARY exactly. When the CONTENT BOUNDARY allows adult content, use direct explicit anatomical words (nude, bare breasts, vulva, penis, testicles, spread legs, penetration, masturbation, ejaculation) and never soften them into euphemisms like intimate areas or suggestive. Output ONLY the English prompt, no markdown, labels or explanations.'
          : 'You are a translation engine for negative image prompts. Translate the RAW PROMPT into a fluent English negative prompt as comma-separated undesired qualities. Keep every concept exactly; do not add unrelated negatives. Respect the CONTENT BOUNDARY exactly. Output ONLY the English negative prompt, no markdown, labels or explanations.';
      const result = await invokeChat({
        endpoint: picked.primary,
        fallbackEndpoints: picked.fallback,
        messages: [
          {
            role: 'system' as const,
            content: system,
          },
          {
            role: 'user' as const,
            content: `RAW PROMPT: ${raw.slice(0, 800)}\n\nCONTENT BOUNDARY: ${boundary}\n\nOUTPUT: the translated prompt now.`,
          },
        ],
        temperature: 0.4,
        maxTokens: Math.min(320, picked.primary.max_tokens || 320),
        userId: admin.user?.id,
        taskType: 'prompt_translation',
        membershipTier: 'admin',
        scene: 'comfyui_console',
        routeReason: channel === 'nsfw' ? 'console_nsfw_prompt_llm' : 'console_sfw_prompt_llm',
      });
      const out = compactFluxPrompt(sanitizeLlmPrompt(result.content), 600);
      if (out) {
        logger.info('[comfyui] prompt translated to english', {
          mode,
          channel,
          model: result.model,
          fromLen: raw.length,
          toLen: out.length,
        });
      }
      return out || null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('[comfyui] prompt translation failed, keep raw', { err: message, channel, mode });
      return null;
    }
  };

  // multipart：参考图上传（客户端先压缩到 ≤1280px JPEG）
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    if (String(form.get('action') || '') !== 'upload_ref') {
      return NextResponse.json(
        { error: 'multipart 仅支持 upload_ref' },
        { status: 400 },
      );
    }
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }
    if (!/^image\//.test(file.type)) {
      return NextResponse.json({ error: '仅支持图片' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '图片超过 10MB' }, { status: 413 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const { url, key } = await uploadImageBase64(
      `data:${file.type};base64,${buf.toString('base64')}`,
      'comfyui-references',
      file.type || 'image/png',
    );
    return NextResponse.json({ success: true, url, key });
  }

  const body = await req.json().catch(() => null);
  if (!body?.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }
  const action = String(body.action);

  // ── 提交生成任务 ─────────────────────────────────────────────
  // ── AI 提示词优化（NSFW 强度路由：≥3 走 vLLM-Qwen3 NSFW 端点）──
  if (action === 'optimize_prompt') {
    const rawPrompt = String(body.prompt || '').trim();
    if (!rawPrompt) {
      return NextResponse.json({ error: 'prompt 不能为空' }, { status: 400 });
    }
    const intensity = Math.max(1, Math.min(5, Math.round(Number(body.intensity) || 1)));
    const channel: 'sfw' | 'nsfw' = intensity >= 3 ? 'nsfw' : 'sfw';
    try {
      const aiModules = await loadAiModules(admin.supabase);
      const picked = pickImagePromptEndpoint(aiModules, channel);
      if (!picked.primary) {
        return NextResponse.json({ error: '未配置提示词优化 LLM 端点' }, { status: 503 });
      }
      const boundary =
        channel === 'nsfw'
          ? `Consensual adult content allowed at intensity ${intensity}. ` +
            (intensity === 3
              ? 'Full nudity, no sexual act.'
              : intensity === 4
                ? 'Solo masturbation before climax, no visible fluids.'
                : 'Explicit consensual adult action with coherent anatomy.')
          : intensity === 2
            ? 'Lingerie/nightwear only, nipples and genitals covered, no sexual act.'
            : 'Fully clothed, no nudity, no explicit content.';
      const messages = [
        {
          role: 'system' as const,
          content:
            'You are a prompt POLISHER for a FLUX/WAN companion generator. Output ONE English image/video prompt as a single paragraph of comma-separated descriptive clauses. IMPORTANT: ONLY refine the wording, grammar and details of the RAW PROMPT. Keep every existing concept and keyword exactly; NEVER invent or add new subjects, scenes, outfits, poses, actions or objects that are not already in the RAW PROMPT, and never remove the user\'s key terms. If the RAW PROMPT is in Chinese or another non-English language, first translate it into English while preserving every concept exactly. Keep identity consistent (same person/face) when a reference is used. Avoid the generic "AI look": emphasize natural skin texture, unique facial features, subtle asymmetries and a candid believable expression. Respect the CONTENT BOUNDARY exactly. When the CONTENT BOUNDARY allows adult content, use direct explicit anatomical words (nude, bare breasts, vulva, penis, testicles, spread legs, penetration, masturbation, ejaculation) and never soften them into euphemisms like intimate areas or suggestive. NEVER output markdown, labels, or explanations.',
        },
        {
          role: 'user' as const,
          content: `RAW PROMPT: ${rawPrompt.slice(0, 800)}\n\nCONTENT BOUNDARY: ${boundary}\n\nOUTPUT: the optimized prompt now.`,
        },
      ];
      const result = await invokeChat({
        endpoint: picked.primary,
        fallbackEndpoints: picked.fallback,
        messages,
        temperature: 0.55,
        maxTokens: Math.min(320, picked.primary.max_tokens || 320),
        userId: admin.user?.id,
        taskType: 'prompt_optimization',
        membershipTier: 'admin',
        scene: 'comfyui_console',
        routeReason: channel === 'nsfw' ? 'console_nsfw_prompt_llm' : 'console_sfw_prompt_llm',
      });
      const optimized = compactFluxPrompt(sanitizeLlmPrompt(result.content), 600);
      if (!optimized) throw new Error('LLM 返回空提示词');
      return NextResponse.json({
        optimized,
        channel,
        model: result.model,
        provider: result.provider,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('[comfyui] optimize_prompt failed', { err: message, channel, intensity });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === 'submit') {
    const rl = await checkRateLimitAsync(`comfyui-gen:${admin.user!.id}`, GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: '生成请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimitHeaders(rl, GEN_LIMIT) },
      );
    }

    await ensurePresetsSeeded(admin.supabase);

    // 工作流来源：内联（编辑器试跑）或数据库
    let wf: Record<string, unknown> | null = null;
    if (body.workflow && typeof body.workflow === 'object' && body.workflow.key) {
      wf = body.workflow as Record<string, unknown>;
    } else {
      const key = String(body.workflow_key || '').trim();
      if (!key) return NextResponse.json({ error: 'workflow_key required' }, { status: 400 });
      const { data, error } = await admin.supabase
        .from('comfyui_workflows')
        .select('*')
        .eq('key', key)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      wf = (data as Record<string, unknown>) || null;
    }
    if (!wf) return NextResponse.json({ error: '工作流不存在' }, { status: 404 });

    const engine = String(wf.engine || 'flux');
    const params: Record<string, unknown> =
      body.params && typeof body.params === 'object' ? body.params : {};
    const defaults: Record<string, unknown> =
      wf.defaults && typeof wf.defaults === 'object' ? (wf.defaults as Record<string, unknown>) : {};
    const merged = { ...defaults, ...params };
    const workflowKey = String(wf.key || 'raw');
    const girlfriendIdRaw = String(body.girlfriend_id || body.girlfriendId || '').trim();
    const girlfriendId = /^[0-9a-f-]{36}$/i.test(girlfriendIdRaw) ? girlfriendIdRaw : null;

    try {
      let runpodJobId = '';
      let endpointId = '';

      if (engine === 'wan') {
        endpointId = wanEndpoint();
        const wanTranslated = await translateToEnglish(
          String(merged.prompt || '').trim(),
          Math.max(1, Math.min(5, Math.round(Number(merged.intensity) || 1))),
          'positive',
        );
        if (wanTranslated) merged.prompt = wanTranslated;
        runpodJobId = await submitWan(merged);
      } else if (engine === 'raw') {
        endpointId = String(body.endpoint_id || comfyEndpoint());
        const graphCandidate =
          params.raw_graph && typeof params.raw_graph === 'object'
            ? (params.raw_graph as Record<string, unknown>)
            : (wf.workflow_json as Record<string, unknown>) || DEFAULT_RAW_GRAPH;
        const check = validateRawGraph(graphCandidate);
        if (!check.ok) {
          return NextResponse.json({ error: check.error || '工作流 JSON 无效' }, { status: 400 });
        }
        const rawTranslated = await translateToEnglish(
          String(merged.prompt || '').trim(),
          1,
          'positive',
        );
        if (rawTranslated) merged.prompt = rawTranslated;
        const { graph, images } = await prepareRawGraph(
          graphCandidate,
          String(merged.prompt || '').trim() || undefined,
        );
        runpodJobId = await submitRawComfy(endpointId, graph, images);
      } else {
        // flux 引擎
        endpointId = String(body.endpoint_id || comfyEndpoint());
        const cfg = await loadComfyConfig(admin.supabase);
        let prompt = String(merged.prompt || '').trim();
        if (!prompt) {
          return NextResponse.json({ error: '提示词不能为空' }, { status: 400 });
        }
        // 中文提示词：生成时自动转英文提交（保留全部概念；翻译失败用原文兜底）
        const genIntensity = Math.max(1, Math.min(5, Math.round(Number(merged.intensity) || 1)));
        const translated = await translateToEnglish(prompt, genIntensity, 'positive');
        if (translated) {
          prompt = translated;
          merged.prompt = translated;
        }
        const rawNegativeText = String(merged.negative || '').trim();
        const translatedNegative = await translateToEnglish(rawNegativeText, genIntensity, 'negative');
        if (translatedNegative) {
          merged.negative = translatedNegative;
        }
        // 全局去“蜡像 / AI 感”：只要提示词没带自然肤质，就强制追加自然感后缀
        const finalPrompt = `${prompt}${
          /natural skin texture/i.test(prompt)
            ? ''
            : ', natural skin texture with visible pores, subtle asymmetric imperfections, candid realistic expression, fine film grain, not airbrushed'
        }, correct realistic anatomy, natural body proportions, well-formed hands and fingers, no extra limbs, coherent posture`;
        merged.prompt = finalPrompt;
        // NSFW 强度生效：>=3 时按强度注入对应内容方向（与对话/捏脸同一套 INTENSITY_ACTIONS），
        // 避免提示词本身温和时「强度调到 5 出图仍是 SFW」
        const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(merged.intensity) || 1)));
        if (nsfwLevel >= 3) {
          let genderRaw = String(merged.gender || '').trim().toLowerCase();
          let styleRaw = String(merged.render_style || merged.style || '').trim().toLowerCase();
          if ((!genderRaw || !styleRaw) && girlfriendId) {
            const { data: gfRow } = await admin.supabase
              .from('girlfriends')
              .select('gender, render_style, anime_render_style, visual_style')
              .eq('id', girlfriendId)
              .maybeSingle();
            if (gfRow) {
              const g = gfRow as Record<string, unknown>;
              if (!genderRaw) genderRaw = String(g.gender || '').toLowerCase();
              if (!styleRaw) styleRaw = String(
                g.render_style || g.anime_render_style || g.visual_style || '',
              ).toLowerCase();
            }
          }
          const nsfwCategory = /2d|anime|manga/.test(styleRaw)
            ? 'anime'
            : normalizeCompanionCategory({ gender: genderRaw || 'female' });
          const direction = studioIntensityDirection(
            nsfwCategory,
            nsfwLevel as 1 | 2 | 3 | 4 | 5,
          );
          if (direction) {
            merged.prompt = `${String(merged.prompt || '').trim()}, ${direction}`;
            logger.info('[comfyui] nsfw direction injected', {
              level: nsfwLevel,
              category: nsfwCategory,
              promptLen: String(merged.prompt || '').length,
            });
          }
        }
        const ckptName =
          String(merged.ckpt_name || '').trim() || 'projectGaiaFlux1D_v20NF4Uncensored.safetensors';
        const family = modelFamilyFromCheckpoint(ckptName);
        const inputImage = String(merged.input_image || '').trim() || undefined;
        const ipAdapterImage = String(merged.ip_adapter_image || '').trim() || undefined;
        const hasImageRef = !!inputImage;

        // 自动 LoRA：表单未手动选 LoRA 时，按「性别 + 渲染风格 + NSFW 强度」固定组合。
        if ((!Array.isArray(merged.loras) || merged.loras.length === 0) && merged.auto_loras !== false) {
          let gender = String(merged.gender || '').trim();
          let style = String(merged.render_style || merged.style || '').trim();
          if (!gender && girlfriendId) {
            const { data: gfRow } = await admin.supabase
              .from('girlfriends')
              .select('gender, appearance_style, render_style, anime_render_style, visual_style')
              .eq('id', girlfriendId)
              .maybeSingle();
            if (gfRow) {
              const g = gfRow as Record<string, unknown>;
              gender = String(g.gender || gender || '');
              style = String(
                g.render_style ||
                  g.anime_render_style ||
                  g.visual_style ||
                  g.appearance_style ||
                  style || '',
              );
            }
          }
          const auto = buildAutoLoraStack(cfg, gender, style, Number(merged.intensity) || 1, [
            ...getVerifiedInstalledLoraSet(),
          ]);
          if (auto.length) {
            merged.loras = auto.map((p) => ({ id: p.id, strength: p.strength }));
            logger.info('[comfyui] auto lora stack', {
              girlfriendId,
              gender,
              style,
              ids: auto.map((p) => p.id),
            });
          }

          // 关键词触发 LoRA：提示词出现 内衣/泳装/乳胶/阴茎/肌肉/丰满/电影感 等自动补挂
          const keywordPicks = buildKeywordLoras(prompt, cfg, [...getVerifiedInstalledLoraSet()]);
          if (keywordPicks.length) {
            const existingIds = new Set(
              (Array.isArray(merged.loras) ? merged.loras : []).map((l) =>
                String((l as Record<string, unknown>).id || ''),
              ),
            );
            const extra = keywordPicks.filter((p) => !existingIds.has(p.id));
            if (extra.length) {
              merged.loras = [
                ...(Array.isArray(merged.loras) ? merged.loras : []),
                ...extra,
              ].slice(0, 3);
              logger.info('[comfyui] keyword lora stack', { ids: extra.map((p) => p.id) });
            }
          }
        }

        const loraStack: Array<{ name: string; strength_model: number; strength_clip: number }> = [];
        const skippedLoras: string[] = [];
        if (Array.isArray(merged.loras)) {
          for (const item of merged.loras.slice(0, 3)) {
            const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
            const asset = cfg.loras.find((l) => l.id === String(rec.id || ''));
            if (!asset?.filename) continue;
            const san = sanitizeLoraForVolume(asset.filename, { fallback: null, allowNull: true });
            if (!san.lora_name) {
              skippedLoras.push(asset.filename);
              continue;
            }
            const strength = clampNum(rec.strength ?? asset.default_strength ?? 0.7, 0, 1.5, 0.7);
            loraStack.push({
              name: san.lora_name,
              strength_model: strength,
              strength_clip: strength,
            });
          }
        }
        const totalStrength = loraStack.reduce((s, l) => s + l.strength_model, 0);
        const scale = totalStrength > 1.55 ? 1.55 / totalStrength : 1;
        const normalizedLoras = loraStack.map((l) => ({
          ...l,
          strength_model: Number((l.strength_model * scale).toFixed(3)),
          strength_clip: Number((l.strength_clip * scale).toFixed(3)),
        }));

        if (!normalizedLoras.length && !hasImageRef) {
          logger.warn('[comfyui] no LoRA applied (auto stack empty or all filtered by volume inventory)', {
            girlfriendId: girlfriendId || null,
            auto: Array.isArray(merged.loras) ? merged.loras.length : 0,
            skipped: skippedLoras,
          });
        }

        const width = roundTo(clampNum(merged.width, 256, 2048, 832), 8);
        const height = roundTo(clampNum(merged.height, 256, 2048, 1216), 8);
        const steps = Math.round(clampNum(merged.steps, 8, 60, 28));
        const seed = Number(merged.seed ?? -1);
        const numImages = Math.round(clampNum(merged.num_images, 1, 4, 1));
        const samplers = new Set(['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_sde']);
        const schedulers = new Set(['simple', 'normal', 'karras', 'sgm_uniform']);
        const samplerRaw = String(merged.sampler || 'euler');
        const schedulerRaw = String(merged.scheduler || 'simple');

        const result = await runpodClient.generate({
          prompt: finalPrompt,
          negative_prompt: String(merged.negative || '').trim() || undefined,
          width,
          height,
          num_inference_steps: steps,
          guidance_scale: family === 'flux' ? 1 : clampNum(merged.cfg, 3, 9, 5),
          flux_guidance: family === 'flux' ? clampNum(merged.flux_guidance, 2, 5, 3.5) : undefined,
          sampler_name: samplers.has(samplerRaw) ? samplerRaw : 'euler',
          scheduler: schedulers.has(schedulerRaw) ? schedulerRaw : 'simple',
          clip_skip: family === 'flux' ? 1 : 2,
          num_images: hasImageRef ? 1 : numImages,
          seed: Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : undefined,
          input_image: inputImage,
          denoising_strength: hasImageRef
            ? clampNum(merged.denoise ?? merged.denoising_strength, 0.15, 0.98, 0.55)
            : undefined,
          ckpt_name: ckptName,
          model_family: family,
          loras: normalizedLoras.length ? normalizedLoras : undefined,
          ip_adapter_image: ipAdapterImage,
          ip_adapter_weight: ipAdapterImage
            ? clampNum(merged.ip_adapter_weight, 0.25, 1, 0.7)
            : undefined,
          endpoint_id: endpointId,
          submit_only: true,
        });
        runpodJobId = result.job_id || '';
        if (!runpodJobId) throw new Error('RunPod 未返回任务 id');
        if (skippedLoras.length) {
          logger.warn('[comfyui] loras skipped (not on volume)', { skippedLoras });
        }
      }

      const { data: job, error: insErr } = await admin.supabase
        .from('comfyui_jobs')
        .insert({
          workflow_key: workflowKey,
          workflow_name: String(wf.name || workflowKey),
          engine,
          endpoint_id: endpointId,
          runpod_job_id: runpodJobId,
          status: 'IN_QUEUE',
          girlfriend_id: girlfriendId,
          params: {
            ...merged,
            loras: undefined,
            raw_graph: undefined,
            input_image: undefined,
            ip_adapter_image: undefined,
            image: undefined,
          },
          created_by: admin.user!.id,
        })
        .select('*')
        .single();
      if (insErr) {
        logger.warn('[comfyui] job insert failed', { err: insErr.message });
        return NextResponse.json({
          success: true,
          job: {
            id: null,
            workflow_key: workflowKey,
            engine,
            endpoint_id: endpointId,
            runpod_job_id: runpodJobId,
            status: 'IN_QUEUE',
            output_urls: [],
          },
          warning: insErr.message,
        });
      }
      return NextResponse.json({ success: true, job });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('[comfyui] submit failed', { engine, err: message });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── 轮询任务 ─────────────────────────────────────────────────
  if (action === 'poll') {
    const jobId = String(body.job_id || '').trim();
    if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });
    const { data: row, error } = await admin.supabase
      .from('comfyui_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    const job = row as Record<string, unknown>;
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      return NextResponse.json({ job });
    }
    const runpodJobId = String(job.runpod_job_id || '');
    if (!runpodJobId) {
      return NextResponse.json({ error: '任务缺少 RunPod job id' }, { status: 400 });
    }
    const engine = String(job.engine || 'flux');
    const endpointId = String(job.endpoint_id || comfyEndpoint());
    const folder = jobFolder(String(job.workflow_key || ''));
    const jobGirlfriendId = job.girlfriend_id ? String(job.girlfriend_id) : null;
    const jobWorkflowKey = String(job.workflow_key || '');
    const jobParams =
      job.params && typeof job.params === 'object' ? (job.params as Record<string, unknown>) : {};

    const finishCompleted = async (media: Array<{ value: string; kind: 'image' | 'video' }>) => {
      const urls: string[] = [];
      const errors: string[] = [];
      const assetRows: Array<Record<string, unknown>> = [];
      for (const item of media.slice(0, 8)) {
        try {
          if (jobGirlfriendId && item.kind === 'image') {
            const role = girlfriendAssetRole(jobWorkflowKey);
            const saved = await persistMedia(
              item.value,
              `girlfriends/${jobGirlfriendId}/${role}`,
              item.kind,
            );
            urls.push(saved.url);
            assetRows.push({
              created_by: job.created_by || null,
              kind: 'girlfriend',
              girlfriend_id: jobGirlfriendId,
              storage_key: saved.key,
              url: saved.url,
              prompt: String(jobParams.prompt || '') || null,
              workflow_id: jobWorkflowKey,
              ckpt_name: String(jobParams.ckpt_name || '') || null,
              width: Number.isFinite(Number(jobParams.width)) ? Number(jobParams.width) : null,
              height: Number.isFinite(Number(jobParams.height)) ? Number(jobParams.height) : null,
              steps: Number.isFinite(Number(jobParams.steps)) ? Number(jobParams.steps) : null,
              seed: Number.isFinite(Number(jobParams.seed)) ? Number(jobParams.seed) : null,
              meta: {
                workflow_key: jobWorkflowKey,
                comfyui_job_id: jobId,
                media_kind: 'image',
                asset_role: role,
                category: workflowCategory(jobWorkflowKey),
              },
            });
          } else {
            const saved = await persistMedia(item.value, folder, item.kind);
            urls.push(saved.url);
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
      let assetWarning: string | undefined;
      if (assetRows.length) {
        const { error: assetErr } = await admin.supabase
          .from('generation_assets')
          .insert(assetRows);
        if (assetErr) {
          assetWarning = assetErr.message;
          logger.warn('[comfyui] generation_assets insert failed', { err: assetErr.message });
        }

        // 同步到伴侣相册（仅照片类；场景/服装/公共不入相册），供聊天与资料页直接展示
        const albumRows = assetRows
          .filter((r) => {
            const meta = r.meta && typeof r.meta === 'object'
              ? r.meta as Record<string, unknown>
              : {};
            return String(meta.category || '') === 'photo' && Boolean(r.girlfriend_id);
          })
          .map((r) => ({
            girlfriend_id: r.girlfriend_id,
            category: 'photo',
            media_type: 'image',
            url: r.url,
            visibility: 'private',
            meta: {
              source: 'comfyui_console',
              workflow_key: jobWorkflowKey,
              asset_role: girlfriendAssetRole(jobWorkflowKey),
            },
          }));
        if (albumRows.length) {
          const { error: albumErr } = await admin.supabase
            .from('companion_assets')
            .insert(albumRows);
          if (albumErr) {
            logger.warn('[comfyui] companion_assets sync failed', { err: albumErr.message });
          }
        }
      }
      const patch: Record<string, unknown> = {
        status: 'COMPLETED',
        output_urls: urls,
        updated_at: new Date().toISOString(),
      };
      if (errors.length) patch.error = `部分媒体保存失败: ${errors.join(' | ').slice(0, 200)}`;
      await admin.supabase.from('comfyui_jobs').update(patch).eq('id', jobId);
      return NextResponse.json({
        job: { ...job, ...patch },
        saved_to_girlfriend: jobGirlfriendId ? true : undefined,
        asset_warning: assetWarning,
      });
    };

    try {
      if (engine === 'wan') {
        const status = await fetchJobStatusRaw(endpointId, runpodJobId);
        if (status.status === 'COMPLETED') {
          const acc: Array<{ value: string; kind: 'image' | 'video' }> = [];
          collectMediaFromOutput(status.output, acc);
          if (!acc.length) {
            await admin.supabase
              .from('comfyui_jobs')
              .update({
                status: 'COMPLETED',
                error: '任务完成但未解析到媒体输出',
                params: {
                  ...((job.params as Record<string, unknown>) || {}),
                  output_raw: JSON.stringify(status.output ?? null).slice(0, 4000),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', jobId);
            return NextResponse.json({
              job: { ...job, status: 'COMPLETED', output_urls: [], error: '任务完成但未解析到媒体输出' },
            });
          }
          return await finishCompleted(acc);
        }
        if (status.status === 'FAILED') {
          const msg = String(status.error || JSON.stringify(status.output || '').slice(0, 280));
          await admin.supabase
            .from('comfyui_jobs')
            .update({ status: 'FAILED', error: msg, updated_at: new Date().toISOString() })
            .eq('id', jobId);
          return NextResponse.json({ job: { ...job, status: 'FAILED', error: msg } });
        }
        await admin.supabase
          .from('comfyui_jobs')
          .update({ status: status.status || 'IN_QUEUE', updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return NextResponse.json({ job: { ...job, status: status.status || 'IN_QUEUE' }, pending: true });
      }

      // flux / raw：统一 Comfy 端点，复用 pollJob（单次 ~15s 探测）
      const r = await runpodClient.pollJob(runpodJobId, {
        endpoint_id: endpointId,
        poll_budget_ms: 15000,
        on_timeout: 'pending',
      });
      if (r.pending) {
        await admin.supabase
          .from('comfyui_jobs')
          .update({ status: r.status || 'IN_QUEUE', updated_at: new Date().toISOString() })
          .eq('id', jobId);
        return NextResponse.json({ job: { ...job, status: r.status || 'IN_QUEUE' }, pending: true });
      }
      return await finishCompleted(r.images.map((value) => ({ value, kind: 'image' as const })));
    } catch (e) {
      if (e instanceof RunPodPendingError) {
        return NextResponse.json({ job: { ...job, status: e.status || 'IN_QUEUE' }, pending: true });
      }
      const msg = e instanceof Error ? e.message : String(e);
      await admin.supabase
        .from('comfyui_jobs')
        .update({ status: 'FAILED', error: msg, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return NextResponse.json({ job: { ...job, status: 'FAILED', error: msg } });
    }
  }

  // ── 取消任务 ─────────────────────────────────────────────────
  if (action === 'fail_timeout') {
    const jobId = String(body.job_id || '').trim();
    const { data: row } = await admin.supabase
      .from('comfyui_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    await admin.supabase
      .from('comfyui_jobs')
      .update({
        status: 'FAILED',
        error: '生成超时：超过 12 分钟未完成，请重新生成。',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return NextResponse.json({ success: true });
  }

  if (action === 'cancel') {
    const jobId = String(body.job_id || '').trim();
    const { data: row } = await admin.supabase
      .from('comfyui_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    const job = row as Record<string, unknown>;
    const runpodJobId = String(job.runpod_job_id || '');
    if (runpodJobId) {
      await runpodClient.cancelJob(runpodJobId, String(job.endpoint_id || '') || undefined);
    }
    await admin.supabase
      .from('comfyui_jobs')
      .update({ status: 'FAILED', error: '管理员手动取消', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    return NextResponse.json({ success: true });
  }

  // ── 保存 / 新建工作流 ────────────────────────────────────────
  if (action === 'save_workflow') {
    const w = body.workflow && typeof body.workflow === 'object' ? body.workflow : {};
    const name = String(w.name || '').trim();
    if (!name) return NextResponse.json({ error: '工作流名称不能为空' }, { status: 400 });
    const engine = ['flux', 'wan', 'raw'].includes(String(w.engine)) ? String(w.engine) : 'flux';
    const category = ['image', 'video', 'dynamic'].includes(String(w.category))
      ? String(w.category)
      : 'image';
    const key =
      String(w.key || '')
        .trim()
        .replace(/[^a-z0-9-_]/gi, '-')
        .toLowerCase() ||
      `wf-custom-${Date.now().toString(36)}`;
    const workflowJson =
      w.workflow_json && typeof w.workflow_json === 'object' && !Array.isArray(w.workflow_json)
        ? w.workflow_json
        : null;
    if (engine === 'raw' && workflowJson) {
      const check = validateRawGraph(workflowJson);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const fields: Record<string, unknown> = {
      key,
      name,
      category,
      engine,
      description: String(w.description || '').slice(0, 500),
      icon: String(w.icon || 'Workflow').slice(0, 40),
      workflow_json: workflowJson,
      params_schema: Array.isArray(w.params_schema) ? w.params_schema : [],
      defaults: w.defaults && typeof w.defaults === 'object' ? w.defaults : {},
      sort_order: Math.round(clampNum(w.sort_order, 0, 999, 50)),
      is_active: w.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const id = String(w.id || '').trim();
    if (id) {
      const { data, error } = await admin.supabase
        .from('comfyui_workflows')
        .update(fields)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, workflow: data });
    }
    const { data, error } = await admin.supabase
      .from('comfyui_workflows')
      .insert({ ...fields, is_preset: false })
      .select('*')
      .maybeSingle();
    if (error) {
      if (String(error.message).includes('duplicate') || String(error.code) === '23505') {
        return NextResponse.json({ error: `key "${key}" 已存在，请换一个标识` }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, workflow: data });
  }

  // ── 删除 / 停用 ──────────────────────────────────────────────
  if (action === 'delete_workflow') {
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const { data: row } = await admin.supabase
      .from('comfyui_workflows')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: '工作流不存在' }, { status: 404 });
    if ((row as Record<string, unknown>).is_preset) {
      await admin.supabase
        .from('comfyui_workflows')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      return NextResponse.json({ success: true, deactivated: true });
    }
    const { error } = await admin.supabase.from('comfyui_workflows').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_workflow') {
    const id = String(body.id || '').trim();
    const { data: row } = await admin.supabase
      .from('comfyui_workflows')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: '工作流不存在' }, { status: 404 });
    const next = !(row as Record<string, unknown>).is_active;
    await admin.supabase
      .from('comfyui_workflows')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ success: true, is_active: next });
  }

  // ── 重置预设 ─────────────────────────────────────────────────
  if (action === 'reset_presets') {
    const rows = CONSOLE_PRESETS.map((p: ConsoleWorkflowPreset) => ({
      key: p.key,
      name: p.name,
      category: p.category,
      engine: p.engine,
      description: p.description,
      icon: p.icon,
      workflow_json: p.workflow_json ?? null,
      params_schema: p.params_schema,
      defaults: p.defaults,
      sort_order: p.sort_order,
      is_preset: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.supabase
      .from('comfyui_workflows')
      .upsert(rows, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: rows.length });
  }

  // ── 端点健康检查 ─────────────────────────────────────────────
  if (action === 'endpoint_health') {
    const endpointId = String(body.endpoint_id || comfyEndpoint()).replace(/[^a-z0-9]/gi, '');
    if (!endpointId) return NextResponse.json({ error: 'endpoint_id required' }, { status: 400 });
    const key = runpodApiKey();
    try {
      const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return NextResponse.json({ success: res.ok, status: res.status, health: data });
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
