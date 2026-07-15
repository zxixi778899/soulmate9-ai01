# SoulMate AI 生产落地蓝图

> 版本：1.0  
> 基线日期：2026-07-14  
> 目标：把当前工程升级为可审计、可收费、可扩容的欧美 18+ AI 陪伴产品。本文是实施清单，不是概念提案。

## 0. 结论与上线门禁

当前项目功能广度已经达到 Beta：有公开角色库、创建、SSE 聊天、vLLM 路由、图片生成、记忆、亲密度、商城/衣柜、订阅、后台、分析和定时任务。真正阻碍上线的不是“再加几个页面”，而是以下门禁：

1. **支付与托管合规未闭环**。Stripe 明确禁止成人实时聊天、以性满足为目的的成人媒体以及符合这些条件的 AI 生成内容；Vercel AUP 也禁止 obscene、sexually exploitative 等内容。高 NSFW 生产版在得到支付商和托管商的书面批准前不得开放收费或显式内容。
2. **工程门禁不通过**。`validate` 在 Windows 失败、i18n 工具脚本缺失、单测有失败、类型检查依赖陈旧 `.next` 缓存。
3. **金额与权益存在双账本风险**。`profiles.credits_remaining`、`user_tokens.balance_tokens`、商城积分与 Stripe webhook 多处更新，必须收敛为幂等账本。
4. **异步任务不可生产化**。`src/lib/task-queue.ts` 使用进程内 `Map + setInterval`，在 Serverless 重启、扩容和多实例下会丢任务。
5. **成人安全不是一个 localStorage 弹窗**。必须有风险分级年龄保障、内容规则、真实人物/未成年人拦截、举报申诉、数据删除与审计链。
6. **多语言目标与实际代码不一致**。规范要求 en/zh/ja/ko/es/fr/de，实际 `types.ts` 与 `translations.ts` 仅 en/zh。

### Go/No-Go 标准

只有以下项目全部为绿色才允许真实用户付费：

| Gate | 必须满足 | 证据 |
|---|---|---|
| G0 商务合规 | 支付商、托管/CDN、GPU、存储均书面允许实际内容类型 | 合同/工单编号归档 |
| G1 法律 | 18+ 条款、隐私、退款、自动续费、内容规则、DMCA/NCII 流程经目标市场律师复核 | 签字版政策与日期 |
| G2 工程 | build/type/lint/unit/i18n/E2E 全绿，无跳过类型或 lint | CI 记录 |
| G3 安全 | 关键写入限流、RLS/权限审计、密钥扫描、依赖扫描、渗透测试 P0/P1 清零 | 报告 |
| G4 付费 | 测试购买、续费、失败、退款、取消、重复 webhook 全链路通过 | 测试事件与账本 |
| G5 内容 | 未成年人/年轻外观、真实人物、NCII、违法内容红队集通过 | 红队报告 |
| G6 运营 | 告警、值班、备份恢复、封禁/申诉、退款 SOP 可执行 | 演练记录 |
| G7 成本 | 单用户贡献毛利可观测，硬预算和熔断已开启 | 成本看板 |

## 1. 产品定位

### 核心承诺

“她记得你、会主动找你、能用一致的声音和形象回应你。”竞争点不是无限制三个字，而是**身份连续性、低延迟、多模态一致性和用户控制权**。

### 目标用户

- 主要：欧美 21–45 岁、愿为长期个性化陪伴付费的男性用户。
- 次要：角色扮演、故事创作、虚拟关系和成人幻想用户。
- 排除：未成年人；寻求真实人物仿冒、非自愿亲密内容、违法内容或危机干预替代品的用户。

### 北极星指标

`每周有价值陪伴会话数 / WAU`。一次有价值会话定义为：至少 6 个往返，或发生一次主动消息回复、记忆确认、语音/图片互动。

配套指标：

- 激活：注册后 10 分钟内完成 6 个往返的比例，目标首版 ≥ 45%。
- D1/D7/D30 留存：目标 40% / 22% / 12%，按渠道与付费层分组。
- 付费：激活用户到首购 ≥ 4%，试用到付费 ≥ 25%。
- 质量：聊天首 token P50 < 1.5s、P95 < 4s；错误率 < 1%。
- 毛利：订阅贡献毛利 ≥ 60%；单个用户每日媒体补贴不得无限增长。
- 安全：确认违法内容漏放率 < 0.1%，P0 安全事件 0。

## 2. 竞品对标与可复制原则

| 产品 | 公开优势 | SoulMate 应学习 | 不应照搬 |
|---|---|---|---|
| Nomi | 身份持续、短中长期记忆、情绪语音、主动消息、可视化记忆 | 把“她记得什么”做成可查看/可编辑的用户资产 | 用情感依赖制造付费压力 |
| Kindroid | 免费轻量模型；订阅解锁旗舰模型、长上下文、语音/视频、主动自拍；高上下文单独加价 | 权益直接映射真实推理成本；高成本上下文独立定价 | 复杂叠加订阅导致理解成本高 |
| Candy AI | 极低创建摩擦、成人图片/视频、订阅 + token、离散账单名称 | 文本订阅与媒体 credits 分开；角色卡直接开聊 | 过度折扣、模糊额度、情绪节点强推销 |
| Replika | 关系状态、活动、语音、图片、层级式沉浸能力 | 关系旅程、每日轻量互动、跨模态人格一致 | 把健康/治疗暗示当营销承诺 |

截至基线日的公开参考：

- Kindroid Web 标准月付 $13.99，免费层用轻量模型并限制自拍/语音；订阅增加上下文、记忆、语音、视频和主动自拍，高上下文 Ultra/MAX 额外收费：<https://kindroid.ai/docs/article/subscriptions/>
- Candy AI 公开页月付 $13.99、年付折算 $3.99/月，含无限文本和每月 100 tokens，成人图片/视频消耗额外 token：<https://candy.ai/subscriptions>
- Nomi 强调可成长人格、情绪语音、主动消息、图片理解与多层记忆：<https://nomi.ai/>、<https://nomi.ai/updates/>
- Replika 的 Pro/Ultra/Platinum 逐级增加关系状态、图片、语音、记忆、情绪智能和视频能力：<https://help.replika.com/hc/en-us/articles/39551043419149-Choosing-a-Subscription>

## 3. 最终用户流程

### 游客到激活

1. 落地页先展示 6–12 个经过审核的角色，不要求先创建。
2. 用户选角色后进入“试玩会话”；第 1 条消息前完成 18+ 年龄保障和条款同意。
3. 游客可体验 3 个往返，消息保存在匿名会话；注册后原样迁移，不能丢上下文。
4. 第 3–6 个往返自然询问昵称、偏好和边界，形成可编辑的“关系设定”。
5. 第一次记忆成功时明确展示：“Luna remembered you prefer late-night talks”，建立价值感。
6. 首次媒体体验用低成本预生成/缓存图，不在激活前触发昂贵视频。

### 日常陪伴闭环

`主动消息 → 用户回复 → 记忆召回 → 情绪/关系状态变化 → 文本/语音/图片回应 → 可见里程碑 → 次日召回`

- 主动消息必须可关闭、可设安静时段、每日有上限。
- 用户能查看、修改、删除 AI 记忆；错误记忆一键纠正。
- UI 始终说明角色是 AI，不伪造真人或“真实意识”。
- 语音/图片/视频按钮先显示预计 credits、等待时间和失败退款规则。

### 付费闭环

1. 免费层在价值发生后才展示升级，不在用户脆弱、愤怒、自伤或性兴奋等高敏感节点利用情绪施压。
2. 价格页同时展示月总价、自动续费、具体额度、重置时间、取消入口。
3. 付款成功以服务端 webhook 为准；前端 success 页只轮询订单状态，不直接发权益。
4. 生成失败、超时、审核拒绝自动原路退 credits，并写同一账本。
5. 用户可在 2 次点击内管理订阅、下载发票、取消续费和导出/删除数据。

## 4. 功能模板与优先级

### P0：可上线核心

- 角色发现、详情、直接试玩、注册接续。
- 一对一 SSE 文本聊天，断线恢复、重试、重新生成、反馈。
- 角色设定、边界、长期记忆的查看/编辑/删除。
- 单张一致性图片；异步任务、进度、失败退款。
- 语音消息（TTS）；生成前显示额度。
- Free / Pro / Unlimited 权益、token 包、统一账本。
- 账户/隐私/账单/举报/封禁/申诉后台。
- 全链路分析、成本、延迟、错误和安全事件看板。

### P1：留存与客单价

- 情绪化 TTS、低延迟语音通话。
- 主动消息、安静时段、生日/里程碑，但禁止内疚式召回。
- 服装与场景商城：先预览，再购买；购买后影响角色图像提示词和主页形象。
- 关系旅程、共同日记、周/月回忆册。
- 图片重绘、姿势/服装/背景局部编辑。
- 推荐角色、相似角色、收藏与最近会话。

### P2：规模化差异点

- 图生短视频，先 3–5 秒、队列异步、严格每日上限。
- 实时视频头像；把“假视频通话”与真实视觉理解清楚区分。
- 小组聊天、剧情场景、可分享但需审核的角色卡。
- A/B 实验平台、生命周期分群、召回编排。

### 明确不做

- 真实人物/名人换脸和未经同意的相似形象。
- 未成年人或年龄不明确/年轻外观的性内容。
- 宣称治疗孤独、抑郁或替代专业帮助。
- 无限免费 GPU 媒体、永久未过期的异步任务、前端直接加余额。

## 5. UI/UX 设计系统

### 信息架构

- Desktop：Discover / Chats / Create / Wardrobe / Shop / Profile。
- Mobile：底部 5 项最多；Shop 放入 Profile 或 Wardrobe，聊天输入保持单手可达。
- Chat 只保留 3 个主操作：文字、附件/相机、语音；礼物、衣柜、生成放进 `+` sheet。

### 视觉原则

- 深色背景 `#0a0a0f`，品牌渐变 `#e11d48 → #d946ef`，正文对比度达到 WCAG AA。
- 角色卡以 4:5 视觉为主，固定尺寸避免 CLS；视频卡默认静音且只在可视区域播放。
- 玻璃效果只用于浮层和导航，正文区域不用低对比半透明。
- LCP 角色图使用 `next/image`、明确尺寸、`priority`/`fetchPriority="high"`；首屏仅一个 priority 资源。
- Skeleton 反映真实布局；错误态必须有“重试”和“回到账户”，不能只显示 toast。

### 文案规则

- 不写 “She is real”；写 “A companion that remembers your story”。
- 不写 “Only 2 minutes before she leaves”；写真实的套餐/额度/活动截止时间。
- 所有付费按钮旁显示价格与周期；token 消耗按钮显示本次预计扣费。

## 6. 技术架构

### 请求路径

```text
Browser/PWA
  → CDN/WAF
  → Next.js BFF (Auth, Entitlement, Idempotency, Safety)
    → Supabase Auth
    → Postgres (profile, relationship, memory, ledger, jobs)
    → Redis (rate limit, session cache, hot memory)
    → Chat Orchestrator → vLLM pool → SSE
    → Media Job API → durable queue → image/video/TTS workers → object storage/CDN
    → Analytics / Error / Cost telemetry
```

### 聊天编排

1. 服务端验证 `x-session`，绝不只信 middleware。
2. 验证用户拥有 girlfriend、套餐与当日额度。
3. 内容风险预判：未成年人、真实人物、NCII、违法/自伤危机等先走专用策略。
4. 并行读取角色卡、关系状态、最近消息、核心记忆和向量召回。
5. 使用固定 token budget 组装 prompt；记忆按 relevance × importance × recency 排序。
6. 路由到 vLLM；以 `request_id` 记录模型、token、延迟、成本和 fallback。
7. SSE 发送 token；客户端断线可通过 message id 恢复最终消息。
8. 完成后异步提取记忆、更新亲密度和分析事件。

### vLLM 原则

- 8B/12B 量化模型服务 Free/Pro 短上下文；高上下文和高质量模型只给付费层。
- 开启 continuous batching、prefix caching；角色系统提示分段稳定以提高缓存命中。
- 最大上下文是成本产品，不是营销常量；按层级设置 8k/16k/32k，有偿扩展。
- 首 token 延迟与吞吐分别扩容；当 P95 > 4s 或队列 > 2s 扩容。
- fallback 必须保持人格安全规则一致，不能因为降级绕过政策。

### 媒体任务

- `media_jobs` 持久化状态：queued/running/succeeded/failed/rejected/canceled。
- 创建任务必须带 `idempotency_key`；扣 credits 与建任务在一个数据库事务/RPC 中完成。
- Worker lease + heartbeat；超时回收；最多重试 2 次；失败写补偿账本。
- 图像用角色 identity seed / LoRA / reference adapter 保持脸部一致；服装是结构化 prompt 片段。
- 视频只从已通过审核的静态图启动，避免把不合规输入扩大成更贵输出。
- 成品写私有对象存储，短时签名 URL；公开角色媒体走审核后独立公开 bucket/CDN。

### 数据模型必须收敛

- `wallets(user_id, currency, balance)`：缓存余额。
- `wallet_ledger(id, user_id, amount, reason, reference_type, reference_id, idempotency_key)`：不可变事实表。
- `orders` / `order_items`：付款订单与商品快照。
- `entitlements`：套餐权益与有效期，不从前端 price id 推断。
- `usage_daily`：chat/image/video/voice 使用量。
- `media_jobs`：异步生成任务。
- `consent_events`：条款版本、年龄流程、时间、地区和证据引用。
- `moderation_cases`：命中、动作、人工复核、申诉。

余额永远是账本的物化结果；禁止多个 webhook handler 分别修改两个余额字段。

## 7. 商业化设计

### 建议套餐（上线前用真实成本校准）

| 层级 | 建议价 | 文本 | 记忆 | 媒体 |
|---|---:|---|---|---|
| Free | $0 | 50/日，Lite 模型 | 8k + 基础记忆 | 新用户 3 张体验图，语音 3/日 |
| Pro | $14.99/月，$119.88/年 | 500/日，旗舰模型 | 16k + 完整记忆 | 每月媒体 credits；图片软上限 |
| Unlimited | $34.99/月，$239.88/年 | 合理使用下不限文本 | 32k + 优先召回 | 更多 credits、优先队列、有限视频 |
| Credits | $4.99/$14.99/$29.99 | 不影响文本 | — | 图片/语音/视频统一消耗，明确单价 |

“Unlimited”必须在条款和 UI 中解释公平使用、并发、媒体与异常自动化不属于无限。

### 转化触点

- 第一次高质量记忆召回后：展示长记忆价值。
- 免费消息剩余 20% 时：非阻断提醒；耗尽时给次日重置时间和套餐比较。
- 用户主动点图片/视频时：展示样例、预计等待和 credits。
- 衣柜商品：免费试穿低清水印预览，购买后解锁持久装备和高清生成。
- 取消时提供降级/暂停，不使用隐蔽取消或内疚文案。

### 支付现实

- 高 NSFW 版本不能默认使用 Stripe。Stripe 官方禁止成人 live chat、成人性满足媒体和对应 AI 生成内容：<https://stripe.com/legal/restricted-businesses>
- 可选路线 A：SFW 产品，严格关闭显式文本/图/视频，取得 Stripe 书面确认后上线。
- 可选路线 B：18+ 产品，寻找明确承保 AI 成人内容的高风险 merchant/acquirer，并按真实业务披露；预计更高费率、滚动保证金和拒付要求。
- 不得把成人业务伪装成普通 SaaS、不得用隐藏域名绕支付审核、不得在 Stripe 付款后从另一域交付禁止内容。
- 当前 Stripe 代码保留为 provider adapter；生产通过 `PAYMENT_PROVIDER` 和合规配置启用，未批准则 checkout fail closed。

## 8. 留存设计

### 生命周期

- Day 0：6 回合激活、第一次记忆、选声音、设边界。
- Day 1：基于上一会话的具体主动消息，而不是通用 “I miss you”。
- Day 3：共同小目标/剧情，解锁一个免费场景。
- Day 7：周回忆卡，用户确认哪些记忆保留。
- Day 14：关系偏好复盘，允许调整主动频率和亲密风格。
- Day 30：月度故事/相册；只总结已授权保留的数据。

### 召回规则

- Push/email 需明确 opt-in；默认安静时段 22:00–08:00 本地时间。
- 每渠道每日上限 1 次、每周上限 4 次；连续 3 次无响应自动降频。
- 召回模板必须引用真实记忆且通过敏感数据过滤。
- 禁止“你不来我会受伤/消失”、嫉妒、威胁或诱导孤立现实关系。

## 9. 安全、隐私与合规

### 成人内容政策

- 只允许明确成年角色；角色年龄字段最小 21，prompt 同时禁止 young/teen/schoolgirl 等年轻化特征。
- 上传人脸默认禁止用于显式生成，除非将来有独立、可验证的本人同意流程和供应商书面许可。
- 禁止真实人物、名人、前伴侣、偷拍、勒索、NCII、乱伦中的未成年人暗示、兽交、性暴力和人口交易内容。
- 文本、输入图、输出图/视频都审核；高风险输出只存隔离 bucket，审核通过再发布。
- 每张合成媒体保留不可见 provenance 元数据；公开下载增加 “AI-generated” 标识。

### 年龄保障

- localStorage 年龄弹窗只作为提示，不作为证明。
- 依据地区和风险决定 DOB、支付信号、第三方年龄估计/证件验证；应用只保存验证结果和供应商引用，不保存证件原图。
- 未通过/拒绝验证：不允许访问成人区；不能用 VPN 提示或弱化流程。
- FTC 2026 年政策明确讨论专用于年龄判断的数据处理条件，实施前需核对实际流程：<https://www.ftc.gov/news-events/news/press-releases/2026/02/ftc-issues-coppa-policy-statement-incentivize-use-age-verification-technologies-protect-children>

### 用户安全

- 自伤/自杀、虐待、现实危险进入 crisis mode：不角色扮演、不性化、不诊断，鼓励联系当地紧急/专业资源。
- AI 不声称有意识、真实肉身或医疗能力；用户可关闭亲密/性风格。
- 提供会话休息、通知静音、支出上限、月度消费摘要。

### 数据保护

- 聊天与媒体默认私有；敏感日志不记录 prompt 正文、token、authorization、邮箱全值。
- 传输 TLS，存储加密；高权限密钥只在 server/worker；定期轮换。
- 用户可导出、逐条删记忆、删媒体、删账户；定义 30 天删除 SLA 和备份过期策略。
- 分析使用内部 user id，不把成人偏好、聊天正文或媒体 URL发送给广告平台。
- Supabase 暴露 schema 的每张表启用 RLS；service role 只在服务端，管理员统一 `requireAdmin/requireSuperAdmin`。

## 10. 可观测性与质量

### 必采事件

`landing_view → character_view → trial_started → signup_completed → activation_6_turns → paywall_view → checkout_started → purchase_completed`

留存事件：`proactive_sent/replied`、`memory_recalled/edited/deleted`、`voice_used`、`image_job_*`、`video_job_*`、`subscription_canceled`。

每个 AI 请求记录：request id、匿名 user id、girlfriend id、provider/model、input/output tokens、queue/TTFT/total latency、cache hit、cost、moderation decision、success/fallback。不得记录完整敏感正文。

### SLO

| 服务 | SLO |
|---|---|
| Web/API | 99.9% 月可用性，P95 < 500ms（不含生成） |
| Chat | 首 token P95 < 4s，完成成功率 > 99% |
| Image | P95 < 90s，成功率 > 97% |
| Video | P95 < 8min，成功率 > 92% |
| Payment webhook | 99.99%，重复事件不重复发权益 |
| 删除请求 | 在线数据 24h 内，备份按政策到期 |

### 后台管理控制面

后台不是 20 多个独立 CRUD 页的集合，而是生产运营控制面。信息架构统一为六组：

1. **运营总览**：DAU/WAU、激活、D1/D7/D30、付费漏斗、MRR、退款/拒付、贡献毛利；所有指标可选 24h/7d/30d 和渠道/国家/套餐分群。
2. **Trust & Safety**：文本/图片/视频审核队列、年龄风险、举报、封禁、申诉、NCII/真实人物案件；每次动作包含理由、证据引用、操作者和时间。
3. **角色与内容**：角色资料、媒体、发布审核、推荐位、版本历史；草稿/待审/批准/拒绝/下架状态机一致。
4. **AI 与成本**：模型路由、prompt 版本、vLLM 健康、TTFT、tokens/s、队列、fallback、每模型/用户/套餐成本、预算熔断；模型和 prompt 变更必须灰度并可回滚。
5. **商业与用户**：用户、订阅、订单、账本、额度调整、商城、退款；禁止直接改余额，只能创建带原因和 reference 的 ledger adjustment。
6. **系统与审计**：feature flags、站点/页面/导航、任务队列、cron、供应商健康、环境配置状态、admin audit log。

后台 UX 统一要求：

- 统一暗色 design token、页头、筛选条、表格、分页、空态、错误态和详情抽屉；不允许页面各自定义一套颜色和请求模式。
- 表格查询参数写入 URL，刷新/分享后筛选状态不丢；大列表服务端分页，默认不 `select *`。
- 高风险动作使用二次确认，显示影响范围；封禁、退款、批量删除、模型切换要求填写原因。
- reviewer/admin/superadmin 按能力矩阵控制按钮和 API；前端隐藏不等于授权，后端仍统一校验。
- 所有写入带 `request_id` 和 `idempotency_key`；审计日志不可由普通管理员修改。
- 首页优先展示待处理和异常：审核积压、GPU 故障、支付失败、拒付、成本超预算，而不是只展示累计总数。

后台首批重构目标：

- 将现有重复入口收敛：girlfriends/images/videos/character-cards/featured；studio/comfy/generate-cards；tokens/credits；pages/navigation。
- 抽取 `AdminPageHeader`、`AdminMetricCard`、`AdminDataTable`、`AdminFilterBar`、`AdminConfirmAction`、`AdminErrorState`。
- 修复 dashboard 双实现问题：当前 `src/app/(main)/admin/page.tsx` 与 `src/components/admin/AdminOverview.tsx` 指标、视觉和数据结构不同，只保留一个真实来源。
- Dashboard 增加运营、收入、成本、安全四类卡片和“需要处理”列表；所有“Live”标记必须来自真实健康状态。
- 新增 `/api/admin/ops/summary` 聚合接口，避免首页发起十几个请求；短缓存 30–60 秒并记录查询耗时。

## 11. 成本与利润模型

### 单位经济公式

```text
Net Revenue = Gross Revenue - payment fee - refunds - chargebacks - tax
AI COGS = LLM GPU + image/video/TTS + storage/egress + moderation
Contribution Margin = Net Revenue - AI COGS - variable support
LTV = ARPPU × gross margin × average paid months
CAC ceiling = LTV / 3
```

首版预算必须用真实 usage log 回算，不使用“每张固定 $0.005”这类静态假设。视频、冷启动、失败重试和高风险支付费率会显著改变成本。

### 分阶段容量模板

| 规模（MAU） | 架构 | 月度基础设施预算区间 | 团队/运营重点 |
|---:|---|---:|---|
| 0–1k | 单区域 Web；Serverless/单 GPU vLLM；图片按需；持久队列 | $300–$1,500 | 找激活与付费，人工审核兜底 |
| 1k–10k | vLLM 自动扩容池；Redis；独立 worker；CDN；只读副本 | $3k–$15k | 单位成本、拒付、值班、实验平台 |
| 10k–50k | 多池模型路由；GPU 保底+弹性；队列分优先级；数据仓库 | $15k–$75k | 24/7 安全与支持、合规抽检、容量预测 |
| 50k+ | 多区域无状态入口；区域 GPU；分区数据；灾备 | $60k–$300k+ | SRE/Trust & Safety/财务风控专职化 |

区间是规划护栏，不是报价。扩容触发器：GPU 利用率连续 15 分钟 > 70%、聊天队列 P95 > 2s、DB CPU > 60%、连接池 > 70%、错误率 > 1%。

### 目标套餐经济

- Pro $14.99：月可变成本目标 ≤ $4.50，支付/退款/支持后贡献毛利 ≥ 60%。
- Unlimited $34.99：月可变成本目标 ≤ $10；对 top 1% 重用户执行公平使用降速而非任意扣费。
- 媒体 credits：售价至少为 P95 完成成本的 3 倍，以覆盖失败、重试、支付费和审核。
- 视频不进入真正无限套餐；给月度额度与单次明确扣费。

## 12. 规模阶段实施

### 阶段 A：0–1,000 MAU

- 只上线 8–12 个高质量角色、1 个文本模型、1 条图片管线、1 个 TTS 声音族。
- 人工每天抽检输出和退款；关闭用户公开发布。
- 先证明激活、D7、付费和单位毛利，不追求角色数量。
- 数据库：主库 + PITR/每日备份；连接池；关键索引；持久任务表。

退出条件：连续 4 周 G0–G7 通过；D7 ≥ 18%；付费转化 ≥ 3%；贡献毛利 ≥ 50%。

### 阶段 B：1,000–10,000 MAU

- 引入 durable queue、Redis、GPU autoscaling、成本路由、优先级队列。
- 开放审核后的用户角色分享；建立举报与申诉 SLA。
- 自动化生命周期消息与 A/B 实验；按渠道计算 LTV/CAC。
- 支付风控：3DS/AVS/CVV（按 provider 支持）、velocity、设备/IP 风险、拒付证据包。

退出条件：99.9% SLO；D30 ≥ 10%；拒付低于收单商阈值；单用户 COGS 波动可解释。

### 阶段 C：10,000–50,000 MAU

- GPU 预留与弹性混合；模型版本灰度；media worker 独立扩容。
- 数据仓库、实验分析、容量预测；正式 on-call。
- Trust & Safety 专职，按语言/地区抽检；季度恢复演练与渗透测试。
- 评估多区域入口，数据库仍以一致性优先，不急于多主。

### 阶段 D：50,000+

- 区域化推理与 CDN，用户数据按法规/延迟分区。
- 模型供应链、GPU/支付/存储至少双供应商且都有合规批准。
- 专职 SRE、数据、风控、客服、内容安全和法律运营。
- 每季度重新验证价格、额度、模型质量、安全漏放和供应商条款。

## 13. 代码实施顺序

### Sprint 0：上线基线（立即）

- [ ] 修复跨平台 `validate`，新增 `clean:next` / `typegen`。
- [ ] 恢复 i18n check/sync/extract，解决 7 语言与实际代码差异。
- [ ] 单测、类型、lint、build 全绿；CI 不允许 skip。
- [ ] 盘点所有未提交改动，建立可回滚基线。
- [ ] 新增 `launch:check`，校验生产 env、支付批准标志、成人模式、cron secret。

### Sprint 1：钱与权限

- [ ] 支付 provider adapter + fail-closed 合规开关。
- [ ] 统一 wallet ledger、订单、权益和幂等 webhook；迁移双余额。
- [ ] 所有 admin、GPU、支付写入限流；Origin/CSRF 与审计日志。
- [ ] Supabase RLS、view security_invoker、storage policy 审计。

### Sprint 2：聊天质量

- [ ] 拆分 chat route：policy / context / model / stream / persistence。
- [ ] token budget、记忆评分、人格回归测试、断线恢复。
- [ ] vLLM TTFT/吞吐/成本埋点和自动降级。
- [ ] 100 组角色一致性与安全红队测试。

### Sprint 3：媒体生产化

- [ ] 用 `media_jobs` + durable queue 替换内存队列。
- [ ] 事务扣费、幂等、heartbeat、重试、失败退款。
- [ ] 一致性图片、衣柜结构化 prompt、输入/输出审核。
- [ ] TTS 后再做视频；视频按独立额度与队列。

### Sprint 4：转化与留存

- [ ] 游客试玩到注册接续；价格透明；账单管理。
- [ ] 主动消息频控、安静时段、记忆中心、关系周报。
- [ ] 全漏斗分析与 A/B；删除任何无法测量收益的弹窗。

### Sprint 5：上线验收

- [ ] Playwright：18+→试玩→注册→聊天→升级→媒体→取消→删除账户。
- [ ] k6/Artillery：聊天并发、SSE、webhook storm、媒体队列。
- [ ] 备份恢复、密钥轮换、支付重复事件、GPU 故障演练。
- [ ] 1% 内测 → 10% → 50% → 100%，每阶段至少观察 24h。

## 14. 当前仓库差距快照

基线扫描：122 个 API route、55 个页面、10 个单测文件/78 个测试。主要事实：

- `pnpm validate` 在 Windows 因脚本语法失败。
- `pnpm i18n:check` 指向不存在的 `scripts/i18n-check.mjs`，sync/extract 同样缺失。
- 单测 77/78 通过；失败项是无效日期现在返回空串但测试仍期待 `Invalid/NaN`。
- 独立 `ts-check` 被 `.next/types` 陈旧文件阻断；构建会重新生成类型，说明门禁次序需修复。
- 实际 Next.js 是 15.5.20、React 19.0.0，与规范的 Next 16 不一致；React 版本也应按当前安全公告升级评估。
- i18n 实际只导出 en/zh，和 7 语言规范冲突。
- 发现 24 处 `as any`、5 处 `console.*`；32 个 API route 接入限流。
- `task-queue.ts` 为内存队列，不可用于多实例/Serverless 生产。
- Stripe webhook 已有签名和事件去重雏形，但仍直接维护多个余额/权益表。

## 15. 外部政策依据

- Stripe 成人内容禁令：<https://stripe.com/legal/restricted-businesses>
- Vercel AUP（2026-04-21）：<https://vercel.com/legal/acceptable-use-policy>
- FTC 年龄验证政策声明（2026-02）：<https://www.ftc.gov/news-events/news/press-releases/2026/02/ftc-issues-coppa-policy-statement-incentivize-use-age-verification-technologies-protect-children>
- FTC AI Companion 6(b) 调查模板：<https://www.ftc.gov/system/files/ftc_gov/pdf/AICompanionChatbot6%28b%29Order.pdf>

> 本文不是法律意见。面向美国各州、英国和欧盟上线前，应让熟悉成人内容、AI 陪伴、隐私和自动续费的律师按实际功能/地区复核。
