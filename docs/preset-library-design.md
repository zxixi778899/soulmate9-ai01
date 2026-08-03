# SoulMate9 预设库（Preset Library）设计方案

日期：2026-08-03 · 项目：C:\Users\71489\soulmate9
交付物：本文档 + `src/lib/preset-library.ts`（24 个预设数据）+ `db/migrations/0019_preset_library.sql`

---

## 1. 背景与目标

当前创建流程是"三步向导 + 从零捏脸"：用户在 Step 0 只能在 5 个内置预设里选，或者完全从零填 20+ 字段。这带来三个问题：

1. **体验**：自由创建门槛高，新用户不知道选什么；预设太少且无法筛选/搜索；点预设后还要手动填名字才能进下一步。
2. **成本**：每个新角色都要实时生成一张立绘（RunPod FLUX GPU 调用 + 5 credits）；自由文本描述经常导致生图返工；创建出的角色 `base_*` 特质列全部落在数据库默认值（20/15/10），聊天人设平淡 → 用户流失 → 获客成本变相上升。
3. **质量**：立绘发色 hex 不在映射表时静默丢失；人设与亲密度/欲望系统脱节；开场白是全局统一模板，没有角色感。

设计目标对齐三大方向：

| 目标 | 策略 | 关键指标 |
|---|---|---|
| 优化体验 | 预设墙 + vibe 筛选 + 一键创建（预填名字）+ 双语开场白 | 创建转化率、首次聊天发送率 |
| 降低成本 | 预设共享立绘缓存、固化提示词减少 token 与返工、跳过 LLM 自由生成 | 每新角色的 GPU 调用数、credits 消耗 |
| 增强质量 | 预设全量对齐 option pool / trait bands / 场景配方 / LoRA 路由 | 立绘一次过审率、次日留存 |

## 2. 竞品调研摘要

直接抓取部分被反爬拦截（JanitorAI 返回 Access Restricted），以下结合可访问页面与公开资料：

| 平台 | 预设/发现机制 | 可借鉴点 |
|---|---|---|
| JanitorAI | 标签驱动发现（人设/关系/场景 tag 云），角色卡含 Description、Scenario、First Message、Example Dialogues | Scenario 与 First Message 分离设计；标签筛选是 NSFW 平台主流发现方式 |
| Character.AI | 分类浏览（Anime/Game/Fantasy…）+ Greeting + Definition 示例对话 | 分类导航 + 开场白即人设钩子 |
| SpicyChat | 社区库 + tag（奇幻/幽默等）+ 搜索 + 推荐流 | tag + trending 排序 |
| CrushOn.AI | 现成角色库按类别浏览（动漫/游戏/名人）+ NSFW 开关 + 创建时设"外观/性格/对话模式" | 类别浏览 + NSFW 分级开关（我们对应 trait bands + 亲密度门控） |
| Candy.AI / DreamGF 系 | 分步捏脸向导（风格→种族→发型→体型→性格多选）+ 快速生成 | 我们的向导结构与之相同，差距在预设数量与一键完成度 |
| Talkie | 卡牌化角色 + 稀有度收集 | 我们已有 N/R/SR/SSR rarity 列但从未写入，预设正好补齐 |

结论：竞品的共同公式 = **大量预设卡（人物原型 × 关系 × 风格）+ 标签筛选 + 强开场白**。SoulMate9 的差异化在于预设与"特质带 + 亲密度 + LoRA 立绘"深度联动，这是竞品都没有的。

## 3. 现状差距诊断（代码级）

1. `POST /api/girlfriends` 从不写 `relationship / occupation / hobbies / rarity / base_desire / base_development / base_kink / base_intimacy` —— 列存在（迁移 0007/0012），值只进了 `meta` jsonb，公开目录和 trait 提示词读到的全是默认值。
2. `character_presets` 表缺少 TS `CreatorPreset` 期望的 `name_zh / description_zh / hobbies / backstory / short_description` 列（`normalizeCreatorPreset` 优雅降级但内容丢失）。
3. `girlfriend_categories` 表（personality/body_type/vibe）定义后完全未使用。
4. 立绘每次创建实时生成，无缓存复用；`buildPortraitPrompt` 的发色 hex→名称映射只覆盖 11 个值，池外颜色静默丢失。
5. 开场白是 `buildCompanionCharacterCard` 的统一模板，24 个预设各自带场景化双语 first_mes。

## 4. 预设库架构

### 4.1 三层结构

```
L1 原型预设层（新增核心）   24 个完整角色原型，一键应用全部字段
L2 模块选项层（已存在）     creator_option_pool：种族/发型/体型/性格标签…自由微调
L3 场景配方层（已存在复用） GIRLFRIEND_SCENE_RECIPES + portrait_outfit 提示
```

L1 预设的每个字段都从 L2 池内取值（保证下拉框回显正确、立绘提示词可映射），并绑定 L3 场景（开场白场景 = 立绘场景，视觉与叙事一致）。

### 4.2 数据模型（迁移 0019）

`character_presets` 扩展列：`name_zh, description_zh, short_description, backstory, hobbies, slug, default_name, age, rarity(N/R/SR/SSR), vibe_tags(jsonb), traits(jsonb), greeting_en, greeting_zh, scene_id, portrait_outfit`。

`traits` = `{base_intimacy, base_desire, base_development, base_kink}`，数值按 `girlfriend-traits.ts` 三条带（50-69 / 70-84 / 85-100）校准：甜系预设落 50-65 档、撩人系 70-84 档、奔放/病娇系 85+ 档，保证创建即有差异化人设曲线。

`vibe_tags` 十类筛选：sweet 甜美治愈 / cool 高冷禁欲 / flirty 主动撩人 / obsessive 病娇占有 / energetic 元气活力 / fantasy 神秘幻想 / sensual 成熟性感 / dominant 霸道强势 / intellectual 温柔知性 / playful 俏皮捣蛋。

### 4.3 预设内容总览（24 个）

| 分布 | 数量 | 角色 |
|---|---|---|
| Female · Realistic | 8 | 邻家甜心 Sofia、高冷女上司 Victoria、火辣教练 Camila、初恋学妹 Emily、知性老师 Ava、病娇玩家 Raven(SSR)、温柔人妻 Isabella、午夜歌姬 Scarlet |
| Female · Anime | 7 | 青梅之约 Sakura、傲娇对手 Rin、猫耳女仆 Yuki、精灵游侠 Aria、地下偶像 Hana、月之巫女 Luna、游戏宅友 Momo |
| Male | 6 | 霸道总裁 Adrian(SSR)、阳光球员 Lucas、冷面医生 Damian、微醺调酒师 Kai、冷面学长 Ren(动漫)、民谣歌手 Noah |
| Transgender | 2 | 赛博歌姬 Nova、T台缪斯 Lexi |
| Exotic | 1 | 异域舞者 Jasmine |

稀有度分布：N×3 / R×11 / SR×8 / SSR×2。关系覆盖 girlfriend/wife/neighbor/coworker/roommate/rival/maid/stranger/boyfriend/partner。职业覆盖 option pool 12 项 + 新增 4 项（Maid/Doctor/Singer/Adventurer）。

## 5. 集成方案（按文件）

1. **`src/lib/preset-library.ts`（本次交付）**：`PRESET_LIBRARY` 数据 + `getPresetById / presetsByVibe / presetsByGender / toCreatorPreset / presetGirlfriendExtras` 助手。
2. **`src/app/api/creator/presets/route.ts`**：DB 为空时的内置回退从 `DEFAULT_CREATOR_PRESETS`（5 个）切换/合并为 `PRESET_LIBRARY`；返回体新增 `vibes: PRESET_VIBE_LABELS` 供前端渲染筛选器。
3. **`src/app/(main)/create/page.tsx`**：`applyPreset()` 扩展——同步设置 `name=default_name`（一键创建关键）；Step 0 预设墙按 `vibe_tags` 筛选 + 稀有度角标；卡片显示 `description_zh` + 关系标签。
4. **`src/app/api/girlfriends/route.ts`（POST）**：请求体带 `preset_id` 时，把 `presetGirlfriendExtras()` 的 8 个字段写入 girlfriends 对应列（补齐差距 1）；`character_card.first_mes` 按 locale 选用 `greeting_zh/greeting_en`。
5. **`src/app/api/girlfriends/generate-portrait/route.ts`**：有 `preset_id` 时把 `portrait_outfit` 注入 outfit 段、`scene_id` 注入场景描述；配合 5.2 的缓存键。

### 5.1 降本策略（量化）

- **预设立绘缓存（最大节省）**：同一 `preset_id + 无自定义改动` 的创建共享同一张预生成 portrait（Supabase storage 存 `portraits/presets/{preset_id}.webp`，24 张一次性离线生成）。按每天 100 次创建、70% 走预设估算：每天节省 70 次 FLUX 调用 ≈ 350 credits + GPU 时长；每月 ≈ 2100 次。
- **提示词固化**：预设的 personality/backstory 是人工审校文本，进 system prompt 前无需 LLM 润色；单角色卡 token 稳定在 ~450 tokens，无自由文本的长度方差。
- **返工率下降**：发色只用 11 个可映射 hex、服装/场景用已验证配方词，立绘一次过审率预期从当前水平提升（上线后按 `generation_presets` 日志统计）。

### 5.2 质量策略

- **数值对齐**：`traits` 直接落 `girlfriends.base_*` 列，`buildTraitPromptSection` 无需走 character_card 回退路径；创建即 Lv.3（intimacy_scores=300）与预设 base_intimacy 叠加形成差异曲线。
- **LoRA 路由对齐**：gender/visual_style 决定 category（female/male/transgender/anime），预设的 fashion/portrait_outfit 措辞避开各 category 的 BLOCKED 负向词。
- **双语一致性**：`greeting_zh` 与 `greeting_en` 语义逐条对齐（已包含在数据文件中），按用户 locale 注入 first_mes。
- **合规**：所有预设年龄 ≥18（最低 19），无禁止关系类型；NSFW 强度仍由亲密度门控（<Lv.3 锁定），预设 traits 只决定曲线形状，不绕过分级。

## 6. 落地计划

| 里程碑 | 内容 | 依赖 |
|---|---|---|
| M1（已完成） | 迁移 0019 已应用 + 24 预设已入库；`src/lib/preset-library.ts` 已添加；`normalizeCreatorPreset` 扩展字段透传已实现（`select('*')` + 条件展开） | `/api/creator/presets` 在 CDN 缓存过期（≤5min）后即返回新预设 |
| M2（已完成） | create 页预设墙可见化 + vibe 筛选（API 返回 `vibes`）+ 稀有度角标 + 关系/职业标签 + default_name/age 预填；POST 写入 8 列 + `preset_id`；灵魂层（迁移 0020）随创建盖章进 `character_card.soul`，聊天/主动消息按 locale 消费 | M1 |
| M3（已完成） | `src/lib/preset-portrait-cache.ts`：固定键 `preset-portraits/{slug}.png` 共享立绘；generate-portrait 命中直接返回（跳过 GPU）+ 未改动外观判定（`visualMatchesPreset`）+ 同步成功后懒回写；POST 创建无图时自动补缓存图；`preset_portrait_stats` 命中/miss 统计；`/api/admin/preset-portraits` GET 查缓存状态、POST 单张离线生成（循环调用即可批量填满 24 张） | M2 |
| M4（已完成） | 迁移 0021：`character_presets.usage_count/last_used_at` + `girlfriend_categories` 建表；创建时写 personality/vibe/relationship 分类行并累计 usage；`GET /api/girlfriends/public?vibe=` 分类筛选；explore TAG_POOL 扩入 7 个新 vibe 键；`GET /api/admin/presets?type=character_presets` 按使用率排序供扩库决策 | M3 |

## 7. 风险与回滚

- 迁移全部为 `ADD COLUMN IF NOT EXISTS` + `ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE`（id 为 uuid 自动生成，slug 部分唯一索引保证幂等），可重复执行；回滚只需 `UPDATE character_presets SET is_active=false WHERE slug IS NOT NULL` 即可下线全部新预设（API 自动回退 5 个内置）。
- `character_presets` 现有 3 条种子（Sakura/Luna/Mia）与新 slug 无冲突（新预设 slug 带后缀）。
- 旧 5 个内置预设保留为回退路径，不删除（符合"调整参数而非删除机制"原则）。
