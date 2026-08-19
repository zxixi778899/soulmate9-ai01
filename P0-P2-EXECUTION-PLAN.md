# P0-P2 关键任务执行计划

**创建时间**: 2026 年 8 月 18 日  
**优先级**: P0 > P1 > P2  
**负责人**: 技术团队  

---

## 🎯 P0 (本周) - 紧急修复与核心优化

### 任务 1: img2img 完整测试 - 验证角色一致性 workflow

#### 背景
- **现状**: img2img 功能之前未生效，ComfyUI workflow 始终使用 EmptyLatentImage
- **影响**: 聊天生成的"自拍"与角色肖像完全无关，用户体验断裂
- **修复**: 已修复为 LoadImage + ImageScale，支持 portrait_url 参考图

#### 测试清单

✅ **1. 基础功能测试**
```typescript
// src/lib/runpod-img2img-builder.ts
// 验证 workflow 节点顺序:
LoadImage (portrait_url) 
→ ImageScale (lanczos → 768×1024)
→ VAEEncode 
→ KSampler (cfg=1, denoise=0.65, steps=28)
→ VAEDecode → SaveImage
```

✅ **2. denoise 参数边界测试**
| Denoise | 场景 | 预期结果 |
|---------|------|----------|
| 0.4-0.5 | 头像/肖像 | 高度一致，几乎不变 |
| 0.6-0.7 | 日常自拍 | 平衡（保留特征但有变化） ← **默认** |
| 0.8-0.9 | 大幅风格变化 | 低一致性，可能丢失面部特征 |

✅ **3. IP-Adapter 集成测试**
```typescript
// 验证人脸锁定是否启用
ApplyIPAdapterFlux (SigLIP 视觉编码器)
权重范围：0.3-0.7 (保证稳定性)
```

✅ **4. 场景用例测试**
- [ ] 聊天中发送 "发张你的照片" → img2img 生成当前女友肖像
- [ ] Studio 换装预览 → outfit 任务 denoise=0.72
- [ ] 更换姿势 → pose 任务 denoise=0.62
- [ ] 更换背景 → background 任务 denoise=0.5

#### 验收标准
- ✅ 生成功能正常，无报错
- ✅ 面部相似度 ≥ 70% (用户主观评估)
- ✅ 响应时间 < 10s (含排队)
- ✅ denoise 参数可按场景切换

#### 相关文件
- `src/lib/runpod-img2img-builder.ts`
- `src/lib/image-generation-routing.ts` (TASK_DENOISE_DEFAULTS)
- `src/app/api/chat/generate-image/route.ts`
- `src/lib/comfy-console/studio-profile.ts`

---

### 任务 2: 统一图片 Service - 合并 6 个重复路由

#### 现状分析

**当前 6 个重复路由**:
| 路由 | 后端 | 缓存 | 审核 | 问题 |
|------|------|------|------|------|
| `/api/runpod/generate` | runpodClient | ✅ 有 | ✅ 有 | 仅这个有缓存 |
| `/api/runpod/batch` | 内联 RunPod | ❌ 无 | ❌ 无 | 批量生成无保护 |
| `/api/chat/generate-image` | 内联 + fallback | ❌ 无 | ❌ 无 | 绕过缓存 |
| `/api/girlfriends/generate-portrait` | 内联 RunPod | ❌ 无 | ❌ 无 | 独立逻辑 |
| `/api/generate-image` | Coze 豆包 | ❌ 无 | ❌ 无 | 第三方依赖 |
| `/api/v2/admin/images/generate-from-meta` | 内联并行 | ❌ 无 | ❌ 无 | 管理专用 |

**核心问题**:
1. 同一个功能有 6 种实现，轮询间隔不同（1-4 秒），超时不同（300-800s）
2. `generation_cache` 只被 `runpodClient` 使用，其他路由完全绕过
3. 错误处理不一致，维护成本高

#### 设计方案

**新架构**:
```typescript
// src/lib/image-service.ts (新建)
class ImageService {
  /**
   * 统一入口：所有图片生成请求
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    // 1. Generation Cache 查询
    const cached = await this.checkGenerationCache(options);
    if (cached) return { url: cached, cached: true };

    // 2. 路由决策
    const route = resolveImageGenerationRoute(options);
    
    // 3. LoRA 选择
    const loraPlan = resolveModelLoraPlan({ ...options, route });
    
    // 4. RunPod 提交
    const job = await this.submitToRunPod(route, loraPlan, options);
    
    // 5. 轮询状态
    const result = await this.pollJobStatus(job);
    
    // 6. 存储 + 缓存
    const url = await this.uploadAndCache(result, options);
    
    // 7. 内容审核 (异步)
    this.moderateOutput(url).catch(console.warn);
    
    return { url, cached: false };
  }
}
```

#### 实施步骤

**Step 1: 创建 ImageService 基础框架**
```typescript
// src/lib/image-service.ts
export interface GenerateOptions {
  prompt: string;
  negativePrompt?: string;
  companionId?: string;
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  referenceImageUrl?: string; // img2img
  denoise?: number;           // img2img
  width?: number;
  height?: number;
  userId?: string;            // for rate limit
}

export interface GenerateResult {
  url: string;
  cached: boolean;
  jobId?: string;              // 异步模式返回 job id
  durationMs?: number;
}

class ImageService {
  private runpodClient: RunPodClient;
  private cache: GenerationCacheStore;
  private storage: StorageService;
  
  constructor() {
    this.runpodClient = new RunPodClient();
    this.cache = new GenerationCacheStore();
    this.storage = new StorageService();
  }
  
  // ... 见上方设计
}
```

**Step 2: Generation Cache 实现**
```typescript
// src/storage/database/generation-cache.ts
class GenerationCacheStore {
  async checkHash(options: GenerateOptions): Promise<string | null> {
    const hash = this.computeHash(options);
    const { data } = await supabase
      .from('generation_cache')
      .select('image_url')
      .eq('hash', hash)
      .maybeSingle();
    return data?.image_url || null;
  }
  
  private computeHash(options: GenerateOptions): string {
    return createHash('sha-256')
      .update(JSON.stringify(options))
      .digest('hex');
  }
}
```

**Step 3: 替换所有路由调用**
```typescript
// 旧代码：6 个路由各自调用
const url = await runpodClient.generateAndUpload(...);

// 新代码：统一调用
const result = await imageService.generate({
  prompt,
  surface: 'companion',
  category: 'female',
  renderStyle: 'realistic',
  nsfwIntensity: 3,
});
return Response.json(result);
```

**Step 4: 添加限流与配额检查**
```typescript
// src/lib/image-service.ts
async validateUserLimits(userId: string, surface: ImageSurface): Promise<void> {
  const membership = await this.getMembership(userId);
  
  const limits = {
    free: { imagesPerDay: 0 },
    pro: { imagesPerDay: 30 },
    unlimited: { imagesPerDay: 100 },
  };
  
  const dailyCount = await this.getDailyUsage(userId);
  const remaining = limits[membership] - dailyCount;
  
  if (remaining <= 0) {
    throw new Error('Image quota exceeded. Please upgrade your plan.');
  }
}
```

#### 验收标准
- ✅ 所有 6 个路由改为调用 ImageService
- ✅ Generation Cache 命中率提升至 30%+
- ✅ 成本降低 30%+ (从 $0.01 降至 $0.007/张)
- ✅ 代码行数减少 40%+ (消除重复逻辑)
- ✅ 错误处理统一，日志规范化

#### 风险与应对
| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| 重构引入新 Bug | 中 | 高 | 逐步迁移，先改 chat 路由做金丝雀发布 |
| Cache 命中率低 | 低 | 中 | 持续监控，优化哈希算法 |
| 性能下降 | 低 | 中 | 添加 Connection Pooling |

#### 时间估算
- Step 1-2: 4 小时 (开发 ImageService)
- Step 3: 6 小时 (逐个替换 6 个路由)
- Step 4: 2 小时 (限流配额)
- Testing: 4 小时 (单元测试 + E2E)
- **总计**: 16 小时 ≈ 2 个工作日

#### 相关文件
- `src/lib/runpod.ts` (RunPodClient)
- `src/app/api/runpod/generate/route.ts`
- `src/app/api/chat/generate-image/route.ts`
- `src/storage/database/schema.ts` (generation_cache table)

---

## 🔧 P1 (2 周) - 性能优化与新功能

### 任务 3: CDN 集成 - CloudFront 缓存优化

#### 目标
- **降低 S3 GET 成本**: 从 $0.0004/1000 次降至 $0.00008/1000 次 (**节省 80%**)
- **提升加载速度**: 全球边缘节点，LCP 降低 50%
- **减轻源站压力**: 90% 请求被 CDN 拦截

#### 技术方案

**AWS CloudFront 配置**:
```
Distribution Settings:
- Origin: s3://soulmate-images-production.s3.cn-north-1.amazonaws.com.cn
- Price Class: All (全球)
- Viewer Protocol Policy: Redirect HTTP to HTTPS
- OAuth: Cognito (可选，目前 presigned URL 已足够)
```

**Cache Behavior**:
```
Default Cache Behavior:
- Cache Policy: CachingOptimized
- Origin Request Policy: CORS Only + Query String Whitelist
- Compression: On
- Max TTL: 365 days (图片永缓存，通过文件名 hash 控制)
```

#### 实施步骤

**Step 1: 创建 CloudFront Distribution**
```bash
aws cloudfront create-distribution \
  --origins '{ "Quantity": 1, "Items": ["https://soulmate-images.s3.cn-north-1.amazonaws.com.cn"]}' \
  --default-cache-policy '{ "Name": "CachingOptimized", "DefaultTTL": 86400, "MaxTTL": 31536000 }'
```

**Step 2: 修改 Storage Service**
```typescript
// src/lib/storage.ts
export function toPublicUrl(key: string): string | null {
  const bucket = resolveBucketName();
  
  // 检查 CloudFront 域名是否配置
  const cdnDomain = process.env.CLOUDFRONT_DOMAIN;
  if (cdnDomain) {
    return `https://${cdnDomain}/${bucket}/${key}`;
  }
  
  // Fallback 到 S3 presigned URL
  return generatePresignedUrl(bucket, key);
}
```

**Step 3: 更新图片上传逻辑**
```typescript
// 上传时同时写入 CDN 缓存 (自动)
await uploadFile(buffer, key, mimeType, cdnInvalidate: true);
```

**Step 4: 缩略图预生成**
```typescript
// 上传原图后同步生成缩略图
async function generateThumbnails(originalUrl: string) {
  const sizes = [
    { w: 128, h: 128, path: 'thumbnails/128x128' },  // Avatar
    { w: 256, h: 256, path: 'thumbnails/256x256' },  // Grid
    { w: 512, h: 512, path: 'thumbnails/512x512' },  // Preview
  ];
  
  for (const size of sizes) {
    const thumbnail = await resizeImage(originalUrl, size.w, size.h);
    await uploadFile(thumbnail, `${size.path}/${filename}`, 'image/webp');
  }
}
```

#### 成本收益分析
| 指标 | 优化前 | 优化后 | 改善 |
|------|--------|--------|------|
| S3 GET 成本/$/百万次 | $0.40 | $0.08 | **-80%** |
| 图片加载时间 | 800ms | 300ms | **-62%** |
| 带宽成本 | $100/月 | $70/月 | **-30%** |

#### 验收标准
- ✅ CloudFront Distribution 创建成功
- ✅ 图片加载时间 LCP < 1.5s (95 分位)
- ✅ S3 GET 请求量降 80%+
- ✅ 所有生产环境图片走 CDN

#### 时间估算
- Step 1-2: 4 小时
- Step 3-4: 4 小时
- Testing: 2 小时
- **总计**: 10 小时 ≈ 1.5 个工作日

---

### 任务 4: Whisper STT - 语音转文字功能集成

#### 目标
- **功能**: 用户上传语音消息 → 自动转录为文字 → 进入聊天流程
- **成本**: ~$0.006/分钟 (RunPod Whisper)
- **延迟**: 2-5 秒 (取决于语音时长)

#### 技术方案

**架构**:
```
用户发送语音 (WebM/Opus)
  ↓
Upload to S3 (临时存储)
  ↓
POST /api/audio/transcribe
  ↓
Whisper via RunPod (GPU)
  ↓
返回 transcription: "你好，今天怎么样？"
  ↓
继续正常聊天流程 (transcription 作为用户消息)
```

#### 实施步骤

**Step 1: 创建 STT API 路由**
```typescript
// src/app/api/audio/transcribe/route.ts
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth';
import { transcribeWithWhisper } from '@/lib/whisper-stt';

export async function POST(req: Request) {
  const user = await requireAuth(req);
  
  // 1. 读取音频文件
  const formData = await req.formData();
  const audioFile = formData.get('audio') as File;
  
  // 2. 上传到 S3
  const key = `temp/stt/${user.id}/${Date.now()}.webm`;
  const arrayBuffer = await audioFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const { url: audioUrl } = await uploadFile(buffer, key, 'audio/webm');
  
  // 3. 限流检查 (免费用户禁用，Pro 10 条/天，Unlimited 无限)
  const sttQuota = await checkSTTQuota(user.id);
  if (!sttQuota.allowed) {
    return Response.json({ error: 'STT quota exceeded' }, { status: 403 });
  }
  
  // 4. Whisper 转录
  const transcription = await transcribeWithWhisper(audioUrl);
  
  // 5. 清理临时文件
  await deleteFile(key);
  
  return Response.json({ transcription });
}
```

**Step 2: Whisper 服务实现**
```typescript
// src/lib/whisper-stt.ts
export async function transcribeWithWhisper(audioUrl: string): Promise<string> {
  // 方案 A: RunPod Self-hosted Whisper
  const endpointId = process.env.WHISPER_RUNPOD_ENDPOINT_ID;
  if (endpointId) {
    return transcribeViaRunPod(audioUrl, endpointId);
  }
  
  // 方案 B: Replicate Whisper (备用)
  return transcribeViaReplicate(audioUrl);
}

async function transcribeViaRunPod(audioUrl: string, endpointId: string): Promise<string> {
  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        audio_url: audioUrl,
        language: 'en',  // 可检测或用户指定
      },
    }),
  });
  
  const result = await response.json();
  return result.output.transcript; // 根据实际 API 结构调整
}
```

**Step 3: 前端 UI 组件**
```typescript
// src/components/ChatVoiceRecorder.tsx
'use client';

export function ChatVoiceRecorder({ onTranscribe }: { onTranscribe: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setIsRecording(true);
    // ... 录音逻辑
  };
  
  const stopRecording = async () => {
    // 停止录音并上传
    const audioFile = await getAudioFile();
    setTranscribing(true);
    
    const response = await fetch('/api/audio/transcribe', {
      method: 'POST',
      body: FormData.append('audio', audioFile),
    });
    
    const { transcription } = await response.json();
    onTranscribe(transcription);
    setTranscribing(false);
  };
  
  return (
    <button onClick={isRecording ? stopRecording : startRecording}>
      {isRecording ? '🔴 点击结束' : '🎤 点击录音'}
      {transcribing && '⏳ 转录中...'}
    </button>
  );
}
```

#### 验收标准
- ✅ 上传 WebM/MP3格式音频
- ✅ 转录准确率 > 90% (英语)
- ✅ 响应时间 < 5 秒 (10 秒语音)
- ✅ 限流正常工作
- ✅ 免费用户无法使用

#### 时间估算
- Step 1-2: 6 小时 (API + Whisper 服务)
- Step 3: 4 小时 (前端组件)
- Testing: 2 小时
- **总计**: 12 小时 ≈ 1.5 个工作日

---

## 🚀 P2 (4 周) - 高级功能突破

### 任务 5: 视频生成 - AnimateDiff ComfyUI workflow

#### 目标
- **功能**: 文生视频 / 图生视频 (2-5 秒)
- **技术**: RunPod ComfyUI + AnimateDiff 插件
- **成本**: ~$0.04/条 (2 秒视频)

#### 实施方案

**ComfyUI Workflow 设计**:
```json
{
  "nodes": [
    {"id": 1, "type": "LoadVideo", "inputs": {"url": "portrait.jpg"}},
    {"id": 2, "type": "AnimateDiffLoader", "inputs": {"model": "moondance.safetensors"}},
    {"id": 3, "type": "KSampler", "inputs": {"frames": 16, "fps": 8}},
    {"id": 4, "type": "VHS_VideoCombine", "inputs": {"format": "mp4"}}
  ]
}
```

**分层配额**:
| 用户层 | 视频配额 | 时长 | 分辨率 |
|--------|---------|------|--------|
| Free   | 0       | —    | —      |
| Pro    | 5 条/天  | 2 秒  | 512×768|
| Unlim  | 30 条/天 | 5 秒  | 768×1024|

#### 时间估算
- Week 1: ComfyUI workflow 设计与调试
- Week 2: API 路由集成 + 限流配额
- Week 3: 前端 UI (视频播放器 + 上传控件)
- Week 4: 测试优化 + 成本缓存策略

**总计**: 80 小时 ≈ 5 个工作日

---

### 任务 6: pgvector 记忆 - 深度记忆召回系统

#### 目标
- **当前**: 正则表达式匹配关键词 (~3000 tokens context)
- **目标**: pgvector 向量嵌入 + 语义召回 (~10000 tokens context)
- **优势**: 长期记忆、场景关联、跨对话学习

#### 技术方案

**数据库 Schema**:
```sql
-- src/db/migrations/xxx_pgvector_memory.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,          -- "用户说喜欢蓝色"
  embedding vector(1536),         -- Voyage AI Embedding
  metadata JSONB,                 -- {date, context, sentiment}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_embedding ON memories 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```

**Embedding 服务**:
```typescript
// src/lib/pgvector-memory.ts
import { createClient } from '@supabase/supabase-js';
import voyage from 'voyage-ai-node';

export class MemoryService {
  private supabase: SupabaseClient;
  private voyage = new Voyage(process.env.VOYAGE_AI_API_KEY);
  
  async saveMemory(userId: string, content: string): Promise<void> {
    // 1. 生成向量嵌入
    const embedding = await this.voyage.embed(content);
    
    // 2. 存入数据库
    await this.supabase
      .from('memories')
      .insert({
        user_id: userId,
        content,
        embedding,
        metadata: { date: new Date().toISOString() },
      });
  }
  
  async retrieveSimilar(userId: string, query: string, topK = 3): Promise<Memory[]> {
    const queryEmbedding = await this.voyage.embed(query);
    
    const { data } = await this.supabase
      .rpc('memory_search', {
        query_vector: queryEmbedding,
        top_k: topK,
        user_id: userId,
      });
    
    return data;
  }
}
```

**聊天上下文注入**:
```typescript
// src/app/api/chat/stream/route.ts
// 原有代码：
const recentMessages = await loadRecentMessages(userId, 20);

// 新代码：
const [recentMessages, relevantMemories] = await Promise.all([
  loadRecentMessages(userId, 20),
  memoryService.retrieveSimilar(userId, currentMessage, 3),
]);

const systemPrompt = `
${basePersonality}
最近相关记忆: ${relevantMemories.map(m => m.content).join('\n')}
最近对话：${recentMessages.slice(-5)}
`;
```

#### 时间估算
- Week 1: 数据库 Schema + Migration
- Week 2: Embedding 服务 + 向量检索 API
- Week 3: 聊天系统集成
- Week 4: 性能优化 (Batch Embedding, Cache)

**总计**: 80 小时 ≈ 5 个工作日

---

## 📊 总体进度规划

| 阶段 | 任务 | 工时估算 | 持续时间 | 交付物 |
|------|------|----------|----------|--------|
| **P0** | img2img 测试 | 8h | 1 周 | 测试报告 + 修复确认 |
| **P0** | 统一图片 Service | 16h | 1 周 | ImageService 重构完成 |
| **P1** | CDN 集成 | 10h | 2 周 | CloudFront 上线 + 性能提升 |
| **P1** | Whisper STT | 12h | 2 周 | 语音消息功能可用 |
| **P2** | 视频生成 | 80h | 4 周 | 图生视频 MVP |
| **P2** | pgvector 记忆 | 80h | 4 周 | 深度记忆系统 |

**总工时**: ~206 小时 ≈ **13 个工作日**

---

## ⚠️ 风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| RunPod 服务不稳定 | 中 | 高 | 多端点 failover (fal.ai + Together) |
| GPU 成本超预算 | 中 | 高 | 严格配额 + Generation Cache + Spot 实例 |
| Whsiper 延迟高 | 低 | 中 | 预加载模型到内存 + 异步处理 |
| pgvector 检索慢 | 低 | 中 | IVFFlat 索引 + HNSW 优化 |
| 重构引入 Bug | 中 | 高 | 金丝雀发布 + 自动化测试覆盖 |

---

## ✅ 验收 checklist

### P0 验收
- [ ] img2img 角色一致性测试通过 (相似度 ≥ 70%)
- [ ] 6 个图片路由全部改用 ImageService
- [ ] Generation Cache 命中率 ≥ 30%
- [ ] 无回归 Bug (原有功能正常)

### P1 验收
- [ ] CloudFront CDN 配置完成，图片加载时间 < 1.5s
- [ ] S3 GET 请求量降低 80%+
- [ ] Whisper STT 可用，转录准确率 > 90%
- [ ] 语音消息功能端到端流畅

### P2 验收
- [ ] 视频生成功能可用 (2-5 秒 mp4)
- [ ] 视频配额系统正常工作
- [ ] pgvector 记忆召回准确率高 (>80%)
- [ ] 聊天上下文包含长期记忆，体验自然

---

**最后更新**: 2026 年 8 月 18 日  
**版本**: v1.0  
**审批人**: [待填写]
