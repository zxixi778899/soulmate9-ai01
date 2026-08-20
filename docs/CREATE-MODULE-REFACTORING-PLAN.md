# Create Module Refactoring Plan
## Reference: https://ourdream.ai/create

## Current Status Analysis

### Existing Create Flow (4 Steps)
1. **Style Step** - Visual style cards + Gender selection
2. **Appearance Step** - Face shape, body type, hair, eyes, skin tone, fashion style
3. **General Step** - Identity (name/age/tagline), Personality tags, Occupation, Relationship, Voice timbre, NSFW content level (1-5)
4. **Portrait Step** - Generate 4 portraits batch, select one, submit

### Core Issues to Address
Based on ourdream.ai analysis and current implementation:

1. **Prompt Generation UX Gap**
   - Currently generates LLM prompt as hidden phase
   - No preview/edit capability for users
   - OurDream shows generated prompt visibly before generation

2. **Model/LORA Visibility**
   - Model selection happens server-side silently
   - Users have no insight into which model/lora stack is used
   - OurDream shows model info, quality settings, LoRA list visibly

3. **Advanced Controls Missing**
   - No seed control
   - No negative prompt customization
   - No guidance scale/denoise adjustment
   - No aspect ratio selection beyond defaults

4. **Real-time Preview Limitation**
   - Genome changes don't show live preview
   - No "what you see is what you get" feedback loop
   - Static companion dossier that doesn't update dynamically

## Refactoring Objectives

### Phase 1: UI Redesign (UI Layer)
1. **Three-Panel Layout** (OurDream Style)
   ```
   ┌──────────────────┬──────────────────────┬─────────────────┐
   │   Live Preview   │    Creation Form     │   Quick Actions │
   │   (Portrait)     │    (Step Wizard)     │   Templates/    │
   │                  │                      │   History       │
   └──────────────────┴──────────────────────┴─────────────────┘
   ```

2. **Enhanced Step Structure (5 Steps)**
   - Step 1: **Identity** - Name, Age, Tags, Relationship, Short description
   - Step 2: **Appearance** - Body features, Hair, Eyes, Skin, Fashion, Ethnicity
   - Step 3: **Personality** - Soul traits, Voice, Backstory hints
   - Step 4: **Content Level** - NSFW tier selection (1-5) with visual previews
   - Step 5: **Review & Generate** - Show full draft, generated prompt, model info, final confirm

3. **Model/LORA Transparency Panel**
   - Display selected model based on style/category
   - Show active LoRA stack with strengths
   - Show generation parameters (steps, cfg, sampler, seed)
   - Allow manual override (advanced mode toggle)

4. **Prompt Preview & Edit**
   - Show LLM-generated positive prompt
   - Show negative prompt
   - Allow inline editing before generation
   - Highlight auto-injected LoRA triggers

5. **Dynamic Genome Preview**
   - Update dossier card in real-time as user selects options
   - Show genome slug mapping
   - Highlight critical appearance fields

### Phase 2: Image Generation Logic (Backend)
1. **Enhanced Prompt Generation API** (`/api/creator/generate-prompt`)
   - Return structured response: `{ prompt, negative_prompt, model_info, lora_stack }`
   - Support dry-run mode (return without execution)
   - Add `preview_url` field for low-res quick preview

2. **Advanced Parameter Control**
   - Store user preferences for steps/cfg/sampler
   - Persist seed for reproducibility
   - Allow aspect ratio presets (portrait, square, landscape)

3. **Improved Routing Strategy**
   - Maintain existing matrix (SDXL for anime/realism, FLUX for 3D/product)
   - Add fallback chain display
   - Cache optimal routes per style+category combo

### Phase 3: Integration Updates
1. **API Route Modifications**
   - `/api/creator/generate-prompt`: Enhanced output schema
   - `/api/girlfriends/generate-portrait`: Support advanced params
   - `/api/creator/preview-genome`: Optional real-time preview endpoint

2. **Component Changes**
   - New `ModelInfoCard.tsx` component
   - New `PromptEditor.tsx` component  
   - Enhanced `PortraitSlot.tsx` with quality metrics display
   - New `GenerationSettings.tsx` for advanced controls

3. **State Management**
   - Use Zustand store for creation state
   - Persist partial drafts locally
   - Sync genome updates to preview card

### Phase 4: Quality & Polish
1. **Gacha Reveal Enhancement**
   - Show detailed stats breakdown (desire/development/kink score)
   - Display rarity probability odds
   - Show which factors contributed to score

2. **Performance Optimization**
   - Debounced prompt generation (avoid repeated LLM calls)
   - Parallel API calls for route+lora resolution
   - Optimistic UI updates for slot status

3. **Error Handling & Graceful Degradation**
   - If LLM prompt fails, show editable fallback template
   - If routing fails, display fallback model with warning
   - If image gen fails, offer parameter adjustment suggestions

## Implementation Checklist

### Files to Modify
```typescript
// Frontend
src/app/(main)/create/page.tsx                    // Main create page → Refactor flow
src/components/creator/                          // New components
  - ModelInfoCard.tsx                             // Display model/lora info
  - PromptEditor.tsx                              // Editable prompt textarea
  - GenerationSettings.tsx                        // Advanced params control
  - PortraitSlot.tsx                              // Enhance with metrics

// Backend
src/app/api/creator/generate-prompt/route.ts     // Enhanced response schema
src/lib/image-generation-routing.ts              // Route metadata enrichment
src/lib/model-lora-routing.ts                    // Expose lora details
src/lib/companion-prompt-pipeline.ts             // Separate positive/negative prompts
```

### Database Changes
```sql
-- Optional: Store user preference for generation settings
CREATE TABLE IF NOT EXISTS user_generation_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  preferred_steps INT DEFAULT 28,
  preferred_cfg DECIMAL(3,1) DEFAULT 4.0,
  preferred_sampler VARCHAR(50),
  last_used_seed BIGINT
);
```

### Migration Steps
1. **Week 1**: UI redesign (3-panel layout, 5-step wizard)
2. **Week 2**: Backend prompt enhancement + Model info panel
3. **Week 3**: Advanced controls + Seed management
4. **Week 4**: Testing, polish, i18n translation completion

## Success Metrics
- User completion rate ↑ (from draft to saved companion)
- Average creation time ↓ (faster iteration with live preview)
- First-generation success rate ↑ (better prompt quality)
- Reduced support tickets about "uncontrollable generation results"

## Risks & Mitigation
1. **Increased Page Complexity**
   - Mitigation: Progressive disclosure (hide advanced by default)
   
2. **LLM Latency on Prompt Generation**
   - Mitigation: Client-side optimistic UI, cached templates
   
3. **Backend Performance Impact**
   - Mitigation: Route caching, async computation for non-critical path

## Estimated Timeline
- Phase 1 (UI): 5-7 days
- Phase 2 (Backend): 3-5 days  
- Phase 3 (Integration): 2-3 days
- Phase 4 (Polish): 2-3 days
- **Total**: ~15 working days

## Next Steps
1. Get approval on design direction
2. Create mockups for 3-panel layout
3. Draft new API response schemas
4. Set up Zustand store structure
5. Begin Phase 1 implementation
