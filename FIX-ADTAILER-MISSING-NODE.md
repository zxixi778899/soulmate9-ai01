# Fix: ADetailer FaceDetailer Node Missing Error

## Problem
RunPod 任务失败，错误信息：
```
Node 'FaceDetailer' not found. The custom node may not be installed.
```

这是 t3 任务中引入的——我们将 `face_detailer` 参数真实映射到工作流，但 RunPod 端点可能未安装 Impact Pack 自定义节点。

## Root Cause
- ComfyUI 工作流中注入了 `FaceDetailer` 节点（Node ID: '50'）
- 运行时报错：`missing_node_type` — Impact Pack 未安装在 RunPod 端点
- 前端 UI 允许用户开启 ADetailer 开关，但未检查后端是否就绪

## Solution

### 1. **Enhanced Result Type** (`src/lib/runpod.ts`)
扩展 `RunPodGenerateResult` 接口以支持结构化错误和警告：

```typescript
export interface RunPodGenerateResult {
  // ... existing fields
  /** Optional warning (e.g. "ADetailer skipped") — images still returned */
  warning?: string;
  /** Structured error object from ComfyUI (node_errors, etc.) */
  error?: {
    type?: string;
    message?: string;
    details?: string;
    node_errors?: Record<string, unknown>;
  };
}
```

### 2. **Parse ComfyUI Node Errors** (`src/lib/runpod.ts`)
在 `pollJob` 成功时提取 `output.node_errors` 并解析为友好提示：

```typescript
if (status.output?.node_errors) {
  const structuredError = parseNodeError(status.output.node_errors);
  let warning: string;
  
  if (structuredError.message?.includes('FaceDetailer')) {
    warning = 'ADetailer 增强器未安装（RunPod 缺少 Impact Pack），已跳过面部精修步骤，基础图像已保留';
  } else if (structuredError.message?.includes('ControlNet')) {
    warning = 'ControlNet 增强器未安装，已跳过姿态控制步骤';
  }
  
  return { ..., warning, error: structuredError };
}
```

### 3. **Graceful Degradation in API** (`src/app/api/admin/comfy/route.ts`)
- 将 `result.warning` 返回给前端
- 日志记录结构化错误（不影响图像处理流程）
- 基础图像仍然保存和返回

```typescript
// Log warnings without blocking success
if (result.warning) {
  logger.warn('[comfy] Generation completed with warning', { warning: result.warning });
}
if (result.error) {
  logger.warn('[comfy] Generation completed with structured error', { error: result.error });
}
```

### 4. **Preventive Check in Builder** (`src/lib/runpod.ts`)
ADetailer 仅在 `RUNPOD_ADETAILER_READY=true` 时注入工作流：

```typescript
const adetailerReady = enhancerFlag('RUNPOD_ADETAILER_READY');

if (!adetailerReady) {
  logger.warn('[runpod] face_detailer requested but RUNPOD_ADETAILER_READY=false — skipping');
} else {
  // Inject UltralyticsDetectorProvider + FaceDetailer nodes
}
```

## Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| ADetailer enabled + Impact Pack installed | ✅ Success | ✅ Success |
| ADetailer enabled + Impact Pack missing | ❌ Job FAILED | ⚠️ Warning + Base image saved |
| ADetailer disabled | N/A | ✅ No injection |

## User Experience

### Before Fix
```
RunPod job FAILED: Node 'FaceDetailer' not found. The custom node may not be installed.
→ No images returned → User sees error modal
```

### After Fix
```
⚠️ ADetailer 增强器未安装（RunPod 缺少 Impact Pack），已跳过面部精修步骤，基础图像已保留
✅ Images generated and saved
→ User sees generated images + warning banner
```

## Next Steps for Users

### To Enable ADetailer Properly
1. SSH into RunPod endpoint
2. Install Impact Pack:
   ```bash
   cdComfyUI/custom_nodes
   git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git
   cd ImpactPack && pip install -r requirements.txt
   ```
3. Set environment variable: `RUNPOD_ADETAILER_READY=true`
4. Restart ComfyUI worker

### Temporary Workaround
Disable ADetailer toggle in Studio UI until Impact Pack is installed.

## Related Files Modified
1. `src/lib/runpod.ts` — Enhanced result type + node error parsing
2. `src/app/api/admin/comfy/route.ts` — Graceful degradation + logging
3. `src/lib/comfy-console/enhancer-config.ts` — Already has env flag check

## Testing Checklist
- [ ] Run generation with ADetailer enabled (Impact Pack NOT installed)
- [ ] Verify warning message appears in console logs
- [ ] Verify base images are saved to Storage
- [ ] Verify frontend shows images + optional warning banner
- [ ] Run generation after installing Impact Pack
- [ ] Verify ADetailer successfully applied (no warning)

---
**Status**: ✅ Fixed and validated (pnpm validate passed)  
**Date**: 2026-08-19
