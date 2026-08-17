'use client';

/**
 * Comfy 操作台 — 工作流 / 模型 / LoRA 清单一键调用 / 生成 / 图库
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Play, Trash2, RefreshCw, HardDrive, Workflow, ImageIcon,
  Settings2, BookOpen, Save, RotateCcw, Sparkles, Layers, ExternalLink,
  Zap, Upload, Download, CheckSquare, Square, Copy, ImagePlus, FileImage,
  Users, Search, X, Maximize2, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OptimizedImg } from '@/components/OptimizedImg';
import Link from 'next/link';
import {
  COMPANION_CATEGORIES,
  COMPANION_CATEGORY_LABELS,
  STUDIO_PROMPTS,
  type CompanionCategory,
} from '@/lib/companion-category';
import { getPresetsForCategory, type GenPreset } from './presets';
import { buildCompanionGenerationPrompt, buildCompanionIdentityBrief } from '@/lib/companion-generation';
import { resolveCompanionProfile } from '@/lib/companion-profile';
import {
  buildStudioPromptEnhancement,
  compactFluxPrompt,
  loraUsageZh,
  recommendedStudioLoras,
  studioIntensityLabel,
  studioLoraStrengthScale,
  studioNegativePrompt,
  type AnimeRenderStyle,
  type NsfwIntensity,
} from '@/lib/comfy-console/studio-profile';
import { getFluxPromptPresets, randomFluxPrompt } from '@/lib/comfy-console/flux-prompt-presets';
import { DEFAULT_ENHANCERS, type StudioEnhancers } from '@/lib/comfy-console/studio-workbench';
import {
  GIRLFRIEND_NEGATIVE_FLUX,
  resolveGirlfriendLoraPlan,
  subjectFromGirlfriendRow,
} from '@/lib/prompt/girlfriend';
import { resolveImageGenerationRoute, type ImageSurface } from '@/lib/image-generation-routing';
import {
  resolveCreativeGenerationPreset,
  type CreativeGenerationMode,
} from '@/lib/creative-generation-presets';
import { buildStudioSceneDraft, buildStudioTaskPrompt } from '@/lib/comfy-console/studio-task-prompt';
import { isLoraAllowedForContext } from '@/lib/lora-scope';
import {
  CHARACTER_ID_PACK,
  getCharacterProductionPreset,
  identityReferenceRolePriority,
  styleProductionHint,
  type CharacterAssetRole,
} from '@/lib/character-asset-production';
import {
  CHARACTER_PIPELINE_STAGES,
  generateStagePrompt,
  resolvePipelineLoras,
  resolveStageReference,
  buildStageGenerationParams,
  type PipelineStageResult,
  type PipelineContext,
} from '@/lib/character-production-pipeline';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Comfy 控制台动态资源/配置 JSON，字段异构且按 key 泛化读写
type Any = Record<string, any>;

const CAT_LABEL: Record<string, string> = {
  body: '身材',
  action: '人物动作 / NSFW',
  outfit: '服装',
  prop: '道具',
  detail: '细节质感',
};


const CAT_ORDER = ['body', 'action', 'outfit', 'prop', 'detail'];

/** Companion asset folder definitions for the resource library browser */
const RESOURCE_FOLDERS: Array<{ id: string; label: string; match: (role: string) => boolean }> = [
  { id: 'avatar-closeup', label: '半身头像', match: (r) => r === 'avatar-closeup' },
  { id: 'identity-reference', label: '身份参考图(旧)', match: (r) => r.startsWith('identity-') },
  { id: 'character-art', label: '立绘', match: (r) => r === 'character-art' },
  { id: 'album', label: '相册 / 场景', match: (r) => r === 'album' || r === 'scene' },
  { id: 'animation', label: '视频', match: (r) => r === 'animation' },
  { id: 'other', label: '其他', match: () => true },
];

type ComfyConsoleProps = { girlfriendId?: string; embedded?: boolean };

type CameraFraming = 'close-up' | 'near' | 'medium' | 'full' | 'long';
type CameraAngle = 'eye-level' | 'low-angle' | 'high-angle';

const CAMERA_FRAMINGS: Array<{ id: CameraFraming; label: string; prompt: string }> = [
  { id: 'close-up', label: '特写', prompt: 'CAMERA COMPOSITION REQUIREMENT: tight facial close-up, face and expression dominate the frame, shoulders may be visible' },
  { id: 'near', label: '近景', prompt: 'CAMERA COMPOSITION REQUIREMENT: close shot from head to upper torso, both shoulders clearly inside the frame' },
  { id: 'medium', label: '中景', prompt: 'CAMERA COMPOSITION REQUIREMENT: medium waist-up shot, head, arms and waist clearly inside the frame' },
  { id: 'full', label: '全身', prompt: 'CAMERA COMPOSITION REQUIREMENT: full-body shot from head to feet, both feet completely visible, no cropped head, hands or feet' },
  { id: 'long', label: '远景', prompt: 'CAMERA COMPOSITION REQUIREMENT: wide long shot, the complete person occupies less than half of the frame and the environment remains clearly visible' },
];

const CAMERA_ANGLES: Array<{ id: CameraAngle; label: string; prompt: string }> = [
  { id: 'eye-level', label: '平视', prompt: 'eye-level camera, neutral perspective' },
  { id: 'low-angle', label: '仰视', prompt: 'LOW-ANGLE CAMERA REQUIREMENT: camera placed below eye level and looking upward, visible upward perspective' },
  { id: 'high-angle', label: '俯视', prompt: 'HIGH-ANGLE CAMERA REQUIREMENT: camera placed above eye level and looking downward, visible downward perspective' },
];

function getPromptAppendPresets(nsfwLevel: NsfwIntensity) {
  const base = [
    { group: '光线', items: [
      { label: '明亮柔光', prompt: 'bright soft key light, balanced fill light, face and body clearly illuminated, correct exposure, no crushed shadows' },
      { label: '窗边日光', prompt: 'bright natural window light, soft frontal fill, clean highlights, visible skin and clothing detail' },
      { label: '影棚布光', prompt: 'professional three-point studio lighting, bright key light, soft fill light, controlled rim light, even exposure' },
    ] },
    { group: '质量', items: [
      { label: '真实皮肤', prompt: 'natural skin texture, visible pores, accurate skin tone, realistic fabric detail, restrained sharpening' },
      { label: '高清细节', prompt: 'sharp subject detail, detailed eyes, detailed hands, clean edges, high dynamic range, professional finish' },
    ] },
    { group: '服装', items: [
      { label: '日常休闲', prompt: 'wearing a fitted contemporary casual outfit with realistic fabric folds and complete garment construction' },
      { label: '优雅礼服', prompt: 'wearing an elegant fitted evening dress with refined tailoring and realistic fabric sheen' },
      { label: '蕾丝内衣', prompt: 'wearing a coordinated adult lace lingerie set with realistic lace texture and tasteful styling' },
    ] },
    { group: '场景', items: [
      { label: '明亮卧室', prompt: 'in a bright modern bedroom with clean daylight, soft neutral decor and clear background depth' },
      { label: '落地窗边', prompt: 'beside a large floor-to-ceiling window in a modern interior, bright daylight filling the room' },
      { label: '摄影棚', prompt: 'in a professional portrait studio with a clean seamless background and controlled lighting' },
    ] },
    { group: '动作', items: [
      { label: '自然站立', prompt: 'standing naturally with relaxed shoulders, balanced posture, hands clearly visible' },
      { label: '回眸', prompt: 'turning the upper body slightly and looking back toward the camera with a natural expression' },
      { label: '坐姿', prompt: 'sitting with supported posture, anatomically natural leg placement and relaxed hands' },
    ] },
  ];
  if (nsfwLevel >= 2) {
    base[2].items.push(
      { label: '透视薄纱', prompt: 'wearing a sheer translucent fabric that reveals body contours beneath, elegant sensual styling' },
      { label: '情趣套装', prompt: 'wearing an adult fantasy lingerie costume with straps and cutouts, bold sensual styling' },
    );
  }
  if (nsfwLevel >= 3) {
    base[4].items.push(
      { label: '裸体展示', prompt: 'standing fully nude with natural confident posture, full body clearly visible, hands resting naturally' },
      { label: '抚摸姿势', prompt: 'one hand gently touching her own body, sensual self-caress, intimate expression' },
    );
  }
  if (nsfwLevel >= 4) {
    base[4].items.push(
      { label: '自慰动作', prompt: 'performing solo masturbation with clear hand-to-body contact, explicit adult action' },
    );
  }
  if (nsfwLevel >= 5) {
    base[4].items.push(
      { label: '交合动作', prompt: 'engaged in consensual intercourse with an unmistakably adult partner, explicit sexual contact' },
    );
  }
  return base;
}

export default function ComfyConsole({ girlfriendId, embedded = false }: ComfyConsoleProps) {
  const [tab, setTab] = useState<'generate' | 'loras' | 'library' | 'workflows' | 'infra'>('generate');
  const [config, setConfig] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState<'idle' | 'submitting' | 'queued' | 'finalizing'>('idle');
  const [fastPreview, setFastPreview] = useState(true);
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [assets, setAssets] = useState<Any[]>([]);
  const [companionAssets, setCompanionAssets] = useState<Any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceImageInputRef = useRef<HTMLInputElement | null>(null);
  const [loraFilter, setLoraFilter] = useState<string>('all');
  const [genMode, setGenMode] = useState<'txt2img' | 'img2img' | 'img2video'>('txt2img');
  const [generationSurface, setGenerationSurface] = useState<ImageSurface>('companion');
  const [installedLoras, setInstalledLoras] = useState<string[]>([]);
  const [volumeInfo, setVolumeInfo] = useState<Any | null>(null);
  const [syncingInstalled, setSyncingInstalled] = useState(false);

  // Generate form
  const [workflowId, setWorkflowId] = useState('auto');
  const [endpointKey, setEndpointKey] = useState('portrait-v9');
  const [ckptId, setCkptId] = useState('flux-fp8');
  const [loraId, setLoraId] = useState('none');
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [selectedLoras, setSelectedLoras] = useState<Array<{ id: string; strength: number }>>([]);
  const [prompt, setPrompt] = useState('');
  const [promptProfileApplied, setPromptProfileApplied] = useState(false);
  const [negative, setNegative] = useState('');
  const [companionCategory, setCompanionCategory] = useState<CompanionCategory>('female');
  const [animeRenderStyle, setAnimeRenderStyle] = useState<AnimeRenderStyle>('realistic');
  const [nsfwIntensity, setNsfwIntensity] = useState<NsfwIntensity>(1);
  const [enhancers, setEnhancers] = useState<StudioEnhancers>(DEFAULT_ENHANCERS);
  const [controlnetStrength, setControlnetStrength] = useState(0.55);
  const [adetailerStrength, setAdetailerStrength] = useState(0.35);
  const [upscaleScale, setUpscaleScale] = useState(1.5);
  const [enhancerStatus, setEnhancerStatus] = useState<Record<string, boolean>>({});
  const [nsfwDescriptions, setNsfwDescriptions] = useState<Record<string, string>>({});
  const [savedPrompts, setSavedPrompts] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [promptTitle, setPromptTitle] = useState('');
  const [selectedSavedPrompt, setSelectedSavedPrompt] = useState('');
  const [selectedPromptPreset, setSelectedPromptPreset] = useState('manual');
  const [customPromptAdds, setCustomPromptAdds] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [promptAddTitle, setPromptAddTitle] = useState('');
  const [promptAddContent, setPromptAddContent] = useState('');
  const [activeAdultPreset, setActiveAdultPreset] = useState<{ id: string; label: string } | null>(null);
  const [cameraFraming, setCameraFraming] = useState<CameraFraming>('medium');
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('eye-level');
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(1216);
  const [steps, setSteps] = useState(8);
  const [cfg, setCfg] = useState(1);
  const [imageCount, setImageCount] = useState(1);
  const [customPresets, setCustomPresets] = useState<Array<GenPreset>>([]);
  const [presetName, setPresetName] = useState('');
  const [sampler, setSampler] = useState('euler');
  const [scheduler, setScheduler] = useState('simple');
  const [seed, setSeed] = useState(-1);
  const [denoise, setDenoise] = useState(0.55);
  const [inputImage, setInputImage] = useState('');
  const [referenceImageUploading, setReferenceImageUploading] = useState(false);
  const [identityConsistency, setIdentityConsistency] = useState(Boolean(girlfriendId));
  const [referenceAutoSelect, setReferenceAutoSelect] = useState(true);
  const [referenceMax, setReferenceMax] = useState(5);
  const [identityStrength, setIdentityStrength] = useState(0.82);
  const [poseStrength, setPoseStrength] = useState(0.68);
  const [styleStrength, setStyleStrength] = useState(0.32);
  const [compositionStrength, setCompositionStrength] = useState(0.48);
  const [kind, setKind] = useState('girlfriend');
  const [productionGirlfriendId, setProductionGirlfriendId] = useState(girlfriendId || '');
  const [assetRole, setAssetRole] = useState<CharacterAssetRole>('scene');
  const [batchIdentityPack, setBatchIdentityPack] = useState(true);
  const [lastResult, setLastResult] = useState<Any[]>([]);
  const [lastGenerationTrace, setLastGenerationTrace] = useState<Any | null>(null);
  const [scopedGirlfriend, setScopedGirlfriend] = useState<Any | null>(null);
  const [gfLoading, setGfLoading] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchGirlfriends, setBatchGirlfriends] = useState<Any[]>([]);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Array<{ id: string; name: string; status: 'pending' | 'running' | 'success' | 'failed'; error?: string }>>([]);
  // ─── Pipeline state (3-stage character production) ─────────────────────────
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState<PipelineStageResult[]>([]);
  const [pipelineAssets, setPipelineAssets] = useState<Record<string, string>>({});
  const pipelineCancelRef = useRef(false);
  const lastAutoLoraKeyRef = useRef<string>('');
  const lastMissingCheckpointRef = useRef<string>('');
  const lastEnhancerFamilyRef = useRef<string>('');

  useEffect(() => {
    let active = true;
    void authedFetch('/api/admin/comfy?view=enhancers')
      .then((response) => response.ok ? response.json() as Promise<{ enhancers?: Array<{ id: string; enabled: boolean }> }> : null)
      .then((data) => {
        if (!active || !data?.enhancers) return;
        setEnhancerStatus(Object.fromEntries(data.enhancers.map((item) => [item.id, item.enabled])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const llmPromptHistoryRef = useRef<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // ─── Resource library (companion folder browser) ─────────────────────────
  const [resourceLibraryOpen, setResourceLibraryOpen] = useState(false);
  const [studioTask, setStudioTask] = useState<'identity' | 'portrait' | 'outfit' | 'pose' | 'background' | 'video'>('identity');
  const [resourceFolderFilter, setResourceFolderFilter] = useState<string>('all');
  const [libraryFolderFilter, setLibraryFolderFilter] = useState<string>('all');

  const identityReferenceAsset = useMemo(() => identityReferenceRolePriority(assetRole)
    .map((role) => companionAssets.find((item) => String(item.meta?.asset_role || item.asset_role || '') === role))
    .find(Boolean), [assetRole, companionAssets]);
  const identityReferenceUrl = String(identityReferenceAsset?.url || '');
  const identityConsistencyActive = Boolean(identityReferenceUrl);

  /** Group companion assets into folders by asset_role for the resource library */
  const resourceFolders = useMemo(() => {
    const grouped: Array<{ id: string; label: string; assets: Any[] }> = [];
    for (const folder of RESOURCE_FOLDERS) {
      if (folder.id === 'other') continue; // handled last
      const matched = companionAssets.filter((a) => {
        const role = String(a.meta?.asset_role || a.asset_role || '');
        return folder.match(role);
      });
      if (matched.length > 0) grouped.push({ id: folder.id, label: folder.label, assets: matched });
    }
    // "other" catches anything not matched above
    const matchedIds = new Set(grouped.flatMap((g) => g.assets.map((a) => a.id || a.url)));
    const otherAssets = companionAssets.filter((a) => !matchedIds.has(a.id || a.url));
    if (otherAssets.length > 0) grouped.push({ id: 'other', label: '其他', assets: otherAssets });
    return grouped;
  }, [companionAssets]);


  const applyRecommendedLoras = (
    category: CompanionCategory,
    animeStyle: AnimeRenderStyle = animeRenderStyle,
    intensity: NsfwIntensity = nsfwIntensity,
  ) => {
    const recommendations = recommendedStudioLoras(category, animeStyle, intensity, generationRoute.modelFamily);
    const available = recommendations
      .map((item) => ({ item, asset: (config?.loras || []).find((l: Any) => l.id === item.id) }))
      .filter((entry) => entry.item.id !== 'none' && entry.asset && (!entry.asset.filename || installedLoras.includes(String(entry.asset.filename))))
      .map((entry) => ({
        id: entry.item.id,
        strength: Number(Math.min(1.05, entry.item.strength * studioLoraStrengthScale(intensity)).toFixed(2)),
      }));
    setSelectedLoras(available.slice(0, 3));
    setLoraId(available[0]?.id || 'none');
    if (available[0]) setLoraStrength(available[0].strength);
    return available.length;
  };

  const applyPreset = (p: GenPreset) => {
    const framing = [
      CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt,
      CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt,
    ].filter(Boolean).join(', ');
    setPrompt(compactFluxPrompt(buildStudioPromptEnhancement({
      category: companionCategory,
      intensity: nsfwIntensity,
      animeStyle: animeRenderStyle,
      scene: `${p.prompt}. ${randomFluxPrompt({ category: companionCategory, style: animeRenderStyle, intensity: nsfwIntensity, framing })}`,
      framing: framing || undefined,
    })));
    setPromptProfileApplied(true);
    setNegative(`${studioNegativePrompt(companionCategory, animeRenderStyle)}, ${p.negative}`);
    setWidth(p.width);
    setHeight(p.height);
    setSteps(p.steps);
    setCfg(p.cfg);
    applyRecommendedLoras(companionCategory);
    toast.success(`已应用预设：${p.name}`);
  };

  const appendPromptControl = (addition: string, label: string) => {
    const normalized = addition.trim();
    if (!normalized) return;
    setPrompt((current) => {
      const base = current.trim().replace(/[,.\s]+$/, '');
      if (base.toLowerCase().includes(normalized.toLowerCase())) return current;
      return base ? `${base}, ${normalized}` : normalized;
    });
    setPromptProfileApplied(false);
    toast.success(`已追加${label}`);
  };
  const applyProductionPreset = (role: CharacterAssetRole) => {
    const preset = getCharacterProductionPreset(role);
    // avatar-closeup is ALWAYS pure txt2img — no reference image, no img2img redraw
    const isAvatar = role === 'avatar-closeup';
    const wantsIdentityRef = !isAvatar && preset.consistency;
    const identityAsset = identityReferenceRolePriority(role)
      .map((referenceRole) => companionAssets.find((item) => item.meta?.asset_role === referenceRole))
      .find((item) => Boolean(item));
    const identityImage = String(identityAsset?.url || '');
    const hasIdentityRef = wantsIdentityRef && identityImage.length > 0;
    setAssetRole(role);
    setKind('girlfriend');
    setGenerationSurface('companion');
    setGenMode(isAvatar ? 'txt2img' : hasIdentityRef ? 'img2img' : 'txt2img');
    setInputImage(isAvatar ? '' : hasIdentityRef ? identityImage : '');
    setIdentityConsistency(hasIdentityRef);
    setWidth(preset.width);
    setHeight(preset.height);
    if (role === 'avatar-closeup') setCameraFraming('near');
    if (role === 'character-art') setCameraFraming('full');
    const isIdentityAsset = role === 'avatar-closeup' || role.startsWith('identity-');
    const assembled = scopedGirlfriend
      ? buildCompanionGenerationPrompt(scopedGirlfriend as Record<string, unknown>, {
          action: `${preset.scene}. ${styleProductionHint(animeRenderStyle)}`,
          adult: isIdentityAsset ? false : nsfwIntensity >= 3,
          sceneOnly: hasIdentityRef,
          intensity: isIdentityAsset ? 1 : nsfwIntensity,
        })
      : null;
    const roleRoute = resolveImageGenerationRoute({
      surface: 'companion',
      category: assembled?.category || companionCategory,
      renderStyle: animeRenderStyle,
      nsfwIntensity: isIdentityAsset ? 1 : nsfwIntensity,
      specialistModelsReady: volumeInfo?.sdxl_models_ready === true,
      sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
    });
    const portraitScene = buildStudioSceneDraft({
      task: role === 'character-art' ? 'portrait' : studioTask,
      modelFamily: roleRoute.modelFamily,
      currentPrompt: hasIdentityRef ? '' : String(scopedGirlfriend?.image_prompt || '').trim(),
      intensity: isIdentityAsset ? 1 : nsfwIntensity,
      renderStyle: animeRenderStyle,
    });
    if (assembled) {
      setCompanionCategory(assembled.category);
      if (isIdentityAsset) {
        // 身份资产用精简提示词：场景预设控制构图，数据库简报控制一致性（与服务端一致，避免 1200+ 长提示词）
        setPrompt('');
        setNegative(assembled.negative);
      } else if (hasIdentityRef) {
        // Identity comes from the ID image; scene content follows the selected NSFW/model contract.
        setPrompt(portraitScene);
        setNegative(assembled.negative);
      } else {
        setPrompt(portraitScene);
        setNegative(assembled.negative);
      }
    }
    setPromptProfileApplied(Boolean(prompt.trim() || scopedGirlfriend?.image_prompt));
    applyRecommendedLoras(assembled?.category || companionCategory, animeRenderStyle, nsfwIntensity);
    if (isAvatar) toast.success(`已切换：${preset.label}，纯文生图（不使用参考图）`);
    else if (wantsIdentityRef && !identityImage) toast.warning('尚无人设参考图，将用完整描述生成；建议先生成半身头像');
    else toast.success(`已切换：${preset.label}，${hasIdentityRef ? '人设图控制一致性' : '将读取伴侣基础信息'}`);
  };

  const applyCategoryPrompt = (category: CompanionCategory) => {
    const preset = STUDIO_PROMPTS[category];
    setCompanionCategory(category);
    const framing = [
      CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt,
      CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt,
    ].filter(Boolean).join(', ');
    setPrompt(compactFluxPrompt(buildStudioPromptEnhancement({
      category,
      intensity: nsfwIntensity,
      animeStyle: animeRenderStyle,
      scene: `${preset.prompt}. ${randomFluxPrompt({ category, style: animeRenderStyle, intensity: nsfwIntensity, framing })}`,
      framing: framing || undefined,
    })));
    setPromptProfileApplied(true);
    setNegative(`${studioNegativePrompt(category, animeRenderStyle)}, ${preset.negative}`);
    applyRecommendedLoras(category);
    toast.success(`已切换为${COMPANION_CATEGORY_LABELS[category].zh}成人提示词`);
  };

  const applyFluxPromptPreset = (presetId: string) => {
    const framing = [
      CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt,
      CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt,
    ].filter(Boolean).join(', ');
    const presets = getFluxPromptPresets({ category: companionCategory, style: animeRenderStyle, intensity: nsfwIntensity });
    const selected = presetId === 'random'
      ? randomFluxPrompt({ category: companionCategory, style: animeRenderStyle, intensity: nsfwIntensity, framing })
      : `${framing ? `Camera framing: ${framing}. ` : ''}${presets.find((item) => item.id === presetId)?.prompt || presets[0]?.prompt || ''}`;
    setSelectedPromptPreset(presetId);
    setPrompt(compactFluxPrompt(selected, 520));
    setPromptProfileApplied(true);
    setNegative(studioNegativePrompt(companionCategory, animeRenderStyle));
    toast.success(`已载入 NSFW ${nsfwIntensity}/5 提示词方案`);
  };


  useEffect(() => {
    try {
      const saved = localStorage.getItem('soulmate-comfy-presets');
      if (saved) setCustomPresets(JSON.parse(saved));
    } catch { /* ignore invalid local preset data */ }
    try {
      const saved = localStorage.getItem('soulmate-comfy-saved-prompts');
      if (saved) setSavedPrompts(JSON.parse(saved));
      const additions = localStorage.getItem('soulmate-comfy-prompt-adds');
      if (additions) setCustomPromptAdds(JSON.parse(additions));
      const descriptions = localStorage.getItem('soulmate-comfy-nsfw-descriptions');
      if (descriptions) setNsfwDescriptions(JSON.parse(descriptions));
    } catch { /* ignore invalid saved prompt data */ }
  }, []);

  const persistSavedPrompts = (items: Array<{ id: string; title: string; content: string }>) => {
    setSavedPrompts(items);
    localStorage.setItem('soulmate-comfy-saved-prompts', JSON.stringify(items));
  };

  const savePrompt = () => {
    const title = promptTitle.trim();
    const content = prompt.trim();
    if (!title || !content) return toast.error('请输入提示词标题和内容');
    const item = { id: `prompt-${Date.now()}`, title, content };
    persistSavedPrompts([item, ...savedPrompts]);
    setSelectedSavedPrompt(item.id);
    toast.success('提示词已保存');
  };

  const loadSavedPrompt = (id: string) => {
    const item = savedPrompts.find((entry) => entry.id === id);
    if (!item) return;
    setSelectedSavedPrompt(id);
    setPromptTitle(item.title);
    setPrompt(item.content);
    setPromptProfileApplied(true);
  };

  const savePromptAdd = () => {
    const title = promptAddTitle.trim();
    const content = promptAddContent.trim();
    if (!title || !content) return toast.error('请输入追加项标题和内容');
    const next = [...customPromptAdds, { id: `add-${Date.now()}`, title, content }];
    setCustomPromptAdds(next);
    localStorage.setItem('soulmate-comfy-prompt-adds', JSON.stringify(next));
    setPromptAddTitle('');
    setPromptAddContent('');
  };

  const removePromptAdd = (id: string) => {
    const next = customPromptAdds.filter((item) => item.id !== id);
    setCustomPromptAdds(next);
    localStorage.setItem('soulmate-comfy-prompt-adds', JSON.stringify(next));
  };

  const updateNsfwDescription = (level: number, value: string) => {
    const next = { ...nsfwDescriptions, [String(level)]: value };
    setNsfwDescriptions(next);
    localStorage.setItem('soulmate-comfy-nsfw-descriptions', JSON.stringify(next));
  };

  const persistCustomPresets = (items: Array<GenPreset>) => {
    setCustomPresets(items);
    localStorage.setItem('soulmate-comfy-presets', JSON.stringify(items));
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name || !prompt.trim()) return toast.error('请输入预设名称并填写提示词');
    const item = {
      id: `custom-${Date.now()}`,
      name,
      desc: '自定义预设',
      prompt: prompt.trim(), negative: negative.trim(), width, height, steps, cfg,
    };
    persistCustomPresets([...customPresets, item]);
    setPresetName('');
    toast.success('预设已保存到当前浏览器');
  };

  const loadVolume = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/comfy?view=volume');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) return;
      setInstalledLoras(Array.isArray(data.installed_loras) ? data.installed_loras : []);
      setVolumeInfo(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConfig = useCallback(async () => {

    setLoading(true);
    try {
      const res = await authedFetch('/api/admin/comfy?view=config');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '加载失败');
      setConfig(data.config);
      setWorkflowId('auto');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const activeId = productionGirlfriendId || girlfriendId;
      const qs = new URLSearchParams({ view: 'assets', limit: '120' });
      if (activeId) qs.set('girlfriend_id', activeId);
      else qs.set('scope', 'public');
      const res = await authedFetch(`/api/admin/comfy?${qs.toString()}`);
      const data = await readResponseJson(res).catch(() => ({} as Any));
      setAssets(data.assets || []);
      setSelectedAssetKeys([]);

      if (data.warning) toast.message(data.warning);
    } catch {
      toast.error('图库加载失败');
    } finally {
      setAssetsLoading(false);
    }
  }, [productionGirlfriendId, girlfriendId]);

  const persistAssetsToCompanionLibrary = useCallback(async (
    id: string,
    generatedAssets: Any[],
    defaultRole: CharacterAssetRole = 'album',
  ): Promise<Any[]> => {
    const created = await Promise.all(generatedAssets.map(async (item) => {
      const url = String(item?.url || '').trim();
      if (!url) return null;
      const rawRole = String(item.meta?.asset_role || item.asset_role || defaultRole) as CharacterAssetRole;
      const role: CharacterAssetRole = rawRole === 'avatar-closeup' ? 'avatar-closeup' : rawRole.startsWith('identity-') ? rawRole : defaultRole;
      const response = await authedFetch(`/api/companion/${encodeURIComponent(id)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: role === 'avatar-closeup' || role.startsWith('identity-') ? 'id_reference' : 'photo',
          media_type: 'image',
          url,
          thumbnail_url: item.thumbnail_url || null,
          visibility: 'private',
          caption: item.caption || null,
          meta: { ...(item.meta || {}), asset_role: role, generation_asset_id: item.id || null },
        }),
      });
      const data = await readResponseJson(response).catch(() => ({} as Any));
      return response.ok && data.asset ? data.asset as Any : null;
    }));
    return created.filter(Boolean) as Any[];
  }, []);

  const loadCompanionAssets = useCallback(async (id: string) => {
    if (!id) {
      setCompanionAssets([]);
      return [] as Any[];
    }
    try {
      const params = new URLSearchParams({ view: 'assets', girlfriend_id: id, limit: '120' });
      const [libraryRes, generatedRes] = await Promise.all([
        authedFetch(`/api/companion/${encodeURIComponent(id)}/assets`),
        authedFetch(`/api/admin/comfy?${params.toString()}`),
      ]);
      const libraryData = await readResponseJson(libraryRes).catch(() => ({} as Any));
      const generatedData = await readResponseJson(generatedRes).catch(() => ({} as Any));
      const libraryAssets: Any[] = Array.isArray(libraryData.assets) ? libraryData.assets : [];
      const knownUrls = new Set(libraryAssets.map((item) => String(item.url || '')));
      const missingGenerated = (Array.isArray(generatedData.assets) ? generatedData.assets : [])
        .filter((item: Any) => item.url && !knownUrls.has(String(item.url)));
      const backfilled = missingGenerated.length
        ? await persistAssetsToCompanionLibrary(id, missingGenerated, 'album')
        : [];
      const nextAssets = [...backfilled, ...libraryAssets].filter((item, index, all) =>
        all.findIndex((candidate) => String(candidate.id || candidate.url) === String(item.id || item.url)) === index,
      );
      setCompanionAssets(nextAssets);
      return nextAssets as Any[];
    } catch {
      setCompanionAssets([]);
      return [] as Any[];
    }
  }, [persistAssetsToCompanionLibrary]);

  const assignCompanionAssetRole = async (asset: Any, role: CharacterAssetRole) => {
    if (!productionGirlfriendId || !asset?.id) return;
    try {
      const previousIdentityAssets = role === 'avatar-closeup'
        ? companionAssets.filter((item) => item.id !== asset.id && String(item.meta?.asset_role || item.asset_role || '') === 'avatar-closeup')
        : [];
      await Promise.all(previousIdentityAssets.map(async (item) => {
        const demotedMeta = { ...(item.meta || {}), asset_role: 'album' };
        const response = await authedFetch(`/api/companion/${encodeURIComponent(productionGirlfriendId)}/assets`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: item.id, category: 'photo', meta: demotedMeta }),
        });
        if (!response.ok) throw new Error('旧 ID 锁脸图更新失败');
      }));
      const nextMeta = { ...(asset.meta || {}), asset_role: role };
      const res = await authedFetch(`/api/companion/${encodeURIComponent(productionGirlfriendId)}/assets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, category: role === 'avatar-closeup' || role.startsWith('identity-') ? 'id_reference' : 'photo', meta: nextMeta }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '参考类型保存失败');
      setCompanionAssets((current) => current.map((item) => {
        if (item.id === asset.id) return { ...item, ...data.asset };
        if (role === 'avatar-closeup' && previousIdentityAssets.some((previous) => previous.id === item.id)) {
          return { ...item, category: 'photo', meta: { ...(item.meta || {}), asset_role: 'album' }, asset_role: 'album' };
        }
        return item;
      }));
      if (role === 'avatar-closeup') {
        setIdentityConsistency(true);
      }
      toast.success(`已设置为${getCharacterProductionPreset(role).shortLabel}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '参考类型保存失败');
    }
  };

  const setCompanionAssetAsReference = (asset: Any) => {
    const url = String(asset?.url || '');
    if (!url) return;
    setInputImage(url);
    if (genMode !== 'img2video') setGenMode('img2img');
    toast.success('已设为当前画面参考；ID 锁脸图仍仅负责头像一致性');
  };

  const deleteCompanionAsset = async (asset: Any) => {
    if (!productionGirlfriendId || !asset?.id) return;
    if (!confirm('删除这项伴侣资源？此操作会从该伴侣资源库中移除图片。')) return;
    try {
      const query = new URLSearchParams({ assetId: String(asset.id) });
      const res = await authedFetch(`/api/companion/${encodeURIComponent(productionGirlfriendId)}/assets?${query.toString()}`, { method: 'DELETE' });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '资源删除失败');
      setCompanionAssets((current) => current.filter((item) => item.id !== asset.id));
      if (String(asset.url || '') === inputImage) setInputImage('');
      toast.success('伴侣资源已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '资源删除失败');
    }
  };
  useEffect(() => {
    loadConfig();
    loadVolume();
  }, [loadConfig, loadVolume]);

  useEffect(() => {
    if (productionGirlfriendId) void loadCompanionAssets(productionGirlfriendId);
    else setCompanionAssets([]);
  }, [loadCompanionAssets, productionGirlfriendId]);

  useEffect(() => {
    if (!girlfriendId) {
      setScopedGirlfriend(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setGfLoading(true);
      try {
        const res = await authedFetch(`/api/admin/girlfriends?id=${encodeURIComponent(girlfriendId)}`);
        const data = await readResponseJson(res).catch(() => ({} as Any));
        const list = data.girlfriends || data.items || [];
        const one = data.girlfriend || list[0] || null;
        if (!cancelled) setScopedGirlfriend(one);
        if (one) {
          // 强制使用已调试的 assembleGirlfriendFromRow，而不是字段逗号拼接
          fillPromptFromGirlfriend(one, { force: true, toastOn: true });
          toast.message(`已载入伴侣：${one.name || girlfriendId}`);
        }
      } catch {
        if (!cancelled) toast.error('载入伴侣失败');
      } finally {
        if (!cancelled) setGfLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- girlfriendId 变更时重新载入伴侣，fillPromptFromGirlfriend 每次渲染重建
  }, [girlfriendId]);

  // Auto-load partner list so the "当前伴侣" dropdown shows the name when entering with girlfriendId
  useEffect(() => {
    if (girlfriendId && batchGirlfriends.length === 0 && !batchLoading) {
      void loadBatchGirlfriends();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在进入页面时按 girlfriendId 触发一次，避免 batch 状态变化引起重复拉取
  }, [girlfriendId]);

  useEffect(() => {
    if (tab === 'library') loadAssets();
  }, [tab, loadAssets]);

  function applyWorkflow(wf: Any, cfg?: Any, opts?: { preservePrompt?: boolean }) {
    const c = cfg || config;
    setWorkflowId(wf.id);
    setKind(wf.kind || 'custom');
    setGenerationSurface(wf.kind === 'outfit' ? 'outfit' : wf.kind === 'prop' ? 'prop' : wf.kind === 'advert' ? 'advert' : 'companion');
    setEndpointKey(wf.defaults?.endpoint_key || 'comfy-default');
    setCkptId(wf.defaults?.ckpt_id || 'flux-fp8');
    setLoraId(wf.defaults?.lora_id || 'none');
    setLoraStrength(wf.defaults?.lora_strength ?? 0.8);
    setSelectedLoras(wf.defaults?.lora_id
      ? [{ id: wf.defaults.lora_id, strength: wf.defaults?.lora_strength ?? 0.8 }]
      : []);
    setWidth(wf.defaults?.width || 832);
    setHeight(wf.defaults?.height || 1216);
    setSteps(wf.defaults?.steps || 28);
    setCfg(String(wf.defaults?.ckpt_id || '').startsWith('flux') ? 1 : (wf.defaults?.cfg || 7));
    setDenoise(wf.defaults?.denoise ?? 0.55);
    if (!opts?.preservePrompt) {
      setPrompt(wf.defaults?.positive || '');
      setNegative(wf.defaults?.negative || '');
    }
    void c;
  }

  /** 用已调试的伴侣卡提示词配方（特征+动作+环境+质量），覆盖通用工作流默认句 */
  function fillPromptFromGirlfriend(row: Any, opts?: { force?: boolean; toastOn?: boolean }) {
    if (!row) return false;
    try {
      const assembled = buildCompanionGenerationPrompt(row as Record<string, unknown>, {
        action: `${STUDIO_PROMPTS[resolveCompanionProfile(row as Record<string, unknown>).category].prompt}. ${styleProductionHint(animeRenderStyle)}`,
        adult: nsfwIntensity >= 3,
        intensity: nsfwIntensity,
      });
      const nextPrompt = String(row.image_prompt || '').trim();
      setCompanionCategory(assembled.category);
      const nextNeg = String(assembled.negative || GIRLFRIEND_NEGATIVE_FLUX).trim();
      if (opts?.force) {
        setPrompt(nextPrompt);
        setPromptProfileApplied(Boolean(nextPrompt));
        setNegative(String(row.negative_prompt || nextNeg || GIRLFRIEND_NEGATIVE_FLUX));
      } else {
        setPrompt((prev: string) => {
          const p = (prev || '').trim();
          const isGeneric =
            !p ||
            p.startsWith('three-quarter body portrait of a beautiful young adult woman') ||
            p === String((config as Any)?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')?.defaults?.positive || '').trim();
          return isGeneric && nextPrompt ? nextPrompt : p;
        });
        setNegative((prev: string) => {
          const n = (prev || '').trim();
          if (!n || n.includes('flat chest') || n.startsWith('blurry, deformed, bad anatomy, child')) {
            return nextNeg || GIRLFRIEND_NEGATIVE_FLUX;
          }
          return n;
        });
      }

      try {
        const plan = resolveGirlfriendLoraPlan(subjectFromGirlfriendRow(row as Record<string, unknown>));
        if (plan?.lora_name) {
          const match = (config?.loras || []).find((l: Any) =>
            String(l.filename || '') === plan.lora_name || String(l.id || '') === plan.lora_name,
          );
          if (match) {
            setLoraId((cur: string) => (cur && cur !== 'none' ? cur : match.id));
            setLoraStrength((s: number) => (s > 0 ? s : plan.lora_strength_model || match.default_strength || 0.75));
            setSelectedLoras((current) => current.length
              ? current
              : [{ id: match.id, strength: plan.lora_strength_model || match.default_strength || 0.75 }]);
          }
        }
      } catch {
        /* ignore lora plan */
      }

      if (opts?.toastOn !== false) {
        toast.success(nextPrompt
          ? `已读取伴侣提示词：${row.name || 'companion'}`
          : '当前伴侣没有保存提示词；可选择提示词预设或使用 AI 生成');
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提示词组装失败');
      return false;
    }
  }

  /** Parameter-first prompt optimization: instant, deterministic and model-aware. */
  const optimizePromptWithLlm = async () => {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt) { toast.error('请先在提示词框输入内容'); return; }
    setOptimizingPrompt(true);
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'optimize_prompt', prompt: sourcePrompt, companion_category: companionCategory, anime_render_style: animeRenderStyle, nsfw_intensity: nsfwIntensity, gen_mode: genMode, asset_role: assetRole, companion: scopedGirlfriend || {}, previous_prompts: llmPromptHistoryRef.current }),
      });
      const data = await readResponseJson<{ prompt?: string; negative?: string; error?: string }>(res);
      if (!res.ok || !data.prompt) throw new Error(data.error || 'Qwen3 提示词优化失败');
      setPrompt(data.prompt);
      llmPromptHistoryRef.current = [...llmPromptHistoryRef.current, data.prompt].slice(-5);
      setPromptProfileApplied(true);
      if (data.negative) setNegative(data.negative);
      toast.success('已使用 Qwen3-8B-Pro-NSFW 优化当前提示词');
      return;
      if (false) { /* legacy deterministic composer retained below for reference */
      const route = resolveImageGenerationRoute({
        surface: generationSurface,
        category: companionCategory,
        renderStyle: animeRenderStyle,
        nsfwIntensity,
        specialistModelsReady: volumeInfo?.sdxl_models_ready === true,
        sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
      });
      const modelFamily = genMode === 'img2video' ? 'wan22' : route.modelFamily;
      const generatedPrompt = buildStudioSceneDraft({
        task: studioTask,
        modelFamily,
        currentPrompt: prompt,
        intensity: nsfwIntensity,
        renderStyle: animeRenderStyle,
      });
      setPrompt(generatedPrompt);
      llmPromptHistoryRef.current = [...llmPromptHistoryRef.current, generatedPrompt].filter(Boolean).slice(-5);
      setPromptProfileApplied(true);
      setNegative(studioNegativePrompt(companionCategory, animeRenderStyle));
      applyRecommendedLoras(companionCategory, animeRenderStyle, nsfwIntensity);
      applyRecommendedParameters(genMode, nsfwIntensity);
      toast.success(`已按${modelFamily.toUpperCase()} · NSFW ${nsfwIntensity}/5 · ${studioTask}完成提示词与反向词优化`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提示词优化失败');
    } finally {
      setOptimizingPrompt(false);
    }
  };

  /** 一键调用：选中 LoRA + 强度 + 触发词写入提示词 */
  function applyLora(lora: Any, opts?: { appendTriggers?: boolean; goGenerate?: boolean }) {
    if (!lora || lora.id === 'none') {
      setLoraId('none');
      setLoraStrength(0);
      toast.message('已关闭 LoRA');
      return;
    }
    setLoraId(lora.id);
    setLoraStrength(lora.default_strength ?? 0.75);
    setSelectedLoras((current) => current.some((item) => item.id === lora.id)
      ? current
      : [...current, { id: lora.id, strength: lora.default_strength ?? 0.75 }].slice(-4));
    const triggers = (lora.trigger_words || []).slice(0, 4).join(', ');
    if (opts?.appendTriggers !== false && triggers) {
      setPrompt((p) => {
        if (!p.trim()) return triggers;
        if (p.includes(triggers.split(',')[0]?.trim() || '___')) return p;
        return `${triggers}, ${p}`;
      });
    }
    toast.success(`已调用：${lora.label?.replace(/^\[[^\]]+\]\s*/, '') || lora.id}`);
    if (opts?.goGenerate !== false) setTab('generate');
  }

  /** 快捷配方 */
  function applyRecipe(recipe: Any) {
    const wf = workflows.find((w) => w.id === recipe.workflow_id);
    if (wf) applyWorkflow(wf);
    const lora = loras.find((l) => l.id === recipe.lora_id);
    if (lora) {
      setLoraId(lora.id);
      setLoraStrength(recipe.lora_strength ?? lora.default_strength ?? 0.75);
      setSelectedLoras([{ id: lora.id, strength: recipe.lora_strength ?? lora.default_strength ?? 0.75 }]);
      const triggers =
        recipe.append_triggers !== false
          ? (lora.trigger_words || []).slice(0, 4).join(', ')
          : '';
      const extra = recipe.positive_extra || '';
      const base = wf?.defaults?.positive || prompt;
      const parts = [triggers, extra, base].filter(Boolean);
      setPrompt(parts.join(', '));
    }
    toast.success(`已应用配方：${recipe.label}`);
    setTab('generate');
  }

  function applyImageTransformation(kind: 'outfit' | 'pose' | 'background') {
    setStudioTask(kind);
    setGenMode('img2img');
    setGenerationSurface('companion');
    setIdentityConsistency(true);
    setDenoise(kind === 'pose' ? 0.52 : 0.44);
    setPrompt('');
    setPromptProfileApplied(true);
    toast.success(kind === 'outfit' ? '已切换到一键换装' : kind === 'pose' ? '已切换到一键姿势' : '已切换到一键背景');
  }

  const workflows: Any[] = useMemo(() => config?.workflows || [], [config?.workflows]);
  const endpoints: Any[] = useMemo(() => config?.endpoints || [], [config?.endpoints]);
  const checkpoints: Any[] = useMemo(() => config?.checkpoints || [], [config?.checkpoints]);
  const allLoras: Any[] = useMemo(() => config?.loras || [], [config?.loras]);
  const generationRoute = resolveImageGenerationRoute({ surface: generationSurface, category: companionCategory, renderStyle: animeRenderStyle, nsfwIntensity, turbo: fastPreview && genMode !== 'img2video', specialistModelsReady: volumeInfo?.sdxl_models_ready === true, sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined });
  // Checkpoint 下拉跟随路由：仅展示当前底模家族的候选（SDXL 时自动带出 Pony/Illustrious 底模）。
  const studioCheckpoints = (() => {
    const routedIds = generationRoute.modelFamily === 'pony'
      ? ['pony-realism-v22']
      : generationRoute.modelFamily === 'illustrious'
        ? ['wai-mature-illustrious-v20']
        : ['flux-fp8', 'flux-unchained'];
    const routed = checkpoints.filter((item) => routedIds.includes(String(item.id)));
    return routed.length ? routed : checkpoints.filter((item) => ['flux-fp8', 'flux-unchained'].includes(String(item.id)));
  })();
  // FLUX responds better to concise natural-language composition; omit hard
  // directional camera clauses (LOW/HIGH-ANGLE REQUIREMENT) from its payload.
  const promptFraming = generationRoute.modelFamily === 'flux'
    ? CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt || ''
    : [CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt, CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt].filter(Boolean).join(', ');
  const recommendedPreset = resolveCreativeGenerationPreset({
    mode: genMode,
    surface: generationSurface,
    category: companionCategory,
    renderStyle: animeRenderStyle,
    intensity: nsfwIntensity,
    assetRole,
    scene: prompt,
    identityConsistency,
    turbo: fastPreview && genMode !== 'img2video',
    specialistModelsReady: volumeInfo?.sdxl_models_ready === true,
    sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
  });
  const applyRecommendedParameters = (
    mode: CreativeGenerationMode = genMode,
    intensity: NsfwIntensity = nsfwIntensity,
  ) => {
    const preset = resolveCreativeGenerationPreset({
      mode,
      surface: generationSurface,
      category: companionCategory,
      renderStyle: animeRenderStyle,
      intensity,
      assetRole,
      scene: prompt,
      identityConsistency,
      turbo: fastPreview && mode !== 'img2video',
      specialistModelsReady: volumeInfo?.sdxl_models_ready === true,
      sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
    });
    setWidth(preset.width);
    setHeight(preset.height);
    setSteps(preset.steps);
    setCfg(preset.cfg);
    setSampler(preset.sampler);
    setScheduler(preset.scheduler);
    if (preset.denoise != null) setDenoise(preset.denoise);
    return preset;
  };
  const applyNsfwIntensity = (next: NsfwIntensity) => {
    const specialistReady = volumeInfo?.sdxl_models_ready === true;
    const route = resolveImageGenerationRoute({
      surface: generationSurface,
      category: companionCategory,
      renderStyle: animeRenderStyle,
      nsfwIntensity: next,
      turbo: false,
      specialistModelsReady: specialistReady,
      sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
    });
    const promptTask = next >= 3 || assetRole === 'character-art' || assetRole === 'scene'
      ? 'portrait'
      : studioTask;
    const scene = prompt.trim() || buildStudioSceneDraft({
      task: promptTask,
      modelFamily: route.modelFamily,
      intensity: next,
      renderStyle: animeRenderStyle,
    });
    const nextPrompt = buildStudioTaskPrompt({
      task: promptTask,
      modelFamily: route.modelFamily,
      companion: scopedGirlfriend as Record<string, unknown> | null,
      scene,
      framing: [
        CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt,
        CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt,
      ].filter(Boolean).join(', '),
      loraTriggers: activeLoraTriggers,
      category: companionCategory,
      renderStyle: animeRenderStyle,
      hasIdentityReference: identityConsistencyActive,
    });
    const parameterPreset = resolveCreativeGenerationPreset({
      mode: genMode,
      surface: generationSurface,
      category: companionCategory,
      renderStyle: animeRenderStyle,
      intensity: next,
      assetRole,
      scene: nextPrompt,
      identityConsistency,
      turbo: false,
      specialistModelsReady: specialistReady,
      sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
    });
    setNsfwIntensity(next);
    setFastPreview(false);
    // Changing the level changes only the model profile and parameters; the
    // authored prompt remains untouched until the user edits it explicitly.
    setActiveAdultPreset(null);
    setWidth(parameterPreset.width);
    setHeight(parameterPreset.height);
    setSteps(parameterPreset.steps);
    setCfg(parameterPreset.cfg);
    setSampler(parameterPreset.sampler);
    setScheduler(parameterPreset.scheduler);
    if (parameterPreset.denoise != null) setDenoise(parameterPreset.denoise);
    const checkpointAsset = (config?.checkpoints || []).find((item: Any) => String(item.filename || '') === route.checkpoint);
    if (checkpointAsset?.id) setCkptId(String(checkpointAsset.id));
    const endpointAsset = (config?.endpoints || []).find((item: Any) =>
      String(item.endpoint_id || '') === route.endpointId || String(item.id || '') === route.endpointId,
    );
    if (endpointAsset?.id) setEndpointKey(String(endpointAsset.id));
    setWorkflowId('auto');
    if (next >= 3 && !specialistReady && animeRenderStyle !== '3d') {
      // resolveImageGenerationRoute already fell back to FLUX (SDXL matrix
      // branches require the verified RUNPOD_SDXL_MODELS_READY gate) — inform, don't block.
      toast.warning('SDXL 矩阵总闸未开启（RUNPOD_SDXL_MODELS_READY），按路由规则降级到 FLUX 生成');
    }
    toast.success(`NSFW ${next}/5：已切换模型参数 profile，保留当前提示词和 LoRA`);
  };
  const installedSet = useMemo(() => new Set(installedLoras), [installedLoras]);
  const loras: Any[] = useMemo(
    () => allLoras.filter((lora) => isLoraAllowedForContext(lora, { surface: generationSurface, category: companionCategory, modelFamily: generationRoute.modelFamily })),
    [allLoras, companionCategory, generationRoute.modelFamily, generationSurface],
  );
  const compatibleSelectedLoras = useMemo(
    () => selectedLoras.filter((selection) => loras.some((lora) =>
      lora.id === selection.id && (!lora.filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(String(lora.filename)))),
    )),
    [installedSet, loras, selectedLoras, volumeInfo?.inventory_source],
  );
  const activeLoraTriggers = useMemo(() => compatibleSelectedLoras.flatMap((selection) => {
    const lora = loras.find((item) => item.id === selection.id);
    return Array.isArray(lora?.trigger_words) ? lora.trigger_words.map(String) : [];
  }), [compatibleSelectedLoras, loras]);
  const resolvedTaskPrompt = useMemo(() => buildStudioTaskPrompt({
    task: studioTask,
    modelFamily: genMode === 'img2video' ? 'wan22' : generationRoute.modelFamily,
    companion: scopedGirlfriend as Record<string, unknown> | null,
    scene: prompt,
    framing: promptFraming,
    loraTriggers: activeLoraTriggers,
    category: companionCategory,
    renderStyle: animeRenderStyle,
    hasIdentityReference: identityConsistencyActive,
  }), [activeLoraTriggers, animeRenderStyle, companionCategory, genMode, generationRoute.modelFamily, identityConsistencyActive, prompt, promptFraming, scopedGirlfriend, studioTask]);
  const recipes: Any[] = config?.lora_recipes || [];
  const stackingTips: string[] = config?.lora_stacking_tips || [];

  const lorasByCat = useMemo(() => {
    const map: Record<string, Any[]> = {};
    for (const l of loras) {
      if (!l.id || l.id === 'none') continue;
      const cat = l.category || 'other';
      if (loraFilter !== 'all' && cat !== loraFilter) continue;
      if (!map[cat]) map[cat] = [];
      map[cat].push(l);
    }
    return map;
  }, [loras, loraFilter]);

  const selectedEndpoint = useMemo(
    () => endpoints.find((e) => e.id === endpointKey),
    [endpoints, endpointKey],
  );
  useEffect(() => {
    const endpoint = generationRoute.modelFamily === 'flux' ? 'comfy-flux-cd1' : 'comfy-sdxl-cd2';
    const routedCheckpoint = checkpoints.find((item) =>
      item.filename === generationRoute.checkpoint || item.id === generationRoute.checkpoint,
    );
    // 按家族回退：SDXL 族找不到 checkpoint 时保持本族 ID，绝不静默回退 flux-fp8
    //（FLUX checkpoint + SDXL 参数混用是 2D 出图模糊的根因之一）。
    const checkpoint = routedCheckpoint?.id
      || (generationRoute.modelFamily === 'pony'
        ? 'pony-realism-v22'
        : generationRoute.modelFamily === 'illustrious'
          ? 'wai-mature-illustrious-v20'
          : (generationRoute.checkpoint.toLowerCase().includes('unchained') ? 'flux-unchained' : 'flux-fp8'));
    if (!routedCheckpoint && generationRoute.modelFamily !== 'flux') {
      const missKey = `${generationRoute.modelFamily}:${generationRoute.checkpoint}`;
      if (lastMissingCheckpointRef.current !== missKey) {
        lastMissingCheckpointRef.current = missKey;
        toast.warning(`控制台 checkpoint 清单缺少 ${generationRoute.checkpoint}，已保持 ${generationRoute.modelFamily} 家族路由，请检查 checkpoints 配置`);
      }
    }
    setEndpointKey(endpoint);
    setCkptId(checkpoint);
    // 参数跟随路由：尺寸/steps/cfg/sampler/scheduler 按底模家族自动应用，无需手选。
    const preset = resolveCreativeGenerationPreset({
      mode: genMode,
      surface: generationSurface,
      category: companionCategory,
      renderStyle: animeRenderStyle,
      intensity: nsfwIntensity,
      assetRole,
      scene: prompt,
      identityConsistency,
      turbo: fastPreview && genMode !== 'img2video',
      specialistModelsReady: volumeInfo?.sdxl_models_ready === true,
      sdxlEndpointId: volumeInfo?.endpoint_id_sdxl || undefined,
    });
    setWidth(preset.width);
    setHeight(preset.height);
    setSteps(preset.steps);
    setCfg(preset.cfg);
    setSampler(preset.sampler);
    setScheduler(preset.scheduler);
    if (preset.denoise != null) setDenoise(preset.denoise);
    // LoRA 跟随路由：「底模家族:类别」组合变化时自动补齐目标家族推荐 LoRA；
    // 同一组合内保留用户当前选择（含手动清空）。
    const autoLoraKey = `${generationRoute.modelFamily}:${companionCategory}`;
    if (loras.length > 0 && lastAutoLoraKeyRef.current !== autoLoraKey) {
      lastAutoLoraKeyRef.current = autoLoraKey;
      const filled = recommendedStudioLoras(companionCategory, animeRenderStyle, nsfwIntensity, generationRoute.modelFamily)
        .map((item) => ({ item, asset: loras.find((lora) => lora.id === item.id) }))
        .filter((entry) => Boolean(entry.asset))
        .map((entry) => ({
          id: entry.item.id,
          strength: Number(Math.min(1.05, entry.item.strength * studioLoraStrengthScale(nsfwIntensity)).toFixed(2)),
        }))
        .slice(0, 3);
      setSelectedLoras(filled);
      setLoraId(filled[0]?.id || 'none');
      if (filled[0]) setLoraStrength(filled[0].strength);
    } else {
      setSelectedLoras((current) => current.filter((selection) => selection.id !== 'none' && loras.some((lora) => lora.id === selection.id)));
      setLoraId((current) => current === 'none' || loras.some((lora) => lora.id === current) ? current : 'none');
    }
    // 增强器跟随路由：家族×题材变化时自动启用质量默认（如 2D 修脸+放大去糊），
    // ControlNet 保留用户选择。
    const enhancerKey = `${generationRoute.modelFamily}:${companionCategory}:${animeRenderStyle}`;
    if (lastEnhancerFamilyRef.current !== enhancerKey) {
      lastEnhancerFamilyRef.current = enhancerKey;
      setEnhancers((current) => ({
        ...current,
        adetailer: generationRoute.qualityEnhancers.adetailer,
        upscale: generationRoute.qualityEnhancers.upscale,
      }));
    }
  }, [animeRenderStyle, checkpoints, companionCategory, generationRoute.cfg, generationRoute.checkpoint, generationRoute.modelFamily, generationRoute.qualityEnhancers.adetailer, generationRoute.qualityEnhancers.upscale, generationRoute.sampler, generationRoute.scheduler, generationRoute.steps, loras]);

  const filteredBatchGirlfriends = useMemo(() => {
    const query = batchSearch.trim().toLowerCase();
    if (!query) return batchGirlfriends;
    return batchGirlfriends.filter((item) =>
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.slug || '').toLowerCase().includes(query),
    );
  }, [batchGirlfriends, batchSearch]);

  const loadBatchGirlfriends = async () => {
    setBatchLoading(true);
    try {
      const res = await authedFetch('/api/admin/girlfriends?limit=100&sort=name&order=asc');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '加载伴侣列表失败');
      setBatchGirlfriends(Array.isArray(data.girlfriends) ? data.girlfriends : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载伴侣列表失败');
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleBatchGirlfriend = (id: string) => {
    setBatchSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 20) {
        toast.error('单次批量任务最多选择 20 位伴侣');
        return current;
      }
      return [...current, id];
    });
  };

  const generationBody = (overrides?: { girlfriendId?: string; prompt?: string; negative?: string; assetRole?: CharacterAssetRole; promptSource?: 'llm' }) => ({
    action: 'generate',
    girlfriend_id: overrides?.girlfriendId || productionGirlfriendId || girlfriendId || undefined,
    workflow_id: workflowId === 'auto' ? undefined : workflowId,
    endpoint_key: endpointKey,
    endpoint_id: selectedEndpoint?.endpoint_id || undefined,
    ckpt_id: ckptId,
    lora_id: loraId === 'none' ? null : loraId,
    lora_strength: loraStrength,
    loras: compatibleSelectedLoras,
    prompt: overrides?.prompt ? compactFluxPrompt(overrides.prompt) : resolvedTaskPrompt,
    negative: overrides?.negative ?? negative,
    width,
    height,
    steps,
    cfg,
    sampler_name: sampler,
    scheduler,
    num_images: imageCount,
    seed,
    denoise: genMode === 'img2img' || inputImage ? denoise : undefined,
    input_image: genMode === 'img2img' || inputImage.trim() || identityConsistencyActive
      ? inputImage.trim() || identityReferenceUrl || undefined
      : undefined,
    character_consistency: (overrides?.assetRole || assetRole) !== 'avatar-closeup' && identityConsistencyActive,
    reference_controls: {
      enabled: (overrides?.assetRole || assetRole) !== 'avatar-closeup' && identityConsistencyActive,
      autoSelect: true,
      maxReferences: 4,
      identityStrength: 0.82,
      poseStrength: generationRoute.modelFamily === 'flux' ? 0 : 0.68,
      styleStrength: generationRoute.modelFamily === 'flux' ? 0 : 0.32,
      compositionStrength: generationRoute.modelFamily === 'flux' ? 0 : 0.48,
      requireExactCategory: true,
      requireExactStyle: true,
    },
    gen_mode: genMode,
    generation_surface: generationSurface,
    model_family: generationRoute.modelFamily,
    prompt_contract: {
      task: studioTask,
      modelFamily: genMode === 'img2video' ? 'wan22' : generationRoute.modelFamily,
      identityFromText: studioTask === 'identity',
      identityFromReference: studioTask !== 'identity',
      loraTriggers: activeLoraTriggers,
    },
    fast_preview: fastPreview && genMode !== 'img2video',
    companion_category: companionCategory,
    anime_render_style: animeRenderStyle,
    nsfw_intensity: nsfwIntensity,
    enhancers: {
      ...enhancers,
      controlnet_strength: controlnetStrength,
      adetailer_strength: adetailerStrength,
      upscale_scale: upscaleScale,
    },
    nsfw_descriptions: nsfwDescriptions,
    prompt_profile_applied: overrides?.promptSource === 'llm' || (overrides?.prompt ? false : promptProfileApplied),
    prompt_source: overrides?.promptSource,
    asset_role: overrides?.assetRole || assetRole,
    reference_role: studioTask === 'pose'
      ? 'pose'
      : studioTask === 'background'
        ? 'composition'
        : studioTask === 'outfit'
          ? 'style'
          : getCharacterProductionPreset(overrides?.assetRole || assetRole).referenceRole,
    kind,
  });

  // 轮询任务完成后调后端 finalize：把图片搬到正确目录并写入 generation_assets
  const finalizeAssets = async (
    jobId: string,
    images: string[],
    overrides?: { girlfriendId?: string; prompt?: string; negative?: string; assetRole?: CharacterAssetRole },
  ): Promise<Any[] | null> => {
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generationBody(overrides),
          action: 'finalize',
          job_id: jobId,
          images,
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (res.ok && Array.isArray(data.assets) && data.assets.length > 0) {
        return data.assets as Any[];
      }
    } catch { /* 保存失败不影响预览 */ }
    return null;
  };

  const runBatchGeneration = async (
    selectedIds: string[] = batchSelectedIds,
    produceIdentityPack: boolean = batchIdentityPack,
  ) => {
    const selectedFromList = batchGirlfriends.filter((item) => selectedIds.includes(String(item.id)));
    const selected = selectedFromList.length ? selectedFromList : scopedGirlfriend && selectedIds.includes(String(scopedGirlfriend.id)) ? [scopedGirlfriend] : [];
    if (!selected.length) return toast.error('请先选择需要生产资源的伴侣');
    const roles = produceIdentityPack ? CHARACTER_ID_PACK : [assetRole];
    const totalTasks = selected.length * roles.length;
    if (totalTasks > 40) return toast.error('单次最多 40 个生成任务，请减少伴侣数量');

    setBatchRunning(true);
    setLastResult([]);
    setBatchProgress(selected.map((item) => ({ id: String(item.id), name: String(item.name || item.id), status: 'pending' })));
    const generatedAssets: Any[] = [];
    let succeeded = 0;
    let failed = 0;

    // Phase-based: iterate roles FIRST (avatar phase → character-art phase), then companions.
    // Failure on one task does NOT block remaining tasks.
    const avatarBackfilled = new Set<string>();
    const runProductionTask = async (role: CharacterAssetRole, girlfriend: Any): Promise<void> => {
      const preset = getCharacterProductionPreset(role);
      const id = String(girlfriend.id);
      const isIdentityAsset = role === 'avatar-closeup' || role.startsWith('identity-');
      const assembled = buildCompanionGenerationPrompt(girlfriend as Record<string, unknown>, {
        action: `${preset.scene}. ${styleProductionHint(animeRenderStyle)}`,
        adult: isIdentityAsset ? false : nsfwIntensity >= 3,
        intensity: isIdentityAsset ? 1 : nsfwIntensity,
      });
      // 身份资产用精简提示词（场景+数据库简报），与服务端一致，避免 1200+ 长提示词
      const promptForRole = isIdentityAsset
        ? `${preset.scene}, ${buildCompanionIdentityBrief(girlfriend as Record<string, unknown>)}`
        : assembled.positive;
      const overrides = { girlfriendId: id, prompt: promptForRole, negative: assembled.negative, assetRole: role };
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generationBody(overrides),
          character_consistency: preset.consistency,
          width: preset.width,
          height: preset.height,
          num_images: 1,
          input_image: undefined,
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || `${preset.label}生成失败`);

      const executedOverrides = {
        ...overrides,
        prompt: String(data.generation_trace?.prompt || overrides.prompt),
        negative: String(data.generation_trace?.negative || overrides.negative),
      };
      if (data.pending && data.job_id) {
        const jobId = String(data.job_id);
        let done = false;
        for (let poll = 0; poll < 24; poll++) {
          const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}${data.endpoint_id ? `&endpoint_id=${encodeURIComponent(String(data.endpoint_id))}` : ''}&admin_source=true${overrides?.girlfriendId ? `&girlfriend_id=${encodeURIComponent(overrides.girlfriendId)}` : ''}&asset_role=${encodeURIComponent(String(overrides?.assetRole || assetRole))}`);
          const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
          if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
            const saved = Array.isArray(pollData.assets) && pollData.assets.length
              ? pollData.assets as Any[]
              : await finalizeAssets(jobId, pollData.images, executedOverrides);
            if (!saved?.length) throw new Error(`${preset.label} asset catalog registration failed`);
            generatedAssets.push(...saved);
            done = true;
            break;
          }
          if (pollData.status === 'FAILED') throw new Error(pollData.error || `${preset.label}任务失败`);
        }
        if (!done) throw new Error(`${preset.label} GPU 排队超时`);
      } else {
        generatedAssets.push(...(Array.isArray(data.assets) ? data.assets : []));
      }
    };
    for (const role of roles) {
      const preset = getCharacterProductionPreset(role);
      for (const girlfriend of selected) {
        const id = String(girlfriend.id);
        setBatchProgress((items) => items.map((item) => item.id === id && item.status === 'pending' ? { ...item, status: 'running' } : item));
        let taskError: unknown = null;
        try {
          await runProductionTask(role, girlfriend);
        } catch (error) {
          taskError = error;
          const message = error instanceof Error ? error.message : String(error);
          // 缺头像参考：自动补生半身头像后重试一次（头像落库即可作为 IP-Adapter 锚点）
          if (role !== 'avatar-closeup' && /avatar reference/i.test(message) && !avatarBackfilled.has(id)) {
            avatarBackfilled.add(id);
            toast.message(`「${String(girlfriend.name || id)}」缺少头像参考，自动补生半身头像后重试`);
            try {
              await runProductionTask('avatar-closeup', girlfriend);
              succeeded += 1;
              await runProductionTask(role, girlfriend);
              taskError = null;
            } catch (retryError) {
              taskError = retryError;
            }
          }
        }
        if (taskError) {
          failed += 1;
          const finalMessage = taskError instanceof Error ? taskError.message : '生成失败';
          const friendly = /avatar reference/i.test(finalMessage)
            ? '缺少头像参考图，请先在管线阶段生成半身头像或上传参考图'
            : finalMessage;
          setBatchProgress((items) => items.map((item) => item.id === id
            ? { ...item, status: 'failed', error: `${preset.shortLabel}：${friendly}` }
            : item));
          // Continue with next task — do NOT break
        } else {
          succeeded += 1;
        }
      }
    }
    // Mark remaining running/pending as success if no error recorded
    setBatchProgress((items) => items.map((item) => item.status === 'running' || item.status === 'pending' ? { ...item, status: 'success' } : item));
    setLastResult(generatedAssets);
    if (produceIdentityPack) {
      for (const girlfriend of selected) {
        const gid = String(girlfriend.id);
        const avatarAsset = generatedAssets.find((item) => item.meta?.asset_role === 'avatar-closeup' && String(item.meta?.girlfriend_id || '') === gid);
        const avatarUrl = String(avatarAsset?.url || '');
        if (avatarUrl) {
          try {
            await authedFetch('/api/admin/girlfriends', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: gid, avatar_url: avatarUrl }),
            });
          } catch { /* 资源已保存，绑定头像失败时仍可在资源库手动更换 */ }
        }
      }
    }
    setBatchRunning(false);
    if (productionGirlfriendId && selectedIds.includes(productionGirlfriendId)) void loadCompanionAssets(productionGirlfriendId);
    if (failed) toast.warning(`生产任务完成：成功 ${succeeded}，失败 ${failed}`);
    else toast.success(`角色生产包完成：共生成 ${succeeded} 项资产`);
  };

  // ─── 3-Stage Pipeline: avatar → character-art → video ──────────────────────
  const runPipelineGeneration = async (companionId: string) => {
    const girlfriend = batchGirlfriends.find((item) => String(item.id) === companionId) || scopedGirlfriend;
    if (!girlfriend) return toast.error('请先选择伴侣');
    pipelineCancelRef.current = false;
    setPipelineRunning(true);
    setPipelineResults(CHARACTER_PIPELINE_STAGES.map((s) => ({ stageId: s.id, status: 'pending' as const })));
    setPipelineAssets({});
    const localAssets: Record<string, string> = { ...pipelineAssets };
    const gender = String(girlfriend.gender || '').toLowerCase();
    const ctx: PipelineContext = {
      companionId,
      companion: girlfriend as Record<string, unknown>,
      category: gender.includes('trans') ? 'transgender' : gender.includes('male') && !gender.includes('female') ? 'male' : 'female',
      animeStyle: animeRenderStyle,
      nsfwIntensity,
      existingAssets: localAssets,
    };

    for (const stage of CHARACTER_PIPELINE_STAGES) {
      if (pipelineCancelRef.current) {
        setPipelineResults((prev) => prev.map((r) => r.status === 'pending' ? { ...r, status: 'skipped' } : r));
        toast.info('管线已取消');
        break;
      }
      setPipelineResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'running' } : r));
      try {
        // 1. AI prompt generation
        const { prompt, negative } = await generateStagePrompt(stage, ctx);
        // 2. Auto LoRA
        const loras = resolvePipelineLoras(stage, ctx);
        // 3. Auto reference resolution
        const refs = resolveStageReference(stage, ctx);
        // 4. Build params
        const params = buildStageGenerationParams(stage, prompt, negative, loras, refs);

        if (stage.mode === 'img2video') {
          // Video: the production route is Wan2.2 image-to-video.
          const videoRes = await authedFetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'wan22',
              girlfriend_id: companionId,
              input_image: refs.inputImage || localAssets['avatar-closeup'] || '',
              prompt,
              negative_prompt: negative,
              duration: stage.video?.durationSeconds === 10 ? 10 : 5,
              fps: stage.video?.fps ?? 16,
              // Pipeline expects a synchronous result — keep the long server poll.
              sync_poll_ms: 150000,
            }),
          });
          const videoData = await readResponseJson(videoRes).catch(() => ({} as Any));
          if (!videoRes.ok) throw new Error(videoData.error || '视频生成失败');
          const videoUrl = String(videoData.video_url || '');
          if (videoUrl) localAssets[stage.assetRole] = videoUrl;
          setPipelineResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, videoUrl, loras } : r));
        } else {
          // Image: call /api/admin/comfy
          const res = await authedFetch('/api/admin/comfy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...generationBody({ girlfriendId: companionId, prompt, negative, assetRole: stage.assetRole as CharacterAssetRole }),
              ...params,
              enhancers,
              character_consistency: stage.id !== 'avatar',
              width: stage.width,
              height: stage.height,
              num_images: 1,
            }),
          });
          const data = await readResponseJson(res).catch(() => ({} as Any));
          if (!res.ok) throw new Error(data.error || `${stage.shortLabel}生成失败`);

          // Handle async (pending) jobs
          if (data.pending && data.job_id) {
            const jobId = String(data.job_id);
            let imageUrl = '';
            for (let attempt = 0; attempt < 24; attempt++) {
              const statusRes = await authedFetch(`/api/runpod/status?job_id=${jobId}&admin_source=true&girlfriend_id=${companionId}&asset_role=${stage.assetRole}`);
              const statusData = await readResponseJson(statusRes).catch(() => ({} as Any));
              if (statusData.status === 'COMPLETED' || statusData.status === 'completed') {
                const images = statusData.images || statusData.output?.images || [];
                imageUrl = images[0]?.url || images[0]?.data || (typeof images[0] === 'string' ? images[0] : '');
                break;
              }
              if (statusData.status === 'FAILED' || statusData.status === 'failed') {
                throw new Error(statusData.error || `${stage.shortLabel} GPU 任务失败`);
              }
            }
            if (!imageUrl) throw new Error(`${stage.shortLabel} 超时`);
            localAssets[stage.assetRole] = imageUrl;
            setPipelineResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, imageUrl, jobId, loras } : r));
          } else {
            // Synchronous result
            const images = data.images || [];
            const imageUrl = images[0]?.url || images[0] || '';
            if (imageUrl) localAssets[stage.assetRole] = imageUrl;
            setPipelineResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'completed', prompt, negative, imageUrl, loras } : r));
          }
        }
        setPipelineAssets({ ...localAssets });
        ctx.existingAssets = { ...localAssets };
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : '生成失败';
        const msg = /avatar reference/i.test(rawMsg)
          ? '缺少头像参考图，请先完成半身头像阶段或上传参考图'
          : rawMsg;
        setPipelineResults((prev) => prev.map((r) => r.stageId === stage.id ? { ...r, status: 'failed', error: msg } : r));
        toast.error(`${stage.shortLabel}：${msg}`);
        // Stop pipeline on failure (subsequent stages depend on this one)
        break;
      }
    }
    // Auto-bind avatar
    if (localAssets['avatar-closeup']) {
      try {
        await authedFetch('/api/admin/girlfriends', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: companionId, avatar_url: localAssets['avatar-closeup'] }),
        });
      } catch { /* non-critical */ }
    }
    setPipelineRunning(false);
    void loadCompanionAssets(companionId);
    const completed = Object.keys(localAssets).length;
    if (completed > 0) toast.success(`管线完成：生成 ${completed} 项资产`);
  };

  const syncInstalled = async () => {
    setSyncingInstalled(true);
    try {
      const res = await authedFetch('/api/admin/model-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_installed' }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '同步失败');
      await loadVolume();
      toast.success(`已同步盘状态 · 更新 ${data.updated ?? 0} 条`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncingInstalled(false);
    }
  };

  const generate = async () => {
    if (!resolvedTaskPrompt.trim()) {
      toast.error('请填写正向提示词');
      return;
    }
    if ((genMode === 'img2img' || genMode === 'img2video') && !inputImage.trim()) {
      toast.error(genMode === 'img2video' ? '图生视频需要人设图或参考图' : '图生图需要参考图 URL');
      return;
    }
    const companionId = productionGirlfriendId || girlfriendId || '';
    if (genMode === 'img2video' && !companionId) {
      toast.error('请先选择对应人设，视频会保存到该人设资源库');
      return;
    }
    setGenerating(true);
    setGenerationStage('submitting');
    setLastResult([]);
    try {
      // The task-aware compiler already produced the final model-specific prompt.
      // Submit immediately; AI optimization remains an explicit optional button.
      const effectivePrompt = resolvedTaskPrompt;
      const effectiveNegative = negative.trim() || generationRoute.negativePrompt;
      const fluxPreset = recommendedPreset;
      const effectiveLoras = compatibleSelectedLoras;

      if (genMode === 'img2video') {
        const videoRes = await authedFetch('/api/generate-video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'wan22', girlfriend_id: companionId, input_image: inputImage.trim(), prompt: effectivePrompt, negative_prompt: effectiveNegative, duration: recommendedPreset.durationSeconds === 10 ? 10 : 5, fps: recommendedPreset.fps || 16, nsfw_intensity: nsfwIntensity, sync_poll_ms: 150000 }),
        });
        const videoData = await readResponseJson(videoRes).catch(() => ({} as Any));
        if (!videoRes.ok) throw new Error(videoData.error || '视频生成失败');
        if (videoData.pending) {
          setLastGenerationTrace({ model: 'Wan2.2', endpoint: 'RUNPOD_WAN_VIDEO_ENDPOINT', job_id: videoData.job_id, status: videoData.status });
          toast.message('Wan2.2 video is still in the GPU queue');
          return;
        }
        const ready = videoData.video_url ? { animation_id: videoData.job_id, video_url: videoData.video_url } : null;
        if (!ready) {
          const failed = Array.isArray(videoData.results) ? videoData.results.find((item: Any) => item.error) : null;
          throw new Error(failed?.error || '视频生成完成但未返回地址');
        }
        setLastResult([{ id: ready.animation_id, url: ready.video_url, media_type: 'video', duration_seconds: 5 }]);
        setLastGenerationTrace({ category: companionCategory, intensity: nsfwIntensity, model: 'Wan2.2', endpoint: 'RUNPOD_WAN_VIDEO_ENDPOINT', identitySource: 'selected_reference_image', loras: [] });
        toast.success('5 秒人设动画已生成并保存');
        return;
      }
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...generationBody({ prompt: effectivePrompt, negative: effectiveNegative, promptSource: 'llm' }),
          ckpt_id: fluxPreset.checkpoint,
          sampler_name: fluxPreset.sampler,
          scheduler: fluxPreset.scheduler,
          steps: fluxPreset.steps,
          cfg: fluxPreset.cfg,
          width: fluxPreset.width,
          height: fluxPreset.height,
          loras: effectiveLoras,
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '生成失败');
      setLastGenerationTrace(data.generation_trace || null);

      // Handle async pending response — poll until job completes
      if (data.pending && data.job_id) {
        setGenerationStage('queued');
        toast.message('GPU 排队中，等待出图…');
        const jobId = String(data.job_id);
        const maxPolls = 24; // status endpoint long-polls up to 8s; about 3 minutes total
        let completed = false;
        for (let i = 0; i < maxPolls; i++) {
          try {
            const activeGfId = productionGirlfriendId || girlfriendId || '';
            const pollRes = await authedFetch(`/api/runpod/status?job_id=${encodeURIComponent(jobId)}${data.endpoint_id ? `&endpoint_id=${encodeURIComponent(String(data.endpoint_id))}` : ''}&admin_source=true${activeGfId ? `&girlfriend_id=${encodeURIComponent(activeGfId)}` : ''}&asset_role=${encodeURIComponent(String(assetRole))}`);
            const pollData = await readResponseJson(pollRes).catch(() => ({} as Any));
            if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
              setGenerationStage('finalizing');
              const saved = Array.isArray(pollData.assets) && pollData.assets.length
                ? pollData.assets as Any[]
                : await finalizeAssets(jobId, pollData.images);
              if (!saved?.length) throw new Error('Generation completed but asset catalog registration failed');
              const polledAssets: Any[] = saved;
              setLastResult(polledAssets);
              if (activeGfId) {
                const libraryAssets = await persistAssetsToCompanionLibrary(activeGfId, polledAssets, 'album');
                setCompanionAssets((current) => [...libraryAssets, ...current].filter((item, index, all) =>
                  all.findIndex((candidate) => String(candidate.id || candidate.url) === String(item.id || item.url)) === index,
                ));
              }
              toast.success(`生成成功 ${polledAssets.length} 张`);
              if (tab === 'library') loadAssets();
              completed = true;
              break;
            }
            if (pollData.status === 'FAILED') {
              throw new Error(pollData.error || 'RunPod 任务失败');
            }
            // Still pending — continue polling
          } catch (pollErr) {
            if (pollErr instanceof Error && pollErr.message.includes('RunPod')) throw pollErr;
            // Network hiccup — keep polling
          }
        }
        if (!completed) {
          throw new Error('GPU 排队超时（3 分钟），请稍后重试');
        }
        return;
      }

      const assets = (data.assets || []).map((a: Any) => {
        let url = String(a.url || '').trim();
        // Bare storage key → public URL (never leave prompt text as src)
        if (url && !/^https?:\/\//i.test(url) && !url.startsWith('data:')) {
          const base =
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            process.env.NEXT_PUBLIC_COZE_SUPABASE_URL ||
            '';
          if (base && a.storage_key) {
            url = `${base.replace(/\/$/, '')}/storage/v1/object/public/portraits/${String(a.storage_key).replace(/^\/+/, '')}`;
          } else if (base && url.includes('/')) {
            url = `${base.replace(/\/$/, '')}/storage/v1/object/public/portraits/${url.replace(/^\/+/, '')}`;
          }
        }
        if (/\s/.test(url) && /masterpiece|photorealistic|raw photo/i.test(url)) {
          url = '';
        }
        return { ...a, url };
      }).filter((a: Any) => a.url && /^https?:\/\//i.test(a.url));
      if (assets.length === 0) {
        throw new Error('生成完成但没有可预览的 HTTPS 地址');
      }
      setLastResult(assets);
      if (companionId) {
        const libraryAssets = await persistAssetsToCompanionLibrary(companionId, assets, 'album');
        setCompanionAssets((current) => [...libraryAssets, ...current].filter((item, index, all) =>
          all.findIndex((candidate) => String(candidate.id || candidate.url) === String(item.id || item.url)) === index,
        ));
      }
      toast.success(`生成成功 ${assets.length} 张`);
      if (tab === 'library') loadAssets();
    } catch (e) {
      const message = e instanceof Error ? e.message : '生成失败';
      // 服务端 400：缺头像参考 → 给出可操作的中文指引
      toast.error(/avatar reference/i.test(message)
        ? '该资产需要头像参考图：请先在「管线阶段」生成半身头像，或在参考图处上传一张人设图'
        : message);
    } finally {
      setGenerating(false);
      setGenerationStage('idle');
    }
  };

  const deleteAsset = async (idOrAsset: string | Any) => {
    const id = typeof idOrAsset === 'string' ? idOrAsset : idOrAsset?.id;
    const storage_key = typeof idOrAsset === 'string' ? undefined : idOrAsset?.storage_key;
    if ((!id && !storage_key) || !confirm('删除这张图？会同时删存储文件。')) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_asset', id, storage_key }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('已删除');
      setAssets((a) => a.filter((x) => x.id !== id && x.storage_key !== storage_key));
      setLastResult((a) => a.filter((x) => x.id !== id && x.storage_key !== storage_key));
      setSelectedAssetKeys((keys) => keys.filter((k) => k !== String(id || storage_key || '')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const assetKey = (a: Any) => String(a.id || a.storage_key || a.url || '');

  const toggleSelect = (a: Any) => {
    const k = assetKey(a);
    if (!k) return;
    setSelectedAssetKeys((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const selectAllVisible = () => {
    setSelectedAssetKeys(assets.map(assetKey).filter(Boolean));
  };

  const clearSelection = () => setSelectedAssetKeys([]);

  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedAssetKeys.includes(assetKey(a))),
    [assets, selectedAssetKeys],
  );

  const batchDelete = async () => {
    if (!selectedAssets.length) {
      toast.message('先勾选图片');
      return;
    }
    if (!confirm(`批量删除 ${selectedAssets.length} 张？会同时删存储文件。`)) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch_delete_assets',
          items: selectedAssets.map((a) => ({
            id: a.id || undefined,
            storage_key: a.storage_key || undefined,
            url: a.url || undefined,
          })),
        }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '批量删除失败');
      toast.success(`已删除 ${data.deleted ?? selectedAssets.length} 张`);
      clearSelection();
      await loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量删除失败');
    }
  };

  const batchDownload = async () => {
    const list = selectedAssets.length ? selectedAssets : assets.slice(0, 20);
    if (!list.length) {
      toast.message('没有可下载的图');
      return;
    }
    toast.message(`开始下载 ${list.length} 张（浏览器可能拦截多文件）`);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const url = a.url as string;
      if (!url) continue;
      try {
        const aEl = document.createElement('a');
        aEl.href = url;
        aEl.download = `comfy_${a.id || i}.png`;
        aEl.target = '_blank';
        aEl.rel = 'noreferrer';
        document.body.appendChild(aEl);
        aEl.click();
        aEl.remove();
        await new Promise((r) => setTimeout(r, 250));
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  const onUploadFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).slice(0, 30);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('action', 'upload_assets');
      const activeGirlfriendId = productionGirlfriendId || girlfriendId;
      if (activeGirlfriendId) fd.append('girlfriend_id', activeGirlfriendId);
      fd.append('asset_role', assetRole);
      fd.append('kind', kind || 'girlfriend');
      for (const f of files) fd.append('files', f);
      const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '上传失败');
      toast.success(`上传成功 ${data.uploaded ?? files.length} 张`);
      setTab('library');
      await loadAssets();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadReferenceImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }
    setReferenceImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('action', 'upload_assets');
      fd.append('kind', 'reference');
      const activeGirlfriendId = productionGirlfriendId || girlfriendId;
      if (activeGirlfriendId) fd.append('girlfriend_id', activeGirlfriendId);
      fd.append('asset_role', assetRole);
      fd.append('files', file);
      const res = await authedFetch('/api/admin/comfy', { method: 'POST', body: fd });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(String(data.error || '参考图上传失败'));
      const uploaded = Array.isArray(data.assets) ? data.assets[0] : null;
      const url = String(uploaded?.url || '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('上传成功但未返回可用的 HTTPS 图片地址');
      setInputImage(url);
      setGenMode('img2img');
      if (activeGirlfriendId) await loadCompanionAssets(activeGirlfriendId);
      toast.success('参考图已上传并启用图生图');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '参考图上传失败');
    } finally {
      setReferenceImageUploading(false);
      if (referenceImageInputRef.current) referenceImageInputRef.current.value = '';
    }
  };


  const saveEndpoints = async () => {
    if (!config) return;
    try {
      const res = await authedFetch('/api/admin/comfy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, replace: true }),
      });
      const data = await readResponseJson(res).catch(() => ({} as Any));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setConfig(data.config);
      toast.success('配置已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    }
  };

  const resetConfig = async () => {
    if (!confirm('恢复默认 Comfy 配置？')) return;
    const res = await authedFetch('/api/admin/comfy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_config' }),
    });
    const data = await readResponseJson(res).catch(() => ({} as Any));
    if (res.ok) {
      setConfig(data.config);
      toast.success('已恢复默认');
    }
  };

  if (loading || !config) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'bg-transparent p-3 sm:p-4 text-slate-100' : 'min-h-screen bg-[#0b0f14] p-4 sm:p-6 text-slate-100'}>
      {girlfriendId ? (
        <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
          {gfLoading ? '正在载入伴侣…' : scopedGirlfriend ? (
            <span>
              按伴侣创作：<strong>{scopedGirlfriend.name || girlfriendId}</strong>
              <span className="ml-2 text-xs text-violet-200/70">资产写入 girlfriends/{girlfriendId}/ · 不进公共库</span>
            </span>
          ) : (
            <span>按伴侣创作 · ID {girlfriendId}（资料未取到也可生成）</span>
          )}
          <button
            type="button"
            className="ml-3 text-xs underline text-violet-200"
            onClick={() => {
              if (!scopedGirlfriend) return;
              fillPromptFromGirlfriend(scopedGirlfriend, { force: true, toastOn: true });
            }}
          >
            一键填充提示词
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
          公共创作模式：结果进入 comfy-outputs / 公共资产库。从「伴侣与媒体」点创作可切换为按卡隔离。
        </div>
      )}
      {!embedded && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-violet-400" />
            Comfy 出图操作台
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            工作流 · LoRA 清单一键调用 · Checkpoint（网络卷）· 图库存删
          <Link href="/admin/model-library" className="mt-2 inline-flex text-xs text-rose-300 hover:text-rose-200 underline-offset-2 hover:underline">打开 Civitai 模型库（搜索 / 入库 / 导出下载清单）→</Link>
            {config.lora_catalog_version != null && (
              <span className="ml-2 text-violet-400/80">catalog v{config.lora_catalog_version}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { loadConfig(); loadVolume(); }} className="border-slate-700">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
          </Button>
        </div>
      </div>

      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1 w-fit">
        {[
          { id: 'generate', label: '创作台', icon: Play },
          { id: 'library', label: '角色资源库', icon: ImageIcon },
          { id: 'loras', label: '模型与 LoRA', icon: Layers },
        ].map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id as typeof tab)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm',
              tab === tabItem.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >
            <tabItem.icon className="h-3.5 w-3.5" />
            {tabItem.label}
          </button>
        ))}
        </div>
        <Button size="sm" variant="outline" className={cn('border-cyan-800 text-cyan-200 h-9', tab !== 'infra' && 'hidden')} disabled={syncingInstalled} onClick={syncInstalled}>
          {syncingInstalled ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <HardDrive className="h-3.5 w-3.5 mr-1" />}
          同步盘状态
        </Button>
        <Button size="sm" variant="outline" className={cn('border-emerald-800 text-emerald-200 h-9', tab !== 'loras' && 'hidden')} onClick={async () => {
          try {
            const res = await authedFetch('/api/admin/comfy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify_loras' }) });
            const data = await res.json();
            if (data.health) {
              const h = data.health;
              if (h.inventorySource === 'unavailable') toast.warning('未取得 RunPod 运行卷清单，LoRA 只能标记为待验证');
              else if (h.suspect > 0) toast.error('发现 ' + h.suspect + ' 个疑似损坏或占位 LoRA，请重新下载');
              else if (h.missing === 0) toast.success('LoRA 真实性检查通过：' + h.ok + '/' + h.total + ' 已由运行卷确认');
              else toast.warning('运行卷缺失 ' + h.missing + ' 个 LoRA：' + h.entries.filter((e: Any) => e.status === 'missing').map((e: Any) => e.label).join(', '));
            }
          } catch { toast.error('LoRA 健康检查失败'); }
        }}>
          <CheckSquare className="h-3.5 w-3.5 mr-1" />
          LoRA检测
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn('h-9 border-violet-700 text-violet-100', batchOpen && 'bg-violet-600/25', tab !== 'generate' && 'hidden')}
          onClick={() => {
            const next = !batchOpen;
            setBatchOpen(next);
            if (next && batchGirlfriends.length === 0) void loadBatchGirlfriends();
          }}
        >
          <Users className="mr-1 h-3.5 w-3.5" /> 批量生成
          {batchSelectedIds.length ? <Badge className="ml-1.5 bg-violet-500 text-white">{batchSelectedIds.length}</Badge> : null}
        </Button>
        <span className={cn('text-[10px] text-slate-400', tab !== 'infra' && 'hidden')}>
          {volumeInfo?.inventory_source === 'runtime-volume' ? `卷上已验证 ${installedLoras.length}` : '卷清单未验证'} · {volumeInfo?.paths?.loras || config.network_volume?.loras_dir || 'models/loras'}
        </span>
      </div>

      {/* GENERATE — SD: left params sticky / right preview */}
      {tab === 'generate' && (
        <div className="space-y-4 text-slate-100">
          <section className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">统一创作入口</h2>
                <p className="mt-1 text-[11px] text-slate-400">参考图在这里统一读取：角色 ID 使用 IP-Adapter 锁定身份，换装、姿势和背景使用图生图工作流。</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={referenceImageUploading}
                onClick={() => referenceImageInputRef.current?.click()}
                className="border-cyan-600/60 text-cyan-100"
              >
                {referenceImageUploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                上传身份/取景参考
              </Button>
              <Input value={inputImage} onChange={(event) => setInputImage(event.target.value)} className="border-slate-700 bg-slate-950 text-xs font-mono" placeholder="上传后自动填入，或粘贴 HTTPS 图片地址" />
              {inputImage ? <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">参考图已生效</Badge> : <Badge variant="outline">未使用参考图</Badge>}
            </div>
            <input
              ref={referenceImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void uploadReferenceImage(event.target.files?.[0] || null)}
            />
          </section>
          <section className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Production flow</p>
                <h2 className="mt-1 text-sm font-bold text-white">选择本次创作任务</h2>
                <p className="mt-1 text-[11px] text-slate-400">先选伴侣，再沿同一身份资产继续创作。每一步都会读取该伴侣资料与资源库，不重复创建人物身份。</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className={cn('rounded-full px-2 py-1', productionGirlfriendId ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200')}>
                  {productionGirlfriendId ? '伴侣已绑定' : '尚未选择伴侣'}
                </span>
                <span>→</span><span>身份参考</span><span>→</span><span>生成结果归档</span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {([
                { id: 'identity', step: '01', title: '生成角色', note: '建立身份参考图', icon: Users },
                { id: 'portrait', step: '02', title: '生成立绘', note: '继承角色外观', icon: ImageIcon },
                { id: 'outfit', step: '03', title: '一键换装', note: 'IP-Adapter 锁身份', icon: Layers },
                { id: 'pose', step: '04', title: '一键姿势', note: '姿势参考控制', icon: Sparkles },
                { id: 'background', step: '05', title: '一键背景', note: '保持人物不变', icon: Workflow },
                { id: 'video', step: '06', title: 'Wan 2.2 视频', note: '选图生成视频', icon: Play },
              ] as const).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setStudioTask(task.id);
                    if (task.id === 'identity') applyProductionPreset('avatar-closeup');
                    if (task.id === 'portrait') applyProductionPreset('character-art');
                    if (task.id === 'outfit') applyImageTransformation('outfit');
                    if (task.id === 'pose') applyImageTransformation('pose');
                    if (task.id === 'background') applyImageTransformation('background');
                    if (task.id === 'video') { setGenMode('img2video'); applyRecommendedParameters('img2video'); }
                    requestAnimationFrame(() => document.getElementById('studio-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                  }}
                  className={cn(
                    'group rounded-lg border p-3 text-left transition',
                    studioTask === task.id ? 'border-violet-400 bg-violet-500/15 shadow-lg shadow-violet-950/30' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-900',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-500">{task.step}</span>
                    <task.icon className={cn('h-4 w-4', studioTask === task.id ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300')} />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-white">{task.title}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{task.note}</p>
                </button>
              ))}
            </div>
          </section>
          {(
          <section className="border-y border-slate-700 bg-slate-950/50 px-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">系统角色生产</h2>
                <p className="mt-1 text-[11px] text-slate-400">3 阶段自动管线：文生图半身头像（IP-Adapter 身份锚点）→ 图生图广告立绘 → 图生视频。优先读取伴侣提示词，模型、参数与 LoRA 自动路由。</p>
              </div>
              <Link href="/admin/girlfriends" className="text-xs font-medium text-violet-300 hover:text-violet-200">新建/编辑伴侣基础信息 →</Link>
            </div>
            <div className="hidden">
              <div>
                <Label className="mb-1 block text-[11px] text-slate-300">当前伴侣</Label>
                <Select value={productionGirlfriendId || 'none'} onValueChange={(id) => {
                  if (id === 'none') return;
                  const girlfriend = batchGirlfriends.find((item) => String(item.id) === id);
                  setProductionGirlfriendId(id);
                  if (girlfriend) {
                    setScopedGirlfriend(girlfriend);
                    fillPromptFromGirlfriend(girlfriend, { force: true });
                    const gender = String(girlfriend.gender || '').toLowerCase();
                    setCompanionCategory(gender.includes('trans') ? 'transgender' : gender.includes('male') && !gender.includes('female') ? 'male' : 'female');
                  }
                  setIdentityConsistency(false);
                  void loadCompanionAssets(id);
                }}>
                  <SelectTrigger className="h-10 border-slate-600 bg-slate-950 text-sm"><SelectValue placeholder="选择系统伴侣" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">选择系统伴侣…</SelectItem>
                    {batchGirlfriends.map((item) => <SelectItem key={String(item.id)} value={String(item.id)}>{String(item.name || item.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" className="mt-1 text-[10px] text-cyan-300 hover:text-cyan-200" onClick={() => void loadBatchGirlfriends()}>
                  {batchLoading ? '正在载入…' : batchGirlfriends.length ? `已载入 ${batchGirlfriends.length} 位伴侣 · 刷新` : '载入伴侣列表'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { title: '1. 管线阶段', roles: ['avatar-closeup', 'character-art'] as CharacterAssetRole[] },
                  { title: '2. 相册 / 场景', roles: ['album', 'scene'] as CharacterAssetRole[] },
                  { title: '3. 参考与辅助', roles: ['pose-reference', 'style-reference', 'composition-reference'] as CharacterAssetRole[] },
                ].map((group) => (
                  <div key={group.title} className="border-l border-slate-700 pl-3">
                    <p className="mb-2 text-[11px] font-semibold text-slate-200">{group.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.roles.map((role) => {
                        const preset = getCharacterProductionPreset(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            title={preset.description}
                            disabled={!productionGirlfriendId}
                            onClick={() => applyProductionPreset(role)}
                            className={cn(
                              'h-8 border px-2 text-[11px] font-medium transition',
                              assetRole === role ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400',
                              !productionGirlfriendId && 'cursor-not-allowed opacity-40',
                            )}
                          >
                            {preset.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {scopedGirlfriend && productionGirlfriendId ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[10px]">
                <span className="font-semibold text-emerald-200">当前伴侣</span>
                <Badge variant="outline">{String(scopedGirlfriend.name || productionGirlfriendId)}</Badge>
                {scopedGirlfriend.age ? <Badge variant="outline">{String(scopedGirlfriend.age)} 岁</Badge> : null}
                {scopedGirlfriend.gender ? <Badge variant="outline">{String(scopedGirlfriend.gender)}</Badge> : null}
                {scopedGirlfriend.occupation ? <Badge variant="outline">{String(scopedGirlfriend.occupation)}</Badge> : null}
                <span className="text-slate-400">欲望 {Number(scopedGirlfriend.base_desire || 0)} · 开发 {Number(scopedGirlfriend.base_development || 0)} · 变态 {Number(scopedGirlfriend.base_kink || 0)}</span>
                <span className="ml-auto text-slate-500">生成结果自动归档到该伴侣资源库</span>
              </div>
            ) : null}
            {productionGirlfriendId ? (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">当前伴侣资源库</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">ID 锁脸只控制头像一致性；“设为画面参考”用于换装、姿势、背景与构图。左右拖动查看更多。</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-8" disabled={referenceImageUploading} onClick={() => referenceImageInputRef.current?.click()}>
                      {referenceImageUploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                      上传图片
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setResourceLibraryOpen(true)}>查看全部</Button>
                  </div>
                </div>
                {companionAssets.length ? (
                  <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [scrollbar-color:rgb(71_85_105)_transparent] [scrollbar-width:thin]">
                    {companionAssets.map((item) => {
                      const role = String(item.meta?.asset_role || item.asset_role || 'scene');
                      return (
                        <div key={String(item.id || item.url)} className={cn('group relative w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-slate-900', inputImage === String(item.url || '') ? 'border-cyan-400 ring-1 ring-cyan-400/50' : 'border-slate-700')}>
                          <button type="button" aria-label="删除伴侣资源" title="删除" onClick={() => void deleteCompanionAsset(item)} className="absolute right-1.5 top-1.5 z-10 rounded-md border border-red-400/40 bg-black/75 p-1.5 text-red-300 opacity-0 transition hover:bg-red-950 group-hover:opacity-100 focus:opacity-100">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" className="block aspect-[2/3] w-full overflow-hidden bg-black" onClick={() => setLightboxUrl(String(item.url || ''))}>
                            {/* 资源横条按需压缩（512px 档），压缩失败自动回退原图 */}
                            <OptimizedImg src={String(item.thumbnail_url || item.url || '')} size="card" alt="伴侣资源" className="h-full w-full object-cover" />
                          </button>
                          <button type="button" onClick={() => setCompanionAssetAsReference(item)} className={cn('h-8 w-full border-t border-slate-700 px-2 text-[10px] font-semibold transition', inputImage === String(item.url || '') ? 'bg-cyan-500/20 text-cyan-100' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white')}>
                            {inputImage === String(item.url || '') ? '当前画面参考' : '设为画面参考'}
                          </button>
                          <Select value={role} onValueChange={(value) => void assignCompanionAssetRole(item, value as CharacterAssetRole)}>
                            <SelectTrigger className="h-8 rounded-none border-x-0 border-b-0 border-slate-700 bg-slate-950 px-2 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="avatar-closeup">ID 锁脸（唯一）</SelectItem>
                              <SelectItem value="pose-reference">姿势参考</SelectItem>
                              <SelectItem value="style-reference">风格参考</SelectItem>
                              <SelectItem value="composition-reference">构图参考</SelectItem>
                              <SelectItem value="character-art">立绘</SelectItem>
                              <SelectItem value="album">相册（默认）</SelectItem>
                              <SelectItem value="scene">场景</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-xs text-slate-500">暂无资源，先生成头像或上传参考图</div>}
              </div>
            ) : null}
            {productionGirlfriendId ? (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" className="bg-cyan-600 hover:bg-cyan-500" disabled={pipelineRunning || batchRunning} onClick={() => void runPipelineGeneration(productionGirlfriendId)}>
                    {pipelineRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    {pipelineRunning ? '管线生产中…' : '开始全管线生产（头像→立绘→视频）'}
                  </Button>
                  {pipelineRunning && (
                    <Button type="button" size="sm" variant="outline" className="border-red-500/50 text-red-300 hover:bg-red-950/40" onClick={() => { pipelineCancelRef.current = true; }}>
                      <X className="mr-1 h-3.5 w-3.5" /> 取消
                    </Button>
                  )}
                  <span className="text-[10px] text-slate-400">读取伴侣提示词 · 自动匹配模型与 LoRA · ID 参考存在时自动保持一致</span>
                </div>
                {/* Pipeline stage indicators */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CHARACTER_PIPELINE_STAGES.map((stage, idx) => {
                    const result = pipelineResults.find((r) => r.stageId === stage.id);
                    const status = result?.status || 'pending';
                    return (
                      <div key={stage.id} className={cn(
                        'rounded-lg border p-2 text-center transition',
                        status === 'completed' && 'border-emerald-500/60 bg-emerald-950/30',
                        status === 'running' && 'border-cyan-400/60 bg-cyan-950/30',
                        status === 'failed' && 'border-red-500/60 bg-red-950/30',
                        status === 'skipped' && 'border-slate-600 bg-slate-900/30 opacity-60',
                        status === 'pending' && 'border-slate-700 bg-slate-900/50',
                      )}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-[10px] font-bold text-slate-400">{idx + 1}</span>
                          {status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />}
                          {status === 'completed' && <CheckSquare className="h-3 w-3 text-emerald-400" />}
                          {status === 'failed' && <Trash2 className="h-3 w-3 text-red-400" />}
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-slate-200">{stage.shortLabel}</p>
                        <p className="text-[9px] text-slate-400">{stage.mode === 'txt2img' ? '文生图' : stage.mode === 'img2img' ? '图生图' : '图生视频'}</p>
                        {result?.imageUrl && (
                          <button type="button" className="group relative mx-auto mt-1 block cursor-zoom-in" onClick={() => setLightboxUrl(result.imageUrl!)}>
                            {/* 阶段缩略图按需压缩（320px 档），点击仍可打开原图大图 */}
                            <OptimizedImg src={result.imageUrl} size="thumb" alt={stage.shortLabel} className="mx-auto h-12 w-auto rounded border border-slate-700 object-contain" />
                            <span className="absolute inset-0 flex items-center justify-center rounded bg-black/50 opacity-0 transition group-hover:opacity-100"><Maximize2 className="h-4 w-4 text-white" /></span>
                          </button>
                        )}
                        {result?.error && <p className="mt-1 text-[9px] text-red-300">{result.error}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {productionGirlfriendId ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-300">当前任务：<strong className="text-cyan-200">{getCharacterProductionPreset(assetRole).label}</strong> · 自动保存至 <code>girlfriends/{productionGirlfriendId}/{assetRole}</code></span>
                <span className="flex items-center gap-2">
                  <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => { setResourceFolderFilter('all'); setResourceLibraryOpen(true); }}>
                    <FolderOpen className="mr-0.5 inline h-3 w-3" />打开资源库
                  </button>
                  <Link href={`/admin/assets?girlfriendId=${encodeURIComponent(productionGirlfriendId)}`} className="text-violet-300 hover:text-violet-200">查看角色资源文件夹 →</Link>
                </span>
              </div>
            ) : <p className="mt-3 text-[11px] text-amber-300">先选择伴侣；如果还没有角色，请到“伴侣与媒体”填写基础信息。</p>}
          </section>
          )}
          {batchOpen ? (
            <section className="rounded-xl border border-violet-500/40 bg-violet-950/20 p-3 shadow-lg shadow-violet-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-violet-300" /> 批量生产角色资产</h2>
                  <p className="mt-1 text-[11px] text-slate-300">自动读取每位伴侣资料并归档到独立目录。身份生产包包含半身头像（IP-Adapter 身份锚点）。</p>
                  <div className="mt-2 inline-flex border border-violet-500/40 bg-slate-950 p-1">
                    <button type="button" onClick={() => setBatchIdentityPack(true)} className={cn('h-7 px-2 text-[11px]', batchIdentityPack ? 'bg-violet-600 text-white' : 'text-slate-300')}>身份图组 + 立绘</button>
                    <button type="button" onClick={() => setBatchIdentityPack(false)} className={cn('h-7 px-2 text-[11px]', !batchIdentityPack ? 'bg-violet-600 text-white' : 'text-slate-300')}>仅当前任务</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={batchRunning || batchLoading} onClick={() => {
                    setBatchSelectedIds(filteredBatchGirlfriends.slice(0, batchIdentityPack ? 8 : 20).map((item) => String(item.id)));
                  }}>选择当前结果</Button>
                  <Button type="button" size="sm" variant="outline" disabled={batchRunning} onClick={() => setBatchSelectedIds([])}>清空</Button>
                  <Button type="button" size="sm" className="bg-violet-600 hover:bg-violet-500" disabled={batchRunning || batchSelectedIds.length === 0} onClick={() => void runBatchGeneration()}>
                    {batchRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                    {batchRunning ? '角色资产生产中' : batchIdentityPack ? `生成 ${batchSelectedIds.length * CHARACTER_ID_PACK.length} 项资产` : `生成 ${batchSelectedIds.length} 项资产`}
                  </Button>
                </div>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input value={batchSearch} onChange={(event) => setBatchSearch(event.target.value)} placeholder="搜索伴侣名字 / slug" className="h-9 border-slate-700 bg-slate-950 pl-8 text-sm" />
              </div>
              {batchLoading ? (
                <div className="flex h-28 items-center justify-center text-sm text-slate-300"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载伴侣列表…</div>
              ) : (
                <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {filteredBatchGirlfriends.map((item) => {
                    const id = String(item.id);
                    const checked = batchSelectedIds.includes(id);
                    const progress = batchProgress.find((entry) => entry.id === id);
                    const image = String(item.avatar_url || item.portrait_url || item.card_url || '');
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={checked}
                        disabled={batchRunning}
                        onClick={() => toggleBatchGirlfriend(id)}
                        className={cn('flex items-center gap-2 rounded-lg border p-2 text-left transition', checked ? 'border-violet-400 bg-violet-500/20' : 'border-slate-700 bg-slate-950/70 hover:border-slate-500')}
                      >
                        <div className="h-11 w-9 shrink-0 overflow-hidden rounded bg-slate-800">
                          {image ? <OptimizedImg src={image} size="thumb" alt="" className="h-full w-full object-cover" /> : <ImageIcon className="m-2 h-5 w-5 text-slate-400" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{item.name || id}</p>
                          <p className={cn('mt-0.5 text-[10px]', progress?.status === 'failed' ? 'text-red-300' : progress?.status === 'success' ? 'text-emerald-300' : progress?.status === 'running' ? 'text-cyan-300' : 'text-slate-400')}>
                            {progress?.status === 'running' ? '生成中…' : progress?.status === 'success' ? '已完成' : progress?.status === 'failed' ? '失败' : checked ? '已选择' : '待选择'}
                          </p>
                        </div>
                        {checked ? <CheckSquare className="h-4 w-4 shrink-0 text-violet-300" /> : <Square className="h-4 w-4 shrink-0 text-slate-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {batchProgress.some((item) => item.status === 'failed') ? (
                <div className="mt-2 rounded border border-red-500/30 bg-red-950/20 px-2 py-1.5 text-[10px] text-red-200">
                  {batchProgress.filter((item) => item.status === 'failed').map((item) => `${item.name}: ${item.error || '生成失败'}`).join('；')}
                </div>
              ) : null}
            </section>
          ) : null}
          <section id="studio-composer" className="scroll-mt-4 rounded-xl border border-slate-700 bg-[#111214] p-4 shadow-xl shadow-black/30">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-700 pb-3">
              {([
                ['companion', '伴侣人物'],
                ['outfit', '服装商品'],
                ['prop', '道具商品'],
                ['advert', '广告素材'],
              ] as const).map(([surface, label]) => (
                <Button
                  key={surface}
                  type="button"
                  size="sm"
                  variant={generationSurface === surface ? 'default' : 'outline'}
                  className={cn('h-8', generationSurface === surface && 'bg-violet-600 hover:bg-violet-500')}
                  onClick={() => {
                    setGenerationSurface(surface);
                    setSelectedLoras([]);
                    setLoraId('none');
                    const targetWorkflow = workflows.find((item) => item.kind === surface || (surface === 'companion' && item.kind === 'girlfriend'));
                    if (targetWorkflow) applyWorkflow(targetWorkflow);
                  }}
                >
                  {label}
                </Button>
              ))}
              <Badge className="ml-auto border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                {generationRoute.modelFamily === 'flux' ? 'CD1 · FLUX' : generationRoute.modelFamily === 'pony' ? 'CD2 · Pony Realism' : 'CD2 · Illustrious 2D'}
              </Badge>
            </div>
            <div className="mb-3 rounded-md border border-cyan-500/20 bg-cyan-950/10 p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Label className="text-[11px] text-cyan-100">生图路由 · SDXL 模型矩阵</Label>
                <Badge className={volumeInfo?.sdxl_models_ready === true
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}>
                  {volumeInfo?.sdxl_models_ready === true ? '矩阵总闸 ON' : '矩阵总闸 OFF · 回退 FLUX'}
                </Badge>
                <span className="text-[10px] text-slate-400">
                  {generationRoute.endpointId ? `端点 ${generationRoute.endpointId}` : 'SDXL 端点未配置'}
                </span>
              </div>
              <div className="grid gap-1 text-[10px] text-slate-300 sm:grid-cols-2">
                <div>底模：<span className="font-mono text-cyan-200">{generationRoute.checkpoint}</span></div>
                <div>采样：<span className="text-cyan-200">{generationRoute.steps} 步 · cfg {generationRoute.cfg} · {generationRoute.sampler} · {generationRoute.scheduler} · clip_skip {generationRoute.clipSkip}</span></div>
                <div>尺寸：<span className="text-cyan-200">{generationRoute.width}×{generationRoute.height}</span> · 预设 {generationRoute.presetId}</div>
                <div>LoRA 白名单：<span className="font-mono text-cyan-200">{generationRoute.loraPolicy.categoryEnv}</span></div>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{generationRoute.reason}</p>
            </div>            <div className="mb-3 flex flex-wrap gap-2" aria-label="角色分类">
              {COMPANION_CATEGORIES.filter((category) => category !== 'anime').map((category) => (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={companionCategory === category ? 'default' : 'outline'}
                  className={cn('h-8', companionCategory === category && 'bg-fuchsia-600 hover:bg-fuchsia-500')}
                  onClick={() => applyCategoryPrompt(category)}
                >
                  {COMPANION_CATEGORY_LABELS[category].zh}
                </Button>
              ))}
            </div>
            <div className="mb-3 grid gap-3 rounded-md border border-fuchsia-500/20 bg-fuchsia-950/10 p-3 md:grid-cols-[220px_1fr]">
              <div>
                <Label className="mb-2 block text-[11px] text-slate-200">NSFW 强度：{nsfwIntensity}/5</Label>
                <input type="range" min={1} max={5} step={1} value={nsfwIntensity} onChange={(event) => applyNsfwIntensity(Number(event.target.value) as NsfwIntensity)} className="w-full accent-rose-500" />
                <p className="mt-1 text-[10px] text-cyan-300">{activeAdultPreset ? `随机预设：${activeAdultPreset.label}` : '滑块会同步刷新提示词、模型、参数与 LoRA'}</p>
                <p className="mt-1 text-[10px] font-medium text-rose-200">当前：{studioIntensityLabel(nsfwIntensity)}</p>
                <details className="mt-2 rounded border border-rose-500/25 bg-rose-950/10 p-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-rose-100">NSFW 1–5 自定义等级描述（留空则不追加）</summary>
                  <div className="mt-2 space-y-1.5">
                    {[1, 2, 3, 4, 5].map((level) => <label key={level} className="block text-[10px] text-slate-300">等级 {level}
                      <Textarea value={nsfwDescriptions[String(level)] || ''} onChange={(event) => updateNsfwDescription(level, event.target.value)} rows={2} className="mt-1 min-h-12 border-slate-700 bg-slate-950 text-xs" placeholder="仅填写你希望该等级追加的成年、合规画面描述" />
                    </label>)}
                  </div>
                </details>
                <p className="mt-1 text-[10px] text-slate-400">滑块只更新等级、参数和 LoRA；生成时由 AI 按当前场景意图重写一次，避免重复堆叠提示词。</p>
              </div>
              <div>
                <Label className="mb-2 block text-[11px] text-slate-200">渲染风格</Label>
                <div className="flex flex-wrap gap-2">
                  {(['realistic', '2d', '3d'] as const).map((style) => (
                    <Button
                      key={style}
                      type="button"
                      size="sm"
                      variant={animeRenderStyle === style ? 'default' : 'outline'}
                      onClick={() => {
                        setAnimeRenderStyle(style);
                        setPromptProfileApplied(false);
                        applyRecommendedLoras(companionCategory, style);
                      }}
                      className={cn('h-8', animeRenderStyle === style && 'bg-violet-600')}
                    >
                      {style === 'realistic' ? '写实实拍' : style === '2d' ? '2D 动漫' : '3D 动画'}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">路由规则：写实 → SDXL·Pony Realism；2D 动漫 → SDXL·Illustrious；3D 与产品资产 → FLUX；矩阵总闸关闭时全部 fail-open 回 FLUX。画风不改变女性、男性或跨性别的身体逻辑。</p>
              </div>
            </div>
            <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
              <Label className="mb-2 block text-[11px] text-slate-200">构图取景（景别与机位同时生效）</Label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] text-slate-500">景别</span>
                {CAMERA_FRAMINGS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={cameraFraming === item.id ? 'default' : 'outline'}
                    className={cn('h-8', cameraFraming === item.id && 'bg-cyan-600 hover:bg-cyan-500')}
                    onClick={() => { setCameraFraming(item.id); toast.success(`已应用${item.label}景别`); }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                <span className="mr-1 text-[10px] text-slate-500">机位</span>
                {CAMERA_ANGLES.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={cameraAngle === item.id ? 'default' : 'outline'}
                    className={cn('h-8', cameraAngle === item.id && 'bg-cyan-600 hover:bg-cyan-500')}
                    onClick={() => { setCameraAngle(item.id); toast.success(`已应用${item.label}机位`); }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-cyan-300/80">当前最终控制：{CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.label} · {CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.label}</p>
            </div>
            <div className="mb-2 flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 border-cyan-500/40 text-cyan-200" onClick={() => appendPromptControl(`${CAMERA_FRAMINGS.find((item) => item.id === cameraFraming)?.prompt || ''}, ${CAMERA_ANGLES.find((item) => item.id === cameraAngle)?.prompt || ''}`, '当前取景')}>+ 添加当前取景到提示词</Button>
            </div>
            <div className="mb-3 rounded-lg border border-violet-500/25 bg-violet-950/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-[11px] text-violet-100">提示词追加控制</Label>
                <span className="text-[10px] text-slate-400">不会替换伴侣提示词，可分别叠加光线、质量、服装、场景和动作</span>
              </div>
              <div className="space-y-2">
                {getPromptAppendPresets(nsfwIntensity).map((group) => (
                  <div key={group.group} className="flex flex-wrap items-center gap-2">
                    <span className="w-9 shrink-0 text-[10px] font-semibold text-violet-300">{group.group}</span>
                    {group.items.map((item) => (
                      <Button key={item.label} type="button" size="sm" variant="outline" className="h-8 border-violet-500/35 text-violet-100" onClick={() => appendPromptControl(item.prompt, item.label)}>
                        + {item.label}
                      </Button>
                    ))}
                  </div>
                ))}
                <div className="mt-2 grid gap-2 border-t border-violet-500/20 pt-2 md:grid-cols-[180px_1fr_auto]">
                  <Input value={promptAddTitle} onChange={(event) => setPromptAddTitle(event.target.value)} placeholder="追加项标题" className="h-8 border-violet-500/30 bg-slate-950 text-xs" />
                  <Input value={promptAddContent} onChange={(event) => setPromptAddContent(event.target.value)} placeholder="追加项内容" className="h-8 border-violet-500/30 bg-slate-950 text-xs" />
                  <Button type="button" size="sm" className="h-8 bg-violet-600 hover:bg-violet-500" onClick={savePromptAdd}>添加</Button>
                </div>
                {customPromptAdds.length > 0 && <div className="flex flex-wrap gap-2">
                  {customPromptAdds.map((item) => <div key={item.id} className="flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-950/20">
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-violet-100" onClick={() => appendPromptControl(item.content, item.title)}>+ {item.title}</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-1 text-rose-300" onClick={() => removePromptAdd(item.id)} aria-label={`删除追加项 ${item.title}`}>×</Button>
                  </div>)}
                </div>}
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white">正向提示词 · 人物 + 做什么</h2>
                <p className="text-[11px] text-slate-300">使用自然语言描述成年 AI 伴侣及其正在进行的性感、妩媚或亲密动作。</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 gap-1 border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10" onClick={optimizePromptWithLlm} disabled={optimizingPrompt} title="读取任务、NSFW、模型、LoRA、取景和当前提示词后立即优化">
                  {optimizingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {optimizingPrompt ? 'AI 编译中' : 'AI 优化提示词'}
                </Button>
                <Badge className="border-violet-400/40 bg-violet-500/15 text-violet-100">{prompt.length} 字符</Badge>
              </div>
            </div>
            <div className="hidden mb-2 flex items-center gap-2 rounded-md border border-cyan-500/20 bg-cyan-950/10 p-2">
              <Label htmlFor="flux-prompt-preset" className="shrink-0 text-[11px] text-cyan-100">提示词方案 · NSFW {nsfwIntensity}/5</Label>
              <select
                id="flux-prompt-preset"
                value={selectedPromptPreset}
                onChange={(event) => applyFluxPromptPreset(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950 px-2 text-xs text-white"
              >
                <option value="random">随机调用当前等级方案</option>
                {getFluxPromptPresets({ category: companionCategory, style: animeRenderStyle, intensity: nsfwIntensity }).map((item, index) => (
                  <option key={item.id} value={item.id}>方案 {index + 1}</option>
                ))}
              </select>
            </div>
            <div className="mb-2 grid gap-2 rounded-md border border-cyan-500/20 bg-cyan-950/10 p-2 md:grid-cols-[1fr_auto]">
              <Input value={promptTitle} onChange={(event) => setPromptTitle(event.target.value)} placeholder="保存标题" className="h-8 border-slate-600 bg-slate-950 text-xs text-white" />
              <Button type="button" size="sm" className="h-8 bg-cyan-600 text-white hover:bg-cyan-500" onClick={savePrompt}>保存当前提示词</Button>
              <select value={selectedSavedPrompt} onChange={(event) => loadSavedPrompt(event.target.value)} className="h-8 rounded-md border border-slate-600 bg-slate-950 px-2 text-xs text-white md:col-span-2">
                <option value="">选择已保存提示词（可选）</option>
                {savedPrompts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_180px]">
              <Textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); setPromptProfileApplied(true); setSelectedPromptPreset('manual'); }} rows={4} className="min-h-28 resize-y border-slate-600 bg-[#0b0c0e] text-sm leading-6 text-white placeholder:text-slate-400 focus-visible:ring-violet-500" placeholder="例如：一位成年女性穿着红色连衣裙，站在窗边，侧身看向镜头。" />
              <Button className="min-h-28 bg-slate-100 text-base font-bold !text-slate-950 hover:bg-white" disabled={generating} onClick={generate}>
                {generating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
                {generationStage === 'submitting'
                  ? '正在提交…'
                  : generationStage === 'queued'
                    ? 'GPU 生成中…'
                    : generationStage === 'finalizing'
                      ? '正在保存…'
                      : '生成'}
              </Button>
            </div>
            <details className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-cyan-100">实际提交提示词 · {genMode === 'img2video' ? 'WAN 2.2' : generationRoute.modelFamily.toUpperCase()} · {studioTask}</summary>
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-300">{resolvedTaskPrompt}</p>
              <p className="mt-2 text-[10px] text-slate-500">该提示词由当前任务、模型族、兼容 LoRA 触发词和参考图角色编译；不会跨模型复用语法。</p>
            </details>
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-semibold text-slate-300">反向提示词</div>
              <Textarea value={negative} onChange={(e) => setNegative(e.target.value)} rows={2} className="min-h-16 resize-y border-slate-700 bg-[#0b0c0e] font-mono text-xs leading-5 text-slate-200 placeholder:text-slate-600 focus-visible:ring-rose-500" placeholder="blurry, bad anatomy, underage, watermark…" />
            </div>
          </section>

          <section className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-cyan-500/30 bg-cyan-950/20 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-cyan-100">推荐参数 · {recommendedPreset.label}</div>
              <div className="mt-1 text-[11px] text-slate-300">
                {recommendedPreset.modelFamily} · {recommendedPreset.sampler} / {recommendedPreset.scheduler} · Steps {recommendedPreset.steps} · CFG {recommendedPreset.cfg} · {recommendedPreset.width}×{recommendedPreset.height}
                {recommendedPreset.denoise != null ? ` · Denoise ${recommendedPreset.denoise.toFixed(2)}` : ''}
                {recommendedPreset.durationSeconds ? ` · ${recommendedPreset.durationSeconds} 秒 / ${recommendedPreset.frames} 帧` : ''}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">{recommendedPreset.reason}</div>
            </div>
            <button
              type="button"
              aria-pressed={fastPreview}
              onClick={() => {
                const next = !fastPreview;
                setFastPreview(next);
                toast.message(next ? '已开启极速预览：优先快速确认构图' : '已切换完整质量模式');
              }}
              className={cn(
                'rounded-md border px-3 py-2 text-xs font-semibold transition',
                fastPreview ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-slate-600 text-slate-300',
              )}
            >
              {fastPreview ? '极速预览 · 开' : '完整质量'}
            </button>
            <Button type="button" size="sm" variant="outline" className="border-cyan-500/50 text-cyan-100" onClick={() => { const preset = applyRecommendedParameters(); toast.success(`已应用${preset.label}`); }}>
              应用推荐参数
            </Button>
          </section>
          <section className="hidden gap-3 rounded-md border border-slate-700 bg-[#17181b] p-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">采样方法 (Sampler)</Label>
              <Select value={sampler} onValueChange={setSampler}>
                <SelectTrigger className="h-9 border-slate-600 bg-[#0b0c0e] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="euler">Euler（FLUX 推荐）</SelectItem>
                  <SelectItem value="euler_ancestral">Euler ancestral</SelectItem>
                  <SelectItem value="dpmpp_2m">DPM++ 2M</SelectItem>
                  <SelectItem value="dpmpp_2m_sde">DPM++ 2M SDE</SelectItem>
                  <SelectItem value="dpmpp_sde">DPM++ SDE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">调度类型 (Scheduler)</Label>
              <Select value={scheduler} onValueChange={setScheduler}>
                <SelectTrigger className="h-9 border-slate-600 bg-[#0b0c0e] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple（FLUX 推荐）</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="karras">Karras</SelectItem>
                  <SelectItem value="sgm_uniform">SGM Uniform</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-300"><span>迭代步数 (Steps)</span><span>{steps}</span></div>
              <input type="range" min={8} max={50} step={1} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="mt-2 w-full accent-violet-500" />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">生成尺寸</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min={256} max={2048} step={64} value={width} onChange={(event) => setWidth(Number(event.target.value))} className="h-9 border-slate-600 bg-[#0b0c0e] text-xs" aria-label="宽度" />
                <Input type="number" min={256} max={2048} step={64} value={height} onChange={(event) => setHeight(Number(event.target.value))} className="h-9 border-slate-600 bg-[#0b0c0e] text-xs" aria-label="高度" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">CFG</Label>
              <Input type="number" min={0.5} max={20} step={0.5} value={cfg} onChange={(event) => setCfg(Number(event.target.value))} className="h-9 border-slate-600 bg-[#0b0c0e] text-xs" />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">Seed（-1 随机）</Label>
              <Input type="number" min={-1} value={seed} onChange={(event) => setSeed(Number(event.target.value))} className="h-9 border-slate-600 bg-[#0b0c0e] text-xs" />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-300"><span>Denoise</span><span>{denoise.toFixed(2)}</span></div>
              <input type="range" min={0.05} max={1} step={0.05} value={denoise} onChange={(event) => setDenoise(Number(event.target.value))} disabled={genMode === 'txt2img'} className="mt-2 w-full accent-violet-500 disabled:opacity-35" />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-slate-300">生成数量</Label>
              <Input type="number" min={1} max={4} value={imageCount} onChange={(event) => setImageCount(Math.min(4, Math.max(1, Number(event.target.value))))} className="h-9 border-slate-600 bg-[#0b0c0e] text-xs" />
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(460px,1fr)_minmax(520px,1fr)] gap-4 items-start">
          <div className="space-y-3 xl:sticky xl:top-14 xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto pr-0.5">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-lg shadow-black/20">
              <div className="text-xs font-semibold text-slate-100 mb-2 flex items-center gap-1">
                <Settings2 className="h-3.5 w-3.5" /> 生成模式
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: 'txt2img' as const, label: '文生图', icon: FileImage },
                  { id: 'img2img' as const, label: '图生图', icon: ImagePlus },
                  { id: 'img2video' as const, label: '图生视频', icon: Play },
                ]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setGenMode(m.id);
                      const preset = applyRecommendedParameters(m.id);
                      setPromptProfileApplied(false);
                      toast.success(`已应用${preset.label}参数`);
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px]',
                      genMode === m.id
                        ? 'border-violet-400 bg-violet-600/60 !text-white'
                        : 'border-slate-500 bg-slate-950 !text-slate-100 hover:border-violet-400 hover:!text-white',
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={identityConsistency}
                onClick={() => setIdentityConsistency((enabled) => {
                  const next = !enabled;
                  if (next && genMode === 'img2img') setDenoise((value) => Math.min(value, 0.45));
                  return next;
                })}
                className={cn(
                  'hidden mt-2 w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition',
                  identityConsistency
                    ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-50'
                    : 'border-slate-600 bg-slate-950/60 text-slate-300 hover:border-slate-500',
                )}
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  {identityConsistency ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4" />}
                  人物一致性
                </span>
                <span className="text-[10px] opacity-80">
                  {identityConsistency
                    ? girlfriendId ? '已锁定当前伴侣特征' : '需先选择伴侣卡'
                    : '关闭'}
                </span>
              </button>
              <div className="hidden mt-3 border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">混合参考控制</span>
                  <button
                    type="button"
                    aria-pressed={referenceAutoSelect}
                    onClick={() => setReferenceAutoSelect((value) => !value)}
                    className={cn('text-[11px] font-medium', referenceAutoSelect ? 'text-cyan-300' : 'text-slate-400')}
                  >
                    {referenceAutoSelect ? '自动匹配已开启' : '自动匹配已关闭'}
                  </button>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  身份图只取当前伴侣；动作、构图和风格参考严格匹配性别、写实/2D/3D 与模型族。
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    ['身份', identityStrength, setIdentityStrength],
                    ['动作', poseStrength, setPoseStrength],
                    ['风格', styleStrength, setStyleStrength],
                    ['构图', compositionStrength, setCompositionStrength],
                  ].map(([label, value, setter]) => (
                    <label key={String(label)} className="text-[10px] text-slate-300">
                      <span className="flex justify-between"><span>{String(label)}</span><span>{Number(value).toFixed(2)}</span></span>
                      <input type="range" min={0} max={1} step={0.05} value={Number(value)} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))} className="w-full accent-cyan-500" />
                    </label>
                  ))}
                </div>
                <label className="mt-2 flex items-center justify-between text-[10px] text-slate-300">
                  <span>最多参考图</span>
                  <input type="number" min={1} max={8} value={referenceMax} onChange={(event) => setReferenceMax(Math.min(8, Math.max(1, Number(event.target.value))))} className="h-7 w-16 rounded border border-slate-600 bg-slate-950 px-2 text-right text-xs" />
                </label>
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
                文生图优先使用伴侣卡肖像保持身份；图生图把上传图片作为姿势与构图参考，人物仍以伴侣卡的脸型、发色、眼睛和身材为准。
              </p>
            </div>

            <div className="hidden rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-white">快速预设</div>
                <Badge variant="outline" className="text-[10px]">中文</Badge>
              </div>
              <div className="flex gap-1.5">
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} className="h-8 border-slate-600 bg-slate-950 text-xs text-white" placeholder="新预设名称" />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 border-slate-500 text-white" onClick={saveCurrentPreset}>保存当前</Button>
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-80 overflow-y-auto">
                {[...getPresetsForCategory(companionCategory), ...customPresets].map((pr) => (
                  <div key={pr.id} className="flex items-stretch rounded-lg border border-slate-600 bg-slate-950 hover:border-pink-400">
                    <button type="button" onClick={() => applyPreset(pr)} className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-100">
                        {pr.name}
                        {pr.nsfw ? <span className="rounded bg-rose-500/25 px-1 text-[9px] font-bold leading-4 text-rose-300">18+</span> : null}
                      </div>
                      <div className="text-[11px] text-slate-100">{pr.desc}</div>
                    </button>
                    {pr.id.startsWith('custom-') && (
                      <button type="button" className="px-2 text-red-300 hover:bg-red-950/40 hover:text-red-100" aria-label={`删除预设 ${pr.name}`} onClick={() => persistCustomPresets(customPresets.filter((item) => item.id !== pr.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-lg shadow-black/20 [&_label]:font-medium [&_label]:text-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-400">Sampler</Label>
                  <Select value={sampler} onValueChange={setSampler}>
                    <SelectTrigger className="h-9 border-slate-700 bg-slate-950 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="euler">Euler（FLUX 推荐）</SelectItem>
                      <SelectItem value="euler_ancestral">Euler ancestral</SelectItem>
                      <SelectItem value="dpmpp_2m">DPM++ 2M</SelectItem>
                      <SelectItem value="dpmpp_2m_sde">DPM++ 2M SDE</SelectItem>
                      <SelectItem value="dpmpp_sde">DPM++ SDE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-slate-400">Scheduler</Label>
                  <Select value={scheduler} onValueChange={setScheduler}>
                    <SelectTrigger className="h-9 border-slate-700 bg-slate-950 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple（FLUX 推荐）</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="karras">Karras</SelectItem>
                      <SelectItem value="sgm_uniform">SGM Uniform</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                <Settings2 className="h-4 w-4" /> 参数
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-slate-400">工作流</Label>
                  <Select value={workflowId} onValueChange={(id) => {
                    if (id === 'auto') {
                      setWorkflowId('auto');
                      applyRecommendedParameters(genMode, nsfwIntensity);
                      toast.success('已使用任务自动工作流，不锁定构图');
                      return;
                    }
                    const wf = workflows.find((w) => w.id === id);
                    if (wf) applyWorkflow(wf, undefined, { preservePrompt: true });
                    else setWorkflowId(id);
                  }}>
                    <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动工作流 · 跟随任务与取景</SelectItem>
                      {workflows.map((w) => (<SelectItem key={w.id} value={w.id}>{w.name}（手动）</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[10px] text-cyan-300/80">自动模式不会写入固定 3/4 全身构图。</p>
                </div>
                <div>
                  <Label className="text-[11px] text-slate-400">端点</Label>
                  <Select value={endpointKey} onValueChange={setEndpointKey}>
                    <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{endpoints.map((e) => (<SelectItem key={e.id} value={e.id}>{e.label || e.id}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Checkpoint</Label>
                <Select value={ckptId} onValueChange={setCkptId}>
                  <SelectTrigger className="h-9 bg-slate-950 border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{(studioCheckpoints.length ? studioCheckpoints : checkpoints).map((c) => (<SelectItem key={c.id} value={c.id}>{c.label || c.filename || c.id}</SelectItem>))}</SelectContent>
                </Select>
                <p className="mt-1 text-[10px] leading-4 text-cyan-300/80">
                  自动路由：NSFW {nsfwIntensity}/5 · {animeRenderStyle} · {generationRoute.modelFamily.toUpperCase()} · {generationRoute.reason}
                </p>
              </div>
              <div>
                <Label className="text-[11px] flex items-center justify-between">
                  <span>LoRA 叠加（最多 4 个）</span>
                  <span className="text-[10px] text-cyan-300">已选 {selectedLoras.length}</span>
                </Label>
                <p className="mb-1 text-[10px] text-slate-400">仅显示与当前 {generationRoute.modelFamily.toUpperCase()} 模型兼容的 LoRA；用途和建议强度见下方。</p>
                <Select value="none" onValueChange={(id) => {
                  if (id === 'none') return;
                  const l = loras.find((x) => x.id === id);
                  if (!l) return;
                  setLoraId(id);
                  setLoraStrength(l.default_strength ?? 0.7);
                  setSelectedLoras((current) => current.some((item) => item.id === id)
                    ? current
                    : [...current, { id, strength: l.default_strength ?? 0.7 }].slice(-4));
                }}>
                  <SelectTrigger className="h-9 bg-slate-950 border-slate-600 text-xs text-slate-100"><SelectValue placeholder="添加 LoRA…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">添加 LoRA…</SelectItem>
                    {loras.map((l) => {
                      const fn = String(l.filename || '');
                      const on = !fn || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(fn));
                      return (
                        <SelectItem key={l.id} value={l.id} className="py-2">
                          <div className="max-w-[420px]">
                            <div className="text-xs font-medium text-slate-100">
                              {on ? '● ' : '○ '}{String(l.label || l.id).replace(/^\[[^\]]+\]\s*/, '')}
                            </div>
                            <div className="mt-0.5 whitespace-normal text-[10px] leading-4 text-slate-400">
                              用途：{loraUsageZh(l)}
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {selectedLoras.length > 0 && (
                <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-950/20 p-2.5">
                  {selectedLoras.map((selection) => {
                    const asset = loras.find((item) => item.id === selection.id);
                    const filename = String(asset?.filename || '');
                    const onDisk = !filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(filename));
                    return (
                      <div key={selection.id} className="rounded-md border border-slate-700 bg-slate-950 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-white">{asset?.label || selection.id}</p>
                            <p className={cn('truncate text-[10px] font-mono', onDisk ? 'text-cyan-300' : 'text-amber-300')}>
                              {onDisk ? filename : `${filename} · 未在盘上`}
                            </p>
                            <p className="mt-1 text-[10px] leading-4 text-slate-400">用途：{asset ? loraUsageZh(asset) : '用途尚未识别'}</p>
                          </div>
                          <button type="button" className="text-slate-300 hover:text-red-300" onClick={() => {
                            setSelectedLoras((current) => current.filter((item) => item.id !== selection.id));
                            if (loraId === selection.id) setLoraId('none');
                          }} aria-label={`移除 ${asset?.label || selection.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <input type="range" min={0} max={1.2} step={0.05} value={selection.strength} onChange={(event) => {
                            const strength = Number(event.target.value);
                            setSelectedLoras((current) => current.map((item) => item.id === selection.id ? { ...item, strength } : item));
                          }} className="w-full accent-violet-500" />
                          <span className="w-9 text-right text-[11px] font-semibold text-violet-200">{selection.strength.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" className="text-[10px] font-medium text-slate-300 hover:text-white" onClick={() => { setSelectedLoras([]); setLoraId('none'); }}>
                    清空全部 LoRA
                  </button>
                </div>
              )}
              <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3">
                <div className="mb-2 flex items-center justify-between"><div><h3 className="text-xs font-semibold text-cyan-100">增强参数</h3><p className="text-[10px] text-slate-400">位于 LoRA 下方；只提交已安装且已勾选的节点</p></div><span className="text-[10px] text-slate-500">最终值随本次生成提交</span></div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([['controlnet', 'ControlNet', controlnetStrength, setControlnetStrength, 0, 1, 0.05], ['adetailer', 'ADetailer', adetailerStrength, setAdetailerStrength, 0, 1, 0.05], ['upscale', '高清修复倍率', upscaleScale, setUpscaleScale, 1, 2, 0.1]] as const).map(([key, label, value, setter, min, max, step]) => <label key={key} className="rounded border border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-200"><span className="flex items-center justify-between"><span><input type="checkbox" className="mr-1" checked={enhancers[key]} disabled={enhancerStatus[key] === false} onChange={(event) => setEnhancers((current) => ({ ...current, [key]: event.target.checked }))} />{label}</span><span className={enhancerStatus[key] ? 'text-emerald-300' : 'text-slate-500'}>{enhancerStatus[key] ? '就绪' : enhancerStatus[key] === false ? '未安装' : '检查中'}</span></span><input className="mt-2 w-full accent-cyan-500" type="range" min={min} max={max} step={step} value={value} onChange={(event) => setter(Number(event.target.value))} disabled={!enhancers[key] || enhancerStatus[key] === false} /><span className="block text-right text-cyan-200">{Number(value).toFixed(2)}</span></label>)}
                </div>
              </div>
              {(genMode === 'img2img' || genMode === 'img2video') && (
                <div className="space-y-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] text-amber-200/90">参考图</Label>
                    <div className="flex items-center gap-1.5">
                      {(productionGirlfriendId || girlfriendId) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => { setResourceFolderFilter('all'); setResourceLibraryOpen(true); }}
                          className="h-7 border-cyan-700/60 bg-cyan-950/40 px-2 text-[11px] text-cyan-100 hover:bg-cyan-900/50"
                        >
                          <FolderOpen className="mr-1 h-3 w-3" />
                          从资源库选择
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={referenceImageUploading}
                        onClick={() => referenceImageInputRef.current?.click()}
                        className="h-7 border-amber-700/60 bg-amber-950/40 px-2 text-[11px] text-amber-100 hover:bg-amber-900/50"
                      >
                        {referenceImageUploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                        上传图片
                      </Button>
                    </div>
                  </div>
                  <Input value={inputImage} onChange={(e) => setInputImage(e.target.value)} className="bg-slate-950 border-slate-700 text-xs font-mono" placeholder="也可粘贴 HTTPS 图片地址" />
                  {inputImage ? (
                    <div className="flex items-center gap-2 rounded border border-white/10 bg-black/20 p-1.5">
                      <OptimizedImg src={inputImage} size="thumb" alt="参考图预览" className="h-16 w-12 rounded object-cover" />
                      <div className="min-w-0 flex-1 text-[10px] text-slate-300">
                        <p className="font-medium text-amber-100">已启用参考图</p>
                        <p className="truncate">{inputImage}</p>
                      </div>
                      <button type="button" onClick={() => setInputImage('')} className="px-1 text-[10px] text-slate-400 hover:text-white">清除</button>
                    </div>
                  ) : null}
                  {genMode === 'img2img' && (
                    <div>
                      <Label className="text-[11px] text-slate-400">Denoise {denoise.toFixed(2)}</Label>
                      <input type="range" min={0.15} max={0.95} step={0.05} value={denoise} onChange={(e) => setDenoise(Number(e.target.value))} className="w-full accent-amber-500" />
                      {identityConsistency ? <p className="mt-1 text-[10px] text-cyan-200/80">一致性开启时服务端会将有效 Denoise 限制在 0.45 以内，降低换脸和体貌漂移。</p> : null}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px] text-slate-400">宽</Label><Input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">高</Label><Input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">Steps</Label><Input type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">CFG</Label><Input type="number" step={0.1} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-400">Seed</Label><Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
                <div><Label className="text-[11px] text-slate-200">生成数量</Label><Select value={String(imageCount)} onValueChange={(value) => setImageCount(Number(value))}><SelectTrigger className="h-9 border-slate-600 bg-slate-950 text-xs text-white"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((count) => <SelectItem key={count} value={String(count)}>{count} 张</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="text-[11px] text-slate-400">kind</Label><Input value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 bg-slate-950 border-slate-700 text-xs" /></div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 min-h-[calc(100vh-11rem)] flex flex-col shadow-xl shadow-black/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-violet-400" /> 输出预览
              </div>
              <div className="text-[11px] font-medium text-slate-300">
                {genMode === 'txt2img' && '文生图'}
                {genMode === 'img2img' && '图生图'}
                {genMode === 'img2video' && '图生视频 · 默认 5 秒'}
              </div>
            </div>
            {lastGenerationTrace && (
              <div className="mb-3 border border-cyan-800/70 bg-cyan-950/30 p-3 text-xs text-slate-200">
                <div className="mb-2 font-semibold text-cyan-300">本次生成链路</div>
                <div>基础信息：{String(lastGenerationTrace.identitySource || 'manual_prompt')}</div>
                <div>分类 / 强度：{String(lastGenerationTrace.category || '-')} / {String(lastGenerationTrace.intensity || '-')}</div>
                <div>模型：{String(lastGenerationTrace.checkpoint || '-')}</div>
                <div>参数：Steps {String(lastGenerationTrace.steps || '-')} / CFG {String(lastGenerationTrace.cfg || '-')} / FLUX Guidance {String(lastGenerationTrace.fluxGuidance || '-')} / {String(lastGenerationTrace.sampler || '-')} / {String(lastGenerationTrace.scheduler || '-')}</div>
                <div>参考图重绘：{lastGenerationTrace.referenceDenoise == null ? '未使用' : String(lastGenerationTrace.referenceDenoise)}</div>
                <div className="mt-2 text-cyan-200">实际 LoRA：</div>
                <div className="break-all text-slate-300">
                  {Array.isArray(lastGenerationTrace.loras) && lastGenerationTrace.loras.length
                    ? lastGenerationTrace.loras.map((item: Any) => String(item.name) + ' (' + Number(item.strength_model || 0).toFixed(2) + ')').join(' / ')
                    : '未加载 LoRA'}
                </div>
              </div>
            )}
            {generating && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400 py-16">
                <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
                <p className="text-sm">RunPod 排队 / 推理中…</p>
              </div>
            )}
            {!generating && lastResult.length === 0 && (
              <div className="flex flex-1 min-h-[560px] flex-col items-center justify-center border border-dashed border-slate-600 bg-slate-950/70 rounded-lg text-slate-300 text-sm py-20">
                <ImageIcon className="h-10 w-10 mb-3 opacity-40" />
                生成结果会出现在这里
              </div>
            )}
            {!generating && lastResult.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lastResult.map((a, idx) => (
                  <div key={a.id || a.url || idx} className="rounded-lg border border-slate-700 overflow-hidden bg-black/40">
                    {a.media_type === 'video' ? (
                      <video src={a.url} controls loop playsInline className="w-full max-h-[70vh] bg-black" />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={a.url} alt="" className="w-full object-contain max-h-[70vh] bg-black" />
                    )}
                    <div className="p-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-700 flex-1" onClick={async () => { try { await navigator.clipboard.writeText(a.url || ''); toast.success('已复制 URL'); } catch { toast.message(a.url || ''); } }}>
                        <Copy className="h-3 w-3 mr-1" /> 复制
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-700" onClick={() => { setInputImage(a.url || ''); setGenMode('img2img'); toast.message('已设为参考图'); }}>
                        作参考
                      </Button>
                      {a.media_type !== 'video' ? (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] border-cyan-800 text-cyan-300" onClick={() => {
                          setInputImage(a.url || '');
                          setGenMode('img2video');
                          setAssetRole('character-art');
                          setPromptProfileApplied(false);
                          toast.message('已选择该立绘/相册图片，可直接生成 5 秒视频');
                        }}>
                          <Play className="mr-1 h-3 w-3" />生成视频
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" className="h-7 text-[10px] border-red-900 text-red-400" onClick={() => deleteAsset(a)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      )}


      {/* LORA CATALOG */}
      {tab === 'loras' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold flex items-center gap-2 text-violet-300">
                  <Sparkles className="h-4 w-4" />
                  LoRA 功能与用法
                </h2>
                <p className="mt-1 text-xs text-slate-400 max-w-2xl">
                  面向人物动作（NSFW）、服装、道具、身材。底座仅 FLUX（与 fp8 配套）。
                  文件放在网络卷 <code className="text-cyan-400">models/loras/</code>，
                  文件名须与下方 <code className="text-cyan-400">filename</code> 一致。
                  一键下载：<code className="text-violet-300">scripts/runpod/download-loras.sh</code>
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setLoraFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px]',
                    loraFilter === 'all' ? 'bg-violet-600' : 'bg-slate-800 text-slate-400',
                  )}
                >
                  全部
                </button>
                {CAT_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLoraFilter(c)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px]',
                      loraFilter === c ? 'bg-violet-600' : 'bg-slate-800 text-slate-400',
                    )}
                  >
                    {CAT_LABEL[c] || c}
                  </button>
                ))}
              </div>
            </div>

            {stackingTips.length > 0 && (
              <ul className="mt-3 grid sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                {stackingTips.map((t, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-violet-400 shrink-0">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recipes */}
          {recipes.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="text-sm font-semibold text-amber-200/90 flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4" /> 快捷配方（一键填工作流 + LoRA + 提示词）
              </h3>
              <div className="flex flex-wrap gap-2">
                {recipes.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    className="bg-amber-700/80 hover:bg-amber-600 h-8 text-xs"
                    onClick={() => applyRecipe(r)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped list */}
          {CAT_ORDER.filter((c) => lorasByCat[c]?.length).map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-1">
                {CAT_LABEL[cat] || cat}
                <span className="ml-2 text-[10px] font-normal text-slate-400">
                  {lorasByCat[cat].length} 个
                </span>
              </h3>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {lorasByCat[cat].map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      'rounded-xl border p-3 space-y-2 bg-slate-900/50',
                      loraId === l.id ? 'border-violet-500' : 'border-slate-800',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm text-white">
                          {String(l.label || '').replace(/^\[[^\]]+\]\s*/, '')}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {l.nsfw && (
                            <Badge className="text-[9px] bg-rose-900/60 text-rose-100">NSFW</Badge>
                          )}
                          <Badge className={cn('text-[9px]', (!l.filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(String(l.filename)))) ? 'bg-emerald-900/50 text-emerald-100' : 'bg-amber-900/40 text-amber-100')}>
                            {(!l.filename || (volumeInfo?.inventory_source === 'runtime-volume' && installedSet.has(String(l.filename)))) ? '卷上已验证' : volumeInfo?.inventory_source === 'runtime-volume' ? '卷上缺失' : '待验证'}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] border-slate-600">
                            强度 {l.default_strength}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 bg-violet-600 shrink-0"
                        onClick={() => applyLora(l)}
                      >
                        一键调用
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed"><span className="font-semibold text-violet-300">用途：</span>{l.description_zh || l.usage || loraUsageZh(l)}</p>
                    {l.compatibility_zh && <p className="text-[10px] text-cyan-300/80"><span className="font-semibold">适用模型：</span>{l.compatibility_zh}</p>}
                    {l.authenticity_zh && <p className="text-[10px] text-emerald-300/80"><span className="font-semibold">真实性：</span>{l.authenticity_zh}</p>}
                    {l.risk_zh && <p className="text-[10px] text-amber-300/80"><span className="font-semibold">注意：</span>{l.risk_zh}</p>}
                    <p className="text-[10px] font-mono text-cyan-400/70 break-all">{l.filename}</p>
                    {(l.trigger_words?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {l.trigger_words.map((t: string) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] border-slate-700 flex-1"
                        onClick={() => applyLora(l, { appendTriggers: true })}
                      >
                        调用并跳转生成
                      </Button>
                      {l.page_url && (
                        <a
                          href={l.page_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center h-7 px-2 rounded border border-slate-700 text-[10px] text-slate-400 hover:text-white"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(lorasByCat).length === 0 && (
            <div className="text-center text-slate-400 text-sm py-12">该分类暂无 LoRA</div>
          )}
        </div>
      )}

      {/* LIBRARY */}
      {tab === 'library' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">生成图库</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                支持多选 · 批量上传 / 下载 / 删除 · 单张可作参考图
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => onUploadFiles(e.target.files)}
              />
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-500"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                批量上传
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={batchDownload}>
                <Download className="h-3.5 w-3.5 mr-1" /> 下载{selectedAssetKeys.length ? `(${selectedAssetKeys.length})` : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-900 text-red-300"
                onClick={batchDelete}
                disabled={!selectedAssetKeys.length}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> 批量删除{selectedAssetKeys.length ? `(${selectedAssetKeys.length})` : ''}
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={selectAllVisible}>
                全选
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={clearSelection}>
                清空
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" asChild>
                <a href="/admin/images">图片管理</a>
              </Button>
              <Button size="sm" variant="outline" className="border-slate-700" onClick={loadAssets}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新
              </Button>
            </div>
          </div>
          {/* Folder filter tabs */}
          {(productionGirlfriendId || girlfriendId) && assets.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setLibraryFolderFilter('all')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition',
                  libraryFolderFilter === 'all' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                )}
              >
                全部
              </button>
              {RESOURCE_FOLDERS.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setLibraryFolderFilter(folder.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition',
                    libraryFolderFilter === folder.id ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                  )}
                >
                  {folder.label}
                </button>
              ))}
            </div>
          )}
          {assetsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-400 text-sm space-y-3">
              <p>暂无记录。先生成，或点「批量上传」导入参考图。</p>
              <Button size="sm" className="bg-rose-600" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1" /> 上传图片
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(libraryFolderFilter === 'all'
                ? assets
                : assets.filter((a) => {
                    const role = String(a.meta?.asset_role || a.asset_role || '');
                    const folder = RESOURCE_FOLDERS.find((f) => f.id === libraryFolderFilter);
                    return folder ? folder.match(role) : true;
                  })
              ).map((a, idx) => {
                const k = assetKey(a);
                const selected = selectedAssetKeys.includes(k);
                return (
                  <div
                    key={k || idx}
                    className={cn(
                      'rounded-lg border overflow-hidden bg-slate-900/50 relative group',
                      selected ? 'border-rose-500 ring-1 ring-rose-500/40' : 'border-slate-800',
                    )}
                  >
                    <button
                      type="button"
                      className="absolute left-2 top-2 z-10 rounded bg-black/60 p-1 text-white"
                      onClick={() => toggleSelect(a)}
                      title="选择"
                    >
                      {selected ? <CheckSquare className="h-4 w-4 text-rose-400" /> : <Square className="h-4 w-4" />}
                    </button>
                    {/* 图库网格按需压缩（512px 档），复制/下载仍走原图 URL */}
                    <OptimizedImg src={a.url} alt="" className="aspect-[2/3] w-full object-cover" />
                    <div className="p-2 space-y-1">
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[9px] border-slate-600">{a.kind || 'img'}</Badge>
                        {a.lora_name && (
                          <Badge className="text-[9px] bg-violet-900/50">{a.lora_name}</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 font-mono">{a.prompt || a.storage_key}</p>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-[10px] border-slate-700"
                          onClick={() => {
                            setInputImage(a.url || '');
                            setTab('generate');
                            toast.message('已填入参考图');
                          }}
                        >
                          作参考
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 flex-1 text-[10px] border-violet-800 text-violet-300"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(a.url || '');
                              toast.success('已复制 URL');
                            } catch {
                              toast.message(a.url || '');
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] border-slate-700"
                          onClick={() => {
                            if (!a.url) return;
                            const aEl = document.createElement('a');
                            aEl.href = a.url;
                            aEl.download = `comfy_${a.id || idx}.png`;
                            aEl.target = '_blank';
                            document.body.appendChild(aEl);
                            aEl.click();
                            aEl.remove();
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] border-red-900 text-red-400"
                          onClick={() => deleteAsset(a.id ? a.id : a)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WORKFLOWS */}

      
      {false && tab === 'generate' && (
        <div className="grid md:grid-cols-2 gap-3">
          {workflows.map((w) => (
            <div key={w.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">{w.name}</h3>
                  <Badge className="mt-1 text-[10px]" variant="outline">{w.kind}</Badge>
                </div>
                <Button
                  size="sm"
                  className="bg-violet-600"
                  onClick={() => {
                    applyWorkflow(w);
                    setTab('generate');
                  }}
                >
                  使用
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-400">{w.description}</p>
              <pre className="mt-2 text-[10px] text-slate-400 overflow-auto max-h-24 font-mono">
                {JSON.stringify(w.defaults, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* INFRA */}
      {false && tab === 'generate' && (
        <div className="space-y-4 max-w-3xl">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="font-semibold flex items-center gap-2 text-violet-300">
              <BookOpen className="h-4 w-4" /> LoRA / 模型挂网络卷
            </h3>
            <ol className="mt-3 list-decimal pl-5 space-y-2 text-sm text-slate-300">
              {(config?.network_volume?.setup_notes || []).map((n: string, i: number) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-black/40 p-3">
                <div className="text-slate-400">网络卷</div>
                <div className="font-mono text-emerald-300">{config?.network_volume?.name}</div>
                <div className="text-slate-400">{config?.network_volume?.region}</div>
              </div>
              <div className="rounded-lg bg-black/40 p-3">
                <div className="text-slate-400">LoRA 目录</div>
                <div className="font-mono text-cyan-300">{config?.network_volume?.loras_dir}</div>
                <div className="text-slate-400">Checkpoint</div>
                <div className="font-mono text-cyan-300">{config?.network_volume?.checkpoints_dir}</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-black/40 p-3 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">一键下载（RunPod model-downloader）</div>
              <pre className="font-mono text-[11px] text-cyan-300/90 whitespace-pre-wrap">{`chmod +x download-loras.sh
./download-loras.sh
# 编辑 lora-urls.txt 后:
./download-loras.sh --from-file /runpod-volume/models/loras/lora-urls.txt`}</pre>
              <p className="text-slate-400">详见 scripts/runpod/README-LORA.md</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <h3 className="font-semibold">Serverless 端点 ID（填你的真实 ID）</h3>
            {endpoints.map((ep: Any, idx: number) => (
              <div key={ep.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end border-b border-slate-800 pb-3">
                <div>
                  <Label className="text-[11px] text-slate-400">{ep.label}</Label>
                  <p className="text-[10px] text-slate-400">{ep.notes}</p>
                </div>
                <div className="sm:col-span-2">
                  <Input
                    className="font-mono text-xs bg-slate-950 border-slate-700"
                    placeholder="RunPod endpoint id"
                    value={ep.endpoint_id || ''}
                    onChange={(e) => {
                      const next = { ...config, endpoints: [...endpoints] };
                      next.endpoints[idx] = { ...ep, endpoint_id: e.target.value };
                      setConfig(next);
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={saveEndpoints} className="bg-violet-600 gap-1">
                <Save className="h-3.5 w-3.5" /> 保存端点配置
              </Button>
              <Button variant="outline" className="border-slate-700 gap-1" onClick={resetConfig}>
                <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400 space-y-2">
            <h3 className="font-semibold text-slate-200">你现有资源建议用法</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><b className="text-slate-300">model-downloader Pod</b>：启动后把 ckpt/LoRA 下到 <code className="text-cyan-400">soulmate-models-ca2</code></li>
              <li><b className="text-slate-300">ComfyUI 5.8.6 / portrait:v9</b>：挂同一网络卷，出图用</li>
              <li><b className="text-slate-300">soulmate-vllm-luminaid</b>：只聊天，不填到出图端点</li>
              <li>Serverless 显示 0/3 空闲 = 按需唤醒，正常；有请求会起 worker</li>
            </ul>
            <p className="text-[11px] pt-2">
              SQL 建图库表：执行仓库 <code className="text-violet-300">db/migrations/0009_comfy_console.sql</code>
            </p>
          </div>
        </div>
      )}
      <footer className="mt-8 border-t border-white/10 pt-4 pb-6 text-[11px] text-slate-400 space-y-2 max-w-4xl">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> 使用说明
        </h3>
        <ol className="list-decimal pl-4 space-y-1 text-slate-400">
          <li>左侧参数（文生图 / 图生图），右侧输出预览；说明固定在页面底部。</li>
          <li>LoRA 须对应网络卷 models/loras/ 真实文件名；● 盘上可调，未安装会在服务端回退。</li>
          <li>下载：模型库导出 lora-urls.txt → RunPod downloader → 在 LORA_REGISTRY 添加条目或设置 RUNPOD_INSTALLED_LORAS → 同步盘状态。</li>
          <li>伴侣模式写入 girlfriends/&#123;id&#125;/；公共模式写入 comfy-outputs。</li>
          <li>当前仅展示已接通的文生图与图生图；采样器、调度器、Steps、CFG、Seed 和 LoRA 均写入真实工作流。</li>
        </ol>
      </footer>

      {/* Lightbox for full-size image viewing */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setLightboxUrl(null)}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic external storage URL */}
          <img src={lightboxUrl} alt="大图预览" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Resource Library — companion asset folder browser */}
      {resourceLibraryOpen && (
        <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setResourceLibraryOpen(false)}>
          <div
            className="flex max-h-[85vh] w-[90vw] max-w-4xl flex-col rounded-xl border border-slate-700 bg-[#0d1117] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">伴侣资源库</h3>
                <span className="text-[11px] text-slate-400">
                  {productionGirlfriendId || girlfriendId} · {companionAssets.length} 项资产
                </span>
              </div>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => setResourceLibraryOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Folder tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-slate-800 px-4 py-2">
              <button
                type="button"
                onClick={() => setResourceFolderFilter('all')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition',
                  resourceFolderFilter === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                )}
              >
                全部 ({companionAssets.length})
              </button>
              {resourceFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => setResourceFolderFilter(folder.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition',
                    resourceFolderFilter === folder.id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                  )}
                >
                  {folder.label} ({folder.assets.length})
                </button>
              ))}
            </div>
            {/* Asset grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {companionAssets.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                  <ImageIcon className="h-8 w-8 opacity-40" />
                  <p className="text-sm">该伴侣暂无资产，请先通过管线生成</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {(resourceFolderFilter === 'all'
                    ? companionAssets
                    : resourceFolders.find((f) => f.id === resourceFolderFilter)?.assets || []
                  ).map((a, idx) => {
                    const role = String(a.meta?.asset_role || a.asset_role || '');
                    const folderLabel = RESOURCE_FOLDERS.find((f) => f.id !== 'other' && f.match(role))?.label || '其他';
                    const isVideo = String(a.media_type || '').includes('video') || role === 'animation';
                    return (
                      <div key={a.id || a.url || idx} className="group relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900/50">
                        {isVideo ? (
                          <video src={a.url} muted loop playsInline className="aspect-[2/3] w-full object-cover" onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()} />
                        ) : (
                          /* 资源库网格按需压缩（512px 档），「查看大图」仍走原图 */
                          <OptimizedImg src={a.url} alt="" className="aspect-[2/3] w-full object-cover" />
                        )}
                        {/* Folder badge */}
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-cyan-200">{folderLabel}</span>
                        {/* Hover overlay with actions */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 transition group-hover:opacity-100">
                          {!isVideo && (
                            <button
                              type="button"
                              className="rounded-md bg-cyan-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-500"
                              onClick={() => {
                                setInputImage(a.url || '');
                                setGenMode('img2img');
                                setResourceLibraryOpen(false);
                                toast.success('已设为参考图');
                              }}
                            >
                              设为参考图
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-md bg-white/15 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-white/25"
                            onClick={() => setLightboxUrl(a.url || '')}
                          >
                            查看大图
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Footer hint */}
            <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-400">
              点击「设为参考图」将自动切换到图生图模式并填入参考图 URL。文件夹按资产角色自动归档：girlfriends/&#123;id&#125;/&#123;role&#125;/
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
