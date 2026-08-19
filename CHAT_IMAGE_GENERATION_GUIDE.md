# 💬 对话页图生图功能实现指南

## 📋 功能概述

在聊天页面中集成智能图片生成系统，根据对话上下文自动优化提示词并生成高质量图片。

### 核心特性

1. **上下文感知的提示词优化** - LLM 分析聊天历史，提取视觉元素
2. **多类型生成支持** - 换装、换姿势、换场景、重新生成
3. **渐进式进度反馈** - 实时进度条显示生成状态
4. **批量生成能力** - 支持一次生成 1-4 张图片
5. **参考图融合** - 可上传参考图或自动使用现有角色图像

---

## 🏗️ 架构设计

```mermaid
flowchart TD
    Client[聊天客户端] --> HTTP[HTTP Request]
    HTTP --> API[/api/chat/generate-image-from-context/ route.ts]
    
    API --> Auth{验证用户}
    Auth -->|成功 | Context[获取聊天历史]
    Auth -->|失败 | Error401
    
    Context --> LLM[LLM Prompt Enhancement]
    LLM --> Prompt{有提示词？}
    Prompt -->|是 | Use[使用现有提示词]
    Prompt -->|否 | ContextAnalyze[分析对话上下文]
    
    ContextAnalyze --> Extract[提取视觉元素]
    Extract --> BuildPrompt[构建增强提示词]
    BuildPrompt --> Route[路由到 Image Generation]
    
    Use --> Route
    Route --> Params[解析生成参数]
    Params --> GenWorker[RunPod 生成工作流]
    
    GenWorker --> Progress[进度监控]
    Progress --> Polling{轮询状态}
    
    Polling -->|pending| Progress
    Polling -->|success| Upload[上传到 Storage]
    Polling -->|error| Error500
    
    Upload --> SaveDB[保存到数据库]
    Save --> Response[返回结果]
    
    Response --> Client
```

---

## 🔧 后端 API

### 端点信息

**路径**: `/api/chat/generate-image-from-context`  
**方法**: `POST`  
**鉴权**: 需要用户登录

### 请求参数

```typescript
interface GenerateImageRequest {
  girlfriend_id: string;           // ✅ 必需 - 伴侣 ID
  message?: string;                // 用户输入的提示词（用于上下文分析）
  existing_prompt?: string;        // 直接提供的提示词（跳过优化）
  context_type?: 'outfit'          // 上下文类型
    | 'pose' 
    | 'scene' 
    | 'portrait';
  reference_image_url?: string;    // 参考图 URL
  count?: number;                  // 生成数量 (1-4, default: 1)
  nsfw_intensity?: number;         // NSFW 级别 (1-5, default: 1)
}
```

### 响应格式

#### 成功响应

```json
{
  "success": true,
  "images": [
    "https://.../chat-images/gf_123_1723894561.png"
  ],
  "prompt_generated": "natural editorial photograph with realistic skin texture, gorgeous young adult female age 22-28 named Alice, Asian features...",
  "count": 1,
  "message": "Images are being generated..."
}
```

#### 异步处理响应

```json
{
  "success": true,
  "pending_jobs": [
    {
      "job_id": "abc-123-def",
      "endpoint_id": "wozrrlcdipyl3p"
    }
  ],
  "count": 1,
  "message": "Images are being generated. Poll /api/ai/status?job_id=<job_id>"
}
```

#### 错误响应

```json
{
  "error": "Unauthorized",
  "status": 401
}
```

---

## 🎨 前端组件

### 使用方式

```tsx
import { ChatImageGenerator } from '@/components/chat-image-generator';

// In your chat component
<ChatImageGenerator 
  girlfriendId={girlfriend.id}
  onImageGenerated={(imageUrl) => {
    // Handle new image
    setMessages(prev => [...prev, { type: 'image', url: imageUrl }]);
  }}
/>
```

### Props 接口

```typescript
interface ChatImageGeneratorProps {
  /** 伴侣 ID */
  girlfriendId: string;
  
  /** 图片生成回调 */
  onImageGenerated?: (imageUrl: string) => void;
}
```

### UI 组成部分

| 组件 | 功能 | 状态管理 |
|------|------|----------|
| 上下文类型选择器 | portrait/outfit/pose/scene | Local state |
| 提示词输入框 | 文本输入 | Controlled input |
| 进度条 | 实时生成进度 | State + polling |
| 文件上传 | 参考图选择 | FileReader API |
| 预览区域 | 显示选中的图片 | Base64 preview |
| 数量选择器 | 1-4 张可选 | Dropdown |

---

## 🤖 LLM 提示词优化逻辑

### 流程

```python
def enhance_prompt(context, context_type):
    1. 提取最近 20 条聊天记录
    2. 调用 LLM 分析对话语义
    3. 根据 context_type 聚焦视觉元素:
       - outfit: 提取服装、配饰描述
       - pose: 提取动作、姿态关键词
       - scene: 提取背景、环境、光照
       - portrait: 综合所有视觉特征
    
    4. 生成结构化提示词:
       medium, character, ethnicity, face, hair, eyes, body, clothes, style, quality_enhancers
    
    5. 截断至 700 字符，保留逗号分隔格式
    
    return enhanced_prompt
```

### 示例

**用户输入**: "她穿这件白色连衣裙看起来怎么样？配高跟鞋好吗？"

**优化后的提示词**:
```
natural editorial photograph with realistic skin texture, 
gorgeous young adult female age 22-28 named Sarah, 
mixed features, oval face shape, long wavy brown hair, 
brown eyes looking at viewer, slim athletic build, 
wearing elegant white knee-length dress with high heels, 
soft natural lighting, clear eyes, complete head in frame, 
photorealistic detail, fashion photography composition
```

---

## 🔒 安全与权限

### 访问控制

1. **身份验证**: 必须登录且 token 有效
2. **伴侣归属**: 只能为已拥有的或公开的伴侣生成
3. **NSFW 过滤**: 内容审核拦截违规请求

### Rate Limiting

```typescript
const PORTRAIT_GEN_LIMIT = {
  maxRequests: 10,   // 每分钟
  windowMs: 60 * 1000
};
```

---

## ⚙️ 技术栈依赖

### 必需

- **Next.js 15+** App Router
- **Supabase** Database + Storage
- **RunPod** GPU Worker (FLUX model)
- **LLM Service** for prompt enhancement

### 可选增强

- `RUNPOD_ADETAILER_READY=true` - 面部细节增强
- `RUNPOD_UPSCALE_READY=true` - 超分辨率放大
- `RUNPOD_CONTROLNET_READY=true` - 深度控制

---

## 📊 性能指标

### 生成时间

| 阶段 | 耗时 | 说明 |
|------|------|------|
| LLM 优化提示词 | ~2-3s | 取决于 LLM 速度 |
| FLUX 基础生成 | ~6-8s | 24 steps @ 1024x1536 |
| ADetailer 增强 | +3-5s | 如果启用 |
| Upscale 放大 | +5-8s | 如果启用 2x |
| Storage 上传 | ~1-2s | CDN 传输 |
| **Total (SFW)** | **~12-15s** | 无增强 |
| **Total (Enhanced)** | **~20-30s** | 完整增强链 |

### 成本估算

- RunPod GPU: $0.28/hour × 3min/job ≈ $0.014/image
- LLM prompt opt: ~$0.005/job
- Total per job: **≈ $0.019**

---

## 🧪 测试场景

### Test 1: 基本生成流程

```bash
# Create test message
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "message": "你今天好漂亮",
    "girlfriend_id": "<GF_ID>"
  }'

# Generate image with context
curl -X POST http://localhost:3000/api/chat/generate-image-from-context \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "girlfriend_id": "<GF_ID>",
    "message": "穿红色礼服参加晚宴",
    "context_type": "outfit"
  }'
```

### Test 2: 批量生成 + 进度监控

```javascript
// Frontend JS test
const res = await fetch('/api/chat/generate-image-from-context', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    girlfriend_id: gfId,
    message: '海边度假场景',
    context_type: 'scene',
    count: 4
  })
});

const result = await res.json();
console.log(result); // { success: true, pending_jobs: [...] }

// Poll each job
for (const job of result.pending_jobs) {
  const pollUrl = `/api/ai/status?job_id=${job.job_id}`;
  const pollRes = await fetch(pollUrl);
  const status = await pollRes.json();
  console.log('Status:', status);
}
```

### Test 3: 使用自定义提示词

```bash
curl -X POST http://localhost:3000/api/chat/generate-image-from-context \
  -H "Content-Type: application/json" \
  -d '{
    "girlfriend_id": "<GF_ID>",
    "existing_prompt": "cinematic shot, girl in yellow summer dress standing by ocean",
    "count": 1
  }'
```

---

## 🚀 部署步骤

### Step 1: 环境变量配置

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
COZE_SUPABASE_URL=xxx
COZE_SUPABASE_SERVICE_ROLE_KEY=xxx

# RunPod
RUNPOD_ENDPOINT_ID=wozrrlcdipyl3p
RUNPOD_API_KEY=xxx

# Optional Enhancers
RUNPOD_ADETAILER_READY=true
RUNPOD_UPSCALE_READY=true
```

### Step 2: 代码提交

```bash
git add src/app/api/chat/generate-image-from-context/route.ts
git add src/components/chat-image-generator.tsx
git commit -m "feat: add contextual image generation to chat

- LLM-powered prompt optimization based on conversation history
- Progress bar for real-time feedback
- Support for outfit/pose/scene/portrait contexts
- Batch generation up to 4 images"
git push origin main
```

### Step 3: Vercel 部署

等待自动部署完成，然后访问聊天页面测试新功能。

---

## 📈 后续优化方向

### Phase 2: 高级功能

1. **历史记忆持久化** - 保存生成的 prompt 供下次复用
2. **风格迁移** - 允许用户上传风格参考图
3. **A/B 测试对比** - 同时生成多个版本让用户选择
4. **模板库** - 内置常用场景的预设 prompt

### Phase 3: 商业化

1. **积分消耗** - 每次生成消耗一定积分
2. **会员特权** - Unlimited 会员无限次生成
3. **优先队列** - Pro 会员加速通道

---

## ⚠️ Known Issues & Fixes

### Issue 1: 进度条不更新

**原因**: Polling interval 设置过短或过长  
**解决**: 调整 `setInterval(..., 3000)` 到合适值

### Issue 2: 提示词优化失败

**原因**: LLM service 超时或错误  
**解决**: 添加 fallback 到基础提示词生成逻辑

### Issue 3: 大量并发时 GPU 排队

**原因**: RunPod worker 负载过高  
**解决**: 实施队列系统 + 消息通知

---

*Created: August 17, 2026*  
*Author: Qoder AI Agent*  
*Status: Ready for Testing*  
*Next: QA Validation & User Acceptance Testing*
