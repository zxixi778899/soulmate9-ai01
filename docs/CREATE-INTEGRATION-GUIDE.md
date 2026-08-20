# Create Module Integration Guide

## 新架构概览

### Three-Panel Layout
```
┌──────────────────┬──────────────────────┬─────────────────┐
│ Panel A          │ Panel B              │ Panel C         │
│ Live Preview     │ Creation Form        │ Action Panel    │
│ (Dossier Card)   │ (Step Wizard)        │ (Model/Prompt)  │
│                  │                      │                 │
│ [Portrait]       │ Step 1-5 Wizard      │ ├ ModelInfoCard│
│                  │                      │ ├ PromptEditor │
│                  │                      │ └ GenSettings  │
└──────────────────┴──────────────────────┴─────────────────┘
```

### Integration Steps

#### Step 1: Add Imports to create/page.tsx
```typescript
import { useCreationStore } from '@/components/creator/useCreationStore';
import { ModelInfoCard } from '@/components/creator/ModelInfoCard';
import { PromptEditor } from '@/components/creator/PromptEditor';
import { GenerationSettings } from '@/components/creator/GenerationSettings';
```

#### Step 2: Initialize Store in Page Component
```typescript
export default function CreatePage() {
  // New: Access Zustand store
  const {
    formData,
    setFormData,
    modelMeta,
    loraInfo,
    positivePrompt,
    negativePrompt,
    basePrompt,
    generationSettings,
    updateSettings,
    isSettingsOpen,
    toggleSettings,
    closeSettings,
    setGenerationResult,
    saveDraftToLocalStorage,
  } = useCreationStore();
  
  // ... existing code
}
```

#### Step 3: Update State Management

**Before:**
```typescript
const [name, setName] = useState('');
const [age, setAge] = useState(22);
// ... many individual states
```

**After:**
```typescript
// Use store instead for form fields
const { name, age } = formData;
setFormData({ name: 'New Name', age: 25 });

// Individual fields still work but sync with store
```

#### Step 4: Enhanced Prompt Generation Call

**Before:**
```typescript
const promptRes = await authedFetch('/api/creator/generate-prompt', {
  method: 'POST',
  body: JSON.stringify({...portraitRequestBody()}),
});
const promptData = await readResponseJson<{ success?: boolean; prompt?: string }>(promptRes);
```

**After:**
```typescript
const promptRes = await authedFetch('/api/creator/generate-prompt', {
  method: 'POST',
  body: JSON.stringify({
    ...portraitRequestBody(),
    nsfw_level: nsfwLevel,
  }),
});
const promptData = await readResponseJson<{
  success?: boolean; 
  prompt?: string;
  meta?: any;
  lora_info?: any;
  negative_prompt?: string;
  base_prompt?: string;
}>(promptRes);

if (promptData.success) {
  setGenerationResult({
    meta: promptData.meta,
    lora: promptData.lora_info,
    positive: promptData.prompt || '',
    negative: promptData.negative_prompt || '',
    base: promptData.base_prompt || promptData.prompt,
  });
}
```

#### Step 5: Update Portrait Generation to Use Settings

**Before:**
```typescript
await runBatch(undefined, promptData.prompt);
```

**After:**
```typescript
// Pass advanced settings to generation
await runBatch(undefined, promptData.prompt, {
  steps: generationSettings.steps,
  fluxGuidance: generationSettings.fluxGuidance,
  seed: generationSettings.randomSeed ? undefined : generationSettings.seed,
  turbo: generationSettings.turboMode,
});
```

#### Step 6: Add UI Components to Layout

**Add Model/Prompt Info Panel (Right Side):**
```tsx
{/* Right Panel: Model Info & Prompt Editor */}
<div className="w-full lg:w-[400px] flex-shrink-0 space-y-4">
  <ModelInfoCard 
    modelMeta={modelMeta}
    loraInfo={loraInfo}
    error={error || undefined}
  />
  
  {(positivePrompt || negativePrompt) && (
    <PromptEditor
      positivePrompt={positivePrompt}
      negativePrompt={negativePrompt}
      basePrompt={basePrompt}
      triggerWords={loraInfo?.triggerWords || []}
    />
  )}
  
  {/* Advanced Settings Trigger */}
  <button
    type="button"
    onClick={toggleSettings}
    className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left hover:border-[#FF2D78]/40 transition-all"
  >
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-white/80">Generation Settings</span>
      <ArrowRight className="h-4 w-4 text-white/40" />
    </div>
    <div className="mt-2 text-xs text-white/35">
      Steps: {generationSettings.steps} • CFG: {generationSettings.fluxGuidance} • {generationSettings.aspectRatio}
    </div>
  </button>
</div>
```

**Add GenerationSettings Modal:**
```tsx
<GenerationSettings
  isOpen={isSettingsOpen}
  onClose={closeSettings}
  steps={generationSettings.steps}
  cfg={generationSettings.cfg}
  fluxGuidance={generationSettings.fluxGuidance}
  width={generationSettings.width}
  height={generationSettings.height}
  sampler={generationSettings.sampler}
  scheduler={generationSettings.scheduler}
  onSettingsChange={(newSettings) => {
    updateSettings(newSettings);
    saveDraftToLocalStorage(); // Auto-save changes
  }}
/>
```

#### Step 7: Implement Auto-Save Drafts

On form field changes:
```typescript
// Debounced auto-save every 2 seconds
useEffect(() => {
  const timeoutId = setTimeout(() => {
    saveDraftToLocalStorage();
  }, 2000);
  
  return () => clearTimeout(timeoutId);
}, [formData, saveDraftToLocalStorage]);
```

Load draft on mount:
```typescript
useEffect(() => {
  loadDraftFromLocalStorage();
}, [loadDraftFromLocalStorage]);
```

#### Step 8: Update Step Navigation Logic

The step structure remains the same, but add "Review & Generate" as Step 5:

**Current Steps:**
1. Style
2. Appearance  
3. General
4. Portrait

**New Steps:**
1. Identity
2. Appearance
3. Personality
4. Content Level
5. Review & Generate ← NEW STEP

In Step 5, display:
- Generated prompt (editable)
- Model info card
- LoRA stack summary
- "Start Generation" button

## Translation Keys Required

Add these to `src/lib/i18n/translations.ts`:

```typescript
// In all 7 language blocks (en, zh, ja, ko, es, fr, de):
'create.modelInfo': 'Model Information',
'create.loraStack': 'LoRA Stack',
'create.inventoryFrom': 'Inventory from',
'create.steps': 'Steps',
'create.resolution': 'Resolution',
'create.sampler': 'Sampler',
'create.scheduler': 'Scheduler',
'create.preset': 'Preset',
'create.whyThisModel': 'Why this model',
'create.modelLoadError': 'Model Loading Error',
'create.modelInfoPending': 'Waiting for model information...',
'create.positivePrompt': 'Positive Prompt',
'create.negativePrompt': 'Negative Prompt',
'create.positivePlaceholder': 'Edit your prompt here...',
'create.negativePlaceholder': 'Optional: edit negatives...',
'create.regenerateBase': 'Regenerate base prompt',
'create.regen': 'Regen',
'create.words': 'Words',
'create.tokensApprox': '~Tokens',
'create.edit': 'Edit',
'create.generationSettings': 'Generation Settings',
'create.qualityPresets': 'Quality Presets',
'create.fast': 'Fast',
'create.balanced': 'Balanced',
'create.quality': 'Quality',
'create.ultra': 'Ultra',
'create.cfgGuidance': 'CFG Guidance',
'create.aspectRatio': 'Aspect Ratio',
'create.loraMissingTitle': 'Some LoRAs missing',
```

## Performance Considerations

1. **Debounced Auto-Save**: Don't save localStorage on every keystroke
2. **Lazy Load Components**: Only render PromptEditor after prompt is generated
3. **Optimistic Updates**: Update UI before API response for better perceived performance
4. **Draft Persistence**: Store drafts locally, sync to server only on save

## Error Handling

Handle API failures gracefully:
- If prompt generation fails → Show editable fallback template
- If model routing fails → Display FLUX fallback with warning icon
- If loRA missing → Warn user but allow generation to proceed

## Testing Checklist

- [ ] Draft autosaves when typing
- [ ] Prompt appears after generation call
- [ ] Model info displays correctly
- [ ] LoRA stack shows with strengths
- [ ] Settings modal opens/closes
- [ ] Advanced params pass to generation API
- [ ] Seed randomization works
- [ ] Aspect ratio presets change dimensions
- [ ] Quality presets adjust steps/CFG
- [ ] Copy to clipboard buttons work

## Migration Path

**Week 1**: Integrate components into new 5-step flow  
**Week 2**: Add i18n translations and polish edge cases  
**Week 3**: User testing and bug fixes  

See full plan in CREATE-MODULE-REFACTORING-PLAN.md
