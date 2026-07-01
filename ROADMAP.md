# SoulMate AI — 优化路线图（Optimization Roadmap）

> 用于跟踪基础框架完成后的增长 / 防风险 / 工程质量优化。每完成一项 → 把方框打勾 `[x]`。

---

## 一、项目现状盘点（截至基础框架完成时）

| 维度 | 数量 / 状态 | 评估 |
|------|------------|------|
| 代码体量 | 222 文件 / 35,768 行 | 中等规模 |
| 页面 | 39 个（含 12 个 Admin） | 完整 |
| API 路由 | 81 个 | 完整 |
| i18n | 7 语言 268 key 100% | 🟢 优 |
| 自定义域名 | soulmateai.shop ✅ | 🟢 优 |
| 单元测试 | 0 个 | 🔴 缺失 |
| 监控 / 埋点 | 0 个 | 🔴 缺失 |
| 邮件能力 | 未接入 | 🔴 缺失 |
| 限流 | Upstash 已写未启用 | 🟡 待激活 |
| 缓存 | API 无 `unstable_cache` | 🟡 |
| `console.log` | 163 处 | 🟡 噪音 |
| 超大文件 | admin/images 1601 行 | 🟡 |

---

## 二、P0 优先级（影响营收转化）

### [ ] P0-1 邮件能力接入 Resend
- 问题：Supabase Free 邮件配额 3 封/小时 + 进垃圾箱，注册流失 ≥30%
- 方案：接入 Resend（3000 封/月免费）+ 自定义品牌邮件
- 工作量：4 小时
- 收益：送达率 92% → 99%

### [ ] P0-2 Stripe 支付转化优化
- 问题：pricing 页无社会证明 / 倒计时 / 退款保证
- 方案：实时升级计数、首次访问 24h 折扣、Money-Back 徽章、达 50 条上限粉色升级 modal
- 工作量：6 小时
- 收益：付费率 +15~30%

### [ ] P0-3 性能优化（LCP）
- 问题：chat/[id] 1215 行单文件 / 公开页无 ISR / OSS 签名 URL 每次签
- 方案：landing/`girlfriend/[slug]` 加 ISR 300s、unstable_cache 60s、签名 URL 30 天、chat 拆子组件
- 工作量：8 小时
- 收益：LCP 2.8s → 1.2s

---

## 三、P1 优先级（防风险）

### [ ] P1-1 Sentry 错误监控
- 接 `@sentry/nextjs` 免费版 5K/月
- 500 错误率 > 1% 邮件告警 / 慢请求 P95 > 3s
- 工作量：3 小时

### [ ] P1-2 启用 Upstash Redis 限流
- 问题：rate-limit.ts 已写好但未配 Upstash 环境变量
- 关键接口：chat/stream 50/h、generate-image 10/h、signup 5/h/IP、girlfriends POST 30/h
- 工作量：2 小时
- 收益：防 RunPod GPU 单次刷烧 $50+

### [ ] P1-3 console.log 清理
- 163 处散落，可能泄漏 token/email
- 写 logger.ts (dev=console / prod=Sentry)、全局替换、lint 加 no-console
- 工作量：3 小时

### [ ] P1-4 数据库索引审查
- 181 处 supabase.from().eq() 未审查索引
- 重点：girlfriends.user_id、review_status+is_public、messages.gf_id+created_at DESC
- 工作量：2 小时
- 收益：P95 200ms → 20ms

---

## 四、P2 优先级（增长留存）

### [ ] P2-1 PWA 接入
- next-pwa + manifest.json + service-worker
- 用户可"Add to Home Screen"
- 离线缓存最近 10 张女友图
- 工作量：4 小时
- 收益：7 日留存 +30%

### [ ] P2-2 PostHog 埋点
- 关键事件：注册成功 / 创建女友 / 首条消息 / 触达上限 / 点付费 / 完成付费
- 漏斗：landing → register → first chat → upgrade
- session 录屏
- 工作量：4 小时

### [ ] P2-3 主动召回 / Push 通知
- /api/proactive/check 已有框架，差触发
- Vercel Cron 19:00：8 小时未上线用户女友发 "Missing you…"
- Web Push API + Resend 邮件兜底
- 工作量：8 小时
- 收益：7 日留存 +20%

### [ ] P2-4 长期记忆 pgvector
- Supabase pgvector + OpenAI text-embedding-3-small
- 聊天时检索最相似 5 条历史 + memories
- AI Prompt 注入"记忆"
- 工作量：12 小时
- 收益：续费率 +10%

---

## 五、P3 优先级（工程质量）

### [ ] P3-1 关键路径单元测试（Vitest）
- requireAdmin / intimacy 公式 / Stripe webhook 签名 / i18n fallback
- 工作量：6 小时

### [ ] P3-2 E2E 关键流程（Playwright）
- 18+ → 注册 → 创建 → 发消息 → 触达 → 升级
- 邮件验证 → 登录
- Stripe Checkout
- 工作量：8 小时

### [ ] P3-3 超大文件重构
- admin/images 1601 → ImageGrid/FilterBar/GenerateModal/EditDrawer
- chat/[id] 1215 → useChatStream hook 抽离
- i18n/translations.ts 1912 → 拆 7 个 JSON
- 工作量：10 小时

### [ ] P3-4 文档同步
- AGENTS.md 补 Resend/Sentry/Upstash 环境变量
- 新增 RUNBOOK.md 应急手册（webhook 重放 / DB 慢查询 / 退款流程）
- 工作量：3 小时

---

## 六、建议实施排期

### 第 1 周（防漏出血）— 12h
- [ ] P0-1 Resend (4h)
- [ ] P1-2 Upstash (2h)
- [ ] P1-1 Sentry (3h)
- [ ] P1-3 console.log (3h)

### 第 2 周（提升转化）— 16h
- [ ] P0-2 Stripe 转化 (6h)
- [ ] P0-3 性能 LCP (8h)
- [ ] P1-4 DB 索引 (2h)

### 第 3 周（留存增长）— 16h
- [ ] P2-2 PostHog (4h)
- [ ] P2-3 主动召回 (8h)
- [ ] P2-1 PWA (4h)

### 第 4 周（长线投入）— 18h
- [ ] P2-4 pgvector (12h)
- [ ] P3-1 单测 (6h)

---

## 七、ROI 估算

| 优化项 | 预期收益 |
|--------|---------|
| 邮件送达 92→99% | 注册流失 -30% |
| Stripe 转化优化 | 付费率 +15~30% |
| LCP 2.8s→1.2s | SEO 排名 + 转化 |
| 主动召回 + Push | 7 日留存 +20% |
| Upstash 限流 | 防单次刷 $50+ 损失 |
| pgvector 长期记忆 | 续费率 +10% |

**4 周累计 ≈ 60 小时，ROI 预期 MRR 翻倍。**
