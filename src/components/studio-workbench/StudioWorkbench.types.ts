import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { CreativeGenerationMode } from '@/lib/creative-generation-presets';
import type { ImageSurface } from '@/lib/image-generation-routing';
import type { CharacterAssetRole } from '@/lib/character-asset-production';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Studio state carries heterogeneous API payloads
export type Any = Record<string, any>;

export type StudioTask = 'identity' | 'portrait' | 'outfit' | 'pose' | 'background' | 'video';

export type GenerationStage = 'idle' | 'submitting' | 'queued' | 'finalizing';

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

  // Output
  generating: boolean;
  generationStage: GenerationStage;
  lastResult: Any[];
  lastGenerationTrace: Any | null;

  // UI
  advancedMode: boolean;
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
  | { type: 'SET_GENERATING'; value: boolean; stage?: GenerationStage }
  | { type: 'SET_RESULT'; assets: Any[]; trace?: Any | null }
  | { type: 'SET_ADVANCED'; value: boolean }
  | { type: 'SET_FAST_PREVIEW'; value: boolean }
  | { type: 'APPLY_TRANSFORM'; kind: 'outfit' | 'pose' | 'background' };

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
  assetRole: 'avatar-closeup',
  generating: false,
  generationStage: 'idle',
  lastResult: [],
  lastGenerationTrace: null,
  advancedMode: false,
};
