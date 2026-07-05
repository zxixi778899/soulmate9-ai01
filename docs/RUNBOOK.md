# Soulmate9 — RUNBOOK

> 运维手册：常见告警、应急流程、日常维护。

## 目录

- [告警响应](#告警响应)
- [数据库维护](#数据库维护)
- [Cron 任务](#cron-任务)
- [缓存运维](#缓存运维)
- [应急降级](#应急降级)
- [容量规划](#容量规划)

---

## 告警响应

### Stripe webhook 失败激增

**症状**: `logger.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not configured')` 持续出现。

**根因**: Vercel project env 丢失 `STRIPE_WEBHOOK_SECRET`。

**修复**:
1. Vercel Dashboard → Project → Settings → Environment Variables
2. 添加 `STRIPE_WEBHOOK_SECRET`（从 Stripe Dashboard → Developers → Webhooks 复制）
3. Redeploy

### LLM 调用全部 fallback 到 Claude

**症状**: PostHog funnel 显示 `llm_fallback_used` 事件激增；Coze 调用失败率 > 50%。

**根因**: Coze API 限流 / 临时故障。

**修复**:
1. 不需要立即处理 — Claude 兜底链已生效
2. 查看 Coze 控制台是否有限流告警
3. 必要时调整 `CLAUDE_FALLBACK_MODEL` 到更高规格

### RunPod 队列堆积

**症状**: RunPod dashboard 显示 `IN_QUEUE` 任务 > 50；API 响应 > 60s。

**修复**:
1. 检查 endpoint 是否缩容到 0 worker — RunPod 自动扩缩容需 1-2 分钟
2. 紧急情况下加 worker：`POST /v2/{endpoint}/scale` with min=2
3. 长期方案：考虑多 endpoint 负载均衡

### Sentry error rate > 1%

**症状**: 告警邮件 `/api/admin/sentry-stats` > 1%。

**修复**:
1. Sentry Dashboard → 查看 top issues
2. 常见原因：
   - 上游 API 限流 → 已通过 fallback chain 缓解
   - 客户端浏览器不兼容 → 检查 Browser support
   - DB 连接耗尽 → 检查 `pg_stat_activity`

---

## 数据库维护

### 周一 03:00 UTC — 清理过期 generation_cache

由 `/api/cron/cleanup-cache` 自动执行。检查是否成功：

```sql
SELECT COUNT(*) FROM generation_cache WHERE expires_at < NOW();
-- 应该是 0
```

### 每月 1 号 — vacuum + analyze

```bash
psql $DATABASE_URL -c "VACUUM ANALYZE chat_messages;"
psql $DATABASE_URL -c "VACUUM ANALYZE intimacy_events;"
```

### 亲密值聚合视图异常

`intimacy_score_latest` 视图基于事件流 + DISTINCT ON。慢查询时检查：

```sql
EXPLAIN ANALYZE
SELECT * FROM intimacy_score_latest
WHERE user_id = 'xxx' AND girlfriend_id = 'yyy';
```

预期 < 50ms。如果慢：
1. 确认 `idx_intimacy_events_user_girlfriend_time` 存在
2. 考虑物化视图 + 每日刷新

### pgvector 索引重建

如果开启了长期记忆功能（P2-Memory）：

```sql
REINDEX INDEX idx_chat_messages_embedding;
REINDEX INDEX idx_memory_events_embedding;
```

ivfflat 索引在大量删除后需要重建。

---

## Cron 任务

| 路径 | 时间 (UTC) | 用途 |
|---|---|---|
| `/api/cron/subscription-reminder` | 09:00 daily | 订阅到期前 3 天发邮件 |
| `/api/cron/re-engagement` | 14:00 daily | 流失 > 7 天召回 |
| `/api/cron/cleanup-cache` | 03:00 daily | 清理过期 generation_cache |

**鉴权**：所有 cron 必须带 `Authorization: Bearer ${CRON_SECRET}` header。
**配置**：Vercel Dashboard → Project → Settings → Crons。

### 测试 cron

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://soulmate9.com/api/cron/subscription-reminder
```

预期返回：`{"ok":true,"sent":N,"skipped":N,"failed":N}`

---

## 缓存运维

### generation_cache 命中率下降

```sql
SELECT
  kind,
  COUNT(*) AS entries,
  AVG(hit_count) AS avg_hits,
  SUM(hit_count) AS total_hits
FROM generation_cache
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY kind;
```

正常：image 平均 hits > 5；video 平均 hits > 1。

**低于预期原因**：
- 用户输入差异大（个性化 prompt 多）
- 缓存 TTL 太短 — 调大 `DEFAULT_TTL_HOURS`

### 手动清理某用户缓存

```sql
DELETE FROM generation_cache WHERE cache_key LIKE 'prefix_%';
```

---

## 应急降级

### Coze 完全不可用

1. **临时**：手动把 `CLAUDE_FALLBACK_MODEL` 切到 `claude-3-5-sonnet-20241022`（更贵但更稳）
2. **永久**：启用本地 Llama fallback — 部署 Ollama + llama3.1:8b

### RunPod 完全不可用

1. 启用静态 fallback 图片：每个公开女友预生成 5 张常驻图
2. 临时屏蔽图片生成路由，前端降级为纯文字聊天

### 数据库只读 / 写入失败

1. Vercel Dashboard → Postgres → 升级 plan
2. 短期：减少 proactive_message 调度频次（每小时 1 次 → 每 6 小时 1 次）

---

## 容量规划

### 1000 MAU 预估成本（基于 2026-07 定价）

| 项目 | 用量 | 月成本 |
|---|---|---|
| Vercel Pro | 1 项目 | $20 |
| Supabase Auth | 1000 MAU | $0（免费层） |
| Supabase Coze | 8GB 数据 + 250GB 流量 | $25 |
| RunPod FLUX | 100k 张/月 × $0.005/张（缓存后） | $500 |
| RunPod CogVideoX | 5k 段/月 × $0.10/段 | $500 |
| Coze LLM | 5M tokens × $1.5/M | $7.5 |
| Claude fallback | 200k tokens × $0.80/M | $0.16 |
| Cloudflare R2 | 100GB 存储 + 1TB 出流量 | $15 |
| Resend | 10k 邮件 | $20 |
| PostHog | 1M events | $0（免费层） |
| **总计** | | **~$1087/月** |

按 $20/月订阅 × 200 付费用户 = $4000 MRR。**毛利率 73%**。

---

## 联系 / 升级

- 紧急告警 → Slack #soulmate9-incidents
- 性能投诉 → 看 Sentry / PostHog dashboard
- 安全事件 → 立即停止服务 + 查 Cloudflare Logs