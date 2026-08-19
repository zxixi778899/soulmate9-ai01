# UI 警告弹窗 - Composition Freeze Warning

## 🎯 **设计目标**

在用户选择宽高比但启用了 identityConsistency 时，提供清晰提示和快速操作选项。

---

## 📐 **组件规格**

### **位置:** `src/components/studio-workbench/panels/AspectRatioBar.tsx`

### **触发条件:**
1. 用户点击宽高比按钮
2. 当前模式为 img2img
3. `identityConsistencyActive === true`
4. 新宽高与参考图不一致

---

## 🎨 **UI 设计方案**

### **方案 A: Toast 通知（轻量级）**

```tsx
// ComfyConsole.tsx 中修改 onAspectRatioChange
const onSelectAspectRatio = useCallback((width: number, height: number) => {
  setWidth(width);
  setHeight(height);
  
  // 检查是否需要警告
  if (
    identityConsistencyActive && 
    genMode === 'img2img' && 
    inputImage
  ) {
    toast.info('身份锁定模式下改变构图需要调整去噪强度', {
      description: '当前的参考图构图可能与新尺寸不匹配，建议增加 denoise 值',
      action: (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDenoise(0.65);
            toast.success('denoise 已自动调整为 0.65');
          }}
        >
          自动调整 denoise
        </Button>
      ),
      duration: 8000, // 更长时间供用户操作
    });
  }
}, [
  identityConsistencyActive,
  genMode,
  inputImage,
  setDenoise,
]);
```

---

### **方案 B: 内嵌警告卡片（推荐）**

#### **1. 在 AspectRatioBar.tsx 中添加警告区域**

```tsx
'use client';

import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

const ASPECT_RATIOS: Array<{ label: string; width: number; height: number; icon: string }> = [
  { label: '3:4', width: 832, height: 1216, icon: '▯' },
  { label: '9:16', width: 768, height: 1344, icon: '▯' },
  { label: '2:3', width: 832, height: 1216, icon: '▯' },
  { label: '1:1', width: 1024, height: 1024, icon: '□' },
  { label: '4:3', width: 1216, height: 832, icon: '▭' },
  { label: '16:9', width: 1344, height: 768, icon: '▭' },
];

export function AspectRatioBar() {
  const { state, dispatch, identityConsistencyActive, genMode, currentInputImage } = useStudio();

  // 计算警告条件
  const needsWarning = (newWidth: number, newHeight: number): boolean => {
    if (!identityConsistencyActive || genMode !== 'img2img' || !currentInputImage) {
      return false;
    }
    
    // 如果新尺寸与原图差异较大，需要警告
    const originalRatio = state.aspectRatio; // 假设有记录原图比例
    const newRatio = newWidth / newHeight;
    return Math.abs(originalRatio - newRatio) > 0.3;
  };

  const isActive = (ar: typeof ASPECT_RATIOS[number]) =>
    state.width === ar.width && state.height === ar.height;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      {/* ⚠️ 警告卡片 */}
      {needsWarning(state.width, state.height) && (
        <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-amber-200">
              构图变化可能受限
            </p>
            <p className="mt-0.5 text-[10px] text-amber-300/80">
              身份锁定模式下，从参考图的裁剪方式切换到大比例变化可能需要更高的 denoise 值 (0.6+)
            </p>
          </div>
        </div>
      )}

      {/* 原有宽高比选择器 */}
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        画面比例
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ASPECT_RATIOS.map((ar) => {
          const shouldWarn = needsWarning(ar.width, ar.height);
          
          return (
            <button
              key={ar.label}
              onClick={() => {
                if (shouldWarn && identityConsistencyActive && genMode === 'img2img') {
                  // 显示 toast 提示
                  window.showToastCompositionWarning?.();
                }
                
                dispatch({ 
                  type: 'SET_PARAMS', 
                  patch: { width: ar.width, height: ar.height } 
                });
              }}
              className={cn(
                'relative flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs transition group',
                isActive(ar)
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
                shouldWarn && 'hover:ring-2 hover:ring-amber-500/30'
              )}
            >
              <span className="text-base leading-none">{ar.icon}</span>
              <span className="mt-0.5 font-medium">{ar.label}</span>
              <span className="text-[9px] text-slate-500">{ar.width}×{ar.height}</span>
              
              {/* ⚠️ 警告图标悬停提示 */}
              {shouldWarn && (
                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      
      {state.advancedMode && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={state.width}
            onChange={(e) => dispatch({ 
              type: 'SET_PARAMS', 
              patch: { width: +e.target.value } 
            })}
            className="w-20 rounded-md border border-white/10 bg-[#0d0d15] px-2 py-1 text-xs text-white"
          />
          <span className="text-slate-600">×</span>
          <input
            type="number"
            value={state.height}
            onChange={(e) => dispatch({ 
              type: 'SET_PARAMS', 
              patch: { height: +e.target.value } 
            })}
            className="w-20 rounded-md border border-white/10 bg-[#0d0d15] px-2 py-1 text-xs text-white"
          />
        </div>
      )}
    </div>
  );
}
```

---

### **方案 C: 快速操作面板（高级功能）**

在 StudioWorkbench 顶部添加一个**composition mode switch**:

```tsx
// src/components/studio-workbench/StudioWorkbench.tsx

<div className="mb-4 flex items-center gap-3">
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-slate-400">构图自由度:</span>
    <Select
      value={compositionFreeze}
      onValueChange={(value) => setCompositionFreeze(value === 'lock')}
    >
      <SelectTrigger className="w-40 h-8 text-xs">
        <SelectValue placeholder="选择模式" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="freedom">🎨 自由构图</SelectItem>
        <SelectItem value="preserve">🔒 保持原构图</SelectItem>
      </SelectContent>
    </Select>
  </div>
  
  {compositionFreeze && (
    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300">
      ⚠️ 将临时禁用 ID 一致性
    </Badge>
  )}
</div>
```

对应的逻辑：

```typescript
const [compositionFreeze, setCompositionFreeze] = useState(false);

useEffect(() => {
  if (compositionFreeze && identityConsistencyActive) {
    toast.warning('构图自由度已开启，ID 一致性将临时禁用', {
      description: '生成完成后会自动恢复原始设置',
      duration: 3000,
    });
    
    // 临时保存并禁用 identityConsistency
    setIdentityConsistencyActiveTemporarily(false);
    
    return () => {
      // 清理：恢复原设置
      setIdentityConsistencyActiveTemporarily(true);
    };
  }
}, [compositionFreeze]);
```

---

## 🔧 **实现步骤**

### **Step 1: 添加 State 到 Context**

编辑 `src/components/studio-workbench/StudioContext.tsx`:

```typescript
interface StudioState {
  // ... existing fields
  
  compositionFreeze: boolean;  // 新增：是否允许构图变化
  identityConsistencyActive: boolean;
  genMode: 'txt2img' | 'img2img' | 'img2video';
  currentInputImage?: string;
}

interface StudioDispatch {
  setCompositionFreeze: (value: boolean) => void;
  notifyCompositionWarning: () => void;
}
```

---

### **Step 2: 实现 Warning Handler**

在 `ComfyConsole.tsx` 中:

```typescript
const showToastCompositionWarning = useCallback(() => {
  // 检查是否需要警告
  if (
    identityConsistencyActive &&
    genMode === 'img2img' &&
    inputImage
  ) {
    const isNewFraming = Math.abs(
      (width / height) - (originalImageWidth / originalImageHeight)
    ) > 0.3;
    
    if (isNewFraming) {
      toast.info('构图大幅变化需提高 denoise', {
        description: '建议 denoise ≥ 0.6 以打破构图限制',
        action: (
          <Button
            size="sm"
            onClick={() => setDenoise(prev => Math.max(prev, 0.6))}
          >
            设为 0.6
          </Button>
        ),
        duration: 8000,
      });
    }
  }
}, [
  identityConsistencyActive,
  genMode,
  inputImage,
  width,
  height,
  originalImageWidth,
  originalImageHeight,
  setDenoise,
]);

// 暴露给全局使用
useEffect(() => {
  window.showToastCompositionWarning = showToastCompositionWarning;
  return () => {
    delete window.showToastCompositionWarning;
  };
}, [showToastCompositionWarning]);
```

---

## 🎨 **视觉示例**

### **正常状态：**
```
┌─────────────────────────────────────┐
│ 画面比例                             │
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐│
│ │▯3:4││▯9:16││▯2:3││▯1:1││▯4:3││▯16:9││ ← 无警告
│ │832×1216...                        │
└─────────────────────────────────────┘
```

### **警告状态 (构图变化):**
```
┌─────────────────────────────────────┐
│ ⚠️ 构图变化可能受限                   │
│ 身份锁定模式下，从裁剪切换到大比例     │
│ 变化可能需要更高 denoise 值           │
├─────────────────────────────────────┤
│ 画面比例                             │
│ ┌───✓┐ ┌───⚠┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐│
│ │▯3:4│ │▯9:16││▯2:3││▯1:1││▯4:3││▯16:9││ ← 新选项有警告图标
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘│
│         ↑ hover 放大                      │
└─────────────────────────────────────┘
```

---

## 📊 **用户交互流程图**

```mermaid
graph TD
    A[用户选择宽高比] --> B{identityLock 启用？}
    B -- No --> C[直接应用新尺寸]
    B -- Yes --> D{生图模式？}
    D -- txt2img --> C
    D -- img2img --> E{尺寸差异大？}
    E -- No --> F[直接应用，轻微警告]
    E -- Yes --> G[显示 Toast+Action 按钮]
    G --> H{用户点击自动调整？}
    H -- Yes --> I[setDenoise(0.65)]
    H -- No --> J[保持默认，用户手动调整]
    I --> K[开始生成]
    J --> K
```

---

## ✅ **验收标准**

1. ✅ Toast 仅在必要时触发（构图变化 + identityLock）
2. ✅ Action 按钮立即生效
3. ✅ 不会影响 txt2img 流程
4. ✅ UI 简洁不干扰创作流
5. ✅ 支持键盘/鼠标操作

---

## 💡 **后续优化建议**

1. **智能推荐 denoise 值**
   ```typescript
   const recommendedDenoise = computeRecommendedDenoise(
     originalWidth, originalHeight,
     newWidth, newHeight
   );
   // 根据比例变化幅度计算
   ```

2. **历史记录偏好**
   ```typescript
   // 记住用户的选择习惯
   localStorage.setItem('soulmate-comfy-preferred-denoise', '0.65');
   ```

3. **批量操作的预览**
   ```typescript
   // 在批量任务前统一提示
   toast.confirm('批量生成将使用统一的构图策略，确认？');
   ```
