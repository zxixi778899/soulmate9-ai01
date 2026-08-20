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
  
  // Generation State
  modelMeta: ModelMeta | null;
  loraInfo: ModelLoraInfo | null;
  positivePrompt: string;
  negativePrompt: string;
  basePrompt: string;
  setGenerationResult: (result: { 
    meta: ModelMeta, 
    lora?: ModelLoraInfo, 
    positive: string, 
    negative?: string,
    base?: string
  }) => void;
  clearGenerationResult: () => void;
  
  // Advanced Settings
  generationSettings: GenerationSettings;
  updateSettings: (settings: Partial<GenerationSettings>) => void;
  resetSettings: () => void;
  
  // UI State
  isSettingsOpen: boolean;
  toggleSettings: () => void;
  closeSettings: () => void;
  
  // Draft Persistence
  saveDraftToLocalStorage: () => void;
  loadDraftFromLocalStorage: () => void;
  clearDraft: () => void;
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
