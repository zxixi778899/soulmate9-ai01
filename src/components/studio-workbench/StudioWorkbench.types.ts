import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { CreativeGenerationMode } from '@/lib/creative-generation-presets';
import type { ImageModelFamily, ImageSurface } from '@/lib/image-generation-routing';
import type { CharacterAssetRole } from '@/lib/character-asset-production';
import type { IdentityKit } from '@/lib/identity-kit';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Studio state carries heterogeneous API payloads
export type Any = Record<string, any>;

export type StudioTask = 'identity' | 'portrait' | 'outfit' | 'pose' | 'background' | 'video';

export type GenerationStage = 'idle' | 'submitting' | 'queued' | 'finalizing';

/** Studio 手动模型选择（'auto' = 跟随题材自动路由） */
export type StudioModelOverride = 'auto' | ImageModelFamily;

export type StudioEnhancerKey = 'controlnet' | 'adetailer' | 'upscale';

export interface StudioEnhancerState {
  controlnet: boolean;
  adetailer: boolean;
  upscale: boolean;
}

export interface LoraSelection {
  id: string;
  strength: number;
}

export interface StudioState {
  // Config (read-only after init)
  config: Any | null;
  volumeInfo: Any | null;
  installedLoras: string[];

  // Companion
  companionId: string;
  scopedGirlfriend: Any | null;
  companionAssets: Any[];

  // Mode
  genMode: CreativeGenerationMode;
  studioTask: StudioTask;
  generationSurface: ImageSurface;
  identityConsistency: boolean;

  // Prompt
  prompt: string;
  negative: string;
  inputImage: string;

  // Style
  companionCategory: CompanionCategory;
  animeRenderStyle: AnimeRenderStyle;
  nsfwIntensity: NsfwIntensity;

  // Parameters
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  denoise: number;
  imageCount: number;
  fastPreview: boolean;

  // LoRA
  selectedLoras: LoraSelection[];
  assetRole: CharacterAssetRole;

  // Model / enhancers (manual controls)
  modelOverride: StudioModelOverride;
  ipAdapter: boolean;
  enhancers: StudioEnhancerState;
  enhancerStatuses: Any[];

  // Node control states
  controlnetType: 'openpose' | 'depth' | 'canny' | 'normal';
  controlnetPreprocessor: string;
  controlnetStrength?: number;
  controlnetGuidance: number;
  adetailerModel: string;
  adetailerConfidence: number;
  adetailerDenoise?: number;
  adetailerArea: 'face' | 'head' | 'nose_only';
  upscaleModel: string;
  upscaleFactor: 2 | 3 | 4;
  tileSize?: number;
  upscaleDenoise?: number;

  // Output
  generating: boolean;
  generationStage: GenerationStage;
  lastResult: Any[];
  lastGenerationTrace: Any | null;

  // Identity Kit (character consistency anchor)
  identityKit: IdentityKit | null;

  // UI
  advancedMode: boolean;
  activeNodeControlTab: StudioEnhancerKey;
  /** 用户是否手动改过采样参数（改过则不再被推荐预设覆盖） */
  paramsTouched: boolean;
}

export type StudioAction =
  | { type: 'SET_CONFIG'; config: Any | null; volumeInfo: Any | null; installedLoras: string[] }
  | { type: 'SET_COMPANION'; id: string; girlfriend: Any | null; assets: Any[] }
  | { type: 'SET_COMPANION_ASSETS'; assets: Any[] }
  | { type: 'SET_MODE'; genMode: CreativeGenerationMode }
  | { type: 'SET_TASK'; task: StudioTask }
  | { type: 'SET_SURFACE'; surface: ImageSurface }
  | { type: 'SET_IDENTITY_CONSISTENCY'; value: boolean }
  | { type: 'SET_PROMPT'; text: string }
  | { type: 'SET_NEGATIVE'; text: string }
  | { type: 'SET_INPUT_IMAGE'; url: string }
  | { type: 'SET_STYLE'; category: CompanionCategory; renderStyle: AnimeRenderStyle; intensity: NsfwIntensity }
  | { type: 'SET_NSFW'; intensity: NsfwIntensity }
  | { type: 'SET_PARAMS'; patch: Partial<Pick<StudioState, 'width' | 'height' | 'steps' | 'cfg' | 'sampler' | 'scheduler' | 'seed' | 'denoise' | 'imageCount'>> }
  | { type: 'SET_LORAS'; loras: LoraSelection[] }
  | { type: 'ADD_LORA'; lora: LoraSelection }
  | { type: 'REMOVE_LORA'; id: string }
  | { type: 'SET_LORA_STRENGTH'; id: string; strength: number }
  | { type: 'SET_ASSET_ROLE'; role: CharacterAssetRole }
  | { type: 'SET_MODEL_OVERRIDE'; value: StudioModelOverride }
  | { type: 'SET_IPADAPTER'; value: boolean }
  | { type: 'SET_ENHANCER'; key: StudioEnhancerKey; value: boolean }
  | { type: 'SET_ENHANCER_STATUSES'; statuses: Any[] }
  | { type: 'PATCH_COMPANION'; patch: Any }
  | { type: 'SET_GENERATING'; value: boolean; stage?: GenerationStage }
  | { type: 'SET_RESULT'; assets: Any[]; trace?: Any | null }
  | { type: 'SET_IDENTITY_KIT'; kit: IdentityKit | null }
  | { type: 'SET_ADVANCED'; value: boolean }
  | { type: 'SET_FAST_PREVIEW'; value: boolean }
  | { type: 'APPLY_TRANSFORM'; kind: 'outfit' | 'pose' | 'background' }
  // Node control actions
  | { type: 'SET_CONTROLNET_TYPE'; value: 'openpose' | 'depth' | 'canny' | 'normal' }
  | { type: 'SET_CONTROLNET_PREPROCESSOR'; value: string }
  | { type: 'SET_CONTROLNET_STRENGTH'; value: number }
  | { type: 'SET_CONTROLNET_GUIDANCE'; value: number }
  | { type: 'SET_ADETAILER_MODEL'; value: string }
  | { type: 'SET_ADETAILER_CONFIDENCE'; value: number }
  | { type: 'SET_ADETAILER_DENOISE'; value: number }
  | { type: 'SET_ADETAILER_AREA'; value: 'face' | 'head' | 'nose_only' }
  | { type: 'SET_UPSCALER_MODEL'; value: string }
  | { type: 'SET_UPSCALE_FACTOR'; value: 2 | 3 | 4 }
  | { type: 'SET_TILE_SIZE'; value: number }
  | { type: 'SET_UPSCALE_DENOISE'; value: number }
  | { type: 'SET_ACTIVE_NODE_CONTROL_TAB'; value: StudioEnhancerKey };

export const INITIAL_STATE: StudioState = {
  config: null,
  volumeInfo: null,
  installedLoras: [],
  companionId: '',
  scopedGirlfriend: null,
  companionAssets: [],
  genMode: 'txt2img',
  studioTask: 'identity',
  generationSurface: 'companion',
  identityConsistency: false,
  prompt: '',
  negative: '',
  inputImage: '',
  companionCategory: 'female',
  animeRenderStyle: 'realistic',
  nsfwIntensity: 1,
  width: 832,
  height: 1216,
  steps: 8,
  cfg: 1,
  sampler: 'euler',
  scheduler: 'simple',
  seed: -1,
  denoise: 0.55,
  imageCount: 1,
  fastPreview: true,
  selectedLoras: [],
  assetRole: 'album',
  modelOverride: 'auto',
  ipAdapter: true,
  enhancers: { controlnet: false, adetailer: true, upscale: false },
  enhancerStatuses: [],

  // Node control initial states
  controlnetType: 'openpose',
  controlnetPreprocessor: 'none',
  controlnetStrength: undefined,
  controlnetGuidance: 6,
  adetailerModel: 'nothing_v2',
  adetailerConfidence: 0.6,
  adetailerDenoise: undefined,
  adetailerArea: 'face',
  upscaleModel: '4x_UltraSharp',
  upscaleFactor: 2,
  tileSize: 512,
  upscaleDenoise: undefined,

  generating: false,
  generationStage: 'idle',
  lastResult: [],
  lastGenerationTrace: null,
  identityKit: null,
  advancedMode: false,
  activeNodeControlTab: 'controlnet',
  paramsTouched: false,
};
