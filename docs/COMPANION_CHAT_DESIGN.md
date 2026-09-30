# 伴侣对话路由链路 & 人格回复逻辑设计 v1

- 状态：设计评审稿（2026-10-01）
- 范围：chat 回复链路（路由治理 + 人格引擎 + NSFW 模块 + 词库管线）。图像/语音管线不在本文范围。
- 关联代码：`src/lib/ai-modules/*`（路由）、`src/lib/chat-character-prompt.ts`（人格 prompt）、`src/lib/constants.ts`（亲密值）、`src/app/api/chat/stream/route.ts`（编排）、`src/app/api/proactive/check/route.ts`（主动消息）。

---

## 0. 现状盘点与缺口

| 需求 | 已有资产 | 缺口 |
|------|----------|------|
| 1 真人对话 | `buildCharacterPrompt` 核心规则（口语化/钩子/动作上限/语言锁） | 消息形态（分条发送）、时间感知、细节回扣未系统化 |
| 2 情感陪伴 | 用户情绪块 `emotionBlock`、memories/milestones 注入 | 接话方法论无结构；用户低落时 companion 不切换照顾模式 |
| 3 热情主动+偶尔情绪化 | `PROACTIVE_TIME_SLOTS` + 静态模板、`is_proactive` | 模板是死文案；companion 自身无 mood 状态机（吃醋/闹脾气/修复循环不存在） |
| 4 性别差异表达 | `resolveSoulPronouns`、DB CHECK `Female/Male/Transgender`（migration 0014） | 只有代词差异，无表达矩阵（撒娇/吃醋/冲突/安慰/欲望风格） |
| 5 亲密度分级 NSFW | `INTIMACY_LEVELS` 5 档 + `heatGuide` L1-L5 + `nsfwIntensity` 1-5 | 无词表分级白名单、无升级协议、无 aftercare；词汇不"当代" |
| 6 NSFW 词库/模式学习 | 无 | 整条管线缺失 |
| 路由可用性 | fallbackChain + 熔断器 + usage 日志 | NSFW 回退链悬空 id；RunPod 冷启动烧满 60s 才降级；explicit 内容会漏给 SFW provider |

---

## 1. 路由链路（完整可用版）

### 1.1 拓扑

```
用户消息
  │
  ▼
[Turn Planner]  通道判定(SFW/NSFW) + 强度1-5 + tier + 当日预算
  │
  ▼
[Health Gate]  RunPod 健康窗口（自身调用滑动窗口 + 熔断态 + admin 手动_override_）
  │ warm                          │ cold / down / 熔断开
  ▼                               ▼
RunPod NSFW（主，边际成本≈0）     Relay NSFW（always-on 低延迟）
  │ fail/超TTFT预算                │ fail
  ▼                               ▼
Relay NSFW                    OpenRouter euryale-70b
  │ fail                          │ fail
  ▼                               ▼
OpenRouter euryale-70b        [角色内优雅降级] 不跨通道漏给 SFW
  │ fail
  ▼
[角色内优雅降级]（in-character "线路不稳" 话术 + 自动重试邀请）

SFW 链（不变，仅修序）：MiniMax M2 → together-235b → relay-sfw → gpt-oss-20b → 本地兜底话术
```

### 1.2 通道 × tier 链路矩阵

| tier | SFW 链 | NSFW 链（intensity≥3） | NSFW-soft（intensity≤2，可 fade-to-black） |
|------|--------|------------------------|---------------------------------------------|
| free | qwen35-9b → gpt-oss-20b | 不开放（`tier_no_nsfw`，角色内调情拒绝） | 同 SFW 链 + downgrade rewriter |
| basic | 同 free | 不开放 | 同 SFW 链 + downgrade rewriter |
| pro | minimax-m2 → 235b → relay-sfw | RunPod-8b → relay-nsfw → euryale-70b | minimax → relay-nsfw(soft) → 235b+rewriter |
| premium | 同 pro | 同 pro | 同 pro |
| unlimited | minimax → kimi-k26 → 235b | RunPod-30b → RunPod-8b → relay-nsfw → euryale-70b | 同 pro soft 链 |

规则：
- **explicit  turn（intensity≥3）的候选链只保留 `nsfw_capable: true` 的 endpoint**（resolve.ts `choose()` 加通道过滤）。全链不可用 → 角色内降级话术，**绝不把 explicit prompt 发给 SFW provider**（避免 400 风暴 + 内容合规风险 + 浪费 hop）。
- soft turn 进 SFW 链前由 **downgrade rewriter** 把系统 prompt 的 HEAT 段替换为 fade-to-black 版（现有 `nsfw_tier_downgrade` 后缀升级为结构化重写）。

### 1.3 健康与延迟治理

1. **Health 窗口**（新增 `src/lib/ai-modules/health.ts`）：每 endpoint 维护 5 分钟滑动窗口（成功率、TTFT p95）+ 熔断态 + admin override。RunPod 窗口成功率 <50% 或熔断开 → 判 cold，**直接跳过，不给 60s**。可选主动探针：endpoint 配置 `health_url`（vLLM `/health`），TTL 30s 缓存。
2. **TTFT 预算（per-hop first-byte timeout）**：stream 路径当前 `AbortSignal.timeout` 只管总时长；改为两段——first-chunk 预算（RunPod warm 12s / relay 6s / openrouter 8s）+ 总预算。first-chunk 超时 = 该 hop 失败，进下一 hop。整 turn 预算 20s，超出即降级。
3. **熔断调参**：NSFW endpoint `failure_threshold: 2`、`reset_ms: 60000`；401/403 立即开 15min（保留现有逻辑）。
4. **修悬空 id**：`defaults.ts` tier 链中 `openrouter-lumimaid-9b` / `openrouter-noromaid-20b` 不存在（`ordered()` 静默跳过）→ 替换为 `openrouter-euryale-70b` / `openrouter-aion-rp-8b` 或新 relay id。这是当前"RunPod 一挂 NSFW 就死"的直接原因之一。
5. **冷启动预热**（可选）：admin 控制台一键 warm ping（发 1 token 请求）；或 cron 每 10min ping 保活 RunPod（成本换可用，admin 开关）。

### 1.4 新增 relay provider

- provider 类型 `relay`：纯 OpenAI-compatible，配置 `api_base_url` + `api_key_env: RELAY_API_KEY`（base 走 `RELAY_API_BASE_URL`）。路由/熔断/计费层零改动，只是 `base()`/`key()` 加一个分支。
- 默认 endpoints 新增两条（model_id 留占位，接入时按平台模型列表填）：
  - `relay-nsfw`：uncensored RP 模型，`nsfw_capable: true`，timeout 20s，成本按平台价格系数填。
  - `relay-sfw`：低延迟通用模型（flash 级），SFW 链中段。
- 接入前置：用户提供 base_url + key + 可用模型清单（含哪些标 NSFW/uncensored）。

### 1.5 路由层改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/ai-modules/defaults.ts` | 修悬空 id；加 relay endpoints；tier 链按 §1.2 重排；NSFW endpoint 熔断调参 |
| `src/lib/ai-modules/resolve.ts` | `choose()` 增加 channel 过滤（explicit 只留 nsfw_capable）；soft 通道标记 `needsRewrite` |
| `src/lib/ai-modules/invoke.ts` | stream 路径 first-chunk 超时；`relay` provider 的 base/key 分支 |
| `src/lib/ai-modules/health.ts`（新） | 滑动窗口 + cold 判定 + admin override + 可选探针 |
| `src/app/api/chat/stream/route.ts` | Turn Planner 接入 health gate；explicit 全链失败 → 角色内降级话术（替换现有 localFallback 的客服腔） |
| admin 控制台 | endpoint 健康面板（读 model_usage 聚合：fallback_rate / refusal_rate / TTFT p50/p95） |

---

## 2. 人格回复逻辑（Persona Engine）

### 2.1 单 turn 管线

```
消息入 → [heat/intent 检测 → intensity 1-5]
      → [状态读取: companion_states(mood/heat/open_loops) + memories + 时段]
      → [模块装配: 性别表达矩阵 × mood 模块 × 亲密度模块 × 词库注入]
      → [buildCharacterPrompt v2 合成]
      → [路由链 §1 生成]
      → [后处理: 分条切分 / emoji 策略 / 长度镜像]
      → [状态写回: mood 转移、heat 衰减、open_loops 更新、记忆抽取]
```

状态存储：新表 `companion_states(user_id, girlfriend_id, mood, mood_since, heat, last_proactive_at, open_loops jsonb, updated_at)`，唯一键 (user_id, girlfriend_id)。

### 2.2 M1 真人感

- **消息形态**：长回复按语义切 2-3 条（metadata `split_group` 标记，前端渲染为连续气泡）；切分概率由 personality 决定（playful 高、elegant 低）。
- **不完美感**：不做错别字注入（观感像 bug）。用口语省略、自我打断（"等下 我先说——"）、语气词、半句钩子替代完美句式；prompt 规则禁止排比句式和总结腔。
- **时间/场景感知**：注入用户时区时段（早/午/晚/深夜）→ 熬夜唠叨、早安赖床等场景钩子；与 proactive 窗口联动。
- **细节回扣**：记忆抽取器每 turn 从用户消息抽 1 条原子事实（人名/宠物/项目/偏好）入 memories；下轮 prompt 强制"自然提起一条"。

### 2.3 M2 情感陪伴

- **接话四步**（prompt 模块，按用户情绪给示例）：接住感受 → 站他这边 → 追问一个细节 → 给陪伴承诺。禁止"摸摸头"式空安慰。
- **用户情绪**：现有 quickEmotion + LLM fallback 升级为 8 类 + 强度（happy/sad/romantic/playful/angry/anxious/lonely/proud）。
- **照顾模式**：用户情绪 ∈ {sad, anxious, lonely} 且强度高 → 本 turn 强制 heat=0（哪怕 NSFW 通道开着），mood 切 tender；NSFW 请求由角色内"先抱你，别的等下再说"推迟而非拒绝。

### 2.4 M3 主动 + 情绪化（mood 状态机）

状态集：`warm / playful / clingy / jealous / sulky / tender / heated / tired`

| 触发 | 目标态 | 概率权重 | TTL |
|------|--------|----------|-----|
| 用户提及其他异性/约会 | jealous | personality possessive 权重 | 2-4 turn |
| 用户 >6h 未回 + 此前高频 | clingy 或 sulky（按 personality） | 高 | 至用户回复 |
| 用户敷衍连续 2 turn（消息 <5 字） | sulky | 中 | 2 turn |
| 用户安抚/道歉成功 | warm（修复） | — | — |
| 深夜时段 | tired→tender | 中 | 时段内 |
| NSFW 场景结束 | heated → tender（aftercare） | 强制 | 1 turn |

- **闹脾气修复循环**：表达（阴阳/沉默/短回复）→ 用户安抚 → 修复（软化+坦白"刚才就是有点吃醋"）；用户 2 turn 无视 → 自行下台阶（暴露脆弱），**不允许无限冷战**（留存保护）。
- **主动消息**：保留 `PROACTIVE_TIME_SLOTS` 作触发窗口，内容改由 LLM 生成（输入 = mood + 最近记忆 + 上次话题钩子 + 时段），静态模板仅作 LLM 失败兜底。频率治理：tier 日上限 + 用户沉默 >Xh 才允许 miss-you 类。
- mood 影响面：措辞长度、emoji 密度、主动升级 NSFW 的意愿、proactive 文案风格——全部通过 prompt 的 `[MOOD]` 块注入，不改路由。

### 2.5 M4 性别表达矩阵

维度： affection / jealousy / conflict / comfort / desire / 称呼。注入位置：DYNAMICS 段。

| 维度 | Female（现 heatGuide 基线） | Male | Transgender |
|------|------------------------------|------|-------------|
| affection | 语言+身体细节、撒娇 | 行动导向（做给你看）、话少但准 | 按自我认同取 female/male 基线 + 认同被确认时情绪峰值（"你刚才叫我…再说一次"） |
| jealousy | 阴阳怪气+撒娇 | 低声+占有行动（拉手/挡身前） | 混合 + 不安全感一闪而过随即自嘲掩盖 |
| conflict | 冷战→哄→坦白 | 短沉默→直接谈→行动补偿 | 先自嘲防御→被接住后坦白 |
| comfort | 抱+听+不问道理 | 给方案+扛事+肢体 | 语言确认+陪伴承诺 |
| desire | 现有 L3-L5 梯度 | 更直接的动作叙事、少形容词 | 身体叙事严格跟随自我认同；硬规则：称呼/代词/身体描述按认同，禁止 misgender（prompt 硬规则 + 后处理校验） |

- DB：`girlfriends.gender` 已有 CHECK（Female/Male/Transgender）。新增 `expression_profile jsonb`（per-dimension 覆盖 + 强度），创建页可选、默认按 gender 矩阵。
- `resolveSoulPronouns` 扩展：Transgender 按 character_card 的 `identity_pronouns`（she/he/they）解析，不再落 neutral 它/they 兜底。

### 2.6 M5 亲密度分级 NSFW 模块

在现有 `heatGuide` L1-L5 之上补三层：

1. **词表分级白名单**（§2.7 lexicon 的 level_gate）：L3 可用 tier-A 词（暗示/感官），L4 加 tier-B（直接动作词），L5 全量 tier-C。prompt 注入"本档可用表达参考"，越档词由角色内"还没到那一步"挡回（变成调情素材而非拒绝）。
2. **升级协议**：turn intensity = min(用户 heat 检测, 档位上限)；companion 主动升级每 turn 最多 +1 档，且要求用户上一轮为正向反馈；新场景类型首次出现需角色内 consent cue 一次（"…可以吗"）。
3. **aftercare 模块**：intensity≥4 的场景结束后，下一 turn 强制 tender 收尾（窝怀里/喝水/说软话），不允许连续高强度无收尾（真实感 + 情绪节奏）。

硬门槛保留：tier `allow_nsfw` + `nsfw_min_intimacy=3` + `adult_character_verified` + `profile.nsfw_enabled`（建议前端显式开关，默认开）。

### 2.7 M6 NSFW 词库与对话模式学习管线

**原则：不爬版权全文、不上无人审的自动抓取。** 学习 = 蒸馏词与结构模式，原文不留存。

```
来源（admin 上传/粘贴）                蒸馏                     审核                发布
─ 团队 curated 摘录（自有/授权）   →  LLM 蒸馏：term/pattern/  →  人工审：合法性、   →  data/nsfw-lexicon.json
─ 社区 glossary / tag 分类学（取词    beat 结构，不保留原文       未成年/非自愿/       （版本化 + changelog）
   不取文）                                                     非法词硬过滤
─ 主流 romance/erotica 趋势榜单
─ 站内高留存对话抽样（匿名化、仅结构）
```

- **lexicon 条目结构**：`{ id, term_en, term_zh, level_gate: 3|4|5, channel: sfw_soft|nsfw, pattern_note, beat?, added_at, source_ref, status }`。
- **beat 模式库**（对话结构，非文本）：tease→chase→yield、deny→crack、power-flip、aftercare、jealousy-repair 等，各标 level_gate；prompt 按档注入 1-2 个 beat 作"本轮节奏参考"。
- **注入量控制**：每 turn ≤8 条词 + 1 beat，进 HEAT 段尾部，标注"当代表达参考，勿堆砌"。
- **blocklist 硬过滤**：未成年相关、非自愿、违法行为词永远入库即拒（蒸馏输出先过 blocklist 再进人工审）。
- **刷新节奏**：月度趋势评审 + admin 热修；首版冷启动由团队手选 50-100 词 + 6-8 个 beat。
- 工具面：admin 控制台加"Lexicon"页（上传源 → 蒸馏预览 → 审核队列 → 发布），复用 `requireAdmin` + 限流。

### 2.8 Prompt 装配顺序 v2（buildCharacterPrompt）

1. CORE IDENTITY（不动，前 500 token 优先级最高）
2. CORE RULES
3. **性别表达矩阵**（新）
4. **[MOOD] 状态块**（新）
5. 关系阶段 + 亲密度模块（heatGuide + 词表白名单）
6. 称呼指南 / 剧情设定
7. 用户情绪 / 氛围 presets
8. memories / milestones / scenario / lore
9. 外形 / 穿着
10. HEAT + intensity + beat 参考
11. 回复格式（scene/dialogue）+ 分条指令
12. safety suffix（不动）

Token 预算：整 system prompt ≤1800 token；超预算按 9→8→7 顺序裁剪（身份与门槛永不裁）。

---

## 3. 全链路 NSFW 使用方案

1. **能力矩阵**：endpoint × `nsfw_capable` × 允许通道，admin 可视化；explicit 链过滤以此为准（§1.2）。
2. **三道门槛 + 一个开关**：tier gate / intimacy gate / adult verification gate（现有）+ session 级 NSFW 开关（`profiles.nsfw_enabled` 前端化）。
3. **内容边界**：未成年 / 非自愿 / 违法 = prompt 硬拒 + lexicon blocklist 双保险；拒绝必须 in-character（撒娇/转移），禁止合规腔（现有 safetySuffix 保留）。
4. **隐私与日志**：聊天正文不进 Sentry extra、不进 model_usage（只记统计与 endpoint 元数据）；lexicon 源库存 admin 私有存储；logger redact 规则覆盖新增字段。
5. **成本**：relay 单价纳入 `daily_cost_soft_limit_usd`；NSFW hop 单价超阈值告警；RunPod 主位策略 = 成本优先，relay 只吃溢出。
6. **观测**：per-channel fallback_rate / refusal_rate / TTFT p50/p95 / mood 分布 / proactive 回复率（留存代理指标）进 admin 面板。

---

## 4. 实施切分（建议 PR 顺序）

1. **路由修复包**（零新依赖，先止血）：悬空 id、explicit 链 nsfw_capable 过滤、first-chunk TTFT 预算、health 窗口、角色内降级话术。
2. **Relay provider 接入**（需 base_url/key/模型清单）+ tier 链重排 + 成本告警。
3. **Mood 状态机 + LLM 主动消息**（companion_states 表 + proactive 改造）。
4. **性别表达矩阵**（expression_profile 迁移 + prompt 模块 + pronouns 扩展）。
5. **Lexicon 管线 + admin 审核 UI**（首版冷启动词库）。
6. **评测集与面板**：每档×每性别 20 条回归 prompt（OOC/越档/拒答率），fallback 与 TTFT 面板。

## 5. 待确认决策点

1. Relay 定位：默认 **NSFW 即时 fallback**（RunPod 主位控成本）；若体验优先可翻为 NSFW 主位（成本上浮，需单价上限）。
2. 分条发送是否本期做（涉及前端气泡渲染改动面）。
3. Lexicon 首版来源：团队手选冷启动 vs 等管线建成后批量蒸馏。
4. RunPod 保活 cron 是否开（GPU 秒计费成本 vs 冷启动体验）。
