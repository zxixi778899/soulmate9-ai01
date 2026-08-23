'use client';

import { createContext, useCallback, useContext, useReducer, useMemo, type Dispatch, type ReactNode } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { toast } from 'sonner';
import {
  resolveImageGenerationRoute,
  TASK_DENOISE_DEFAULTS,
} from '@/lib/image-generation-routing';
import {
  resolveCreativeGenerationPreset,
} from '@/lib/creative-generation-presets';
import { buildStudioTaskPrompt } from '@/lib/comfy-console/studio-task-prompt';
import { compactFluxPrompt } from '@/lib/comfy-console/studio-profile';
import {
  INITIAL_STATE,
  type StudioState,
  type StudioAction,
  type StudioTask,
  type Any,
} from './StudioWorkbench.types';

function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: action.config, volumeInfo: action.volumeInfo, installedLoras: action.installedLoras };
    case 'SET_COMPANION':
      return { ...state, companionId: action.id, scopedGirlfriend: action.girlfriend, companionAssets: action.assets };
    case 'SET_COMPANION_ASSETS':
      return { ...state, companionAssets: action.assets };
    case 'SET_MODE':
      return { ...state, genMode: action.genMode };
    case 'SET_TASK':
      return { ...state, studioTask: action.task };
    case 'SET_SURFACE':
      return { ...state, generationSurface: action.surface };
    case 'SET_IDENTITY_CONSISTENCY':
      // 身份一致性 = IP-Adapter 锁脸：与 IP 开关保持同步，与参控图无关。
      return { ...state, identityConsistency: action.value, ipAdapter: action.value };
    case 'SET_PROMPT':
      return { ...state, prompt: action.text };
    case 'SET_NEGATIVE':
      return { ...state, negative: action.text };
    case 'SET_INPUT_IMAGE':
      return { ...state, inputImage: action.url };
    case 'SET_STYLE':
      return { ...state, companionCategory: action.category, animeRenderStyle: action.renderStyle, nsfwIntensity: action.intensity };
    case 'SET_NSFW':
      return { ...state, nsfwIntensity: action.intensity };
    case 'SET_PARAMS':
      return { ...state, ...action.patch, paramsTouched: true };
    case 'SET_LORAS':
      return { ...state, selectedLoras: action.loras };
    case 'ADD_LORA':
      if (state.selectedLoras.some((l) => l.id === action.lora.id)) return state;
      if (state.selectedLoras.length >= 4) { toast.error('最多同时使用 4 个 LoRA'); return state; }
      return { ...state, selectedLoras: [...state.selectedLoras, action.lora] };
    case 'REMOVE_LORA':
      return { ...state, selectedLoras: state.selectedLoras.filter((l) => l.id !== action.id) };
    case 'SET_LORA_STRENGTH':
      return { ...state, selectedLoras: state.selectedLoras.map((l) => l.id === action.id ? { ...l, strength: action.strength } : l) };
    case 'SET_ASSET_ROLE':
      return { ...state, assetRole: action.role };
    case 'SET_MODEL_OVERRIDE':
      // 切换模型族时重置手动参数：FLUX 与 SDXL 的采样器/CFG/步数完全不同，
      // 保留上一族的手调值会把 euler/simple/CFG1 发给 SDXL。
      return { ...state, modelOverride: action.value, paramsTouched: false };
    case 'SET_IPADAPTER':
      return { ...state, ipAdapter: action.value, identityConsistency: action.value };
    case 'SET_ENHANCER':
      return { ...state, enhancers: { ...state.enhancers, [action.key]: action.value } };
    case 'SET_ENHANCER_STATUSES':
      return { ...state, enhancerStatuses: action.statuses };
    case 'PATCH_COMPANION':
      return {
        ...state,
        scopedGirlfriend: state.scopedGirlfriend ? { ...state.scopedGirlfriend, ...action.patch } : action.patch,
      };
    case 'SET_GENERATING':
      return { ...state, generating: action.value, generationStage: action.stage || (action.value ? 'submitting' : 'idle') };
    case 'SET_RESULT':
      return { ...state, lastResult: action.assets, lastGenerationTrace: action.trace ?? null };
    case 'SET_IDENTITY_KIT':
      return { ...state, identityKit: action.kit };
    case 'SET_ADVANCED':
      return { ...state, advancedMode: action.value };
    case 'APPLY_TRANSFORM':
      return {
        ...state,
        genMode: 'img2img',
        studioTask: action.kind,
        generationSurface: 'companion',
        identityConsistency: true,
        // 服务端对 avatar-closeup/最终产品角色会丢弃 img2img 输入图，
        // 用 identity-half 才能保留参考图重绘。
        assetRole: 'identity-half',
        denoise: action.kind === 'pose'
          ? TASK_DENOISE_DEFAULTS.pose
          : action.kind === 'background'
            ? TASK_DENOISE_DEFAULTS.background
            : TASK_DENOISE_DEFAULTS.outfit,
        prompt: '',
      };
    // Node control actions
    case 'SET_CONTROLNET_TYPE':
      return { ...state, controlnetType: action.value };
    case 'SET_CONTROLNET_PREPROCESSOR':
      return { ...state, controlnetPreprocessor: action.value };
    case 'SET_CONTROLNET_STRENGTH':
      return { ...state, controlnetStrength: action.value };
    case 'SET_CONTROLNET_GUIDANCE':
      return { ...state, controlnetGuidance: action.value };
    case 'SET_ADETAILER_MODEL':
      return { ...state, adetailerModel: action.value };
    case 'SET_ADETAILER_CONFIDENCE':
      return { ...state, adetailerConfidence: action.value };
    case 'SET_ADETAILER_DENOISE':
      return { ...state, adetailerDenoise: action.value };
    case 'SET_ADETAILER_AREA':
      return { ...state, adetailerArea: action.value };
    case 'SET_UPSCALER_MODEL':
      return { ...state, upscaleModel: action.value };
    case 'SET_UPSCALE_FACTOR':
      return { ...state, upscaleFactor: action.value };
    case 'SET_TILE_SIZE':
      return { ...state, tileSize: action.value };
    case 'SET_UPSCALE_DENOISE':
      return { ...state, upscaleDenoise: action.value };
    case 'SET_ACTIVE_NODE_CONTROL_TAB':
      return { ...state, activeNodeControlTab: action.value };
    default:
      return state;
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  /** Build the resolved prompt for submission */
  resolvedPrompt: string;
  /** Build the generation request body and submit */
  generate: () => Promise<void>;
  /** Load config from API */
  loadConfig: () => Promise<void>;
  /** Refresh companion assets (library + generated) */
  refreshAssets: (id?: string) => Promise<void>;
  /** 当前生效的生图路由（供 LoRA 过滤等展示用） */
  generationRoute: ReturnType<typeof resolveImageGenerationRoute>;
  /** 推荐参数预设（未手动改参时生效） */
  recommendedPreset: ReturnType<typeof resolveCreativeGenerationPreset>;
  /** Optimize prompt with AI */
  optimizePrompt: () => Promise<void>;
  /** Upload reference image */
  uploadReferenceImage: (file: File) => Promise<void>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

export function StudioProvider({ children, girlfriendId }: { children: ReactNode; girlfriendId?: string }) {
  const [state, dispatch] = useReducer(studioReducer, {
    ...INITIAL_STATE,
    companionId: girlfriendId || '',
    identityConsistency: Boolean(girlfriendId),
  });

  const loadConfig = useCallback(async () => {
    try {
      const [res, volRes, enhRes] = await Promise.all([
        authedFetch('/api/admin/comfy?view=config'),
        authedFetch('/api/admin/comfy?view=volume'),
        authedFetch('/api/admin/comfy?view=enhancers'),
      ]);
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const config = data.config || null;

      const volData = await readResponseJson(volRes).catch(() => ({} as Any));
      const volumeInfo = volRes.ok ? volData : null;
      const installedLoras = Array.isArray(volData.installed_loras) ? volData.installed_loras : [];

      const enhData = await readResponseJson(enhRes).catch(() => ({} as Any));
      const enhancerStatuses = Array.isArray(enhData.enhancers) ? enhData.enhancers : [];

      dispatch({ type: 'SET_CONFIG', config, volumeInfo, installedLoras });
      dispatch({ type: 'SET_ENHANCER_STATUSES', statuses: enhancerStatuses });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Config load failed');
    }
  }, []);

  // Refresh companion assets: library assets + generated assets merged
  const refreshAssets = useCallback(async (id?: string) => {
    const companionId = id || state.companionId;
    if (!companionId) return;
    try {
      const params = new URLSearchParams({ view: 'assets', girlfriend_id: companionId, limit: '120' });
      const [libraryRes, generatedRes] = await Promise.all([
        authedFetch(`/api/companion/${encodeURIComponent(companionId)}/assets`),
        authedFetch(`/api/admin/comfy?${params.toString()}`),
      ]);
      const libraryData = await readResponseJson(libraryRes).catch(() => ({} as Any));
      const generatedData = await readResponseJson(generatedRes).catch(() => ({} as Any));
      const libraryAssets: Any[] = Array.isArray(libraryData.assets) ? libraryData.assets : [];
      const generatedAssets: Any[] = Array.isArray(generatedData.assets) ? generatedData.assets : [];
      const knownUrls = new Set(libraryAssets.map((a) => String(a.url || '')));
      const merged = [
        ...libraryAssets,
        ...generatedAssets.filter((a) => a.url && !knownUrls.has(String(a.url))),
      ].filter((item, idx, all) =>
        all.findIndex((c) => String(c.id || c.url) === String(item.id || item.url)) === idx,
      );
      dispatch({ type: 'SET_COMPANION_ASSETS', assets: merged });
    } catch { /* ignore */ }
  }, [state.companionId]);

  // Derived: generation route（含 Studio 手动模型覆盖）
  const generationRoute = useMemo(() => {
    const args = {
      surface: state.generationSurface,
      category: state.companionCategory,
      renderStyle: state.animeRenderStyle,
      nsfwIntensity: state.nsfwIntensity,
      specialistModelsReady: state.volumeInfo?.sdxl_models_ready === true,
      sdxlEndpointId: state.volumeInfo?.endpoint_id_sdxl || undefined,
      familyOverride: state.modelOverride === 'auto' ? undefined : state.modelOverride,
    };
    try {
      return resolveImageGenerationRoute(args);
    } catch {
      // NSFW 硬路由 SDXL 矩阵缺失时抛错；渲染层退回 SFW 路由避免页面崩溃，
      // 实际生成请求仍会被服务端 fail-closed 拦截并给出明确错误。
      return resolveImageGenerationRoute({ ...args, nsfwIntensity: 2 });
    }
  }, [state.generationSurface, state.companionCategory, state.animeRenderStyle, state.nsfwIntensity, state.volumeInfo, state.modelOverride]);

  // Derived: recommended preset（必须感知手动模型族覆盖，否则选 SDXL 仍显示 FLUX 参数）
  const recommendedPreset = useMemo(() => {
    const args = {
      mode: state.genMode,
      surface: state.generationSurface,
      category: state.companionCategory,
      renderStyle: state.animeRenderStyle,
      intensity: state.nsfwIntensity,
      assetRole: state.assetRole,
      scene: state.prompt,
      identityConsistency: state.identityConsistency,
      specialistModelsReady: state.volumeInfo?.sdxl_models_ready === true,
      sdxlEndpointId: state.volumeInfo?.endpoint_id_sdxl || undefined,
      familyOverride: state.modelOverride === 'auto' ? undefined : state.modelOverride,
    };
    try {
      return resolveCreativeGenerationPreset(args);
    } catch {
      return resolveCreativeGenerationPreset({ ...args, intensity: 2 });
    }
  }, [state.genMode, state.generationSurface, state.companionCategory, state.animeRenderStyle, state.nsfwIntensity, state.assetRole, state.prompt, state.identityConsistency, state.volumeInfo, state.modelOverride]);

  // Derived: effective task（身份系角色走 identity 提示词合约，其余默认 portrait）
  const effectiveTask: StudioTask = useMemo(() => {
    if (state.genMode === 'img2video') return 'video';
    if (state.studioTask === 'outfit' || state.studioTask === 'pose' || state.studioTask === 'background') {
      return state.studioTask;
    }
    return state.assetRole.startsWith('identity') ? 'identity' : 'portrait';
  }, [state.genMode, state.studioTask, state.assetRole]);

  // Derived: resolved task prompt
  const resolvedPrompt = useMemo(() => {
    const loraTriggers = state.selectedLoras.flatMap((sel) => {
      const allLoras: Any[] = state.config?.loras || [];
      const lora = allLoras.find((l) => l.id === sel.id);
      return Array.isArray(lora?.trigger_words) ? lora.trigger_words.map(String) : [];
    });
    // 身份一致性靠 IP-Adapter（身份锚点/头像/卡图），与 img2img 参控图无关。
    const roleOf = (asset: Any): string => String(asset.asset_role || asset.meta?.asset_role || asset.role || '');
    const gf = state.scopedGirlfriend as Any | null;
    const hasIdentityAnchor =
      state.companionAssets.some((asset) => ['identity-anchor', 'avatar-closeup'].includes(roleOf(asset)) && Boolean(asset.url)) ||
      Boolean(gf?.avatar_url || gf?.portrait_url);
    return buildStudioTaskPrompt({
      task: effectiveTask,
      modelFamily: state.genMode === 'img2video' ? 'wan22' : generationRoute.modelFamily,
      companion: state.scopedGirlfriend as Record<string, unknown> | null,
      scene: state.prompt,
      framing: '',
      loraTriggers,
      category: state.companionCategory,
      renderStyle: state.animeRenderStyle,
      hasIdentityReference: state.identityConsistency && hasIdentityAnchor,
    });
  }, [effectiveTask, state.genMode, state.scopedGirlfriend, state.prompt, state.selectedLoras, state.config, state.companionCategory, state.animeRenderStyle, state.identityConsistency, state.companionAssets, generationRoute]);

  const generate = useCallback(async () => {
    const taskPrompt = resolvedPrompt.trim();
    if (!taskPrompt) { toast.error('请填写正向提示词'); return; }
    if ((state.genMode === 'img2img' || state.genMode === 'img2video') && !state.inputImage.trim()) {
      toast.error(state.genMode === 'img2video' ? '图生视频需要参考图' : '图生图需要参考图');
      return;
    }

    dispatch({ type: 'SET_GENERATING', value: true, stage: 'submitting' });
    dispatch({ type: 'SET_RESULT', assets: [] });

    try {
      if (state.genMode === 'img2video') {
        const videoRes = await authedFetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'wan22',
            girlfriend_id: state.companionId || undefined,
            input_image: state.inputImage.trim(),
            prompt: taskPrompt,
            negative_prompt: state.negative.trim() || undefined,
            duration: recommendedPreset.durationSeconds === 10 ? 10 : 5,
            fps: recommendedPreset.fps || 16,
            nsfw_intensity: state.nsfwIntensity,
            sync_poll_ms: 150000,
          }),
        });
        const videoData = await readResponseJson(videoRes).catch(() => ({} as Any));
        if (!videoRes.ok) throw new Error(videoData.error || '视频生成失败');
        if (videoData.pending && videoData.job_id) {
          // WAN 2.2 10s clips can exceed the 150s server poll budget.
          // Continue polling from the client until the GPU finishes.
          dispatch({ type: 'SET_GENERATING', value: true, stage: 'queued' });
          const jobId = String(videoData.job_id);
          const endpointId = String(videoData.endpoint_id || '');
          const cost = Number(videoData.cost) || 0;
          toast.message('Wan2.2 视频生成中…');
          const pollBudget = 60; // 60 × 5s = 5 min
          let polledUrl = '';
          for (let attempt = 0; attempt < pollBudget; attempt++) {
            await new Promise((r) => setTimeout(r, 5000));
            const qs = new URLSearchParams({ job_id: jobId, kind: 'video' });
            if (endpointId) qs.set('endpoint_id', endpointId);
            if (state.companionId) qs.set('girlfriend_id', state.companionId);
            qs.set('cost', String(cost));
            const pollRes = await authedFetch(`/api/runpod/status?${qs.toString()}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
            if (pollData.status === 'COMPLETED' || pollData.status === 'completed') {
              polledUrl = String(pollData.video_url || '');
              break;
            }
            if (pollData.status === 'FAILED' || pollData.status === 'failed') {
              throw new Error(pollData.error || '视频生成失败');
            }
          }
          if (!polledUrl) throw new Error('视频生成超时（5 分钟）');
          dispatch({ type: 'SET_RESULT', assets: [{ id: jobId, url: polledUrl, media_type: 'video', duration_seconds: recommendedPreset.durationSeconds === 10 ? 10 : 5 }], trace: { model: 'Wan2.2' } });
          toast.success('视频已生成');
          return;
        }
        const videoUrl = videoData.video_url || '';
        if (!videoUrl) throw new Error('视频生成完成但未返回地址');
        dispatch({ type: 'SET_RESULT', assets: [{ id: videoData.job_id, url: videoUrl, media_type: 'video', duration_seconds: 5 }], trace: { model: 'Wan2.2' } });
        toast.success('视频已生成');
        return;
      }

      // Image generation (txt2img / img2img)
      // 服务端对 avatar-closeup/最终产品角色会丢弃 img2img 输入图，改用 identity-half
      const isFinalProductRole = state.assetRole === 'character-art' || state.assetRole === 'album' || state.assetRole === 'scene';
      const effectiveAssetRole = state.genMode === 'img2img' && (state.assetRole === 'avatar-closeup' || isFinalProductRole)
        ? 'identity-half'
        : state.assetRole;
      const body: Any = {
        action: 'generate',
        girlfriend_id: state.companionId || undefined,
        prompt: compactFluxPrompt(taskPrompt),
        negative: state.negative.trim() || generationRoute.negativePrompt,
        ckpt_id: recommendedPreset.checkpoint,
        sampler_name: state.paramsTouched ? state.sampler : recommendedPreset.sampler,
        scheduler: state.paramsTouched ? state.scheduler : recommendedPreset.scheduler,
        steps: state.paramsTouched ? state.steps : recommendedPreset.steps,
        cfg: state.paramsTouched ? state.cfg : recommendedPreset.cfg,
        width: state.width,
        height: state.height,
        loras: state.selectedLoras,
        num_images: state.imageCount,
        seed: state.seed,
        gen_mode: state.genMode,
        generation_surface: state.generationSurface,
        model_family: generationRoute.modelFamily,
        companion_category: state.companionCategory,
        anime_render_style: state.animeRenderStyle,
        nsfw_intensity: state.nsfwIntensity,
        asset_role: effectiveAssetRole,
        // Studio 手动控件：模型族覆盖 + IP-Adapter 开关 + 增强器
        model_family_override: state.modelOverride === 'auto' ? undefined : state.modelOverride,
        ip_adapter_enabled: state.ipAdapter,
        enhancers: state.enhancers,
        prompt_contract: {
          task: effectiveTask,
          modelFamily: generationRoute.modelFamily,
          identityFromText: effectiveTask === 'identity',
          identityFromReference: effectiveTask === 'portrait',
          loraTriggers: state.selectedLoras.flatMap((sel) => {
            const allLoras: Any[] = state.config?.loras || [];
            const lora = allLoras.find((l) => l.id === sel.id);
            return Array.isArray(lora?.trigger_words) ? lora.trigger_words.map(String) : [];
          }),
        },
      };

      const isTransformTask = effectiveTask === 'outfit' || effectiveTask === 'pose' || effectiveTask === 'background';
      if (state.genMode === 'img2img' || state.inputImage.trim()) {
        body.input_image = state.inputImage.trim() || undefined;
        // 变换强度直接控制参控图的重绘幅度；变换任务始终发送当前滑杆值。
        body.denoise = state.paramsTouched || isTransformTask ? state.denoise : (recommendedPreset.denoise ?? state.denoise);
        body.character_consistency = state.identityConsistency;
      }

      // IP-Adapter 参考图解析：identity-anchor 资产 > avatar-closeup 资产 >
      // girlfriend.avatar_url > portrait_url（服务端无显式参考图时也会同序回退）
      if (state.ipAdapter) {
        const assetRoleOf = (a: Any): string => String(a.asset_role || a.meta?.asset_role || a.role || '');
        const anchorAsset = state.companionAssets.find((a) => assetRoleOf(a) === 'identity-anchor' && a.url);
        const avatarAsset = state.companionAssets.find((a) => assetRoleOf(a) === 'avatar-closeup' && a.url);
        const gf = state.scopedGirlfriend as Any | null;
        const ipImage = String(anchorAsset?.url || avatarAsset?.url || gf?.avatar_url || gf?.portrait_url || '');
        if (ipImage) body.ip_adapter_image = ipImage;
      }

      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '生成失败');

      // Handle async pending
      if (data.pending && data.job_id) {
        dispatch({ type: 'SET_GENERATING', value: true, stage: 'queued' });
        toast.message('GPU 排队中，等待出图…');
        const jobId = String(data.job_id);
        // ~24 polls × (3s interval + server long-poll) ≈ 3 minutes total.
        // The interval is required: without it transient poll failures burn
        // through all attempts in seconds and mis-report "queue timeout".
        let lastPollError = '';
        for (let i = 0; i < 24; i++) {
          try {
            const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}${data.endpoint_id ? `&endpoint_id=${encodeURIComponent(String(data.endpoint_id))}` : ''}&admin_source=true${state.companionId ? `&girlfriend_id=${encodeURIComponent(state.companionId)}` : ''}&asset_role=${encodeURIComponent(effectiveAssetRole)}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
            if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
              dispatch({ type: 'SET_GENERATING', value: true, stage: 'finalizing' });
              const assets = Array.isArray(pollData.assets) && pollData.assets.length ? pollData.assets : [];
              dispatch({ type: 'SET_RESULT', assets, trace: data.generation_trace });
              toast.success(`生成成功 ${assets.length} 张`);
              void refreshAssets(state.companionId || undefined);
              return;
            }
            if (pollData.status === 'FAILED') throw new Error(`RunPod 任务失败: ${pollData.error || '未知错误'}`);
            await new Promise((r) => setTimeout(r, 3000));
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes('RunPod')) throw pollErr;
            // Transient poll error — remember it and keep polling.
            lastPollError = pollErr instanceof Error ? pollErr.message : String(pollErr);
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
        throw new Error(lastPollError
          ? `GPU 排队超时（3 分钟），请稍后重试（最近轮询异常：${lastPollError.slice(0, 120)}）`
          : 'GPU 排队超时（3 分钟），请稍后重试');
      }

      // Synchronous result
      const assets = (data.assets || data.images || []).filter(Boolean);
      dispatch({ type: 'SET_RESULT', assets, trace: data.generation_trace });
      toast.success(`生成成功 ${assets.length} 张`);
      void refreshAssets(state.companionId || undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      toast.error(/avatar reference/i.test(msg) ? '需要头像参考图：请先生成半身头像或上传人设图' : msg);
    } finally {
      dispatch({ type: 'SET_GENERATING', value: false });
    }
  }, [resolvedPrompt, state, recommendedPreset, generationRoute, effectiveTask, refreshAssets]);

  const optimizePrompt = useCallback(async () => {
    if (!state.prompt.trim()) { toast.error('请先输入提示词'); return; }
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'optimize_prompt',
          prompt: state.prompt,
          companion_category: state.companionCategory,
          anime_render_style: state.animeRenderStyle,
          nsfw_intensity: state.nsfwIntensity,
          gen_mode: state.genMode,
          companion: state.scopedGirlfriend || {},
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok || !data.prompt) throw new Error(data.error || 'AI 优化失败');
      dispatch({ type: 'SET_PROMPT', text: data.prompt });
      if (data.negative) dispatch({ type: 'SET_NEGATIVE', text: data.negative });
      toast.success('已使用 AI 优化提示词');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 优化失败');
    }
  }, [state.prompt, state.companionCategory, state.animeRenderStyle, state.nsfwIntensity, state.genMode, state.scopedGirlfriend]);

  const uploadReferenceImage = useCallback(async (file: File) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'reference');
      const res = await authedFetch('/api/upload', { method: 'POST', body: fd });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok || !data.url) throw new Error(data.error || '上传失败');
      dispatch({ type: 'SET_INPUT_IMAGE', url: data.url });
      if (state.genMode === 'txt2img') dispatch({ type: 'SET_MODE', genMode: 'img2img' });
      toast.success('参考图已上传');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    }
  }, [state.genMode]);

  const value = useMemo<StudioContextValue>(() => ({
    state,
    dispatch,
    resolvedPrompt,
    generate,
    loadConfig,
    refreshAssets,
    generationRoute,
    recommendedPreset,
    optimizePrompt,
    uploadReferenceImage,
  }), [state, resolvedPrompt, generate, loadConfig, refreshAssets, generationRoute, recommendedPreset, optimizePrompt, uploadReferenceImage]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
