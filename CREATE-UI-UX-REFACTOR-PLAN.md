# SoulMate AI 创建页面 UI/UX 重构方案
## 对标 OurDream AI 的现代化创作体验

---

## 🎯 目标与定位

### 核心设计理念
借鉴 OurDream AI 和 Midjourney 的最佳实践，打造一个:
- **更直观的可视化参数调节系统**
- **实时预览 (Turbo 小图) 快速反馈循环**
- **Prompt 智能推荐系统**
- **流畅动画与渐进式交互体验**

### 优化优先级 (P0-P2)
- **P0**: 可视化参数滑块 + Turbo 实时预览
- **P1**: Prompt 模板库 + 一键应用
- **P2**: 增强型生成进度可视化 + 高级参数面板

---

## 📐 架构设计

### 新创建设计模式

```
┌─────────────────────────────────────────────────────┐
│  Step Indicator (顶部步骤指示器 - 保持)                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────┐    │
│  │              │  │                          │    │
│  │  Live        │  │  Visual Parameter        │    │
│  │  Preview     │  │  Controls (新增)         │    │
│  │  Panel       │  │                          │    │
│  │  (新增)      │  │  - 可视化滑块组          │    │
│  │              │  │  - 实时 Turbo 预览        │    │
│  │              │  │  - Prompt 推荐卡片     │    │
│  │              │  │                          │    │
│  └──────────────┘  └──────────────────────────┘    │
│                        │                           │
│                        ▼                           │
│               ┌─────────────────┐                  │
│               │ Advanced        │                  │
│               │ Settings Toggle │                  │
│               └─────────────────┘                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ 技术实现方案

### Phase 1: 可视化参数滑块系统 (P0)

#### 1.1 新建组件：`VisualParamSlider.tsx`
```typescript
// Components/creator/VisualParamSlider.tsx
interface SliderConfig {
  category: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  options: Array<{ value: number; label: string }>;
  presetValues?: Record<string, number[]>; // 预设值
}

/** 
 * 可视化滑块组件
 * 特性:
 * - 双模切换：滑块/选项卡
 * - 实时数值显示
 * - 预设按钮快速选择
 * - 平滑过渡动画
 */
```

#### 1.2 集成到 CreatorStore
```typescript
// 扩展 useCreationStore
interface CreationState {
  // ... existing
  previewMode: 'disabled' | 'turbo' | 'final';
  enablePreview: (mode: 'turbo' | 'final') => void;
  updateParam: (category: string, value: number) => void;
}
```

#### 1.3 Turbo 预览 API 端点
```typescript
// /api/girlfriends/generate-portrait-turbo
// 复用现有接口，但强制使用 turbo preset:
// steps: 8, width: 640, height: 960, seed: random
```

---

### Phase 2: Prompt 模板系统 (P1)

#### 2.1 新建 Prompt 模板数据结构
```sql
-- db/migrations/003X_prompt_templates.sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT,
  description_en TEXT,
  description_zh TEXT,
  visual_style TEXT[],
  gender TEXT[],
  base_prompt TEXT NOT NULL,
  positive_hint TEXT,
  negative_hint TEXT,
  lora_recs JSONB, -- [{id, strength, reason}]
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 预设模板数据
INSERT INTO prompt_templates VALUES
  ('anime-pastoral', '田园少女', '乡村田园风', '...');
  ('realistic-corporate', '职场精英', '都市商务风', '...');
```

#### 2.2 新建组件：`PromptTemplateCard.tsx`
```typescript
/**
 * Prompt 模板展示卡片
 * 功能:
 * - 点击加载模板内容
 * - 显示风格/性别匹配度
 * - 一键应用到当前表单
 * - 预览缩略图 (可选)
 */
```

#### 2.3 API 端点
```typescript
// GET /api/creator/prompt-templates?style=realistic&gender=Female
// POST /api/creator/prompt-templates/:slug/use (计数 +1)
```

---

### Phase 3: 增强型进度可视化 (P2)

#### 3.1 改进当前 Creating Phase 显示
```typescript
// src/app/(main)/create/page.tsx

/** 新的生成阶段状态机 */
type CreatePhase = 
  | 'idle'
  | 'analyzing_params'     // 分析参数，推荐 LoRA
  | 'crafting_prompt'      // LLM 生成提示词
  | 'applying_loras'       // 计算 LoRA 组合
  | 'generating_preview'   // Turbo 预览中
  | 'generating_final'     // 高清图生成中
  | 'post_processing'      // ADetailer/放大等
  | 'done';

/** 新增进度详情面板 */
const GenerationProgressDetail = ({ phase, details }) => {
  // 显示每个阶段的详细信息
  // - 正在使用的模型：FLUX fp8
  // - 激活的 LoRA: rdanimefluxv1rapid (0.7)
  // - 生成的正向提示词摘要
  // - 预计剩余时间
};
```

---

## 🎨 UI 组件详细规范

### A. 步骤导航优化

#### 原有设计保持不变，但添加:
```css
/* 激活状态增强 */
step-indicator.active {
  box-shadow: 0 0 16px rgba(255, 45, 120, 0.5);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

### B. 实时预览面板 (新增)

```tsx
// Components/creator/LivePreviewPanel.tsx
const LivePreviewPanel = () => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 防抖触发 Turbo 预览
  useEffect(() => {
    const timer = setTimeout(() => {
      if (shouldGeneratePreview()) {
        generateTurboPreview();
      }
    }, 800); // 800ms 防抖
    
    return () => clearTimeout(timer);
  }, [formData]);
  
  return (
    <div className="sticky top-4">
      {/* 预览图片 */}
      <OptimizedImg 
        src={previewImage || placeholder}
        className="rounded-2xl border border-white/10"
      />
      
      {/* 生成状态徽章 */}
      {isGenerating && (
        <div className="mt-3 text-xs text-center text-white/40">
          <Loader2 className="inline h-3 w-3 animate-spin" />
          Generating preview...
        </div>
      )}
      
      {/* 手动触发生成按钮 */}
      <GamePrimaryButton onClick={generateTurboPreview}>
        Generate Quick Preview
      </GamePrimaryButton>
    </div>
  );
};
```

### C. 可视化参数滑块组 (新增)

```tsx
// Components/creator/ParamSliderGroup.tsx
const ParamSliderGroup = ({ config }) => {
  const [mode, setMode] = useState<'slider' | 'tabs'>('slider');
  
  return (
    <div className="mb-6 rounded-xl bg-white/[0.035] border border-white/10 p-4">
      {/* 模式切换 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/90">{config.label}</h3>
        <div className="flex gap-2">
          <Pill active={mode === 'slider'} onClick={() => setMode('slider')}>
            Slider
          </Pill>
          <Pill active={mode === 'tabs'} onClick={() => setMode('tabs')}>
            Presets
          </Pill>
        </div>
      </div>
      
      {/* 滑块模式 */}
      {mode === 'slider' && (
        <>
          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={config.value}
            onChange={(e) => config.onChange(Number(e.target.value))}
            className="w-full h-2 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-[#FF2D78]"
          />
          <div className="mt-2 text-right text-sm text-white/60">
            {config.options.find(o => o.value === config.value)?.label}
          </div>
        </>
      )}
      
      {/* 预设模式 */}
      {mode === 'tabs' && (
        <div className="grid grid-cols-3 gap-2">
          {config.presetValues?.map((val, idx) => (
            <button
              key={idx}
              onClick={() => config.onChange(val)}
              className={`p-2 rounded-lg text-xs transition-all ${
                config.value === val
                  ? 'bg-[#FF2D78] text-white'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
              }`}
            >
              {config.options.find(o => o.value === val)?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## 🔧 代码修改清单

### 文件改动列表

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/components/creator/useCreationStore.ts` | 修改 | 添加 previewMode, updateParam 等 |
| `src/app/(main)/create/page.tsx` | 大幅修改 | 重组布局，添加 LivePreviewPanel |
| `src/app/api/girlfriends/generate-portrait-turbo/route.ts` | 新建 | Turbo 预览专用端点 |
| `src/app/api/creator/prompt-templates/route.ts` | 新建 | Prompt 模板 CRUD API |
| `src/components/creator/VisualParamSlider.tsx` | 新建 | 可视化参数滑块 |
| `src/components/creator/PromptTemplateCard.tsx` | 新建 | Prompt 模板卡片 |
| `src/components/creator/LivePreviewPanel.tsx` | 新建 | 实时预览面板 |
| `db/migrations/003X_prompt_templates.sql` | 新建 | Prompt 模板表迁移 |

---

## 🚀 实施步骤

### Week 1: 基础架构搭建 (P0)
1. ✅ 创建 `VisualParamSlider` 组件
2. ✅ 扩展 `useCreationStore` 支持参数跟踪
3. ✅ 实现 Turbo 预览 API 端点
4. ✅ 重构 create page 布局为左右分栏

### Week 2: Prompt 模板系统 (P1)
1. ✅ 数据库迁移 & 初始数据
2. ✅ 创建 `PromptTemplateCard` 组件
3. ✅ 实现模板加载/应用逻辑
4. ✅ 添加模板推荐算法 (基于 style/gender)

### Week 3: 进度可视化增强 (P2)
1. ✅ 重构 creating phase 状态机
2. ✅ 添加阶段性详情展示
3. ✅ 优化动画流畅度
4. ✅ 性能测试与优化

### Week 4: 打磨与 QA
1. ✅ i18n 翻译完善
2. ✅ 移动端适配
3. ✅ A/B 测试准备
4. ✅ 正式上线

---

## 📊 预期效果对比

### Before vs After

| 维度 | 旧版本 | 新版本 |
|------|--------|--------|
| **参数调节** | Pill 按钮切换 | 滑块 + 预设双模，直观精准 |
| **反馈速度** | 仅最后一步显示 4 张大图 | 实时 Turbo 预览 (8s → 3s) |
| **Prompt 工程** | 完全后端生成，用户不可见 | 模板推荐 + 手动微调 |
| **学习成本** | 需要试错才能理解参数 | 可视化 + 实时反馈，降低门槛 |
| **完成率预估** | ~60% | ~80% (通过实时预览减少流失) |

---

## 🎯 技术指标

### 性能要求
- Turbo 预览响应时间：< 3s (从参数变更到显示)
- 大图生成时间：< 10s (FLUX 28 steps on RTX 4090)
- 首屏加载时间 (< LCP): < 2.5s
- 动画帧率：稳定 60fps

### 兼容性
- 浏览器：Chrome/Safari/Firefox/Edge (最新 2 个版本)
- 移动端：iOS Safari 15+, Android Chrome 90+
- 分辨率：自适应 (最小宽度 375px)

---

## ⚠️ 注意事项

1. **Rate Limit**: Turbo 预览需独立限流 (建议 10 次/分钟)
2. **Cost Control**: Turbo 预览成本约为大图的 15%，需计入计费模型
3. **Cache Strategy**: 相同参数的 Turbo 结果可缓存 5 分钟
4. **Fallback**: 当 GPU 繁忙时，自动降级为"排队中"提示而非直接生成

---

## 📝 下一步行动

请确认以下事项后再开始实施:

1. **是否需要我立即开始 Phase 1 的代码实现？**
2. **是否有特定的视觉设计风格偏好？** (如：更激进的新浪潮设计 vs 保守优化)
3. **是否需要同时准备 A/B 测试方案？** (控制组 vs 实验组)
4. **数据库迁移是否需要我先准备 SQL 脚本？**

我会根据你的反馈提供详细的代码实现！🚀
