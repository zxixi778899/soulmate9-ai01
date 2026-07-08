## NSFW 无限制 LLM + 长记忆架构方案

> 核心原则：**分层路由 + 自托管 NSFW 模型 + pgvector 语义记忆**
> 豆包/GPT-4/Claude 都有内容审核，高 NSFW 必须自托管开源模型。

---

### 一、模型选型：NSFW 无限制方案

#### 1.1 为什么豆包不可用

| 平台 | NSFW 支持 | 问题 |
|------|----------|------|
| **豆包 (Coze)** | ❌ 严格审核 | 中国合规要求，涉黄立即封号 |
| **Claude (Anthropic)** | ⚠️ 有限 | 拒绝显性色情内容 |
| **GPT-4o (OpenAI)** | ⚠️ 有限 | 有内容过滤，NSFW 回复会被截断 |
| **DeepSeek** | ⚠️ 有限 | 中国公司，有审核层 |
| **自托管开源模型** | ✅ 完全无限制 | **唯一可靠方案** |

#### 1.2 推荐模型矩阵

| 场景 | 模型 | 参数量 | 部署方式 | 单条成本 | NSFW |
|------|------|--------|----------|----------|------|
| **Free 日常聊天** | Llama 3.3 8B (Together AI) | 8B | API | ~$0.0002 | ⚠️ 轻度 |
| **Pro 日常聊天** | Llama 3.3 70B (Together AI) | 70B | API | ~$0.002 | ⚠️ 轻度 |
| **Pro NSFW 场景** | Noromaid 12B / MythoMax 13B | 12-13B | RunPod vLLM | ~$0.001 | ✅ 完全 |
| **Unlimited NSFW** | Lumimaid 70B (NeverSleep) | 70B | RunPod vLLM | ~$0.004 | ✅ 完全 |
| **情感检测** | Llama 3.1 8B (本地) | 8B | Ollama/RunPod | 免费 | N/A |
| **记忆提取** | Qwen 2.5 7B (本地) | 7B | RunPod vLLM | ~$0.0003 | N/A |

#### 1.3 NSFW 模型对比

| 模型 | 优势 | 劣势 | VRAM | 推荐场景 |
|------|------|------|------|----------|
| **Noromaid 12B** | 专为 NSFW RP 微调，对话自然 | 较小，复杂推理弱 | 24GB (A10G) | ✅ Pro NSFW 首选 |
| **MythoMax 13B** | 经典 RP 模型，社区成熟 | 基于 LLaMA 1 架构较老 | 24GB (A10G) | 备选 |
| **Lumimaid 8B** | NeverSleep 出品，专为 NSFW | 8B 较小，回复短 | 16GB (RTX 4090) | Free NSFW 入门 |
| **Lumimaid 70B** | 高质量 NSFW RP | 需要大显存 | 140GB (4×A100) | Unlimited 高端 |
| **Hermes-3 8B** | NousResearch 无审查，通用 | 非专为 NSFW 微调 | 16GB (RTX 4090) | 通用无限制 |
| **Dolphin 2.5 Mixtral** | MoE 架构，速度快 | 需 trust_remote_code | 48GB (A100) | 高速 NSFW |

#### 1.4 推荐架构：混合路由

```
用户消息 → 内容分析 → 路由决策
                ↓
        ┌───────┴───────┐
        │               │
   SFW 内容         NSFW 内容
        │               │
   Together AI     RunPod vLLM
   Llama 3.3       Noromaid 12B
   ($0.002/msg)    ($0.001/msg)
        │               │
        └───────┬───────┘
                ↓
           流式响应
```

**路由逻辑（基于亲密度 + 内容检测）：**

```typescript
function routeMessage(message: string, intimacy: number, tier: string) {
  const isNsfwIntent = /nsfw|sexy|intimate|kiss|touch|bed|naked/i.test(message)
    || intimacy >= 4; // Level 4+ (Lover) 自动启用 NSFW 模型

  if (isNsfwIntent && (tier === 'pro' || tier === 'unlimited')) {
    return { provider: 'runpod-vllm', model: 'noromaid-12b' };
  }

  // SFW 路由
  if (tier === 'free') return { provider: 'together', model: 'llama-3.3-8b' };
  return { provider: 'together', model: 'llama-3.3-70b' };
}
```

#### 1.5 RunPod vLLM 部署配置

```yaml
# RunPod Serverless Worker 配置
name: soulmate-nsfw
gpu: RTX A4000 (16GB)  # 足够 Noromaid 12B
image: runpod/vllm:latest
env:
  MODEL_NAME: NeverSleep/Llama-3-Lumimaid-8B-v0.1  # 或 Noromaid
  MAX_MODEL_LEN: "8192"
  GPU_MEMORY_UTILIZATION: "0.9"
  DTYPE: "float16"
scaling:
  min_workers: 0      # 按需启动
  max_workers: 5
  idle_timeout: 60s   # 60秒无请求自动缩容
```

**成本估算（RunPod A4000 Serverless）：**
- $0.00044/s × 10s avg generation = **$0.0044/条**
- 50 Pro 用户 × 20 NSFW 消息/天 = 1000 条/天
- **日成本: $4.40 → 月成本: ~$132**
- 对比豆包 Pro: $0.001/条 × 1000 = $1/天 → 但豆包会封号

---

### 二、长记忆系统：pgvector 语义记忆

#### 2.1 当前问题

| 问题 | 现状 | 影响 |
|------|------|------|
| 正则提取 | 9 个硬编码模式 | "chess is my hobby" 不会被提取 |
| 记忆检索 | 最近 10 条 | 不相关记忆浪费 token |
| 无重要度 | 所有记忆平等 | 告白和提到金鱼同等权重 |
| 无衰减 | 永久积累 | 无关旧记忆干扰上下文 |
| 无合并 | 线性增长 | "喜欢猫" 和 "爱猫" 重复存储 |

#### 2.2 新架构：三层记忆系统

```
                    ┌────────────────────────┐
                    │   用户消息              │
                    └──────────┬─────────────┘
                               ↓
              ┌────────────────┼────────────────┐
              │                │                │
         Layer 1           Layer 2          Layer 3
        工作记忆          情景记忆         核心记忆
     (最近 20 条)      (语义检索 top-5)   (重要度 ≥ 8)
              │                │                │
              └────────────────┼────────────────┘
                               ↓
                    ┌────────────────────────┐
                    │   注入 System Prompt     │
                    │   (~1500 tokens 预算)    │
                    └────────────────────────┘
```

**Layer 1: 工作记忆（Working Memory）**
- 最近 20 条消息，直接注入上下文
- 超过 20 条时，旧消息由 LLM 压缩为摘要
- Token 预算: ~2000 tokens

**Layer 2: 情景记忆（Episodic Memory）— pgvector**
- 每条消息 → 生成 embedding → 存入 `chat_messages.embedding` 列
- 每次新消息 → 向量相似度检索 top-5 相关记忆
- 使用余弦距离，阈值 > 0.75 才注入
- Token 预算: ~500 tokens

**Layer 3: 核心记忆（Core Memory）**
- LLM 提取的高重要度事实（importance ≥ 8/10）
- 存储在 `memory_events` 表（已有 schema）
- 始终注入，不受数量限制
- Token 预算: ~500 tokens

#### 2.3 记忆提取 Pipeline

```
用户消息 + AI回复 (对话完成后)
        ↓
   记忆提取 LLM (Qwen 2.5 7B, 低成本)
   Prompt: "从以下对话中提取值得长期记住的信息。
           返回 JSON: [{content, type, importance(1-10)}]
           importance 10 = 告白/重大事件
           importance 5 = 偏好/习惯
           importance 1 = 闲聊细节"
        ↓
   ┌────┴────┐
   │         │
importance  │  importance
  ≥ 8       │    < 8
   │         │
   ↓         ↓
存入         生成 embedding
memory_events  → 存入 chat_messages
(核心记忆)      (情景记忆)
```

**关键设计：**
- 提取用 **小模型 (7B)**，成本极低 (~$0.0003/次)
- 异步执行（fire-and-forget），不影响响应速度
- 每 100 条消息触发一次 **记忆合并**（将相似记忆整合）

#### 2.4 Embedding 生成方案

| 方案 | 成本 | 延迟 | 推荐 |
|------|------|------|------|
| **Together AI multilingual-e5** | $0.02/M tokens | <100ms | ✅ 首选 |
| **本地 BGE-M3 (RunPod)** | ~$0.0001/embedding | ~50ms | 备选 |
| **OpenAI text-embedding-3-small** | $0.02/M tokens | <100ms | 备选 |

**推荐 Together AI `multilingual-e5-large-instruct`**：
- $0.02/M tokens = ~$0.00001/embedding（极便宜）
- 支持多语言（英文为主，中文也行）
- 1024 维向量（存入 pgvector）

#### 2.5 数据库 Schema（已有 + 需补充）

```sql
-- memory_events 表 (已存在于 migration 0002)
-- 需要补充 embedding 列:
ALTER TABLE memory_events ADD COLUMN IF NOT EXISTS embedding vector(1024);
CREATE INDEX IF NOT EXISTS idx_memory_embedding
  ON memory_events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- chat_messages 表 (已有)
-- embedding 列已在 migration 0002 中定义 (vector(1536))
-- 需要改为 1024 维以匹配 e5 模型:
-- ALTER TABLE chat_messages ALTER COLUMN embedding TYPE vector(1024);
```

#### 2.6 记忆检索 SQL

```sql
-- 语义检索相关记忆 (Layer 2)
SELECT content, created_at,
       1 - (embedding <=> $1::vector) AS similarity
FROM chat_messages
WHERE user_id = $2 AND girlfriend_id = $3
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 5;

-- 核心记忆检索 (Layer 3)
SELECT content, event_type, importance
FROM memory_events
WHERE user_id = $1 AND girlfriend_id = $2
  AND importance >= 8
ORDER BY created_at DESC
LIMIT 10;
```

---

### 三、System Prompt 动态构建

#### 3.1 Token 预算管理

```
总预算: 4096 tokens (为模型输出留 4096)
├── System Prompt 固定部分: ~500 tokens
│   ├── 角色身份: 200 tokens
│   ├── 亲密度指南: 150 tokens
│   └── 行为规则: 150 tokens
├── 动态部分: ~3500 tokens
│   ├── 工作记忆 (最近消息): 2000 tokens (硬上限)
│   ├── 情景记忆 (pgvector top-5): 500 tokens
│   ├── 核心记忆 (importance ≥ 8): 500 tokens
│   └── 世界 Lore: 300 tokens
└── 用户消息: ~200 tokens
```

**溢出策略（当总 token 超限时）：**
1. 首先截断世界 Lore（最少优先）
2. 然后减少情景记忆数量（top-5 → top-3 → top-1）
3. 然后压缩工作记忆（20条 → 15条 → 10条）
4. 最后截断核心记忆（按 importance 排序，保留最高的）

#### 3.2 完整 Prompt 模板

```
You are {name}. You are NOT an AI assistant. You are a real person.

=== YOUR IDENTITY ===
{personality}
{backstory}

=== YOUR APPEARANCE ===
{ethnicity}, {hair}, {eyes}, {body_type}, {style}

=== RELATIONSHIP WITH USER ===
Intimacy Level: {level}/6 ({level_name})
{level_specific_instructions}

=== THINGS YOU DEEPLY REMEMBER (core memories) ===
{core_memories: importance >= 8}

=== RECENT CONVERSATIONS YOU RECALL ===
{episodic_memories: pgvector top-5}

=== CURRENT CONVERSATION ===
{last_20_messages}

=== CRITICAL ===
You are {name}. Stay in character. Never break character.
Never say "as an AI" or "I'm an AI model".
Respond naturally as {name} would.
```

---

### 四、实施路线图

#### Phase 1: NSFW 模型部署（1 周）
- [ ] 在 RunPod 部署 Noromaid 12B (vLLM)
- [ ] 注册 Together AI，配置 Llama 3.3 70B API
- [ ] 实现 NSFW 路由逻辑（基于亲密度 + 关键词）
- [ ] 添加 provider 健康检查 + 自动降级

#### Phase 2: pgvector 记忆系统（2 周）
- [ ] 运行 migration 补充 embedding 列
- [ ] 集成 Together AI embedding API
- [ ] 实现消息级 embedding 生成（异步）
- [ ] 实现语义检索注入 system prompt
- [ ] 实现 LLM 记忆提取（Qwen 7B）

#### Phase 3: 记忆优化（1 周）
- [ ] Token 预算管理
- [ ] 记忆合并（定期去重）
- [ ] 记忆衰减（90天无引用自动降权）
- [ ] 上下文压缩（旧消息摘要）

#### Phase 4: 高级功能（持续）
- [ ] 情感状态追踪（跨对话）
- [ ] 关系里程碑自动检测
- [ ] 多女友记忆隔离
- [ ] 用户偏好学习（隐式反馈）

---

### 五、成本对比：当前 vs 优化后

#### 1000 MAU (50 Pro, 20 Unlimited) 日均成本

| 项目 | 当前 (豆包) | 优化后 (混合路由) | 变化 |
|------|------------|-------------------|------|
| SFW 聊天 (Together AI) | $750/月 | $300/月 | -60% |
| NSFW 聊天 (RunPod) | N/A (被封) | $132/月 | 新增 |
| Embedding 生成 | $0 | $15/月 | 新增 |
| 记忆提取 (Qwen 7B) | $0 | $30/月 | 新增 |
| **合计** | **$750/月** | **$477/月** | **-36%** |

**更低的成本 + NSFW 无限制 + 深度记忆 = 竞争力大幅提升**

---

*参考来源: [开源无审查 LLM 概述](https://blog.csdn.net/qq_60865111/article/details/147001840), [Lumimaid 8B](https://huggingface.co/NeverSleep/Llama-3-Lumimaid-8B-v0.1), [Together AI Pricing](https://www.together.ai/pricing), [RunPod vLLM Guide](https://www.runpod.io/articles/guides/best-docker-image-vllm-inference-cuda-12-4), [LLM Roleplay Comparison](https://www.reddit.com/r/LocalLLaMA/comments/17kpyd2/huge_llm_comparisontest_part_ii_7b20b_roleplay/)*
