# RunPod 多端点故障转移系统设计

## 🎯 **设计目标**

1. **自动故障转移**: FLUX → SDXL → FLUX Backup
2. **30 秒超时机制**: 每个端点最多等待 30 秒
3. **兜底方案**: 三层保护确保生图成功
4. **完整日志**: 追踪使用的模型和进度
5. **电路断路器**: 避免频繁访问失败端点

---

## 🏗️ **架构设计**

### **1. 三层端点策略**

```
Primary (FLUX):     RUNPOD_ENDPOINT_ID
    ↓ 30s timeout
Fallback 1 (SDXL):  RUNPOD_ENDPOINT_ID_SDXL
    ↓ 30s timeout
Fallback 2 (FLUX):  Same as Primary (retry) or alternate backup
```

### **2. 电路断路器模式 (Circuit Breaker)**

- **阈值**: 连续 5 次失败后打开断路器（停止访问）
- **冷却时间**: 5 分钟后自动尝试恢复
- **状态追踪**: `consecutiveFailures`, `isOpen`, `lastFailure`

### **3. 关联 ID 追踪系统**

每次生成分配唯一 `correlationId`，贯穿所有重试：
```typescript
rp_1724006800000_abc123xyz
```

---

## 🔧 **使用方式**

### **Step 1: 导入故障转移引擎**

```typescript
import { runPodFailoverGenerate } from '@/lib/runpod-failover';
import { runpodClient } from '@/lib/runpod';
import { logger } from '@/lib/logger';

// 准备 generation options
const fluxOptions = {
  prompt: '...SFW prompt...',
  negative_prompt: '...',
  steps: 28,
  model_family: 'flux',
  // ... other options
};

const sdxlOptions = {
  prompt: '...SFX prompt with pony tags...',
  negative_prompt: '...',
  steps: 20,
  model_family: 'pony',
  // ... other options
};
```

### **Step 2: 调用故障转移生成**

```typescript
try {
  const result = await runPodFailoverGenerate(
    // Primary: FLUX generate
    async () => await runpodClient.generate(fluxOptions),
    
    // Fallback 1: SDXL generate  
    async () => await runpodClient.generate(sdxlOptions),
    
    // Fallback 2: Retry FLUX (same options or different)
    async () => await runpodClient.generate(fluxOptions)
  );
  
  logger.info('✅ Image generation succeeded', {
    imagesCount: result.images?.length,
    job_id: result.job_id,
  });
  
  return result;
  
} catch (error) {
  logger.error('🚨 All endpoints failed', { error });
  throw error;
}
```

---

## 📊 **日志输出示例**

### ✅ **成功场景**

```
[runpod-failover] starting generation workflow { correlationId: "rp_xxx" }
[runpod-failover] generation attempt { endpointType: "flux-primary", attempt: "1/2" }
[runpod-failover] ✅ SUCCESS - primary FLUX endpoint {
  imagesCount: 4,
  executionTimeMs: 12500,
  endpointId: "wozrrlcdipyl3p"
}
```

### ⚠️ **故障转移场景**

```
[runpod-failover] starting generation workflow { correlationId: "rp_xxx" }
[runpod-failover] generation attempt { endpointType: "flux-primary", attempt: "1/2" }
[runpod-failover] ⚠️ TIMEOUT - switching to SDXL { waitedMs: 30000 }
[runpod-failover] circuit breaker OPENED for endpoint { consecutiveFailures: 5 }
[runpod-failover] ⏸️ SKIPPED - circuit breaker OPEN for primary FLUX
[runpod-failover] generation attempt { endpointType: "sdxl", attempt: "2/2" }
[runpod-failover] ✅ SUCCESS - SDXL fallback endpoint {
  reason: "failed over from primary FLUX"
}
```

### 🚨 **全部失败场景**

```
[runpod-failover] 🚨 ALL ENDPOINTS FAILED {
  totalElapsedMs: 90000,
  lastError: "All generation endpoints failed after 90000ms."
  fluxPrimaryHealth: { consecutiveFailures: 5, isOpen: true },
  sdxlHealth: { consecutiveFailures: 3, isOpen: false }
}
```

---

## 🔍 **环境配置**

确保 `.env.local` 包含以下变量：

```bash
# Primary FLUX endpoint
RUNPOD_API_KEY=rpa_REDACTED
RUNPOD_ENDPOINT_ID=wozrrlcdipyl3p  # Your main ComfyUI/FLUX endpoint

# SDXL fallback endpoint
RUNPOD_ENDPOINT_ID_SDXL=kbca2e380jc74s  # SDXL worker
RUNPOD_SDXL_MODELS_READY=true
RUNPOD_SDXL_CHECKPOINTS=ponyRealism_V22.safetensors,waiMatureIllustrious_v20.safetensors
```

---

## 🛡️ **兜底方案详情**

### **Level 1: 快速超时检测**

- 每个请求设置 30 秒超时（`ENDPOINT_TIMEOUT_MS`）
- 超过时限立即切换到下一个端点
- 不阻塞 Vercel 300 秒 serverless timeout

### **Level 2: 端点降级**

```
Flux Unavailable → SDXL Available? 
    ↓ Yes      → Use SDXL (pony/illustrious)
    ↓ No       → Try SDXL again or fail back to FLUX
```

### **Level 3: 本地容错（可选扩展）**

如果所有云端端点都失败，可以考虑：

1. **缓存上次结果**: 返回最近的生成图片
2. **降级文本模式**: 跳过生图直接进入聊天
3. **队列重试**: 稍后异步重试并通知用户

---

## 📈 **监控指标**

系统自动记录以下指标：

| Metric | Description |
|--------|-------------|
| `IMAGE_GENERATION_START` | 每次生成的开始时间 |
| `IMAGE_GENERATION_SUCCESS` | 成功时间和端点类型 |
| `IMAGE_GENERATION_FAILOVER` | 触发故障转移（从 FLUX→SDXL） |
| `IMAGE_GENERATION_FAILURE` | 所有端点失败的错误信息 |

通过 [analytics.ts](file:///c:/Users/71489/soulmate9/src/lib/analytics.ts) 发送到后端分析。

---

## 🧪 **测试建议**

### **1. 正常流程测试**

```bash
# Test 1: Primary endpoint works quickly
curl http://localhost:5000/api/test/generate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"scenario":"normal"}'
```

预期：FLUX endpoint 在 10-20 秒内完成

### **2. 超时切换测试**

模拟 primary endpoint 缓慢响应：

```typescript
// Simulate slow primary
await runPodFailoverGenerate(
  async () => { await new Promise(r => setTimeout(r, 35000)); return {}; }, // Slow FLUX
  async () => ({ images: ['http://test.com'], job_id: 'sdxl-job' }),        // Fast SDXL
  async () => ({})                                                           // Backup
);
```

预期：30 秒后自动切换到 SDXL

### **3. 全部失败测试**

```typescript
try {
  await runPodFailoverGenerate(
    async () => { throw new Error('Error A'); },
    async () => { throw new Error('Error B'); },
    async () => { throw new Error('Error C'); }
  );
} catch (error) {
  console.log('Caught:', error.message); // Should contain all errors
}
```

预期：抛出详细错误，包含 3 次尝试的信息

---

## ⚙️ **可配置参数**

在 `runpod-failover.ts` 中调整：

```typescript
export const ENDPOINT_TIMEOUT_MS = 30000;        // Change timeout
export const MAX_RETRIES = 2;                    // More retry attempts
export const CIRCUIT_BREAKER_THRESHOLD = 5;      // Higher/lower threshold
```

---

## 🔐 **安全注意事项**

1. ❌ **不要硬编码 API key**: 始终使用环境变量
2. ✅ **敏感字段 redact**: logger 自动过滤 API keys
3. ✅ **错误信息脱敏**: 不暴露内部端点详细信息给前端
4. ✅ **限流保护**: 结合 `@/lib/rate-limit` 使用

---

## 📝 **集成示例**

### **修改 `/api/admin/comfy/route.ts`**

```typescript
import { runPodFailoverGenerate } from '@/lib/runpod-failover';

export async function POST(req: Request, context: AppRouteContext) {
  try {
    // Build generation parameters
    const fluxParams = buildWorkflow(options, 'flux');
    const sdxlParams = buildWorkflow(options, 'pony');
    
    // Execute with failover
    const result = await runPodFailoverGenerate(
      async () => await runpodClient.generate(fluxParams),
      async () => sdxlParams && await runpodClient.generate(sdxlParams),
      async () => await runpodClient.generate(fluxParams) // Retry
    );
    
    return NextResponse.json({
      success: true,
      job_id: result.job_id,
      images: result.images,
    });
    
  } catch (error) {
    logger.error('[comfy-failover] generation failed', { error });
    return NextResponse.json(
      { error: 'Generation failed after trying all endpoints' },
      { status: 503 }
    );
  }
}
```

---

## 🚀 **下一步优化**

1. **智能路由**: 根据历史成功率自动排序端点优先级
2. **健康检查**: 定时 ping 端点提前发现问题
3. **性能分析**: 比较不同端点的平均响应时间
4. **费用追踪**: 记录哪个端点被优先使用（成本优化）
