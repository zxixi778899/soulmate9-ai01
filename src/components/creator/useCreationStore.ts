import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GenerationSettings } from './GenerationSettings';
import type { ModelMeta, ModelLoraInfo } from './ModelInfoCard';

/**
 * Creation Store - Zustand store for character creation state
 * Manages form data, generation settings, and draft persistence
 */

export interface CreateFormData {
  name: string;
  age: number;
  visualStyle: string;
  gender: string;
  ethnicity: string;
  faceShape: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  bodyType: string;
  fashionStyle: string;
  appearancePrompt: string;
  selectedTags: string[];
  occupation: string;
  shortDescription: string;
  relationship: string;
  selectedVoice: string;
  nsfwLevel: number;
}

export interface CreationState {
  // Form Data
  formData: CreateFormData;
  setFormData: (data: Partial<CreateFormData>) => void;
  resetFormData: () => void;
  
  // Preview Mode
  previewMode: 'disabled' | 'turbo' | 'final';
  enablePreview: (mode: 'turbo' | 'final') => void;
  disablePreview: () => void;
  lastPreviewTime: number;
  previewCooldownMs: number; // 防抖间隔
  
  // Generation State
  modelMeta: ModelMeta | null;
  loraInfo: ModelLoraInfo | null;
  positivePrompt: string;
  negativePrompt: string;
  basePrompt: string;
  setGenerationResult: (result: { 
    meta: ModelMeta | null, 
    lora?: ModelLoraInfo | null, 
    positive: string, 
    negative?: string,
    base?: string
  }) => void;
  clearGenerationResult: () => void;
  
  // Advanced Settings
  generationSettings: GenerationSettings;
  updateSettings: (settings: Partial<GenerationSettings>) => void;
  resetSettings: () => void;
  
  // Prompt Actions
  updatePositivePrompt: (prompt: string) => void;
  updateNegativePrompt: (prompt: string) => void;
  
  // UI State
  isSettingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
  
  // Draft Persistence
  saveDraftToLocalStorage: () => void;
  loadDraftFromLocalStorage: () => void;
  clearDraft: () => void;
  
  // Parameter Updates
  updateParam: (category: string, value: unknown) => void;
  resetParams: () => void;
}

const initialFormData: CreateFormData = {
  name: '',
  age: 22,
  visualStyle: 'realistic',
  gender: 'Female',
  ethnicity: 'Asian',
  faceShape: 'Oval',
  hairStyle: 'Long Flowing',
  hairColor: '#d4a574',
  eyeColor: 'Brown',
  bodyType: 'Slim',
  fashionStyle: 'Casual',
  appearancePrompt: '',
  selectedTags: ['Romantic', 'Playful'],
  occupation: 'Student',
  shortDescription: '',
  relationship: 'girlfriend',
  selectedVoice: '',
  nsfwLevel: 1,
};

const initialSettings: GenerationSettings = {
  steps: 28,
  cfg: 1,
  fluxGuidance: 3.5,
  width: 1024,
  height: 1536,
  aspectRatio: '2:3',
  sampler: 'euler',
  scheduler: 'simple',
  seed: null,
  turboMode: false,
  randomSeed: true,
};

const initialPreviewState = {
  previewMode: 'disabled' as const,
  lastPreviewTime: 0,
  previewCooldownMs: 800, // 800ms debounce
};

export const useCreationStore = create<CreationState>()(
  persist(
    (set, get) => ({
      // Initial State
      formData: initialFormData,
      modelMeta: null,
      loraInfo: null,
      positivePrompt: '',
      negativePrompt: '',
      basePrompt: '',
      generationSettings: initialSettings,
      isSettingsOpen: false,
      ...initialPreviewState,
      
      // Form Actions
      setFormData: (data) =>
        set((state) => ({
          formData: { ...state.formData, ...data },
        })),
      
      resetFormData: () =>
        set({
          formData: initialFormData,
        }),
      
      // Generation Result Actions
      setGenerationResult: (result) =>
        set({
          modelMeta: result.meta,
          loraInfo: result.lora || null,
          positivePrompt: result.positive,
          negativePrompt: result.negative || '',
          basePrompt: result.base || result.positive,
        }),
      
      clearGenerationResult: () =>
        set({
          modelMeta: null,
          loraInfo: null,
          positivePrompt: '',
          negativePrompt: '',
          basePrompt: '',
        }),
      
      // Prompt Actions
      updatePositivePrompt: (prompt) =>
        set({ positivePrompt: prompt }),
      
      updateNegativePrompt: (prompt) =>
        set({ negativePrompt: prompt }),
      
      // Settings Actions
      updateSettings: (settings) =>
        set((state) => ({
          generationSettings: { ...state.generationSettings, ...settings },
        })),
      
      resetSettings: () =>
        set({
          generationSettings: initialSettings,
        }),
      
      // UI Actions
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      
      closeSettings: () =>
        set({ isSettingsOpen: false }),
      
      // Draft Persistence
      saveDraftToLocalStorage: () => {
        const { formData, generationSettings } = get();
        localStorage.setItem('creator_draft', JSON.stringify({
          formData,
          generationSettings,
          savedAt: new Date().toISOString(),
        }));
      },
      
      loadDraftFromLocalStorage: () => {
        const stored = localStorage.getItem('creator_draft');
        if (!stored) return;
        
        try {
          const parsed = JSON.parse(stored);
          if (parsed.formData) {
            set({ formData: { ...initialFormData, ...parsed.formData } });
          }
          if (parsed.generationSettings) {
            set({ generationSettings: { ...initialSettings, ...parsed.generationSettings } });
          }
        } catch (error) {
          console.warn('[creation-store] Failed to load draft:', error);
        }
      },
      
      clearDraft: () => {
        localStorage.removeItem('creator_draft');
        set({ formData: initialFormData, generationSettings: initialSettings });
      },
      
      // Preview Mode Actions
      enablePreview: (mode) =>
        set({ 
          previewMode: mode, 
          lastPreviewTime: Date.now() 
        }),
      
      disablePreview: () =>
        set({ previewMode: 'disabled' }),
      
      // Parameter Update Actions
      updateParam: (category, value) => {
        set((state) => {
          const newData = { ...state.formData };
          
          // Map category to form field
          switch(category) {
            case 'visual_style':
              newData.visualStyle = String(value);
              break;
            case 'gender':
              newData.gender = String(value);
              break;
            case 'ethnicity':
              newData.ethnicity = String(value);
              break;
            case 'face_shape':
              newData.faceShape = String(value);
              break;
            case 'hair_style':
              newData.hairStyle = String(value);
              break;
            case 'eye_color':
              newData.eyeColor = String(value);
              break;
            case 'body_type':
              newData.bodyType = String(value);
              break;
            case 'fashion_style':
              newData.fashionStyle = String(value);
              break;
            case 'nsfw_level':
              newData.nsfwLevel = Number(value);
              break;
            case 'age':
              newData.age = Number(value);
              break;
            default:
              // For unrecognized categories, try to match with form data keys
              const key = Object.keys(newData).find(k => k === category) as keyof typeof newData | undefined;
              if (key) {
                newData[key] = value as never;
              }
          }
          
          return { formData: newData };
        });
      },
      
      resetParams: () =>
        set({ 
          formData: initialFormData, 
          ...initialPreviewState 
        }),
    }),
    {
      name: 'creator-draft-storage',
      partialize: (state) => ({
        formData: state.formData,
        generationSettings: state.generationSettings,
      }),
    },
  ),
);
