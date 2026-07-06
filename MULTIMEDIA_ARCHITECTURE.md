## SoulMate AI 多媒体架构方案：聊天 / 图片 / 视频 / 语音

> 设计原则：**成本优先分层 + 角色一致性 + 渐进增强**
> 免费用户享受基础体验，付费用户解锁高质量多模态，每一层都有明确的升级触发点。

---

### 一、聊天（Chat）— 核心体验层

#### 1.1 模型分层策略

| 用户层级 | 主模型 | 降级链 | 单条成本 | 响应速度 |
|----------|--------|--------|----------|----------|
| **Free** | doubao-seed-2-0-lite | doubao-seed-2-0-mini | ~$0.0002 | <1s |
| **Pro** | doubao-seed-2-0-pro | claude-3-5-haiku → llama-local | ~$0.001 | 1-2s |
| **Unlimited** | doubao-seed-2-0-pro (thinking mode) | claude-3-5-sonnet → deepseek-v3 | ~$0.003 | 2-4s |

**关键优化：**
- **免费用户**用最便宜的 lite 模型，回复简短（system prompt 限制 max_tokens: 150）
- **Pro/Unlimited** 用 pro 模型，支持长回复（max_tokens: 800）+ thinking mode
- 意图路由（`llm-router.ts`）决定是否需要 complex_reasoning 模式
- 情感检测用本地 Llama 3.1（免费），不影响主模型预算

#### 1.2 流式响应架构

```
用户消息 → Rate Limit → Promise.all(并行查询) → LLM SSE 流 → 保存消息
                              ↓
                    ┌─────────┼──────────┐
                    │         │          │
               Profile    Girlfriend  Recent Messages
               (tier/     (name/      (last 20 for
                limits)    personality) context)
                    │         │          │
                    └─────────┼──────────┘
                              ↓
                    Emotion Detection (async, 不阻塞)
                              ↓
                    Memory Extraction (fire-and-forget)
```

**已实现的优化：**
- 4 次核心 DB 查询改为 `Promise.all()` 并行（延迟降低 ~60%）
- 情感检测异步运行，不阻塞首 token 响应
- 记忆提取 fire-and-forget，不影响聊天流

#### 1.3 上下文窗口管理

| 策略 | 实现 | Token 成本 |
|------|------|-----------|
| System Prompt | 角色人设 + 关系阶段 + NSFW 开关 | ~500 tokens |
| 最近消息 | 最后 20 条（截断长内容） | ~2000 tokens |
| 记忆注入 | 相关记忆 top-3 | ~300 tokens |
| Lore 上下文 | 世界观匹配 top-2 | ~200 tokens |
| **总计** | | **~3000 tokens input** |

---

### 二、图片（Image）— 视觉体验层

#### 2.1 统一图片 Service 架构

当前有 6 个重复的图片生成路由。统一为单一 `ImageService`：

```
                        ┌──────────────────────┐
                        │   ImageService        │
                        │   (src/lib/image-service.ts) │
                        ├──────────────────────┤
                        │                      │
  请求 ──→ Generation ──→ ComfyUI ──→ Upload ──→ 返回 URL
           Cache Check    (RunPod)    (S3/OSS)
           ↓ (命中)
           直接返回缓存 URL
```

**核心特性：**
- 统一入口 `ImageService.generate(options)` 替代所有 6 个路由
- 统一的 generation_cache 查询（SHA-256 哈希去重）
- 统一的 RunPod 客户端（可配置超时/重试/GPU 类型）
- 统一的内容审核（输入 prompt + 输出图片）

#### 2.2 角色一致性方案（img2img）

**已修复的 ComfyUI Workflow：**
```
CheckpointLoaderSimple (flux1-dev-fp8)
     ↓
CLIPTextEncode (positive prompt: 角色描述 + 场景)
CLIPTextEncode (negative prompt: 质量标准)
     ↓
LoadImage (portrait_url)  ← 角色肖像作为参考
     ↓
ImageScale (lanczos → 目标尺寸 768×1024)
     ↓
VAEEncode (image → latent)
     ↓
KSampler (euler/simple, 28 steps, cfg 3.5, denoise: 0.65)
     ↓
VAEDecode → SaveImage
```

**denoise 参数控制一致性：**
- `0.4-0.5`: 高度一致（适合头像/肖像场景）
- `0.6-0.7`: 平衡（适合日常自拍，保留角色特征但有变化）← **默认**
- `0.8-0.9`: 低一致性（适合大幅度风格变化）

#### 2.3 图片成本优化

| 策略 | 预期节省 | 实现难度 |
|------|----------|----------|
| Generation Cache 全覆盖 | 30-40% | 低（已在做） |
| CDN 缓存（CloudFront） | 80-90% S3 GET 成本 | 中 |
| PNG → WebP 存储 | 70% 存储+带宽 | 中 |
| 缩略图预生成（256px） | 60% 带宽 | 低 |
| RunPod Spot 实例 | 50-70% GPU 成本 | 低 |
| 批量生成用 A40 而非 A100 | 40% GPU 成本 | 低 |

**每张图片成本：**
- 当前: ~$0.01-0.015 (A100, 无缓存)
- 优化后: ~$0.003-0.005 (A40 spot + cache + CDN)

#### 2.4 分层图片策略

| 用户层级 | 每日图片配额 | 分辨率 | img2img | 场景 |
|----------|-------------|--------|---------|------|
| **Free** | 0 张/天 | — | — | 只看女友预设肖像 |
| **Pro** | 30 张/天 | 768×1024 | 有 | 聊天自拍、换装预览 |
| **Unlimited** | 100 张/天 | 1024×1344 | 有 | 高清、批量、视频帧 |

---

### 三、视频（Video）— 高级体验层

#### 3.1 技术选型

| 方案 | 成本/秒 | 质量 | 延迟 | 推荐 |
|------|---------|------|------|------|
| RunPod ComfyUI + AnimateDiff | ~$0.02/s | 中 | 30-60s | ✅ 首选 |
| RunPod FLUX + SVD | ~$0.05/s | 中高 | 60-120s | 备选 |
| Replicate Kling | ~$0.10/s | 高 | 120-300s | 仅 Unlimited |
| 本地 LTX-Video | ~$0.005/s | 低 | 10-20s | 未来探索 |

#### 3.2 视频生成架构

```
用户请求 "发个视频给我" 
    ↓
ImageService.generate(portrait, scene)  ← 先生成关键帧
    ↓
ComfyUI AnimateDiff Workflow:
    LoadImage (关键帧)
    → AnimateDiff Loader (motion module)
    → KSampler (16 frames, 8 fps)
    → VHS_VideoCombine (mp4 output)
    ↓
Upload to S3 (mp4, ~2-5MB for 2s clip)
    ↓
返回视频 URL (presigned, 7-day TTL)
```

#### 3.3 视频分层策略

| 用户层级 | 视频配额 | 时长 | 分辨率 | 场景 |
|----------|---------|------|--------|------|
| **Free** | 0 | — | — | 不可用（升级诱饵） |
| **Pro** | 5 条/天 | 2秒 | 512×768 | 聊天短视频 |
| **Unlimited** | 30 条/天 | 5秒 | 768×1024 | 高清、长视频 |

**视频成本估算（Pro 用户 50 人 × 5 条/天）：**
- 250 条/天 × $0.04/条 = **$10/天 = $300/月**
- 通过缓存常见动作模板可降至 **$150/月**

---

### 四、语音（Voice）— 情感连接层

#### 4.1 技术选型

| 功能 | 方案 | 成本 | 延迟 | 推荐 |
|------|------|------|------|------|
| **TTS** (文字转语音) | Coze Doubao TTS | ~$0.005/100字 | <1s | ✅ 首选 |
| **TTS 备选** | ElevenLabs | ~$0.03/100字 | 1-2s | 高质量备选 |
| **STT** (语音转文字) | Whisper (via RunPod) | ~$0.006/min | 2-5s | ✅ 首选 |
| **STT 备选** | Coze ASR | ~$0.003/min | <1s | 低延迟备选 |
| **Voice Clone** | ElevenLabs Instant | $0.30/角色 | 5s | Unlimited 专属 |

#### 4.2 语音消息架构

```
用户发送语音消息 (WebM/Opus)
    ↓
Upload to S3 (临时存储)
    ↓
STT: Whisper → 文字转录
    ↓
正常聊天流程 (文字 → LLM → 回复文字)
    ↓
TTS: 角色语音 → 音频文件
    ↓
Upload to S3 → 返回语音 URL
    ↓
Chat 显示: [语音消息 ▶] + 文字转录
```

#### 4.3 语音分层策略

| 用户层级 | 语音配额 | TTS 质量 | Voice Clone | 场景 |
|----------|---------|----------|-------------|------|
| **Free** | 0 条/天 | — | — | 不可用（升级诱饵） |
| **Pro** | 50 条/天 | 标准 (Doubao) | 否 | 日常语音消息 |
| **Unlimited** | 无限 | 高质量 + Clone | 是 | 专属角色声音 |

---

### 五、成本总览与盈利模型

#### 5.1 单用户日均成本

| 功能 | Free 用户 | Pro 用户 | Unlimited 用户 |
|------|----------|---------|---------------|
| 聊天 (LLM) | $0.01 | $0.05 | $0.15 |
| 图片 (GPU) | $0.00 | $0.15 | $0.50 |
| 视频 (GPU) | $0.00 | $0.20 | $1.00 |
| 语音 (TTS/STT) | $0.00 | $0.05 | $0.10 |
| 存储+CDN | $0.001 | $0.005 | $0.01 |
| **日均合计** | **$0.011** | **$0.455** | **$1.76** |
| **月均合计** | **$0.33** | **$13.65** | **$52.80** |

#### 5.2 利润率分析

| 层级 | 月费 | 月均成本 | 毛利 | 利润率 |
|------|------|---------|------|--------|
| Free | $0 | $0.33 | -$0.33 | -100% |
| Pro | $19.99 | $13.65 | $6.34 | 32% |
| Unlimited | $39.99 | $52.80 | -$12.81 | -32% |

**关键发现：Unlimited 用户如果不限制用量，会亏损！**

#### 5.3 用量控制策略

| 措施 | 效果 |
|------|------|
| Pro: 30 图/天, 5 视频/天 | 成本控制在 $13.65/月 |
| Unlimited: 100 图/天, 30 视频/天 | 成本控制在 $35/月（非满额使用） |
| 80% 用户不会用满配额 | 实际平均成本降低 40-50% |
| Generation Cache 命中率 ~30% | GPU 成本降低 30% |
| CDN 缓存命中率 ~80% | S3 GET 成本降低 80% |

**优化后实际利润率：**
- Pro: ~45% (大部分用户只用 50% 配额)
- Unlimited: ~15% (重度用户较多，但缓存效果好)
- 综合: ~35% (健康水平)

---

### 六、实施路线图

#### Phase 1: 基础完善（2 周）
- [x] 修复 img2img ComfyUI workflow
- [x] Chat stream 并行查询
- [x] 消息用量提示
- [ ] 合并 6 个图片路由为 ImageService
- [ ] 添加 CloudFront CDN

#### Phase 2: 语音集成（2 周）
- [ ] Coze Doubao TTS 集成
- [ ] Whisper STT via RunPod
- [ ] 语音消息 UI 组件
- [ ] 语音配额管理

#### Phase 3: 视频生成（4 周）
- [ ] ComfyUI AnimateDiff workflow
- [ ] 视频上传 + 播放 UI
- [ ] 视频配额管理
- [ ] 视频缓存策略（7 天 TTL）

#### Phase 4: 高级功能（持续）
- [ ] Voice Clone (ElevenLabs)
- [ ] 高清视频 (768×1024)
- [ ] 实时语音通话 (WebRTC)
- [ ] AI 视频通话 (未来)
