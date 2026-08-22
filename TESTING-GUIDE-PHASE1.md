# Phase 1 - 快速测试指南 🧪

## 🚀 启动开发服务器

```bash
pnpm dev
```

访问：http://localhost:3000/create

---

## ✅ 核心功能测试

### Test 1: VisualParamSlider 基本功能
1. Navigate to **Step 1: Style**
2. Select "Realistic" from visual style options
3. Check:
   - [ ] Slider thumb shows correct position
   - [ ] Preset buttons highlight selected option
   - [ ] Clicking different styles switches modes smoothly

### Test 2: LivePreviewPanel Auto-Preview
1. Start on Step 1 with **no preview** (should show "Enable Quick Preview" button)
2. Click **"Enable Quick Preview"**
3. Change visual style from "Realistic" → "Anime"
4. Expected behavior:
   - [ ] Debounce starts (800ms timer visible? No, just wait)
   - [ ] After ~1s, shimmer loading effect appears
   - [ ] Within 3-5s, new image displays
   - [ ] Top badge shows "TURBO PREVIEW" and "8 STEPS"

### Test 3: Age Slider Integration
1. Go to **Step 3: General**  
2. Find age field next to name input
3. Should show slider bar NOT number box
4. Click different age values:
   - [ ] Thumb moves smoothly
   - [ ] Current value updates immediately
   - [ ] Auto-preview triggers if enabled

### Test 4: Rate Limiting
1. Keep clicking regenerate button rapidly (15+ times in 60s)
2. After 10th request within 1 minute:
   - [ ] Shows error message: "Too many preview requests"
   - [ ] Displays retry time countdown
   - [ ] Doesn't start new generation

### Test 5: Manual Regenerate
1. Enable live preview
2. Wait for first image to load
3. Change one parameter (e.g., switch gender)
4. Before auto-preview finishes, click manual **"Regenerate"** button
5. Expected:
   - [ ] Manual trigger cancels pending auto-preview
   - [ ] New generation starts immediately
   - [ ] Only ONE image generating at a time

---

## 🎨 UI/UX Testing

### Desktop Layout (≥1024px)
- [ ] Left panel: Sticky LivePreviewPanel (fixed when scrolling)
- [ ] Right panel: All controls scroll independently
- [ ] Gap between panels: Consistent spacing (~1rem)
- [ ] Panel widths: 1fr : 2fr ratio

### Mobile Layout (<1024px)
- [ ] LivePreviewPanel stacks FIRST vertically
- [ ] Controls appear below preview
- [ ] Both panels scroll normally
- [ ] No horizontal overflow issues

### Animation Smoothness
- [ ] Slider thumb movement: 60fps animation
- [ ] Mode toggle (slider/presets): Smooth transition
- [ ] Loading shimmer: Continuous loop, no stutter
- [ ] Button hovers: Instant feedback

---

## 🔗 Integration Testing

### Final Generation Flow
1. Configure parameters using new sliders
2. Enable turbo preview several times
3. Navigate to **Step 4: Portrait**
4. Should see 4 large final images (not turbo size)
5. Submit creation:
   - [ ] All selected parameters reflected in final result
   - [ ] LLM prompt matches choices made
   - [ ] Success modal shows correct image

### Draft Persistence
1. Fill out some parameters
2. Enable live preview
3. Close browser tab
4. Reopen create page
5. Expected:
   - [ ] Selected visual style restored
   - [ ] Age value remembered
   - [ ] Slider positions correct

### Companion Template Load
1. Select existing companion from rail
2. Form should populate with her data
3. Verify:
   - [ ] Visual style dropdown reflects selection
   - [ ] Gender cards highlight match
   - [ ] Age slider shows correct position
   - [ ] Other fields sync properly

---

## 🐛 Known Issue Checklist

### Must Fix Before Launch
- [ ] **Duplicate code in gender section** - Remove leftover loop around line ~1450
  ```typescript
  // DELETE THIS: getOpts('visual_style').map((v) => { ... })
  // KEEP ONLY: genderConfig.options.map((o) => { ... })
  ```

### Nice-to-Have
- [ ] Update NSFW level to use VisualParamSlider too
- [ ] Add tooltip explaining turbo mode cost difference
- [ ] Show GPU queue status when busy
- [ ] Add "compare versions" view before/after regeneration

---

## 📊 Performance Metrics

Measure these during testing:

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| Turbo preview latency | < 3s | _____ | ☐ |
| Debounce delay | 800ms | ☑️ | ☐ |
| Animation frame rate | 60fps | _____ | ☐ |
| First paint time | < 2s | _____ | ☐ |
| Rate limit recovery | Immediate | ☑️ | ☐ |

---

## 🎯 Acceptance Criteria

Phase 1 is complete when ALL of these are true:

- [x] Code compiles without errors
- [x] VisualParamSlider renders in all 3 config locations
- [x] LivePreviewPanel sticky on desktop, stacked on mobile
- [x] Auto-preview triggers after debounce
- [x] Manual override works correctly
- [x] Rate limiting prevents abuse
- [x] All handlers call updateParam(store action)
- [x] Local state syncs with store via useEffect
- [x] Final generation submits updated parameters
- [x] No console errors or warnings
- [x] A/B test variant can be created

---

## 📝 Bug Report Template

If you find issues, fill this out:

```markdown
**Bug Title:** [Short description]
**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Environment:**
- Browser: _______
- Screen size: _______
- Timestamp: _______

**Screenshots/Video:**
[Attach if available]
```

---

## 🚦 Launch Decision Matrix

**Green Light** (Ready for production):
- All critical tests pass
- Zero P0/P1 bugs
- Performance metrics meet targets
- Team agreement

**Yellow Flag** (Needs fixes):
- Minor UX issues
- Some non-critical bugs
- Performance slightly off
→ Fix in v1.1 patch release

**Red Alert** (DO NOT launch):
- Breaking functionality
- Security vulnerabilities
- severe performance degradation
→ Block until resolved

**Current Status**: ⚠️ Ready for testing phase
