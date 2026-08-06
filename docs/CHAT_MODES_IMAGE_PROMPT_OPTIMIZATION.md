# 聊天双模式 + 生图提示词优化（2026-08-06）

## 1. 对话模式（场景 / 对话）

聊天输入栏新增「场景 / 对话」切换，按女友维度记忆（`localStorage` key：`soulmate_reply_mode_${girlfriendId}`），默认 `scene`，向后兼容。

### API 参数

`POST /api/chat/stream`（即 `/api/ai/chat`）请求体新增：

```json
{ "reply_mode": "scene" | "dialogue" }
```

### 两种模式的行为

| 模式 | 行为 |
|------|------|
| `scene`（场景） | 保留现有场景式回复；台词必须占每条回复 ≥70%，动作节拍最多 1 个短 `*动作*`（<10 字），严禁段落化旁白 |
| `dialogue`（对话） | 只输出她说出口的话；禁止动作/表情/场景/旁白、禁止 `*星号*`；情绪靠语气词、称呼、标点、省略句传递 |

### 服务端兜底

- 发送给 LLM 的历史记录：对话模式下对 assistant 消息先做 `stripActionBeats` 清洗，防止模型模仿旧场景消息。
- 最终回复：对话模式下再次 `stripActionBeats`（去掉 `*…*`、括号舞台指示、纯旁白行）。

### 涉及文件

- `src/lib/chat-character-prompt.ts` — `replyMode` 提示词段（场景/对话规则 + 示例切换）
- `src/lib/chat-reply-sanitize.ts` — 新增 `stripActionBeats()`
- `src/app/api/chat/stream/route.ts` — 接收 `reply_mode`，传入提示词并做两处兜底
- `src/components/chat/ChatInputBar.tsx` — 模式切换 UI（Sparkles=场景 / MessageSquareText=对话）
- `src/app/(main)/chat/[id]/page.tsx` — 状态 + localStorage 持久化 + 请求体携带
- `src/lib/i18n/translations.ts` — `chat.modeScene` / `chat.modeDialogue`（7 语言）

## 2. 生图提示词优化

### 2.1 隐藏提示词（不展示）

- 移除响应中的 `prompt_preview` 与 pending `generation_trace.prompt`。
- 响应仅返回 `prompt_engine: 'llm' | 'deterministic'`。
- 完整提示词只写入 `ai_generation_audits.prompt_summary` 与 `chat_media.metadata.prompt_summary`（内部审计）。

### 2.2 SFW/NSFW 通道判定

`resolveImagePromptChannel()` 综合判定：

- 亲密值未解锁（level 1–2）→ 一律 SFW（强度上限 2 = 内衣级）。
- 亲密值已解锁（level 3–5）→ 只有请求/上下文明确涉黄才走 NSFW；否则仍是 SFW 内容（强度压回 ≤2）。
- 涉及文件：`src/lib/image-prompt-llm.ts`

### 2.3 提示词 LLM 按内容自动路由

- SFW → 质量 SFW 模型（如 `dashscope-qwen-plus`）。
- NSFW → uncensored 模型（RunPod / OpenRouter，按 `priority` 升序，含故障转移）。
- 系统提示词携带：人物资料卡（身份必须不变）、内容边界、最近聊天上下文、用户请求、场景语义、语气/姿态/环境。
- 失败 / 超时（默认 15s）→ 自动回退确定性提示词管线。
- 任务类型记录为 `image_prompt`。

### 2.4 人物一致性增强

- 参考图候选新增：`image_url`、`character_card.image`、`appearance.image`。
- 有参考图时，提示词尾部追加「与参考照同一人：脸/发色/身材/着装不变」。
- LLM 侧强制约束：不得改变角色脸、发、眼、身材、皮肤、风格。

## 3. 配置开关

`src/lib/ai-modules/defaults.ts` 中 `image.scenes.chat_selfie.allow_llm_prompt_polish` 已默认改为 `true`。

> 注意：若数据库 `site_settings`（key=`ai_modules`）已存在覆盖配置，需在后台把该项改为 `true` 才会生效；否则默认值来自代码。

## 4. 验证

- `tsc -p tsconfig.json`：0 错误
- ESLint（改动文件）：通过
- 新增测试：`src/lib/__tests__/chat-reply-mode.test.ts`（对话清洗 / 通道判定 / 提示词清洗 / 身份资料卡）
- 全量测试中 24 个既有失败与本次改动无关（测试与源码漂移，如模型 id、`intercourse` 文案）
