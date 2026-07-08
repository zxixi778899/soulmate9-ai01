# SoulMate9 — 替换Coze LLM方案

## 推荐架构

### 🥇 方案 A：RunPod vLLM 自托管（推荐）

**工作原理**：在你的 RunPod 账户上部署一个 GPU-backed vLLM server，运行未审查模型。

**优势**:
- ✅ 完全无审查，零内容政策风险
- ✅ 你已经有 RunPod 账户和 API Key
- ✅ 项目代码已内置 RunPod vLLM 支持（`src/lib/llm-service.ts` 第25-27行）
- ✅ 按秒计费，不用时 Scale to Zero，成本可控
- ✅ 支持所有 OpenAI 兼容 API（无缝集成现有代码）

**推荐模型**：

| 模型 | 规模 | 特点 | 适用场景 |
|------|------|------|---------|
| `NeverSleep/Llama-3-Lumimaid-8B` | 8B | 最快、最便宜 | Free用户聊天 |
| `NeverSleep/Noromaid-8B-v0.1` | 8B | 角色扮演专长 | 标准聊天 |
| `Sao10K/L3-8B-Stheno-v3.2` | 8B | 创意写作、剧情 | 高级角色 |
| `mistralai/Mistral-Nemo-12B` | 12B | 更大上下文 | Pro用户 |
| `nvidia/Llama-3.1-Nemotron-70B` | 70B | 最强力、最贵 | VIP用户专用 |

**成本估算**（1000 MAU）：
```
模型部署: RunPod Serverless
- 冷启动: ~30秒
- GPU: RTX 4090 / A40（按需）
- 每1K tokens: $0.0003~$0.001
- 月成本: ~$200~$500（取决于MAU和使用量）
```

**部署步骤**：
1. 在 RunPod 创建 vLLM Serverless Template
2. 配置模型（选上面的某几个）
3. 获取 endpoint URL → 填到 `.env.local` 的 `RUNPOD_VLLM_URL`
4. 我修改代码，将 RunPod vLLM 设为主路由

---

### 🥈 方案 B：Together AI + DeepSeek 混合

**工作原理**：用 Together AI 的 Llama 3.3 作为主力（其内容政策相对宽容），DeepSeek 作为兜底。

| 提供商 | 模型 | 内容政策 | 成本 |
|--------|------|---------|------|
| Together AI | Llama 3.3 70B | 轻度审查 | $0.90/1M tokens |
| DeepSeek API | DeepSeek V3 | 中度审查 | $0.27/1M tokens |
| OpenRouter | 多模型 | 中立 | 略高于直连 |

**优势**：无需自托管，即开即用  
**劣势**：仍有内容政策风险

---

### 🥉 方案 C：全自建（RunPod FLUX 生图 + RunPod vLLM 聊天）

**完全去掉所有第三方API**，聊天和生图都用 RunPod 自托管：

```
聊天: RunPod vLLM + Lumimaid/Noromaid（未审查模型）
生图: RunPod FLUX.1-dev-fp8（已配置）
存储: Supabase S3
认证: Supabase Auth
支付: Stripe
```

**优势**：完全自主可控，零政策风险  
**成本**：略高，但透明度高

---

## 🚀 我的建议：方案 A（RunPod vLLM）+ 方案 C 的架构

立即执行以下步骤：

### 第一步：你去 RunPod 创建 vLLM Endpoint（5分钟）

1. 登录 https://www.runpod.io/console/serverless
2. 点击「New Template」→ 选 vLLM
3. 模型选 `NeverSleep/Llama-3-Lumimaid-8B-v0.1`
4. GPU 选 RTX 4090（便宜、快）
5. 创建 → 获取 Endpoint URL

### 第二步：我修改代码（10分钟）

我会：
- 移除所有 Coze 依赖
- 将 RunPod vLLM 设为一级主路由
- Together AI 作为免费用户 fallback
- 保留本地 Llama 作为最后兜底

### 第三步：测试 + 优化（30分钟）

---

## 要我立即开始改造代码吗？

我已经准备好重写 LLM 路由系统，去掉 Coze，以 RunPod vLLM 为主。你只需要：

1. ✅ 同步去 RunPod 创建 vLLM endpoint（上面5分钟步骤）
2. ✅ 把 endpoint URL 发给我

代码改造我这边可以直接开始，不依赖 endpoint 创建完成。

**确认后我立即开工！**