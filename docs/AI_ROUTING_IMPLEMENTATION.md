# SoulMate9 统一 AI 路由实现

本文件记录 `soulmate9-routing-plan.docx` 与当前代码的落地差异，避免后续继续按过时现状重复开发。

## 已存在，不需重建

- 聊天：RunPod vLLM 与 Together 均支持原生 SSE 流式，失败时保留缓冲降级。
- 生图：统一 ComfyUI 端点，支持 FLUX、Pony、Illustrious、LoRA、异步提交与轮询。
- 语音：`/api/ai/voice` 已支持 Fish-Speech / CosyVoice、角色音色和情感预设。
- 视频：统一使用 Wan2.2 图生视频、异步任务与媒体保存。
- 路由配置：AI Modules 与 Provider Routes 已支持会员等级、NSFW 通道、故障转移和熔断参数。

## 本次统一入口

| 能力 | 新入口 | 兼容的原实现 |
|---|---|---|
| 聊天 | `POST /api/ai/chat` | `/api/chat/stream` |
| 生图 | `POST /api/ai/image` | `/api/generate-image` |
| 语音 | `POST /api/ai/voice` | 已是统一入口 |
| 视频 | `POST /api/ai/video` | `/api/generate-video` |
| 状态 | `GET /api/ai/status` | `/api/runpod/status` |

新入口是薄适配层，认证、限流、积分和任务逻辑仍只有一个实现来源。旧入口暂时保留以兼容历史客户端。

## 本次路由和创建优化

- 成人话题会检查最近三条消息，避免后续“继续”“可以”等短句错误退回 SFW。
- Free / 亲密度未解锁 / 年龄验证失败仍强制走安全降级。
- FLUX 标准生成统一为 20 步，Pony 成人生成统一为 28 步。
- 创建页加载真实角色预设；数据库无表、无数据或查询异常时使用内置预设。
- 预设一次填充外观、性格、关系、职业、爱好、声音、背景和简介。
- 角色卡和系统提示词改为服务端统一构建，客户端只提交结构化人物资料。

## 仍属于部署配置

以下项目无法仅靠代码仓库完成，需要在 RunPod / Vercel / Supabase 控制台配置：

- RunPod `minWorkers`、`maxWorkers`、GPU 区域和空闲超时。
- Fish-Speech、CosyVoice、Wan 实际 Endpoint ID 和网络卷模型。
- Together、OpenRouter、RunPod API Key。
- 数据库中的自定义 `character_presets` 与 `creator_option_pool` 内容。
