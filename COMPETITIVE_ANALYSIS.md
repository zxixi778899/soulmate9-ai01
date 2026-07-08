## SoulMate AI 竞品分析与项目完善方案

---

### 一、模型接入问题

#### 当前架构

项目使用三级 LLM 降级链：Coze (豆包 Doubao) → Claude Haiku → 本地 Llama 3.1。图片生成使用 RunPod Serverless (FLUX.1-dev-fp8)。

#### 核心问题

**1. Coze Auth 严重缺陷**
`coze-auth.ts` 和 `llm-service.ts` 各自实现了独立的 token 获取逻辑，缓存 TTL 不一致（一个 50 分钟，一个 55 分钟），可能导致 token 失效窗口。更致命的是，token 获取使用了 `child_process.execSync` 调用 Python 子进程——这在 Vercel/Railway serverless 环境中根本不可用，会导致冷启动阻塞 10 秒甚至超时。

**2. 意图路由过于简单**
`llm-router.ts` 用正则匹配判断用户意图（image_generation / complex_reasoning / chat），准确率有限。例如 "draw yourself" 之前就被误判为 chat。没有利用 LLM 本身做意图分类。

**3. 聊天流缺乏结构化**
`chat/stream/route.ts` 长达 624 行，在一次请求中串行执行 7 次数据库查询（profile、rate limit、daily count、girlfriend info、intimacy、recent messages、memories），然后才调用 LLM。这些查询可以用 `Promise.all` 并行化，将首次响应延迟降低 60-70%。

**4. img2img 功能实际未生效**
`runpodClient.generateAndUpload` 接受 `input_image` 参数用于角色一致性，但 `buildFluxWorkflow` 始终创建 `EmptyLatentImage` 节点，从未使用输入图片。这意味着聊天中生成的"自拍"与角色肖像完全无关。

#### 竞品对比

| 特性 | SoulMate AI | Candy.AI | Replika | Nomi.AI |
|------|-------------|----------|---------|---------|
| LLM 模型 | 豆包/Claude | 自研 + GPT-4 | 自研大模型 | GPT-4 级别 |
| 角色一致性 | 无 (img2img 未启用) | 强 (LoRA 微调) | 强 (一致人设) | 强 (深度记忆) |
| 多模态 | 仅图片 | 图片+语音+视频 | 图片+语音+AR | 图片+语音 |
| 响应速度 | 慢 (串行 DB 查询) | 快 | 快 | 中等 |

#### 优化建议

- **P0**: 合并两个 Coze auth 模块为一个，移除 `execSync`，改用纯 HTTP token 获取
- **P0**: 修复 img2img workflow，在 ComfyUI 中使用 `LoadImage` + `ImageScale` 节点替换 `EmptyLatentImage`
- **P1**: 将 chat/stream 的 7 次串行 DB 查询改为 `Promise.all` 并行
- **P2**: 用 LLM 做意图分类（轻量 prompt + 低 max_tokens），替代正则匹配

---

### 二、付款问题

#### 当前架构

Stripe 处理信用卡，加密货币（USDT/BTC/ETH）采用手动确认模式。

#### 严重问题

**1. 订阅命名混乱（3 套并行命名）**

| 位置 | 命名体系 |
|------|----------|
| constants.ts + webhook | free / premium / unlimited |
| useMembership.ts | free / pro / premium / admin |
| api/membership/route.ts | free / pro / premium / unlimited |

同一个"付费用户"在不同文件里叫 `premium`、`pro`，极易产生 bug。

**2. Stripe Webhook 缺失关键事件**
只处理了 `checkout.session.completed` 和 `customer.subscription.deleted`。缺少：
- `invoice.payment_failed` → 续费失败时用户不会被降级
- `customer.subscription.updated` → 通过 Stripe Dashboard 改计划不会同步
- `customer.subscription.past_due` → 宽限期逻辑缺失

**3. 加密货币零验证**
用户提交 TX hash 后，系统只检查 `txHash.length > 10`，没有：链上验证、金额验证、目标地址验证、确认数检查。管理员确认时直接覆盖 `credits_remaining` 而非累加。

**4. 免费升级漏洞**
pricing 页面的 `handleUpgrade` 降级逻辑：如果 Stripe 失败，调用 `/api/membership` POST。该 API 在 Stripe 未配置时返回 `{success: true}`，前端直接 toast "Upgraded!" 并刷新页面——**用户可以不付钱直接升级**。

**5. 积分购买是空壳**
`/api/shop/credits` GET 返回积分包列表，但没有 Stripe checkout 集成。用户无法实际购买积分。

#### 竞品定价对比

| 平台 | 免费层 | 基础付费 | 高级付费 | 年度折扣 |
|------|--------|----------|----------|----------|
| **SoulMate AI** | 50 条/天, 2 女友 | $19.99/月 (Pro) | $39.99/月 (Unlimited) | 无 |
| **Candy.AI** | 有限消息 + 100 代币/月 | $12.99/月 | 代币另购 $9.99-$299.99 | 年付 $5.99/月 (54% off) |
| **DreamGF** | 有限聊天+图片 | $9.99/月 (Bronze) | $49.99/月 (Gold) | 年付约 25% off |
| **Replika** | 基础聊天 | $19.99/月 (Pro) | — | 年付 $7.99/月 |
| **Nomi.AI** | 有限消息 | $19.99/月 | — | — |

#### 优化建议

- **P0**: 修复免费升级漏洞——`/api/membership` POST 必须验证支付
- **P0**: 统一 tier 命名为 `free / pro / unlimited`，全局替换
- **P0**: 补充 `invoice.payment_failed` webhook handler
- **P1**: 添加年付选项（$199/年 Pro, $399/年 Unlimited），降低流失率
- **P1**: 实现积分购买 Stripe checkout 流程
- **P2**: 加密货币接入 NOWPayments API 做自动链上验证

---

### 三、成本问题

#### 当前成本结构（按 1000 MAU 估算）

| 项目 | 单价 | 月估算用量 | 月成本 |
|------|------|-----------|--------|
| LLM (豆包 Coze) | ~$0.0005/消息 | 150 万条 | ~$750 |
| LLM (Claude Haiku 降级) | ~$0.001/消息 | 15 万条 | ~$150 |
| GPU (RunPod FLUX) | ~$0.01/张 | 3 万张 | ~$300 |
| 存储 (S3 cn-beijing) | $0.023/GB | ~50GB | ~$1.15 |
| Redis (Upstash) | $10/月 | — | $10 |
| Supabase | $25/月 | — | $25 |
| Vercel Pro | $20/月 | — | $20 |
| Railway | $5-20/月 | — | ~$15 |
| Sentry | $0 (free tier) | — | $0 |
| PostHog | $0 (free tier) | — | $0 |
| Resend | $0 (free tier) | — | $0 |
| **合计** | | | **~$1,271/月** |

#### 成本优化机会

**1. LLM 成本 (占比 70%)**
- 免费用户 50 条/天 × 1000 用户 = 50,000 条/天。实际付费用户可能只有 5-10%（50-100 人），所以大部分消息来自免费用户
- 免费用户应该使用最便宜的模型（doubao-seed-2-0-lite），而非 pro
- 缓存高频相同回复（如打招呼、告别）可降低 10-15% 调用量
- 竞品 Candy.AI 使用自研模型大幅降低成本

**2. GPU 成本 (占比 24%)**
- 生成缓存 (`generation_cache`) 只被 `runpodClient` 使用，其他 6 个图片生成路由完全绕过缓存
- 批量生成使用顺序处理（20 张 × 30 秒 = 10 分钟），可改为并行提交
- RunPod Spot 实例可节省 50-70%
- 存储为 PNG（2-3MB），转为 WebP（500KB）可降低存储和带宽成本 70%

**3. 基础设施成本**
- 无 CDN → 每张图片直接请求 S3。加 CloudFront 可降低 S3 GET 成本 80-90%
- Serverless 冷启动导致 in-memory 缓存（URL cache、rate limit）几乎无效
- 考虑迁移到长运行容器（Railway 已在用）避免冷启动

#### 盈利平衡分析

假设 5% 付费转化率（行业平均 3-8%）：
- 1000 MAU → 50 付费用户
- 30 × Pro ($19.99) + 20 × Unlimited ($39.99) = $599.70 + $799.80 = **$1,399.50/月收入**
- 月成本 ~$1,271 → **净利润 ~$128/月**（利润率仅 9%）

要达到 $5,000/月净利润，需要约 **3,500 MAU** 或提高付费转化率到 8%+。

---

### 四、客户转化和留存

#### 当前转化漏斗

```
游客 → 18+ 验证 → 落地页 → 女友预览 → 注册 → Gallery → 创建/聊天 → 免费上限 → 付费
```

#### 转化问题

**1. 注册到首次聊天断裂**
注册后进入 Gallery（空列表），需要用户主动点 "Create" 创建女友才能开始聊天。竞品 Replika 和 Nomi 注册后直接进入预设角色的聊天——零摩擦。

**2. 免费层太慷慨或太吝啬**
50 条/天 × 2 个女友 = 用户可以"凑合用"但不深入。竞品策略：
- Candy.AI: 每天仅 10-15 条免费消息，强制用户感受到"断联"
- Replika: 无限免费聊天，但 NSFW/高级功能锁在付费墙后
- Nomi: 3 天免费试用全部功能，到期后硬锁

**3. Newbie 试用机制未启用**
`newbie_expires_at` 字段存在于代码中，但没有任何 onboarding 流程设置它。用户不知道有试用期。

**4. 缺少留存机制**

| 留存手段 | SoulMate AI | Candy.AI | Replika | Nomi |
|----------|-------------|----------|---------|------|
| 每日签到奖励 | 有 (10-80积分) | 有 | 有 | 有 |
| 连续天数 | 有 | 有 | 有 | 无 |
| 亲密度系统 | 有 (6级) | 有 | 有 | 有 (深度) |
| 主动消息 | 有 (60秒轮询) | 有 | 有 (推送) | 有 (推送) |
| 记忆系统 | 基础正则 | 深度 | 深度 | 极深 (pgvector) |
| 邮件召回 | 有 (cron) | 有 | 有 | 有 |
| 推送通知 | 有 (Web Push) | 有 | 有 | 有 |
| 社交分享 | 无 | 有 | 有 | 有 |
| 使用量提示 | 无 | 有 (80%时提示) | 有 | 有 |

**5. 主动消息用轮询而非 WebSocket**
`proactive/check` 每 60 秒轮询一次，浪费 API 调用。应该用 WebSocket 或 Server-Sent Events 实现实时推送。

#### 优化建议

- **P0**: 注册后直接引导创建第一个女友（3步快速模式），或直接进入预设角色聊天
- **P0**: 在 40/50 条消息时显示 "你已使用 80% 今日消息" 升级提示
- **P1**: 启用 7 天全功能新手试用（设置 `newbie_expires_at`）
- **P1**: 添加 "Why Upgrade?" 对比矩阵到定价页
- **P2**: 实现 WebSocket 替代 60 秒轮询
- **P2**: 添加社交分享功能（分享女友卡片到社交媒体）

---

### 五、图片和视频管理

#### 当前问题

**1. 6 个重复的图片生成路由**

| 路由 | 后端 | 缓存 | 审核 |
|------|------|------|------|
| `/api/runpod/generate` | runpodClient | 有 | 有 |
| `/api/runpod/batch` | 内联 RunPod | 无 | 无 |
| `/api/chat/generate-image` | 内联 + fallback | 无 | 无 |
| `/api/girlfriends/generate-portrait` | 内联 RunPod | 无 | 无 |
| `/api/generate-image` | Coze 豆包 | 无 | 无 |
| `/api/v2/admin/images/generate-from-meta` | 内联并行 | 无 | 无 |

同一个功能有 6 种实现，轮询间隔不同（1-4秒），超时不同（300-800s），错误处理不同。

**2. 无 CDN 层**
所有图片通过 S3 presigned URL 直接访问。每次查看都是一次 S3 GET 请求（$0.0004/1000 次）。没有 CloudFront/Cloudflare 缓存。

**3. 无图片变体**
一张全分辨率 PNG（2-3MB）用于所有场景：头像小圆框、网格卡片、全屏查看。没有缩略图。

**4. Serverless 内存缓存无效**
`storage.ts` 的 URL cache 是 process-local Map。Vercel serverless 每次冷启动都是空缓存，presigned URL 生成命中率接近零。

**5. 无输出审核**
生成的图片未经内容审核就存储和展示。只有 `/api/runpod/generate` 对输入 prompt 做了 `moderateText()` 审核。

#### 优化建议

- **P0**: 合并 6 个图片生成路由为 1 个统一 Service（带可配置超时/重试/缓存）
- **P0**: 修复 img2img ComfyUI workflow，实现角色一致性
- **P1**: 添加 CloudFront CDN，缓存 presigned URL
- **P1**: 生成时同步创建 256px 缩略图（用于 avatar/grid）
- **P1**: 所有生成路由统一使用 `generation_cache`
- **P2**: 存储格式从 PNG 转 WebP（节省 70% 存储和带宽）
- **P2**: 添加输出图片 NSFW 检测（使用 CLIP-based classifier）
- **P2**: 实现孤立 S3 对象定期清理

---

### 六、项目不足和优化方向总结

#### 紧急修复（本周）

| 问题 | 影响 | 优先级 |
|------|------|--------|
| 免费升级漏洞 | 收入损失 | P0 |
| img2img 未生效 | 核心体验缺失 | P0 |
| Coze auth execSync | Serverless 不可用 | P0 |
| Stripe webhook 缺事件 | 续费失败无处理 | P0 |
| Tier 命名混乱 | 维护噩梦 | P0 |

#### 短期优化（2 周内）

| 问题 | 预期收益 | 优先级 |
|------|----------|--------|
| 注册→聊天流程优化 | 转化率 +30% | P1 |
| 消息使用量提示 | 转化率 +15% | P1 |
| 年付定价 | LTV +40% | P1 |
| Chat stream 并行查询 | 响应速度 +60% | P1 |
| 统一图片生成 Service | 维护成本 -50% | P1 |
| 添加 CDN | 图片成本 -80% | P1 |
| 7天全功能试用 | 转化率 +25% | P1 |

#### 中期规划（1-3 个月）

| 方向 | 描述 | 优先级 |
|------|------|--------|
| WebSocket 实时通信 | 替代轮询，支持主动消息推送 | P2 |
| 深度记忆系统 | pgvector 嵌入 + 长期记忆召回 | P2 |
| 视频生成 | RunPod ComfyUI video workflow | P2 |
| 语音消息 | TTS + STT 集成 | P2 |
| A/B 测试定价 | 动态定价 + 促销引擎 | P2 |
| 推荐系统 | "你可能喜欢的角色" | P2 |
| 社交分享 | 女友卡片分享到社交媒体 | P2 |
| E2E 测试 | Playwright 自动化测试 | P2 |

#### 竞品差异化策略

SoulMate AI 的独特定位应该是：

1. **深度定制**：竞品大多提供预设角色，我们允许从外貌到性格到背景故事的全方位定制
2. **关系成长**：6 级亲密度系统 + 解锁内容，比竞品的二元 "free/premium" 更有粘性
3. **NSFW 自由度**：欧美市场对此有强需求，Candy.AI 和 Replika 都在收紧，我们应保持优势
4. **价格竞争力**：$19.99 Pro 与竞品持平，但功能更多（图片生成、语音等）

---

*数据来源: [Candy.AI 评测](https://plisio.net/zh/ai/candy-ai), [DreamGF 2026 评测](https://weavai.app/blog/zh-cn/2026/04/20/dreamgf-ai-2026-%E8%AF%84%E6%B5%8B%EF%BC%9Aai-%E5%A5%B3%E5%8F%8B%E5%AE%9A%E5%88%B6%E5%B9%B3%E5%8F%B0%E5%85%A8%E6%8C%87%E5%8D%97/), [AI 陪伴市场报告](https://www.novaedgedigitallabs.tech/blog/ai-companions-50-million-users-valentines-day-2026)*
