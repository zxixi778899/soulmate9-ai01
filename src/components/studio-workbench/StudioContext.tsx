'use client';

import { createContext, useCallback, useContext, useReducer, useMemo, type Dispatch, type ReactNode } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { toast } from 'sonner';
import {
  resolveImageGenerationRoute,
} from '@/lib/image-generation-routing';
import {
  resolveCreativeGenerationPreset,
} from '@/lib/creative-generation-presets';
import { buildStudioTaskPrompt } from '@/lib/comfy-console/studio-task-prompt';
import { compactFluxPrompt } from '@/lib/comfy-console/studio-profile';
import { buildIdentityPrompt } from '@/lib/identity-kit';
import {
  INITIAL_STATE,
  type StudioState,
  type StudioAction,
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
      return { ...state, identityConsistency: action.value };
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
      return { ...state, ...action.patch };
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
    case 'SET_GENERATING':
      return { ...state, generating: action.value, generationStage: action.stage || (action.value ? 'submitting' : 'idle') };
    case 'SET_RESULT':
      return { ...state, lastResult: action.assets, lastGenerationTrace: action.trace ?? null };
    case 'SET_IDENTITY_KIT':
      return { ...state, identityKit: action.kit };
    case 'SET_ADVANCED':
      return { ...state, advancedMode: action.value };
    case 'SET_FAST_PREVIEW':
      return { ...state, fastPreview: action.value };
    case 'APPLY_TRANSFORM':
      return {
        ...state,
        genMode: 'img2img',
        studioTask: action.kind,
        generationSurface: 'companion',
        identityConsistency: true,
        denoise: action.kind === 'pose' ? 0.52 : 0.44,
        prompt: '',
      };
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
      const res = await authedFetch('/api/admin/comfy?view=config');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const config = data.config || null;

      const volRes = await authedFetch('/api/admin/comfy?view=volume');
      const volData = await readResponseJson(volRes).catch(() => ({} as Any));
      const volumeInfo = volRes.ok ? volData : null;
      const installedLoras = Array.isArray(volData.installed_loras) ? volData.installed_loras : [];

      dispatch({ type: 'SET_CONFIG', config, volumeInfo, installedLoras });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Config load failed');
    }
  }, []);

  // Derived: generation route
  const generationRoute = useMemo(() => resolveImageGenerationRoute({
    surface: state.generationSurface,
    category: state.companionCategory,
    renderStyle: state.animeRenderStyle,
    nsfwIntensity: state.nsfwIntensity,
    turbo: state.fastPreview && state.genMode !== 'img2video',
    specialistModelsReady: state.volumeInfo?.sdxl_models_ready === true,
    sdxlEndpointId: state.volumeInfo?.endpoint_id_sdxl || undefined,
  }), [state.generationSurface, state.companionCategory, state.animeRenderStyle, state.nsfwIntensity, state.fastPreview, state.genMode, state.volumeInfo]);

  // Derived: recommended preset
  const recommendedPreset = useMemo(() => resolveCreativeGenerationPreset({
    mode: state.genMode,
    surface: state.generationSurface,
    category: state.companionCategory,
    renderStyle: state.animeRenderStyle,
    intensity: state.nsfwIntensity,
    assetRole: state.assetRole,
    scene: state.prompt,
    identityConsistency: state.identityConsistency,
    turbo: state.fastPreview && state.genMode !== 'img2video',
    specialistModelsReady: state.volumeInfo?.sdxl_models_ready === true,
    sdxlEndpointId: state.volumeInfo?.endpoint_id_sdxl || undefined,
  }), [state.genMode, state.generationSurface, state.companionCategory, state.animeRenderStyle, state.nsfwIntensity, state.assetRole, state.prompt, state.identityConsistency, state.fastPreview, state.volumeInfo]);

  // Derived: resolved task prompt
  const resolvedPrompt = useMemo(() => {
    const loraTriggers = state.selectedLoras.flatMap((sel) => {
      const allLoras: Any[] = state.config?.loras || [];
      const lora = allLoras.find((l) => l.id === sel.id);
      return Array.isArray(lora?.trigger_words) ? lora.trigger_words.map(String) : [];
    });
    return buildStudioTaskPrompt({
      task: state.studioTask,
      modelFamily: state.genMode === 'img2video' ? 'wan22' : generationRoute.modelFamily,
      companion: state.scopedGirlfriend as Record<string, unknown> | null,
      scene: state.prompt,
      framing: '',
      loraTriggers,
      category: state.companionCategory,
      renderStyle: state.animeRenderStyle,
      hasIdentityReference: state.identityConsistency && Boolean(state.inputImage),
    });
  }, [state.studioTask, state.genMode, state.scopedGirlfriend, state.prompt, state.selectedLoras, state.config, state.companionCategory, state.animeRenderStyle, state.identityConsistency, state.inputImage, generationRoute]);

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
      const body: Any = {
        action: 'generate',
        girlfriend_id: state.companionId || undefined,
        prompt: compactFluxPrompt(taskPrompt),
        negative: state.negative.trim() || generationRoute.negativePrompt,
        ckpt_id: recommendedPreset.checkpoint,
        sampler_name: recommendedPreset.sampler,
        scheduler: recommendedPreset.scheduler,
        steps: recommendedPreset.steps,
        cfg: recommendedPreset.cfg,
        width: recommendedPreset.width,
        height: recommendedPreset.height,
        loras: state.selectedLoras,
        num_images: state.imageCount,
        seed: state.seed,
        gen_mode: state.genMode,
        generation_surface: state.generationSurface,
        model_family: generationRoute.modelFamily,
        companion_category: state.companionCategory,
        anime_render_style: state.animeRenderStyle,
        nsfw_intensity: state.nsfwIntensity,
        fast_preview: state.fastPreview,
        asset_role: state.assetRole,
        prompt_contract: {
          task: state.studioTask,
          modelFamily: generationRoute.modelFamily,
          identityFromText: state.studioTask === 'identity',
          identityFromReference: state.studioTask !== 'identity',
          loraTriggers: state.selectedLoras.flatMap((sel) => {
            const allLoras: Any[] = state.config?.loras || [];
            const lora = allLoras.find((l) => l.id === sel.id);
            return Array.isArray(lora?.trigger_words) ? lora.trigger_words.map(String) : [];
          }),
        },
      };

      if (state.genMode === 'img2img' || state.inputImage.trim()) {
        body.input_image = state.inputImage.trim() || undefined;
        body.denoise = recommendedPreset.denoise ?? state.denoise;
        body.character_consistency = state.identityConsistency;
      }

      // Inject identity kit anchor image for IP-Adapter when available
      if (state.identityKit && state.identityConsistency) {
        const kit = state.identityKit;
        if (kit.faceCropUrl || kit.anchorImageUrl) {
          body.ip_adapter_image = kit.faceCropUrl || kit.anchorImageUrl;
        }
        // Inject identity spec prompt prefix for FLUX consistency
        if (kit.identitySpec) {
          const identityText = buildIdentityPrompt(kit.identitySpec);
          if (identityText && typeof body.prompt === 'string') {
            body.prompt = compactFluxPrompt(`${identityText} ${body.prompt}`);
          }
        }
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
            const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}${data.endpoint_id ? `&endpoint_id=${encodeURIComponent(String(data.endpoint_id))}` : ''}&admin_source=true${state.companionId ? `&girlfriend_id=${encodeURIComponent(state.companionId)}` : ''}&asset_role=${encodeURIComponent(state.assetRole)}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
            if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
              dispatch({ type: 'SET_GENERATING', value: true, stage: 'finalizing' });
              const assets = Array.isArray(pollData.assets) && pollData.assets.length ? pollData.assets : [];
              dispatch({ type: 'SET_RESULT', assets, trace: data.generation_trace });
              toast.success(`生成成功 ${assets.length} 张`);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      toast.error(/avatar reference/i.test(msg) ? '需要头像参考图：请先生成半身头像或上传人设图' : msg);
    } finally {
      dispatch({ type: 'SET_GENERATING', value: false });
    }
  }, [resolvedPrompt, state, recommendedPreset, generationRoute]);

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
    optimizePrompt,
    uploadReferenceImage,
  }), [state, resolvedPrompt, generate, loadConfig, optimizePrompt, uploadReferenceImage]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
