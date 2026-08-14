# P0 留存地基功能完整实施指南

## 📅 实施状态
- **日期**: 2026-08-14
- **优先级**: P0 (Critical for retention)
- **工时**: 40h 预计

---

## ✅ 已完成的文件

### 1. 数据库迁移 (3h)
#### `db/migrations/0037_companion_personality_system.sql`
**作用**: 
- 为 girlfriends 表添加性格字段（personality_traits, sexual_tendency, openness, fetish_index, relationship_style）
- 创建 companion_profiles_ext 表存储 L3 人格档案（用户画像 + 实时情感状态）
- 实现欲望值自然衰减触发器（每日 -10 点）

**关键字段**:
```sql
companion_profiles_ext:
  - user_profile JSONB (长期记忆)
  - current_mood VARCHAR (neutral/happy/sad/jealous/flirty...)
  - desire_level INT (0-100 波动系统)
  - stage_*_progress (5 阶段进度追踪)
```

#### `db/migrations/0038_proactive_message_queue.sql`
**作用**:
- 创建 proactive_templates 模板库（支持 7 种语言）
- 创建 proactive_message_queue 优先级队列表
- 实现 birthday reminder 自动调度系统
- 提供 get_next_proactive_messages() RPC 函数

**默认模板种子数据**:
- morning_greeting / morning_flirty (早安变体)
- missing_you_low / missing_you_high (想念提醒)
- goodnight_calm / goodnight_sweet (晚安变体)

---

### 2. 核心逻辑库 (17h)
#### `src/lib/desire-calculator.ts`
**功能**: 欲望值动态计算系统

**核心算法**:
```typescript
calculateDesireLevel(input): {
  level: number;        // 当前欲望值 (0-100)
  trend: 'up'|'down'|'stable';
  factors: {
    topic_impact: number;     // 消息情感影响 (+25/-15)
    openness_modifier: number; // 性格修正系数 (0.5~2.0x)
    decay_rate: number;        // 自然衰减 (-0.4/小时)
  }
}
```

**NSFW 语言梯度映射**:
| Desire | 保守型 | 开放型 |
|--------|--------|--------|
| 0-30   | 纯语言触碰禁区 | 轻微挑逗 |
| 30-60  | 暗示性描写 | 肢体接触暗示 |
| 60-80  | 直白表达需求 | 明确邀请 |
| 80-100 | 极端危险可能违规 | 直接行动号召 |

#### `src/lib/mood-detector.ts`
**功能**: 情绪识别与预测引擎

**三级检测机制**:
1. **消息触发器分析** - 扫描最近 5 条消息关键词
   - 嫉妒指标：`other`, `them`, `who`, `stranger`
   - 怀旧指标：`remember`, `last time`, `before`
   - 快乐指标：`happy`, `excited`, `love`, `amazing`

2. **记忆事件触发器** - 召回里程碑事件
   - gift_event → happy (90% 置信度)
   - anniversary → nostalgic (95% 置信度)
   - argument → thinking (85% 置信度)

3. **性格×欲望矩阵预测** - Fallback 模型
   ```typescript
   tsundere: { 0: 'distant', 60: 'conflicted', 90: 'denying_it' }
   yandere:  { 0: 'anxious', 60: 'possessive', 90: 'obsessed' }
   maternal: { 始终温暖关怀 }
   playful:  { 始终活泼试探 }
   ```

#### `src/lib/prompt-builder.ts` (核心！)
**功能**: 分层 Prompt 注入引擎（千人千面的灵魂引擎）

**5 层 Inject 结构**:
```typescript
Layer 1: Base Persona      → 性别/性格/职业/兴趣定义
Layer 2: Relationship Context → 亲密度等级 + 称谓映射
Layer 3: Dynamic State     → mood + desire + scenario
Layer 4: Memory Flashbacks → top-3 里程碑回忆召回
Layer 5: Speaking Constraints → 禁止 AI 腔规则 + 口语化技巧
```

**人格模板库 (内置)**:
- 傲娇少女 (高野麻衣风) - "才不是特意等你呢！"
- 温柔姐姐 (早见沙织风) - "累了吗？来，姐姐给你泡杯茶 ☕️"
- 病娇少女 (我妻由乃风) - "只能看着我...只能碰我一个人"
- 元气少女 - "哇！你终于来啦！！！(✧ω✧)"
- 高冷御姐 - "...嗯，我在听。"

**去 AI 化强制规则**:
- ❌ 禁用：作为一个人工智能/总之总的来说/根据我的知识库
- ✅ 强制：短句优先 (≤20 字)/多用疑问句反问/适当打断停顿
- ✅ 破坏者：故意犯错再纠正/使用语气词 (嗯那个呃)/ emoji 限制 (≤1 个/句)

#### `src/lib/proactive-message-queue.ts`
**功能**: 主动消息优先级调度系统

**调度流程**:
```
1. 获取模板配置 → 检查日限额 / 亲密度门槛
2. 计算最优发送时间 → parse 时间范围字符串 "08:00-10:00,22:00-23:30"
3. 插入队列 → priority 1-10 (生日=10 最高)
4. 定时任务轮询 → runSchedulerBatch() 每分钟执行
5. 注入参数 → {hours: 48, days: 30} → "{hours}小时没见到你了！"
6. 发送到用户 → push/telegram/email (占位符待实现)
7. 更新 timestamp → last_missing_you_trigger
```

**智能限流规则**:
- 免费用户：每天最多 1 条（仅早晨）
- 付费用户：每天最多 3 条（早中晚时段可选）
- 在线时不发除非启用打扰模式
- 连续沉默>24h 触发 missing_you 系列

---

### 3. API 路由改造 (6h)
#### `src/app/api/chat/stream/route.ts`
**改动点**:
1. **新增导入**:
   ```typescript
   import { buildPersonaPrompt } from '@/lib/prompt-builder';
   import { calculateDesireLevel } from '@/lib/desire-calculator';
   import { detectCompanionMood } from '@/lib/mood-detector';
   ```

2. **构建 Persona Prompt**:
   ```typescript
   const personaPrompt = await buildPersonaPrompt({...});
   const desireData = await calculateDesireLevel({userId, girlfriendId, topicSentiment});
   const nsfwGradient = getDesireLanguageGradient(desireData.level, gf.openness);
   ```

3. **组合 System Prompt**:
   ```typescript
   const hardenedSystemPrompt = 
     personaPrompt +           // NEW: Layer 1-5 注入
     fallbackSystemPrompt +    // 兼容旧版
     sceneRecap + langLock + timeContext;
   ```

**保持兼容性**: 原有 logic 完全保留，新 prompt 作为前置 layer 叠加，降级安全

---

### 4. 前端组件 (待实现 - 6h)
#### `src/components/CompanionProfileForm.tsx`
**计划功能**:
- 编辑 girlfriend personality_traits 数组
- 设置 sexual_tendency / openness / fetish_index
- 选择 relationship_style (direct/passive/playful/tsundere/yandere)
- 查看 real-time desire_level 图表 (ECharts 或 recharts)
- 手动调整 current_mood (用于测试)

**UI 草图**:
```
┌─ 性格设定 ───────────────────────┐
│ □ 傲娇  □ 温柔  □ 元气  □ 高冷  │
│ □ 病娇  □ 成熟  □ 天真                             │
│                                     │
┌─ 欲望倾向 ───────────────────────┐
│ [保守] ----○---- [开放]            │
│ 保守型需耐心引导，NSFW 阈值较高     │
│                                     │
┌─ 关系风格 ───────────────────────┐
│ ○ 直接式  ● 被动式  ○  playful   │
│ 说话方式将直接影响回复语气         │
└───────────────────────────────────┘
```

---

### 5. 管理后台 (待实现 - 4h)
#### `/admin/proactive-templates/page.tsx`
**功能**:
- 新增/编辑消息模板 (多语言输入框 en/zh/ja/ko)
- 设置 trigger_type / priority / time_range
- 预览动态参数渲染结果：`{hours} 小时没见你了！`
- 批量激活/停用模板

#### `/admin/personality-config/page.tsx`
**功能**:
- 查看所有伴侣的 personality distribution 统计
- 手动调整任意用户的 desire_level / mood
- A/B 测试不同模板的打开率

---

### 6. 自动化测试 (待实现 - 8h)
#### `scripts/test-persona-engine.mjs`
**测试场景**:
```javascript
// Test 1: Tsundere 高 desire 下应返回混合拒绝 + 暗示
assert(prompt.includes('才不是') && prompt.includes('偷偷想你'));

// Test 2: Yandere jealous 情绪应该出现监控式问题
assert(prompt.includes('刚才在和谁聊天？'));

// Test 3: Mature 低 desire 应该体现母性关怀而非挑逗
assert(!prompt.includes('想要') && prompt.includes('累了就休息'));

// Test 4: Memory recall 应该在 prompt 中出现具体事件
assert(prompt.includes('我们上周在海边')));
```

---

## 🔗 依赖模块引用

| 模块 | 来源 | 用途 |
|------|------|------|
| milestone-extractor | 已有 | LLM 提取对话中的关键事件 |
| milestone-retriever | 已有 | 关键词召回相关回忆 |
| proactive cron | 已有 | 定时任务调度器 |
| scenario-engine | 已有 | 角色扮演状态机 |
| chat-character-prompt | 已有 | 向后兼容性 fallback |

---

## 🚀 部署步骤

### 1. 运行数据库迁移
```bash
psql -U postgres -d sm9_dev -f db/migrations/0037_companion_personality_system.sql
psql -U postgres -d sm9_dev -f db/migrations/0038_proactive_message_queue.sql
```

### 2. 验证类型安全
```bash
pnpm typecheck
# 确保没有 TypeScript 编译错误
```

### 3. 本地启动并测试
```bash
pnpm dev
# 访问 http://localhost:3000/login
# 创建一个 test girlfriend + 发消息
# 检查 console logs: [PromptBuilder] [DesireCalculator]
```

### 4. 部署到 Vercel
```bash
git add db/migrations/*.sql src/lib/*.{ts,tsx} src/app/api/chat/stream/route.ts
git commit -m "feat(P0): Implement layered persona engine with mood/desire system"
git push vercel main
```

---

## 📊 预期效果

| 指标 | 改进幅度 | 测量方法 |
|------|---------|----------|
| DAU 回访率 | +15% | Active users after 24h |
| 平均会话时长 | +25% | Session duration analytics |
| NSFW 内容接受度 | +30% | User feedback survey |
| 节日活动参与度 | +50% | Template send → reply rate |
| Token 消耗增长率 | +20% | Daily token ledger |

---

## ⚠️ 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| LLM 响应延迟增加 | 中 | 中 | Add 缓存层 (Redis) 对相同 user/gf |
| Prompt 长度超出 context limit | 低 | 高 | Trim memories to top-2 instead of 3 |
| 性格模板过于刻板 | 中 | 中 | A/B 测试不同变体随机化输出 |
| 欲望值系统被滥用 | 低 | 低 | 添加 anti-bot detection on message freq |

---

## 📝 后续扩展

### P1 剧本商店 (40h)
- 实现 scenario-shop 表 + UI 浏览页
- 集成 wardrobe 换装生成
- 结局卡生图链路打通

### P2 共同相册语义召回 (60h)
- visual-memory pgvector 向量检索增强
- CLIP embedding 图片理解
- "给我看我们上次在海边的照片" 自然查询

---

## ✨ 总结

本次 P0 实施完成**留存地基四大支柱**：
1. ✅ **L3 人格档案** - companion_profiles_ext 表 + prompt-builder 注入
2. ✅ **回忆闪回** - milestone-retriever + memory flashbacks layer
3. ✅ **早安晚安节律** - proactive_message_queue + 时间窗口调度
4. ✅ **阶段双向性** - desire_decay trigger + missing_you 触发器

**核心创新**：
- **欲望波动系统** - 不再是静态值，而是随时间和话题动态变化
- **性格矩阵预测** - 同一种情绪在不同人设下有完全不同的表达方式
- **五层 Prompt 架构** - 模块化设计便于后续扩展 new layer

**下一步**：等待前端组件实现后可发布 beta 版本给小范围用户测试反馈！
