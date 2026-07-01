# SoulMate AI — 优化方案路线图

> 状态：已确认基础框架完成，下一阶段按本方案推进。
> 触发口令：当用户说"开始 P0"、"开始 P1"、"做 Resend"等关键词时，按本文档执行对应章节。

## 一、项目现状盘点

| 维度 | 数量 / 状态 | 评估 |
|------|------------|------|
| 代码体量 | 222 文件 / 35,768 行 | 中等规模 |
| 页面 | 39 个（含 12 个 Admin） | 完整 |
| API 路由 | 81 个 | 完整 |
| i18n | 7 语言 268 key 100% | 🟢 优 |
| 自定义域名 | soulmateai.shop | 🟢 优 |
| 单元测试 | 0 | 🔴 缺失 |
| 监控 / 埋点 | 0 | 🔴 缺失 |
| 邮件能力 | 未接入 | 🔴 缺失 |
| 限流 | Upstash 已写未启用 | 🟡 待激活 |
| 缓存 | API 无 unstable_cache | 🟡 可优化 |
| console.log | 163 处 | 🟡 噪音 |
| 超大文件 | admin/images 1601 / chat 1215 | 🟡 难维护 |

---

## 二、P0 优先级（影响营收转化）

### P0-1 邮件能力接入 Resend
- **问题**：Supabase Free 每小时 3 封邮件配额 + 进垃圾箱，注册流失 ≥30%
- **方案**：Resend SMTP 接管 Supabase Auth + 自定义品牌邮件模板
- **工作量**：4h
- **收益**：邮件送达率 92% → 99%

### P0-2 Stripe 支付转化优化
- **问题**：pricing 页无社会证明 / 倒计时 / 退款保证
- **方案**：实时计数 + 限时折扣 + 信任徽章 + 升级 modal
- **工作量**：6h
- **预期收益**：付费转化 +15~30%

### P0-3 性能优化（首屏 LCP）
- **问题**：chat 1215 行 SSR、公开页无 ISR、OSS 签名 URL CDN 缓存差
- **方案**：landing/girlfriend 改 ISR revalidate=300、加 unstable_cache、OSS 签名延长至 30 天、chat 拆子组件
- **工作量**：8h
- **预期收益**：LCP 2.8s → 1.2s

---

## 三、P1 优先级（防风险）

### P1-1 Sentry 错误监控
- @sentry/nextjs 接入，API 500 / 慢请求 / Error Boundary 告警
- 工作量：3h

### P1-2 启用 Upstash Redis 限流
- chat/stream 50 次/小时、generate-image 10 次/小时、signup 5 次/小时/IP、girlfriends POST 30 次/小时
- 工作量：2h
- **紧急性高**：防脚本刷 RunPod GPU 烧钱

### P1-3 console.log 清理
- 写 lib/logger.ts、全局替换、加 no-console lint rule
- 工作量：3h

### P1-4 DB 索引审查
- girlfriends(user_id)、(review_status, is_public)、messages(gf_id, created_at DESC)、intimacy(user_id, gf_id)
- 工作量：2h

---

## 四、P2 优先级（增长 / 留存）

### P2-1 PWA 接入
- manifest.json + service-worker + Add to Home Screen
- 工作量：4h，预期 +30% 7 日留存

### P2-2 PostHog 行为埋点
- 转化漏斗 + 录屏 + 关键事件
- 工作量：4h

### P2-3 主动召回 + Push + 邮件
- Vercel Cron 19:00 触发，离开 8h 用户女友主动消息
- Web Push + 邮件兜底
- 工作量：8h，预期 +20% 7 日留存

### P2-4 长期记忆 pgvector
- text-embedding-3-small + 5 条最相似检索
- 工作量：12h

---

## 五、P3 优先级（工程质量）

### P3-1 Vitest 单元测试
- requireAdmin / intimacy 公式 / Stripe webhook 签名 / i18n fallback
- 工作量：6h

### P3-2 Playwright E2E
- 18+ → 注册 → 创建 → 聊天 → 上限 → 升级
- 工作量：8h

### P3-3 超大文件重构
- admin/images（1601）、chat（1215）、translations（1912）
- 工作量：10h

### P3-4 文档同步
- AGENTS.md / DESIGN.md / 新增 RUNBOOK.md
- 工作量：3h

---

## 六、实施排期

| 周 | 内容 | 工时 |
|----|------|------|
| 第 1 周 | P0-1 邮件 + P1-2 限流 + P1-1 Sentry + P1-3 日志 | 12h |
| 第 2 周 | P0-2 转化 + P0-3 性能 + P1-4 索引 | 16h |
| 第 3 周 | P2-1 PWA + P2-2 埋点 + P2-3 召回 | 16h |
| 第 4 周 | P2-4 长期记忆 + P3-1 单测 | 18h |

总计 ≈ 62h（≈ 2 周全职）

---

## 七、ROI 预估

| 项 | 预期收益 |
|----|---------|
| 邮件送达 92% → 99% | 注册流失 -30% |
| Stripe 转化优化 | 付费率 +15~30% |
| LCP 2.8s → 1.2s | SEO 排名提升 |
| 主动召回 + Push | 7 日留存 +20% |
| Upstash 限流 | 防止脚本刷单次烧 $50+ |
| pgvector 长期记忆 | 续费率 +10% |

---

## 八、触发口令对照表

| 用户说 | 执行 |
|--------|------|
| "做 P0" / "做 P0-1" | 按 P0-1/2/3 顺序连做 |
| "接 Resend" / "做邮件" | P0-1 |
| "优化支付" / "做转化" | P0-2 |
| "优化性能" / "做 LCP" | P0-3 |
| "接 Sentry" | P1-1 |
| "做限流" / "Upstash" | P1-2 |
| "清日志" / "console.log" | P1-3 |
| "查索引" / "DB 慢" | P1-4 |
| "做 PWA" | P2-1 |
| "接 PostHog" / "做埋点" | P2-2 |
| "主动召回" / "Push 通知" | P2-3 |
| "长期记忆" / "pgvector" | P2-4 |
| "写测试" | P3-1 / P3-2 |
| "重构大文件" | P3-3 |
