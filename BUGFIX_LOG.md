# Bugfix Log — Round 1 (2026-07-07)

本轮为真实代码修复（非任务清单占位），每一项均已实际编辑对应文件。因本地沙盒 `node_modules`
（pnpm 软链接经 FUSE 挂载）间歇性 I/O 错误，无法在此环境内跑通 `tsc`/`vitest`，所有改动均通过
逐行人工复读验证，建议你在自己机器上跑一次 `pnpm run validate && pnpm test` 做最终确认。

## 已修复（高优先级，功能性阻断级）

1. **`src/lib/runpod.ts` — 移除硬编码调试日志导致的必然崩溃**
   原代码无条件调用 `fs.appendFileSync('/app/work/logs/bypass//dev.log', ...)`，该目录在
   Vercel/Railway 容器中不存在，导致图片生成功能每次调用必然抛 `ENOENT`。已替换为项目自带的
   `logger.debug/error`，并将轮询超时从 6 分钟收紧到 ~80 秒（远小于常见 serverless 平台超时），
   避免真实错误信息被平台强杀掩盖。同时为 submit/status 请求加了 `AbortSignal.timeout`。

2. **`src/app/api/runpod/batch/route.ts` — 补齐管理员鉴权 + 修复图片URL写坏**
   该路由可扫描并批量生成**全库**女友头像（消耗 GPU 成本），此前只校验登录，未校验管理员权限，
   任何登录用户都能触发。已接入与 v2 版本一致的 `requireAdmin`。另外 `uploadFile()` 返回
   `{key, url}` 对象，此前直接把整个对象当字符串写入 `avatar_url`，已改为正确解构 `{ url }`。

3. **`src/app/api/runpod/test-generate/route.ts` — 同样的调试日志崩溃问题**
   已清理为使用 logger，并加上 `denyInProduction()` 防止该调试路由在生产环境暴露。

4. **`.env.example` / `.env.local` — 修复环境变量名不一致导致的核心功能瘫痪**
   - `.env.example` 中原来写的 `COZE_API_KEY` 是代码里已经没人读取的过期变量名；真正需要的
     `COZE_WORKLOAD_IDENTITY_API_KEY` / `COZE_WORKLOAD_IDENTITY_CLIENT_SECRET` 之前完全没出现在
     示例文件里 —— 照文档配置，聊天功能 100% 起不来。已修正并补充详细注释。
   - 服务端必需的 `COZE_SUPABASE_ANON_KEY`（不带 `NEXT_PUBLIC_` 前缀）此前在 `.env.local` /
     `.env.example` 均缺失，导致 `getSupabaseClient()` 直接抛异常，几乎所有后台数据库调用不可用。
     已补充。
   - 重新生成了完整的 `.env.example`，与 `grep -rohE "process\.env\.[A-Z_0-9]+" src` 的实际结果
     逐条核对，补上了 `ANTHROPIC_API_KEY`、`TOGETHER_*`、`RUNPOD_VLLM_*`、`CRON_SECRET`、
     `VAPID_*` 等此前遗漏的变量，并注明哪些是可选项。

5. **NSFW 内容路由安全隐患（合规风险）— `src/lib/llm-service.ts`**
   原逻辑：NSFW 请求在 RunPod vLLM / Together AI 均失败后，会静默 fallback 到 Coze / Claude ——
   这两个第三方服务商的服务条款都明确禁止成人内容，一旦被下游发现有可能导致账号被封。
   已改为：NSFW 请求失败后最多降级到自建的 local Llama（无第三方内容政策风险），若仍失败则
   直接返回明确错误，绝不会静默混入 SFW 供应链。

6. **免费升级漏洞（收入相关）— `pricing/page.tsx` + `src/app/api/membership/route.ts`**
   前端 `handleUpgrade` 中存在一个"如果 Stripe checkout 失败，就调用 `/api/membership` POST
   直接升级"的回退逻辑；虽然当前 `/api/membership` POST 不会返回 `success: true`（此前已被堵住），
   但这个危险的回退代码路径仍留在前端，一旦未来有人改动该接口就可能重新引入漏洞。已彻底删除
   前端的危险回退分支，并把后端接口改为**硬性拒绝**任何直接升级请求（403 + 说明），只允许通过
   `/api/stripe/checkout` + webhook 验证付款后的正规流程升级。

## 已修复（中优先级，稳定性/安全性/合规）

7. **`src/lib/coze-auth.ts` — token 获取无并发去重、无重试**
   高并发场景下 token 过期瞬间可能被多个请求同时触发刷新，浪费外部请求并可能撞到限流。
   已加入 in-flight promise 复用（同一时刻的并发调用共享一次刷新），并加入 3 次指数退避重试
   （300ms/600ms）应对网络抖动。同时把硬编码的 `api.coze.cn` 改为可通过 `COZE_AUTH_BASE_URL`
   环境变量覆盖，与项目里其它 base url 的可配置性保持一致。

8. **LLM 全链路无超时控制 — `src/lib/llm-service.ts`**
   `callClaude` / `callLlama` / `callTogetherAI` / `callRunPodVLLM` / `generateText` 此前均没有
   请求超时，一旦上游（尤其自建的 RunPod vLLM / 本地 Llama）挂死，会一直占用连接直到平台自身
   超时才结束，期间拖慢整个应用响应。已统一加上 20 秒 `AbortSignal.timeout`（流式接口
   `streamTextSmart` 保持不变，避免误杀正常的长流式响应）。

9. **Stripe webhook 类型安全 — `src/app/api/stripe/webhook/route.ts`**
   原代码里 5 处 `event.data.object as any` 完全丢弃了 Stripe SDK 的类型检查，字段拼写错误
   在编译期无法被发现。已改用具体的 `Stripe.Checkout.Session` / `Stripe.Invoice` /
   `Stripe.Subscription` 类型（其中一个字段因跨 SDK 版本类型定义不稳定，用窄化的交叉类型而非
   `any` 处理，并加注释说明原因）。

10. **`req.json()` 无兜底导致裸 500 — `wardrobe/route.ts`、`notifications/route.ts`**
    畸形请求体（空 body / 错误 Content-Type）会直接抛出未捕获异常。已统一改为
    `.catch(() => null)` + 显式 400 响应。

11. **`package.json` — `shadcn` 依赖锁定为 `"latest"`**
    这是构建可重复性的反模式：每次安装可能装到不同版本，CI today works / tomorrow breaks。
    已锁定为当前实际可用的版本号 `4.13.0`。

## 复核后确认「文档记录过时、实际已修复」的项目

调研时发现项目根目录的 `COMPETITIVE_ANALYSIS.md` 里记录的几个"严重问题"，经代码核实后
**已经在此前的优化轮次中修复**，特此更新记录，避免误导后续排查：

- **img2img 角色一致性**：文档称"从未启用"，但 `runpod.ts` 的 `buildFluxWorkflow` 已正确实现
  `input_image` 参数的 `LoadImage → ImageScale → VAEEncode → KSampler(denoise)` 分支，
  `chat/generate-image/route.ts` 也正确传入了女友头像作为 `input_image`。此功能实际已生效。
- **Stripe webhook 缺关键事件**：文档称只处理了2个事件，但代码里已包含
  `invoice.payment_failed`、`customer.subscription.updated`、`customer.subscription.deleted`
  的完整处理逻辑（含幂等去重表 `stripe_webhook_events`）。
- **chat/stream 七次串行DB查询**：已用 `Promise.all` 并行化（girlfriend / intimacy /
  recent_messages / memories 四个查询并行，emotion/lore 检测也并行）。

## 尚未处理（已知问题，记录留档，非本轮修复）

- `src/app/api/admin/prompts/route.ts` 和 `src/lib/llm-router.ts` 仍使用 `/tmp/*.json`
  存储管理员配置（图片生成 prompt 预设、模型路由覆盖配置）。Serverless 多实例部署下配置不会
  同步，且冷启动后可能丢失。建议迁移到数据库表（项目已有 Supabase，具备条件），但涉及新建
  schema + 迁移脚本，本轮未处理，留作下一轮任务。
- 6 个重复的图片生成路由（`/api/runpod/generate`、`/api/runpod/batch`、
  `/api/chat/generate-image`、`/api/girlfriends/generate-portrait`、`/api/generate-image`、
  `/api/v2/admin/images/generate-from-meta`）尚未合并为统一 Service，各自超时/重试/缓存策略不一致。
  这是架构级重构，将在"商城系统"和"生图配置优化"任务中一并处理。
- 无 CDN 层缓存图片 presigned URL，无图片缩略图变体。将在生图优化任务中处理。
