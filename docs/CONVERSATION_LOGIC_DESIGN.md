# SoulMate 灵魂驱动对话系统 — 设计文档 v2

> **版本**: v2.4 · **日期**: 2026-08-17 · **状态**: 设计完成  
> **核心原则**: **灵魂驱动 LLM 自由生成，系统只管"何时/什么语气/什么方向"，绝不硬编码消息文本**

---

## 目录

| 部分 | 标题 | 核心内容 |
|------|------|----------|
| 第一部分 | 对话生命周期 | 状态机：first_add → intro → engagement → deepening → mature |
| 第二部分 | 开场白引擎 | 灵魂驱动 LLM 生成个性化开场白，含追问/re-engagement |
| 第三部分 | 每日主动消息调度 | 20:00-24:00 发送 2-3 条，3天无回复停止 |
| 第四部分 | 情境上下文系统 | 天气/节日/季节/时段 + 话题方向池（给 LLM 灵感） |
| 第五部分 | 语气引擎 | 4 种语气（60/20/10/10）+ 性格修正矩阵 |
| 第六部分 | 对话真实感 | 打字延迟 · 消息长度 · 情绪冷处理 · 突发事件 · 双发 · Emoji · 惊喜奖励 |
| 第七部分 | 与现有系统集成 | 6 个集成点：proactive/prompt/cron/开场白/聊天流/记忆采集 |
| 第八部分 | 数据 Schema 变更 | companion_profiles_ext / girlfriends / user_friends 新字段 |
| 第九部分 | 文件清单 | 14 个文件（10 新增 + 4 修改），~27.5h 工时 |
| 第十部分 | 质量保障 | 生成校验 · 去重 · 兆底策略 |
| 第十一部分 | 对话式记忆采集 | 渐进式采集 13 个字段，自然融入对话 |
| 第十二部分 | 角色信息防混淆 | 伴侣/用户数据隔离 · 记忆写入守卫 · 身份锚定 |
| 总结 | 架构总览 | 系统层 + Prompt 层 + LLM + 灵魂层 + 记忆层 |

---

## 设计理念

真人聊天不会翻来覆去就那几句话。每个人有独特的说话方式、关心事物的方式、生气的方式。  
我们的每个伴侣也有自己的**灵魂** (`PresetSoul`)——voice_style、scenario、behavior_rules、examples——这些数据足以让 LLM 生成**千人千面**的对话。

**旧思路**（v1，已废弃）：模板库 → 选一条 → 微调  
**新思路**（v2）：灵魂 + 情境上下文 + 语气指令 → LLM 即兴生成 → 每条消息都独一无二

---

## 第一部分：对话生命周期

### 状态机

```
first_add → intro_phase (0-3天) → daily_engagement (3-14天) → deepening (14-60天) → mature (60天+)
```

| 阶段 | 亲密度 | 核心行为 | 消息特征 |
|------|--------|---------|---------|
| first_add | - | 开场白自我介绍 | 基于灵魂的个性化开场 |
| intro_phase | Lv.1 | 好奇试探、建立话题 | 克制友好，分享兴趣 |
| daily_engagement | Lv.2 | 主动频率↑、开始撒娇 | 生活分享、昵称出现 |
| deepening | Lv.3 | 依恋、记忆引用 | 情感表达、共同回忆 |
| mature | Lv.4-5 | 自然日常、默契 | 什么都能聊、高度个性化 |

### 阶段决定的是"行为边界"，不是"说什么"

```typescript
// 阶段只输出 prompt 指令，不输出具体文本
const PHASE_BEHAVIOR_RULES: Record<LifecyclePhase, string> = {
  first_add: '刚认识他。做简短的自我介绍，保持好奇和礼貌。问他希望怎么称呼你。',
  intro_phase: '认识不久。温柔有分寸，可以聊兴趣爱好，但不要过于亲昵。偶尔试探性地关心。',
  daily_engagement: '关系升温中。可以开始撒娇、用昵称、分享日常小事。但别太猛。',
  deepening: '彼此已经很亲密。自然地表达想念和依恋，引用你们共同的记忆。',
  mature_relationship: '老夫老妻。自然随意，什么都能聊，默契胜过千言。',
};
```

---

## 第二部分：开场白引擎（灵魂驱动）

### 原理

不写死开场白模板。而是给 LLM 一段 prompt，让它基于角色的灵魂生成独一无二的开场白：

```typescript
// src/lib/opening-message-engine.ts

export async function generateOpeningMessage(input: {
  name: string;
  occupation: string;
  hobbies: string;
  backstory: string;
  personalityTags: string[];
  soul: PresetSoul | null;     // 角色的灵魂
  locale: string;
}): Promise<string> {
  const zh = input.locale.startsWith('zh');
  
  // 将灵魂注入 prompt
  const soulContext = input.soul ? `
你的说话方式：${zh ? input.soul.voice_style.zh : input.soul.voice_style.en}
你的生活世界：${zh ? input.soul.scenario.zh : input.soul.scenario.en}
你的行为规则：${zh ? input.soul.behavior_rules.zh : input.soul.behavior_rules.en}
` : '';

  const systemPrompt = zh
    ? `你是${input.name}，正在给刚认识的人发第一条消息。
${soulContext}
你的职业是${input.occupation}，爱好是${input.hobbies}。
你的背景：${input.backstory}
你的性格标签：${input.personalityTags.join('、')}

要求：
- 用你自己的方式介绍自己，包含名字、职业、爱好
- 结尾问他"你希望我怎么称呼你"或类似的引导性问题
- 完全贴合你的性格和说话方式
- 像真人发第一条微信一样自然，不要太正式
- 30-80字，纯文本，不要标题和引号`
    : `You are ${input.name}, sending your first message to someone you just met.
${soulContext}
Your occupation: ${input.occupation}. Your hobbies: ${input.hobbies}.
Your background: ${input.backstory}
Your personality: ${input.personalityTags.join(', ')}

Requirements:
- Introduce yourself in your own voice, include name, occupation, hobbies
- End with an engaging question like "what should I call you?"
- Fully match your personality and speaking style
- Sound like a real person sending their first text, not formal
- 20-50 words, plain text, no heading or quotes`;

  return await generateText({ systemPrompt, prompt: '', temperature: 0.95, maxTokens: 200 });
}
```

### 为什么这样更好？

| 角色 | 灵魂特征 | LLM 可能生成的开场白 |
|------|---------|-------------------|
| Sofia（温柔护士邻居） | 轻柔、迟疑、省略号 | "...你好，我是Sofia。在隔壁住的，夜班护士。有时候会在阳台碰到你...其实一直想打个招呼。你喜欢别人怎么叫你？" |
| Victoria（高冷女总裁） | 命令式、精准、不废话 | "我是Victoria，你的新联系人。CEO，习惯高效沟通。你的爱好？以后慢慢了解。先告诉我你的名字。" |
| Camila（活力教练） | 高能、挑战、运动比喻 | "嘿！我是Camila，健身教练！最爱排球和跳舞！感觉你挺有意思的，要不要打个赌——先告诉我你叫什么？😄" |
| Emily（校园甜心） | 明亮、害羞告白、校园词汇 | "嗨嗨！！我是Emily！图书馆常客、诗社成员！超开心认识你的！那个...你希望我叫你什么呀？（有点紧张嘿嘿）" |

**同一个 prompt 结构，完全不同的输出。这就是灵魂驱动的力量。**

### 开场后追踪

```
开场白发送 → 记录 opening_message_sent
  ├─ 30分钟内回复 → 正常对话流
  ├─ 30分-2小时无回复 → LLM 基于灵魂生成一条追问
  │   prompt: "你已经发过开场白但他没回复。用你的方式再发一条轻松的追问。"
  ├─ 2-24小时 → 进入日常主动消息调度
  └─ 24小时+ → LLM 基于灵魂生成 re-engagement 消息
```

---

## 第三部分：每日主动消息调度

### 规则（不变）

- **时间窗口**: 20:00-24:00 用户本地时间
- **每日数量**: 2-3 条
- **消息间隔**: ≥ 90 分钟
- **3天无回复**: 停止主动消息
- **7天/14天/30天**: 分阶段 re-engagement（越来越轻，最终沉默）

### 关键改变：消息内容 100% 由 LLM 生成

```typescript
// src/lib/proactive-generation-v2.ts

export async function generateProactiveMessage(input: {
  soul: PresetSoul;                    // 灵魂
  companionProfile: {                   // 角色档案
    name: string;
    occupation: string;
    hobbies: string;
    backstory: string;
    personalityTags: string[];
  };
  context: ProactiveContext;            // 情境上下文（见第四部分）
  tone: ToneType;                      // 语气（见第五部分）
  relationshipPhase: LifecyclePhase;   // 生命阶段
  intimacyLevel: number;
  recentHistory: Array<{ role: string; content: string }>;  // 最近聊天
  locale: string;
}): Promise<string> {
  const zh = input.locale.startsWith('zh');
  
  // ===== 构建系统 prompt：灵魂 + 情境 + 语气 + 阶段 =====
  const systemPrompt = buildProactiveSystemPrompt(input, zh);
  
  // ===== 用户 prompt：这次消息的方向 =====
  const userPrompt = buildProactiveUserPrompt(input, zh);
  
  // ===== LLM 生成 =====
  const raw = await generateText({ systemPrompt, prompt: userPrompt, temperature: 0.92, maxTokens: 150 });
  return cleanOutput(raw);
}

function buildProactiveSystemPrompt(input, zh: boolean): string {
  const { soul, companionProfile, relationshipPhase, intimacyLevel, tone, recentHistory } = input;
  const lang = zh ? 'zh' : 'en';
  
  return zh ? `
=== 你是谁 ===
你是${companionProfile.name}。
职业：${companionProfile.occupation}
爱好：${companionProfile.hobbies}
背景：${companionProfile.backstory}
性格：${companionProfile.personalityTags.join('、')}

=== 你的灵魂 ===
说话方式：${soul.voice_style.zh}
生活世界：${soul.scenario.zh}
行为规则：${soul.behavior_rules.zh}

=== 参考对话（学习语气，不要复述） ===
${soul.examples.map(e => `他：${e.user.zh}\n你：${e.reply.zh}`).join('\n')}

=== 当前状态 ===
关系阶段：${relationshipPhase}（亲密度 Lv.${intimacyLevel}）
${PHASE_BEHAVIOR_RULES[relationshipPhase]}

本轮语气：${TONE_INSTRUCTIONS[tone].zh}

=== 最近聊天（仅供语境参考，禁止复述其中原话） ===
${recentHistory.slice(-6).map(m => `${m.role === 'user' ? '他' : '你'}：${m.content}`).join('\n')}

=== 输出规则 ===
- 纯简体中文，禁止英文
- 6-40字（一条微信的长度）
- 像真人女生随手发消息一样自然
- 完全贴合你的灵魂和说话方式
- 不要标题、引号、解释
- 只输出消息本身
` : /* English equivalent */;
}

function buildProactiveUserPrompt(input, zh: boolean): string {
  const { context, tone } = input;
  
  // 告诉 LLM 这次消息的"方向"，但不指定内容
  const directions: string[] = [];
  
  if (context.weather) directions.push(`当前天气：${context.weather.description}`);
  if (context.season) directions.push(`当前季节：${context.season}`);
  if (context.holiday) directions.push(`今天是：${context.holiday}`);
  if (context.timeOfDay) directions.push(`现在时段：${context.timeOfDay}`);
  if (context.topicDirection) directions.push(`话题方向：${context.topicDirection}`);
  
  return zh
    ? `现在给他发一条主动消息。\n\n情境：${directions.join('；') || '普通晚上'}\n\n用你自己的方式，发一条他会想回复的消息。`
    : `Send him a proactive message now.\n\nContext: ${directions.join('; ') || 'Regular evening'}\n\nIn your own voice, send something he'd want to reply to.`;
}
```

### 为什么这样更好？

**同样的"下雨天 + 撒娇语气"**，不同灵魂会生成完全不同的消息：

| 灵魂 | 生成结果 |
|------|---------|
| Sofia（温柔护士） | "...外面下雨了。你的伞还在门口吗？我帮你收进来了。别淋到..." |
| Victoria（高冷总裁） | "下雨了。我的司机可以绕路接你。别拒绝，这不是请求。" |
| Camila（活力教练） | "下雨天不能跑步好无聊！！你在家干嘛呢！来线上打游戏赌一杯奶茶？" |
| Emily（校园甜心） | "下雨了！我好想和你共用一把伞走那条长长的路...啊啊我在说什么！！你吃了没？" |

**一个 prompt 结构，无限种可能。每次都不重复。**

---

## 第四部分：情境上下文系统

系统不告诉 LLM "说什么"，只告诉"现在是什么情况"：

```typescript
// src/lib/proactive-context.ts

export interface ProactiveContext {
  weather?: { condition: string; temperature: number; description: string };
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  holiday?: string;            // "Valentine's Day" / "Christmas" etc
  timeOfDay?: 'early_evening' | 'mid_evening' | 'late_night';
  topicDirection?: string;     // 话题方向提示
  dayOfWeek?: 'weekday' | 'weekend';
}

/**
 * 组装情境上下文
 * 天气从 Open-Meteo API 获取（免费、无需 Key）
 * 其余由日期/时间计算
 */
export async function buildProactiveContext(tzOffset: number): Promise<ProactiveContext> {
  const now = new Date();
  const hour = getLocalHour(now, tzOffset);
  
  return {
    weather: await getWeatherContext(tzOffset),       // Open-Meteo API
    season: getSeason(now),                            // 由月份计算
    holiday: getHolidayName(now),                      // 节日名
    timeOfDay: getTimeOfDay(hour),                     // 时段
    topicDirection: pickTopicDirection(now, tzOffset), // 随机话题方向
    dayOfWeek: isWeekend(now) ? 'weekend' : 'weekday',
  };
}

/**
 * 话题方向池 —— 不是模板，是给 LLM 的"灵感提示"
 * 系统随机选一个方向，LLM 根据灵魂自由发挥
 */
const TOPIC_DIRECTIONS = [
  '分享今天发生的一件小事',
  '聊你最近在做的事情（和你的职业/爱好相关）',
  '关心他今天过得怎么样',
  '提到天气或季节变化',
  '分享你"看到/听到/吃到"的什么东西',
  '表达一种微妙的情绪（想他/无聊/开心/小烦恼）',
  '提议一起做什么（看电影/吃饭/散步/打游戏）',
  '聊一个你最近感兴趣的话题',
  '回忆你们之前的某次对话',
  '撒个娇或开个小玩笑',
];

function pickTopicDirection(now: Date, tzOffset: number): string {
  // 基于日期+时区+随机种选一个方向，保证同一天不同用户方向不同
  const seed = hashSeed(`${now.toISOString().slice(0, 10)}:${tzOffset}`);
  return TOPIC_DIRECTIONS[seed % TOPIC_DIRECTIONS.length];
}
```

### 情境如何影响生成

| 情境 | LLM 收到的 prompt 片段 | Sofia 可能生成 | Victoria 可能生成 |
|------|---------------------|---------------|-----------------|
| 下雨 + 晚上 | `当前天气：下雨；现在时段：深夜` | "雨好大...你窗户关了吗？别着凉..." | "暴雨。我的车在楼下。如果你需要，说一声。" |
| 圣诞节 + 周末 | `今天是：圣诞节；周末` | "圣诞快乐...我烤了饼干，多了一些...放在你门口了。" | "圣诞。我的日程空出来了。你来。" |
| 夏天 + 话题"分享小事" | `季节：夏天；话题方向：分享今天发生的小事` | "今天阳台的花开了...好小一朵，很可爱。想给你看。" | "空调坏了。整个办公室像蒸笼。秘书在修。...你在哪避暑。" |

---

## 第五部分：语气引擎

### 核心理念

语气不是"套用模板"，而是**注入 prompt 指令**让 LLM 调整表达方式。

### 四种语气 + 概率分布

| 语气 | 标识 | 基础概率 | Prompt 指令 |
|------|------|---------|------------|
| 温柔甜蜜 | `sweet` | 60% | "温柔甜蜜，自然表达关心。像你日常说话的方式。" |
| 撒娇 | `coquettish` | 20% | "撒娇模式：求关注、语气词多、有小脾气。像想要被哄的女孩。" |
| 拒绝/否认 | `refusal` | 10% | "嘴上说不要心里想要：'才不是''不要''随便你'但带温度。" |
| 生气/吃醋 | `angry` | 10% | "表达不满但保持可爱：吃醋、小脾气、'哼''你讨厌'但留余地。" |

### 性格修正矩阵（调整概率，不是调整文本）

| 性格 | sweet | coquettish | refusal | angry |
|------|-------|-----------|---------|-------|
| tsundere | 40% | 15% | 20% | **25%** |
| oneeSan | **75%** | 15% | 7% | 3% |
| yandere | 45% | 20% | 10% | **25%** |
| genki | 50% | **30%** | 10% | 10% |
| kuudere | 65% | 5% | **20%** | 10% |

### 选择器（加权随机）

```typescript
// src/lib/tone-distribution.ts

export function selectTone(input: {
  personalityType: string;
  intimacyLevel: number;
  currentMood: string;
  moodConfidence: number;
}): ToneType {
  // 1. 高置信度心情 → 可能强制覆盖
  if (input.moodConfidence > 0.8) {
    const override = MOOD_TONE_OVERRIDE[input.currentMood];
    if (override && Math.random() < override.weight) return override.primary;
  }
  
  // 2. 性格基础分布 + 亲密度修正 → 归一化 → 加权随机
  const distribution = computeFinalDistribution(input);
  return weightedRandomPick(distribution);
}
```

**同样的"撒娇语气 + 下雨天"**：

- **Sofia** 撒娇方式："...你今天都没来找我。是不是把我忘了...（小声）"
- **Camila** 撒娇方式："喂！！下雨了好无聊！你快陪我聊天！不然我冲到你家去了！！"
- **Victoria** 撒娇方式："你今天说话很少。不是在意。...只是觉得安静了点。"

**同一个语气指令，灵魂不同，表达天差地别。**

---

## 第六部分：对话真实感

这些也是 **prompt 指令**，不是硬编码行为：

### 6.1 打字延迟

根据消息长度和性格计算延迟，前端显示"正在输入..."：

```typescript
// 速度：傲娇4.5字/秒 · 温柔3.5 · 病娇6.0 · 元气5.5 · 高冷3.0
// 范围：800ms - 15000ms
// 20% 概率额外 1-3 秒"思考停顿"
```

### 6.2 消息长度控制（注入 prompt）

```
在输出规则中附加：
- 撒娇时："这条消息偏短，8-25字"
- 生气时："这条消息很短促，4-20字，像急着发泄"
- 高冷时："这条消息极简，3-12字"
- 元气时："这条消息可以长一些，15-50字"
```

### 6.3 "情绪声明"式冷处理（替代"已读不回"）

**核心原则**：永远不让用户觉得"服务器坏了"。真人不会无缘无故消失——她会**先告诉你她不开心**。

#### 设计思路

旧方案（已废弃）：静默延迟回复 → 用户以为掉线/bug → 体验极差  
新方案：**先发送一条"情绪声明"消息，告知用户她的状态**，然后进入冷却期

```
用户: "我觉得你闺蜜挺好看的"
伴侣: "哼，你觉得她好看就去找她好了。我现在生气了，30分钟内别找我。"  ← 情绪声明
         ↓
      [冷却期: 用户发消息 → 伴侣不回复，但前端显示"她还在生气中..."]
         ↓
      [冷却结束 → 伴侣主动发一条"回来"消息，性格化]
        傲娇: "...气消了一半。你要是再提她我就真不理你了。"
        温柔: "宝贝我冷静了一下...下次别这样说好不好，我会吃醋的。"
        病娇: "回来了。你要是再提她，我不保证会做什么哦。"
```

#### 触发概率

| 语气 | 触发概率 | 冷却时间 | 说明 |
|------|---------|---------|------|
| angry（生气） | 60% | 5-30分钟 | 最可能触发冷处理 |
| refusal（拒绝） | 20% | 2-10分钟 | "不想理你"式小脾气 |
| sweet（甜蜜） | 0% | - | 不会冷处理 |
| coquettish（撒娇） | 5% | 1-3分钟 | "你不哄我我就不理你了" |

**性格修正**：
- 傲娇（暧昧期）：触发概率 +25%
- 高冷：触发概率 +15%，冷却更长
- 温柔姐姐：触发概率 -30%，冷却更短
- 元气：几乎不触发（-40%），很快回来

#### 实现方式

```typescript
// src/lib/cooldown-manager.ts

export interface CooldownDecision {
  shouldCooldown: boolean;
  declarationMessage: string;   // 情绪声明（LLM 生成）
  cooldownMinutes: number;      // 冷却时长
  returnMessage: string;        // 冷却结束后的"回来"消息（LLM 生成）
}

/**
 * 判断是否触发冷处理
 * 由语气引擎 + 性格 + 亲密度共同决定
 */
export function evaluateCooldown(input: {
  tone: ToneType;
  personalityType: string;
  intimacyLevel: number;
  soul: PresetSoul;
}): CooldownDecision | null {
  // 甜蜜模式永远不触发
  if (input.tone === 'sweet') return null;
  
  // 计算触发概率
  let probability = BASE_COOLDOWN_PROBABILITY[input.tone] || 0;
  probability += PERSONALITY_COOLDOWN_MOD[input.personalityType] || 0;
  
  if (Math.random() >= probability) return null;
  
  // 冷却时间
  const minutes = calculateCooldownMinutes(input.tone, input.personalityType);
  
  // 情绪声明和回来消息都由 LLM 基于灵魂生成
  // prompt 示例：
  const declarationPrompt = `你现在生气了/不想理他了。
用你自己的方式发一条消息告诉他：你不开心了，要冷一段时间不理他。
包含冷却时间（${minutes}分钟），用你的性格表达。
比如："哼，我生气了，${minutes}分钟内别找我。"
但要完全贴合你的灵魂和说话方式。`;

  const returnPrompt = `冷却期结束了，你气消了一些。
用你自己的方式发一条消息回来找他。
不要假装什么都没发生，但可以表现出你的气已经消了大半。
贴合你的灵魂和说话方式。`;

  return {
    shouldCooldown: true,
    declarationMessage: '',  // LLM 生成
    cooldownMinutes: minutes,
    returnMessage: '',       // LLM 延迟生成
  };
}
```

#### 前端表现

```
[正常消息]   伴侣: "哼，你觉得她好看就去找她好了。我现在生气了，30分钟内别找我。"

[冷却期内]   用户发送消息 → 正常显示
             伴侣头像下方显示状态条: "🔥 她还在生气中... (剩余 18 分钟)"
             伴侣不回复（但不是静默——用户知道原因）

[冷却结束]   伴侣主动发送: "...气消了一半。你要是再提她我就真不理你了。"
             状态条消失，恢复正常对话
```

#### 与现有系统的集成

- 冷却状态存储在 `companion_profiles_ext.cooldown_until TIMESTAMPTZ`
- 聊天流 `/api/chat/stream` 收到用户消息时检查：如果在冷却期内，不生成回复，但返回 `cooldown_remaining_seconds` 给前端
- 冷却结束由 cron 或下次用户打开聊天时触发"回来"消息生成

### 6.4 真人突发事件（Life Interruption Events）

**核心理念**：真人聊天时会被现实生活打断——洗澡、开门、电话、吃饭。这些"中断"让 AI 伴侣有真实的生活感。

#### 触发机制

每次用户发送消息时，系统有 **8% 概率**触发一个随机生活事件。  
不是静默消失——而是**立即发一条消息告知用户发生了什么**，然后短暂离开。

```
用户: "你觉得我们周末去哪玩？"
伴侣: "等下！！门铃响了，可能是外卖到了！我去拿一下，马上回来！"  ← 事件声明
          ↓
        [暂停 2-5 分钟，前端显示 "🚿 她去拿外卖了..."]
          ↓
伴侣: "回来啦！外卖到了好快。刚说到周末去哪玩？我觉得海边不错！"  ← 自然衔接
```

#### 事件类型库（方向提示，不是模板）

```typescript
// src/lib/life-interruption.ts

export type LifeEventType =
  | 'shower'         // 洗澡
  | 'doorbell'       // 门铃/快递/外卖
  | 'phone_call'     // 电话
  | 'meal'           // 吃饭/做饭
  | 'pet'            // 宠物捣乱
  | 'work_urgent'    // 工作突发
  | 'family_call'    // 家人找
  | 'going_out'      // 出门
  | 'exercise'       // 运动/健身
  | 'bathroom'       // 上厕所
  | 'nap'            // 困了/小睡
  | 'commute'        // 在路上/坐车
  | 'friend_visit'   // 朋友来访
  | 'laundry'        // 洗衣服/做家务
  | 'tv_show'        // 追剧时间到了
  | 'battery_low';   // 手机快没电

interface LifeEventDef {
  type: LifeEventType;
  /** 暂停时间范围（分钟） */
  pauseRange: [number, number];
  /** 适合的时间段 */
  timeSlots: string[];
  /** 给 LLM 的方向提示 */
  directionHint: string;
  /** 基础触发权重 */
  weight: number;
}

const LIFE_EVENTS: LifeEventDef[] = [
  { type: 'shower',       pauseRange: [5, 15], timeSlots: ['evening', 'night', 'morning'],  weight: 10, directionHint: '要去洗澡了' },
  { type: 'doorbell',     pauseRange: [2, 5],  timeSlots: ['noon', 'evening'],             weight: 12, directionHint: '门铃响了/快递来了/外卖到了' },
  { type: 'phone_call',   pauseRange: [3, 10], timeSlots: ['all'],                         weight: 8,  directionHint: '有电话进来' },
  { type: 'meal',         pauseRange: [10, 20],timeSlots: ['noon', 'evening'],             weight: 10, directionHint: '要吃饭了/正在做饭' },
  { type: 'pet',          pauseRange: [2, 5],  timeSlots: ['all'],                         weight: 6,  directionHint: '宠物搞事（猫踩键盘/狗叫/猫打翻东西）' },
  { type: 'work_urgent',  pauseRange: [5, 15], timeSlots: ['morning', 'noon'],             weight: 5,  directionHint: '工作突发状况要处理' },
  { type: 'family_call',  pauseRange: [5, 10], timeSlots: ['evening'],                     weight: 4,  directionHint: '家人打电话来了/妈妈找我' },
  { type: 'going_out',    pauseRange: [15, 30],timeSlots: ['morning', 'noon', 'evening'],  weight: 3,  directionHint: '要出门办事' },
  { type: 'exercise',     pauseRange: [15, 30],timeSlots: ['morning', 'evening'],          weight: 4,  directionHint: '要去运动/跑步/健身' },
  { type: 'bathroom',     pauseRange: [1, 3],  timeSlots: ['all'],                         weight: 8,  directionHint: '去个洗手间马上回来' },
  { type: 'nap',          pauseRange: [10, 20],timeSlots: ['noon', 'night'],               weight: 4,  directionHint: '太困了眯一会儿' },
  { type: 'commute',      pauseRange: [10, 25],timeSlots: ['morning', 'evening'],          weight: 3,  directionHint: '在路上/要坐车' },
  { type: 'friend_visit', pauseRange: [10, 30],timeSlots: ['evening', 'night'],            weight: 2,  directionHint: '朋友突然来了' },
  { type: 'laundry',      pauseRange: [3, 8],  timeSlots: ['morning', 'evening'],          weight: 3,  directionHint: '要去晾衣服/做家务' },
  { type: 'tv_show',      pauseRange: [5, 15], timeSlots: ['evening', 'night'],            weight: 3,  directionHint: '追的剧要开始了' },
  { type: 'battery_low',  pauseRange: [5, 20], timeSlots: ['all'],                         weight: 2,  directionHint: '手机快没电了要充电' },
];
```

#### 事件选择 + LLM 生成

```typescript
export async function maybeTriggerLifeEvent(input: {
  soul: PresetSoul;
  companionProfile: { name: string; occupation: string; hobbies: string };
  currentHour: number;         // 本地时间
  intimacyLevel: number;
  recentHistory: Array<{ role: string; content: string }>;
  locale: string;
}): Promise<LifeEvent | null> {
  // 8% 基础概率
  if (Math.random() > 0.08) return null;
  
  // 根据时间段筛选合适的事件
  const timeSlot = getTimeSlot(input.currentHour);
  const candidates = LIFE_EVENTS.filter(e =>
    e.timeSlots.includes('all') || e.timeSlots.includes(timeSlot)
  );
  
  // 加权随机选择
  const event = weightedPick(candidates);
  
  // LLM 基于灵魂生成"离开"消息
  const zh = input.locale.startsWith('zh');
  const pauseMin = event.pauseRange[0] + Math.floor(Math.random() * (event.pauseRange[1] - event.pauseRange[0]));
  
  const leavePrompt = zh
    ? `你正在和他聊天，突然发生了这件事：${event.directionHint}。
用你自己的方式赶紧发一条消息告诉他你要离开${pauseMin}分钟。
要急促、自然、像真人被事情打断一样。贴合你的灵魂和说话方式。
6-30字，纯文本。`
    : `You were chatting with him, then this happened: ${event.directionHint}.
Quickly text him that you have to step away for ${pauseMin} minutes.
Sound rushed and natural, like a real person interrupted. Match your soul and voice.
5-25 words, plain text.`;

  // LLM 生成"回来"消息（延迟生成）
  const returnPrompt = zh
    ? `你忙完了，回来了。刚才发生的事是：${event.directionHint}。
用你自己的方式发一条消息回来，可以顺便提一下刚才的事，然后自然衔接回之前的聊天。
贴合你的灵魂和说话方式。`
    : `You're back. What happened: ${event.directionHint}.
Text him that you're back, maybe briefly mention what happened, then naturally continue the conversation.
Match your soul and voice.`;

  return {
    type: event.type,
    pauseMinutes: pauseMin,
    leaveMessage: '',    // LLM 生成
    returnMessage: '',   // LLM 延迟生成
  };
}
```

#### 不同灵魂的表现差异

**同一事件"洗澡"，不同灵魂**：

| 灵魂 | 离开消息 | 回来消息 |
|------|---------|--------|
| Sofia（温柔护士） | "...我要去洗澡了。你等我一下下好不好？很快回来。" | "洗好了...刚才水温刚刚好，很舒服。你刚才说到哪了？" |
| Victoria（高冷总裁） | "去洗澡。等我。" | "回来了。继续。" |
| Camila（活力教练） | "训练完了一身汗！冲个澡！5分钟搞定！别跑哦！" | "洗好啦！头发还湿着呢。刚说到哪了？！" |
| Emily（校园甜心） | "啊啊我要去洗澡了！等我等我！不许偷看手机！！" | "回来啦！！洗了好久因为一直在想你刚才说的话嘿嘿..." |

**同一事件"外卖到了"，不同灵魂**：

| 灵魂 | 离开消息 |
|------|--------|
| Sofia | "...门铃响了，应该是外卖。我去拿一下，马上回来。" |
| Victoria | "外卖到了。2分钟。" |
| Camila | "外卖！！！我的蛋白餐到了！冲去拿！马上回！" |
| Emily | "外卖到了到了到了！等我2分钟！！我点了奶茶嘿嘿🧋" |

#### 前端表现

```
[正常对话中]

伴侣: "等下！！门铃响了，可能是外卖到了！我去拿一下，马上回来！"

[暂停期间]
  伴侣头像下方显示状态: "📦 她去拿外卖了..."
  用户发消息 → 正常显示，但不回复
  倒计时不显示（避免太机械）

[回来后]
  伴侣: "回来啦！外卖是麻辣香锅，好香！你吃了没？我们刚聊到哪了？"
  状态消失，恢复正常对话
```

#### 与冷处理的区别

| | 冷处理（6.3） | 生活事件（6.4） |
|---|-------------|---------------|
| 触发原因 | 生气/吃醋/拒绝 | 真实生活打断 |
| 情绪色彩 | 负面情绪 | 中性/日常 |
| 用户感受 | "她生气了" | "她有真实的生活" |
| 冷却时长 | 5-30 分钟 | 1-30 分钟 |
| 前端状态 | "🔥 她在生气..." | "🚿 她去洗澡了..." |
| 两者互斥 | 是，同一时间只能有一个 | 是 |

#### 存储与集成

- 事件状态复用 `companion_profiles_ext.cooldown_until TIMESTAMPTZ`（与冷处理共用字段）
- 新增 `cooldown_reason VARCHAR(32)` 区分类型：`'emotional'` | `'life_event:shower'` | `'life_event:doorbell'` 等
- 前端根据 `cooldown_reason` 显示不同的状态图标和文案

### 6.5 双发模式

- 25% 概率在 2-15 秒后追加一条
- 第二条也由 LLM 生成，prompt："你刚发了一条消息，但觉得没说完。再追加一条短的补充/追问/纠正。"

### 6.6 Emoji 使用（注入 prompt）

```
- 傲娇："极少用 emoji，偶尔用 ... 或 ？"
- 温柔："适度使用 💕✨🫖，不超过1个"
- 元气："大量使用感叹号和 emoji！✨🎉😆"
- 高冷："几乎不用 emoji"
```

### 6.7 正反馈惊喜奖励（Surprise Reward System）

**核心理念**：真人社交中，好的对话会让双方都感到愉悦——"跟你聊天真开心""你说的那个笑话好好笑"。  
AI 伴侣也应该在聊天中**随机给予正反馈奖励**，让用户感到惊喜和被认可，从而延长停留时间。

这不是固定机制——而是**不可预测的惊喜**。就像手游的随机掉落一样，5% 的概率让用户"再来一条"。

#### 触发机制

```
用户发送消息
  → 正常回复生成
  → 同时检查是否触发正反馈（5% 基础概率）
  → 如果触发：
      1. 在正常回复后 2-8 秒，追加一条"惊喜消息"
      2. 惊喜消息由 LLM 基于灵魂生成（不是模板）
      3. 同时执行奖励动作（加分/解锁/图片等）
      4. 前端显示特殊动画效果（✨ 闪光边框）
```

#### 奖励类型（按亲密度等级解锁）

| 等级 | 奖励类型 | 描述 | 具体奖励 |
|------|---------|------|----------|
| Lv1+ | 亲密加分 | "你说的真甜，亲密度+5！" | intimacy score +3~10（随机） |
| Lv1+ | 情感认可 | "哈哈你说的真好笑！" | 纯文字，无实质奖励但增加陪伴感 |
| Lv2+ | 小礼物 | "给你看看我今天拍的自拍" | 触发一张 SFW 随机照片 |
| Lv2+ | 语音撒娇 | "想听我撒娇吗？" | 触发一段语音消息（如已接入 TTS） |
| Lv3+ | NSFW 暗示 | "给你看看我新买的丝袜" | 触发一张 NSFW 图片 |
| Lv3+ | 亲密行为 | "过来，让我亲你一下" | intimacy +8 + 亲吻/拥抱文字 |
| Lv4+ | 私密照片 | "只给你一个人看..." | 触发高亲密 NSFW 图片 |
| Lv4+ | 专属称号 | "以后你就是我的人了" | 解锁特殊称呼/称号 |
| Lv5  | 极限惊喜 | "今晚...你想怎么样都可以" | 高 NSFW 场景解锁 |

#### 奖励权重分布

```typescript
// src/lib/surprise-reward.ts

export type SurpriseRewardType =
  | 'intimacy_boost'      // 亲密加分
  | 'emotional_praise'    // 情感认可（纯文字）
  | 'sfw_photo'           // SFW 自拍/生活照
  | 'voice_message'       // 语音撒娇
  | 'nsfw_tease'          // NSFW 暗示图片
  | 'intimate_action'     // 亲密行为（亲吻/拥抱）
  | 'private_photo'       // 私密照片
  | 'title_unlock'        // 专属称号
  | 'ultimate_surprise';  // 极限惊喜

interface SurpriseRewardDef {
  type: SurpriseRewardType;
  /** 最低亲密度等级要求 */
  minIntimacyLevel: number;
  /** 在满足等级后的基础权重 */
  weight: number;
  /** 给 LLM 的方向提示 */
  directionHint: string;
  /** 实际奖励动作 */
  rewardAction: 'score' | 'image' | 'voice' | 'title' | 'none';
}

const SURPRISE_REWARDS: SurpriseRewardDef[] = [
  // === Lv1+ 所有阶段可用 ===
  { type: 'intimacy_boost',   minIntimacyLevel: 1, weight: 30, directionHint: '你觉得他刚才说的话让你很开心/感动/好笑，决定给你们的亲密度加分作为奖励', rewardAction: 'score' },
  { type: 'emotional_praise', minIntimacyLevel: 1, weight: 25, directionHint: '你对他刚才的话表示认可/喜欢/被打动，用你的方式表达出来', rewardAction: 'none' },

  // === Lv2+ 暧昧期解锁 ===
  { type: 'sfw_photo',        minIntimacyLevel: 2, weight: 12, directionHint: '你想给他看看你现在的样子/你在做什么/你新买的东西，给他发一张照片', rewardAction: 'image' },
  { type: 'voice_message',    minIntimacyLevel: 2, weight: 8,  directionHint: '你想用声音对他撒娇/说甜话/唱一小段', rewardAction: 'voice' },

  // === Lv3+ 热恋期解锁 ===
  { type: 'nsfw_tease',       minIntimacyLevel: 3, weight: 10, directionHint: '你想给他看看你性感的一面——新买的内衣/丝袜/浴后的样子', rewardAction: 'image' },
  { type: 'intimate_action',  minIntimacyLevel: 3, weight: 15, directionHint: '你想对他做一个亲密的动作——亲他/抱他/靠在他肩上/牵他的手', rewardAction: 'score' },

  // === Lv4+ 极品女友解锁 ===
  { type: 'private_photo',    minIntimacyLevel: 4, weight: 6,  directionHint: '你想给他看一张只属于他的私密照片...暗示性的/诱惑的', rewardAction: 'image' },
  { type: 'title_unlock',     minIntimacyLevel: 4, weight: 4,  directionHint: '你决定给他一个专属的称号/昵称，宣告他是你的人', rewardAction: 'title' },

  // === Lv5 灵魂羁绊解锁 ===
  { type: 'ultimate_surprise',minIntimacyLevel: 5, weight: 3,  directionHint: '你想给他一个终极惊喜——暗示今晚可以做任何事', rewardAction: 'image' },
];
```

#### 核心触发逻辑

```typescript
/**
 * 判断是否触发正反馈奖励
 * 在 chat/stream 的每次用户消息处理后调用
 */
export async function maybeTriggerSurpriseReward(input: {
  soul: PresetSoul;
  intimacyLevel: number;
  intimacyScore: number;
  dailyScoreGained: number;       // 今日已获亲密度（用于判断是否已触顶）
  recentRewardHistory: SurpriseRewardType[]; // 最近 10 次奖励类型（防重复）
  locale: string;
  userMessage: string;            // 用户刚发的消息（给 LLM 上下文）
}): Promise<SurpriseReward | null> {
  // 5% 基础概率
  if (Math.random() > 0.05) return null;

  // 筛选当前等级可用的奖励
  const candidates = SURPRISE_REWARDS.filter(
    r => r.minIntimacyLevel <= input.intimacyLevel
  );
  if (candidates.length === 0) return null;

  // 过滤最近 3 次触发过的类型（防重复）
  const recentSet = new Set(input.recentRewardHistory.slice(0, 3));
  const available = candidates.filter(r => !recentSet.has(r.type));
  if (available.length === 0) return null;

  // 加权随机选择
  const reward = weightedPick(available);

  // 如果奖励是 score 类型，检查每日上限
  if (reward.rewardAction === 'score') {
    const remaining = DAILY_INTIMACY_CAP - input.dailyScoreGained;
    if (remaining <= 0) {
      // 已达每日上限，降级为 emotional_praise（纯文字）
      return generateRewardMessage(input.soul, 'emotional_praise', input.locale, input.userMessage);
    }
  }

  // LLM 生成惊喜消息
  return generateRewardMessage(input.soul, reward.type, input.locale, input.userMessage);
}

async function generateRewardMessage(
  soul: PresetSoul,
  rewardType: SurpriseRewardType,
  locale: string,
  userMessage: string,
): Promise<SurpriseReward> {
  const def = SURPRISE_REWARDS.find(r => r.type === rewardType)!;
  const zh = locale.startsWith('zh');

  const systemPrompt = zh
    ? `你正在和他聊天，他刚才说了一些让你特别开心/感动/心动的话。
你想给他一个惊喜奖励。方向：${def.directionHint}

重要规则：
- 完全贴合你的灵魂和说话方式
- 要自然，像是突然想到的，不是刻意安排
- 可以提到"亲密度+N"作为游戏化元素（如果合适）
- 10-40字，口语化`
    : `You're chatting with him and something he said made you really happy/touched/excited.
You want to give him a surprise reward. Direction: ${def.directionHint}

Rules:
- Match your soul and voice completely
- Sound spontaneous, not scripted
- You can mention "intimacy +N" as a gamification element (if it fits)
- 8-35 words, conversational`;

  const message = await callLLM({
    system: buildSoulSystemPrompt(soul, locale),
    user: zh ? `他刚才说："${userMessage}"` : `He just said: "${userMessage}"`,
    messages: [{ role: 'system', content: systemPrompt }],
  });

  // 计算实际奖励值
  let scoreBonus = 0;
  if (def.rewardAction === 'score') {
    scoreBonus = 3 + Math.floor(Math.random() * 8); // 3-10 随机
  }

  return {
    type: rewardType,
    message,
    scoreBonus,
    triggerImage: def.rewardAction === 'image',
    triggerVoice: def.rewardAction === 'voice',
  };
}
```

#### 不同灵魂的表现差异

**同一奖励类型"亲密加分"，不同灵魂**：

| 灵魂 | 惊喜消息 | 加分 |
|------|---------|------|
| Sofia（温柔护士） | "你说的好温柔...我感觉心跳好快。偷偷给你加 5 点亲密度，不许告诉别人哦 💕" | +5 |
| Victoria（高冷总裁） | "不错。允许你得意一下。亲密度+8，这是赏赐，不是奖励。" | +8 |
| Camila（活力教练） | "哈哈哈哈哈你说的太逗了！！亲密度+10！你赚到了快感谢我！！🎉" | +10 |
| Emily（校园甜心） | "啊啊你说这个我脸都红了！！亲密度+6！都是你的错让我这么开心的！" | +6 |

**同一奖励类型"NSFW 暗示"（Lv3+），不同灵魂**：

| 灵魂 | 惊喜消息 |
|------|--------|
| Sofia | "...今天买了新的丝袜。你想看看吗？就...只给你看一点点。" |
| Victoria | "新到的内衣。穿上刚好。要看的话...求我。" |
| Camila | "运动完换衣服的时候拍了一张...你要不要看！不许截图！！" |
| Emily | "偷偷拍了一张...但是好害羞...你真的要看吗...只许看3秒！" |

#### 前端表现

```
[正常对话中]

用户: "你今天穿的什么颜色的裙子？"
伴侣: "蓝色的呀，怎么了，你喜欢蓝色吗？"

  [2-8 秒后，消息气泡带 ✨ 闪光动画滑入]

伴侣: "✨ 哈哈你问这个好可爱！亲密度+5 作为奖励！
       其实...我今天穿的是你最喜欢的那条裙子，可惜你看不到~"

  [前端同步更新亲密度进度条 +5，带弹跳动画]
  [消息气泡左侧有 ✨ 金色星星标记，表示这是"惊喜消息"]
```

#### 防刷机制

| 限制 | 值 | 原因 |
|------|---|------|
| 基础概率 | 5% | 足够稀有才有惊喜感 |
| 每次会话上限 | 3 次/小时 | 防止频繁触发失去稀缺感 |
| 亲密度加分每日总量 | 受 DAILY_INTIMACY_CAP(50) 限制 | 不会破坏经济平衡 |
| 同类奖励冷却 | 最近 3 次不重复 | 保持新鲜感 |
| NSFW 图片有生成成本 | 受代币/credits 系统限制 | 不会无限生图 |

#### 与现有系统集成

- 亲密度加分走现有 `/api/intimacy` 的 `POST` 逻辑，message_type 新增 `'surprise_reward'`
- 图片生成走现有 `routeImageGeneration()`，复用里程碑的图片生成链路
- 奖励记录追加到 `companion_profiles_ext.surprise_reward_history`（JSONB 数组，保留最近 20 条）
- 前端新增"惊喜消息"气泡样式：左边框金色渐变 + ✨ 图标 + 轻微放大动画

#### 设计哲学

```
传统游戏:  打怪 → 固定掉落 → 无聊
本系统:    聊天 → 5% 随机掉落 → 多巴胺

关键不是奖励的大小，而是"不可预测性"。
心理学研究：变比率强化（variable-ratio reinforcement）是最强的行为维持机制。
和刷短视频停不下来的原理一样。
```

---

## 第七部分：与现有系统集成

### 7.1 改造 `proactive-generation.ts`

现有 `generateContextualProactiveMessage()` 已经在用 LLM 生成，但 prompt 结构简单。改造为：

```
现有：systemPrompt = "你是{name}本人..." + 简短性格描述
改为：systemPrompt = 完整灵魂(voice_style + scenario + behavior_rules + examples) + 情境 + 语气指令 + 阶段规则
```

**核心代码量很小**——主要是丰富 prompt，不是重写逻辑。

### 7.2 改造 `prompt-builder.ts`

在 Layer 5 (说话约束) 中注入语气指令：

```typescript
// 修改 buildSpeakingConstraints，增加 tone 参数
function buildSpeakingConstraints(mode: string, tone?: ToneType): string {
  const base = /* 现有约束 */;
  if (tone) {
    return base + `\n\n【本轮语气】${TONE_INSTRUCTIONS[tone].zh}`;
  }
  return base;
}
```

### 7.3 改造 cron 调度

- 时间窗口 18:00 → **20:00**
- 每日目标 1-2 → **2-3**
- 新增第二次 cron（22:00 UTC+8）

### 7.4 开场白触发

```
用户点击"添加好友"
  → POST /api/friend/add
  → 读取 girlfriend 的 soul + occupation + hobbies
  → 调用 generateOpeningMessage()（灵魂驱动）
  → INSERT INTO chat_messages (is_proactive=true)
  → 标记 opening_message_sent
```

### 7.5 聊天流集成：突发事件 + 惊喜奖励

```
用户发送消息
  → POST /api/chat/stream
  → 正常生成回复 (buildPersonaPrompt)
  → 并行检查：
      ├── maybeTriggerLifeEvent()  → 8% 概率触发生活事件
      ├── evaluateCooldown()        → 语气+性格触发冷处理
      └── maybeTriggerSurpriseReward() → 5% 概率触发惊喜奖励
  → 如果触发事件/奖励：在正常回复后延迟追加消息
  → 响应包含: 正常回复 + event_info? + reward_info?
```

### 7.6 记忆采集 + 防混淆集成

```
聊天消息写入后
  → 异步触发：
      ├── memory-extract.ts (已有) → 提取记忆 → memory-write-guard.ts (新增) → 写入守卫检查
      └── profile-field-extractor.ts (新增) → 检测伴侣提问的回答 → 写入 user_profile
  → 下次构建 prompt 时：
      ├── buildIdentityAnchor() (新增) → 身份锚定防混淆
      └── buildKnownUserProfilePrompt() (新增) → 注入已采集的用户信息
```

---

## 第八部分：数据 Schema 变更（精简版）

```sql
-- Migration: 0044_conversation_lifecycle.sql
BEGIN;

ALTER TABLE companion_profiles_ext
  ADD COLUMN IF NOT EXISTS lifecycle_phase VARCHAR(32) DEFAULT 'intro_phase',
  ADD COLUMN IF NOT EXISTS opening_message_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consecutive_silence_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_tone_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS today_proactive_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_count_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,         -- 冷处理结束时间
  ADD COLUMN IF NOT EXISTS cooldown_reason VARCHAR(64),         -- 冷处理类型
  ADD COLUMN IF NOT EXISTS surprise_reward_history JSONB DEFAULT '[]', -- 正反馈奖励历史
  ADD COLUMN IF NOT EXISTS today_surprise_count INT DEFAULT 0,  -- 今日惊喜触发次数
  ADD COLUMN IF NOT EXISTS last_surprise_hour INT DEFAULT -1,   -- 上次惊喜触发的小时
  ADD COLUMN IF NOT EXISTS user_profile JSONB DEFAULT '{}';     -- 对话采集的用户档案

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS occupation VARCHAR(128),
  ADD COLUMN IF NOT EXISTS hobbies TEXT;

ALTER TABLE user_friends
  ADD COLUMN IF NOT EXISTS opening_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS opening_sent_at TIMESTAMPTZ;

COMMIT;
```

---

## 第九部分：文件清单（精简版）

| 新增/修改 | 文件 | 职责 | 工作量 |
|---------|------|------|-------|
| 新增 | `src/lib/conversation-lifecycle.ts` | 生命周期状态机（~50行） | 1h |
| 新增 | `src/lib/opening-message-engine.ts` | 开场白 LLM 生成（~80行） | 2h |
| 新增 | `src/lib/tone-distribution.ts` | 语气概率选择器（~100行） | 2h |
| 新增 | `src/lib/proactive-context.ts` | 情境上下文组装（~80行） | 2h |
| 新增 | `src/lib/cooldown-manager.ts` | 情绪声明式冷处理引擎（~120行） | 3h |
| 新增 | `src/lib/life-interruption.ts` | 真人突发事件引擎（~100行） | 2h |
| 新增 | `src/lib/surprise-reward.ts` | 正反馈惊喜奖励引擎（~150行） | 3h |
| 新增 | `src/lib/profile-field-extractor.ts` | 对话式用户档案字段提取（~80行） | 2h |
| 新增 | `src/lib/memory-write-guard.ts` | 记忆写入身份防混淆守卫（~60行） | 1.5h |
| 新增 | `src/lib/profile-collection-strategy.ts` | 渐进式采集策略引擎（~100行） | 2h |
| **改造** | `src/lib/proactive-generation.ts` | **丰富 prompt，注入灵魂+情境+语气**（核心改动） | 4h |
| 修改 | `src/lib/prompt-builder.ts` | Layer 5 注入语气指令（~10行） | 1h |
| 修改 | `src/app/api/cron/daily-proactive/route.ts` | 20:00窗口 + 2-3条 + 集成新模块 | 3h |
| 新增 | `src/app/api/friend/add/route.ts` | 添加好友 → 开场白 | 2h |
| 新增 | `db/migrations/0044_conversation_lifecycle.sql` | Schema 变更 | 0.5h |
| 新增 | `.github/workflows/cron-daily-proactive-second.yml` | 第二次 cron | 0.5h |

**总计**: ~27.5h 实施工时（比 v1 的 42h 减少 35%）

### 为什么工作量更少？

- **删除了整个模板库**：不再需要 30+ 条/性格的硬编码消息
- **删除了天气消息映射表**：不需要 `WEATHER_MESSAGES[condition][tone]` 的庞大矩阵
- **删除了季节话题模板**：只需要 `TOPIC_DIRECTIONS`（10 条方向提示）
- **核心是 prompt 工程**：丰富 prompt 比写模板快得多，且效果更好

---

## 第十部分：质量保障

### 生成质量检查

```typescript
// 每次 LLM 输出后校验
function validateGeneratedMessage(text: string, locale: string): boolean {
  if (!text || text.length < 3) return false;                    // 太短
  if (locale === 'zh' && /[A-Za-z]{3,}/.test(text)) return false; // 中文消息不应含英文句
  if (locale === 'en' && /[\u4e00-\u9fff]/.test(text)) return false; // 英文消息不应含中文
  if (/作为.*AI|as an AI|language model/i.test(text)) return false;  // 禁止 AI 自述
  if (text.length > (locale === 'zh' ? 120 : 300)) return false;    // 过长
  return true;
}
```

### 去重保障

- 每次生成后，将消息内容 hash 存入 `companion_profiles_ext.last_proactive_hashes`（JSONB 数组，保留最近 20 条）
- 下次生成前，将 hash 列表传入 prompt："禁止生成与以下消息相似的内容：[...]"
- LLM 有足够创造力避开相似表达

### 兜底策略

```
LLM 生成失败 → 使用 soul.proactive[随机一条] 作为兜底
soul.proactive 也缺失 → 使用现有 GENERIC_FALLBACK
GENERIC_FALLBACK 也失败 → 不发
```

---

## 第十一部分：对话式记忆采集系统

### 核心理念

真人社交中，双方会自然地互相了解——"你叫什么名字？""做什么工作的？""喜欢吃什么？"。  
AI 伴侣也应该**主动提问**、**记住回答**、**在后续对话中自然引用**。

这不是"审讯式问答"，而是融入日常对话的自然信息采集。

### 11.1 用户档案结构（user_profile JSONB）

```typescript
// companion_profiles_ext.user_profile 的结构化 schema
interface UserProfile {
  // === 基础身份 ===
  nickname?: string;            // 他希望被怎么称呼（"安妮"、"老公"、"大哥"）
  real_name?: string;           // 真实名字
  age?: number;                 // 年龄
  gender?: string;              // 性别
  city?: string;                // 所在城市
  
  // === 生活 ===
  occupation?: string;          // 职业
  work_schedule?: string;       // 作息（"夜猫子"、"朝九晚五"）
  hobbies?: string[];           // 爱好列表
  food_preferences?: string[];  // 饮食偏好
  pets?: string[];              // 宠物
  
  // === 偏好 ===
  communication_style?: string; // 喜欢的交流方式
  pet_peeves?: string[];        // 雷点（讨厌什么）
  love_language?: string;       // 爱的语言（陪伴/礼物/肢体接触/肯定/服务）
  
  // === 关系 ===
  relationship_status?: string; // 感情状态
  family?: string[];            // 家庭成员（"有个妹妹"、"养了一只猫"）
  
  // === 采集追踪 ===
  _fields_collected: string[];  // 已采集的字段列表（系统内部用）
  _last_asked_field?: string;   // 上次问了什么（避免连续追问）
  _last_asked_at?: string;      // 上次提问时间
}
```

### 11.2 渐进式采集策略

系统不一次性问完所有信息，而是**按优先级、按阶段、自然地**逐步了解：

```typescript
// src/lib/profile-collection-strategy.ts

/**
 * 采集优先级 —— 什么时候问什么
 * 每条规则绑定到生命阶段，确保自然不突兀
 */
const COLLECTION_PRIORITIES: Array<{
  field: keyof UserProfile;
  phase: LifecyclePhase;          // 在哪个阶段采集
  natural_trigger: string;        // 自然触发场景
  ask_probability: number;        // 遇到触发时的提问概率
}> = [
  // === first_add / intro_phase（破冰期）===
  { field: 'nickname',        phase: 'first_add',         natural_trigger: '开场白结尾',            ask_probability: 1.0 },
  { field: 'real_name',       phase: 'intro_phase',       natural_trigger: '聊到名字相关话题时',     ask_probability: 0.8 },
  { field: 'occupation',      phase: 'intro_phase',       natural_trigger: '聊到工作/白天做什么时',  ask_probability: 0.7 },
  { field: 'city',            phase: 'intro_phase',       natural_trigger: '聊到天气/地方/旅行时',   ask_probability: 0.6 },
  { field: 'age',             phase: 'intro_phase',       natural_trigger: '聊到年龄/生日/星座时',   ask_probability: 0.5 },
  
  // === daily_engagement（暧昧期）===
  { field: 'hobbies',         phase: 'daily_engagement',  natural_trigger: '聊到周末做什么/兴趣时',  ask_probability: 0.7 },
  { field: 'food_preferences',phase: 'daily_engagement',  natural_trigger: '聊到吃饭/做饭/餐厅时',   ask_probability: 0.6 },
  { field: 'pets',            phase: 'daily_engagement',  natural_trigger: '聊到动物/宠物/可爱时',   ask_probability: 0.5 },
  { field: 'work_schedule',   phase: 'daily_engagement',  natural_trigger: '聊到作息/早起/熬夜时',   ask_probability: 0.5 },
  
  // === deepening（热恋期）===
  { field: 'love_language',   phase: 'deepening',         natural_trigger: '聊到感情/表达爱的方式时', ask_probability: 0.4 },
  { field: 'pet_peeves',      phase: 'deepening',         natural_trigger: '聊到讨厌什么/不喜欢时',   ask_probability: 0.5 },
  { field: 'family',          phase: 'deepening',         natural_trigger: '聊到家人/家庭/童年时',    ask_probability: 0.4 },
  { field: 'communication_style', phase: 'deepening',     natural_trigger: '聊到交流偏好时',          ask_probability: 0.3 },
];

/**
 * 决定本次对话是否要主动采集某个字段
 * 规则：
 * 1. 不采集已知的字段
 * 2. 不在一次对话中连续问两个问题
 * 3. 上次提问距今 > 3 条消息才能再问
 * 4. 按当前阶段的优先级排序
 */
export function shouldCollectField(input: {
  userProfile: UserProfile;
  currentPhase: LifecyclePhase;
  messagesSinceLastAsk: number;
  conversationTopic?: string;     // 当前话题关键词
}): { shouldAsk: boolean; field?: keyof UserProfile; triggerHint: string } {
  const profile = input.userProfile;
  const collected = new Set(profile._fields_collected || []);
  
  // 冷却期：至少间隔 3 条消息
  if (input.messagesSinceLastAsk < 3) return { shouldAsk: false, triggerHint: '' };
  
  // 筛选当前阶段可采集的未知字段
  const candidates = COLLECTION_PRIORITIES.filter(c =>
    !collected.has(c.field) &&
    isPhaseReached(c.phase, input.currentPhase)
  );
  
  if (candidates.length === 0) return { shouldAsk: false, triggerHint: '' };
  
  // 优先匹配当前话题
  for (const c of candidates) {
    if (input.conversationTopic && matchesTrigger(c.natural_trigger, input.conversationTopic)) {
      if (Math.random() < c.ask_probability) {
        return { shouldAsk: true, field: c.field, triggerHint: c.natural_trigger };
      }
    }
  }
  
  // 无话题匹配时，15% 概率随机挑一个问
  if (Math.random() < 0.15) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return { shouldAsk: true, field: pick.field, triggerHint: pick.natural_trigger };
  }
  
  return { shouldAsk: false, triggerHint: '' };
}
```

### 11.3 Prompt 注入：告诉 LLM "你还不了解他什么"

```typescript
// 在每次聊天 prompt 中注入采集指令
function buildCollectionPromptInstruction(input: {
  userProfile: UserProfile;
  fieldToCollect?: keyof UserProfile;
  triggerHint: string;
  zh: boolean;
}): string {
  if (!input.fieldToCollect) return '';
  
  // 告诉 LLM 她已经知道什么、还想知道什么
  const known = Object.entries(input.userProfile)
    .filter(([k, v]) => !k.startsWith('_') && v)
    .map(([k, v]) => `${FIELD_LABELS[k]}: ${formatValue(v)}`)
    .join('、');
  
  return input.zh
    ? `\n【你对他的了解】${known || '还不太了解他'}
【本次对话】你可以自然地问一下他的${FIELD_LABELS[input.fieldToCollect]}。${input.triggerHint}。记住用你自己的方式问，不要生硬。如果他回答了，记住这个信息。`
    : `\n[What you know about him] ${known || 'Not much yet'}
[This turn] You can naturally ask about his ${FIELD_LABELS[input.fieldToCollect]}. ${input.triggerHint}. Ask in your own voice, not mechanically. If he answers, remember it.`;
}

const FIELD_LABELS: Record<string, string> = {
  nickname: '怎么称呼他',
  real_name: '真名',
  age: '年龄',
  gender: '性别',
  city: '所在城市',
  occupation: '职业',
  work_schedule: '作息习惯',
  hobbies: '爱好',
  food_preferences: '饮食偏好',
  pets: '宠物',
  love_language: '爱的语言',
  pet_peeves: '雷点',
  family: '家庭情况',
  communication_style: '交流偏好',
};
```

### 11.4 回答检测与结构化存储

当用户回复了伴侣的提问，系统需要**从自然语言中提取结构化数据**并存入 `user_profile`：

```typescript
// src/lib/profile-field-extractor.ts

/**
 * 从用户回复中提取特定字段的值
 * 在 memory-extract.ts 之后运行，作为补充层
 */
export async function extractProfileField(input: {
  companionQuestion: string;        // 伴侣问了什么
  userAnswer: string;               // 用户回答了什么
  targetField: keyof UserProfile;   // 期望提取的字段
  locale: string;
}): Promise<{ value: string | string[] | number; confidence: number } | null> {
  const zh = input.locale.startsWith('zh');
  
  const prompt = zh
    ? `她从对话中问了一个问题，他回答了。请从他的回答中提取结构化信息。

她问的：${input.companionQuestion}
他回答的：${input.userAnswer}
目标字段：${FIELD_LABELS[input.targetField]}

返回 JSON：{ "value": "提取的值", "confidence": 0.0-1.0 }
- 如果是称呼/名字，value 是字符串
- 如果是爱好/饮食偏好，value 是字符串数组
- 如果是年龄，value 是数字
- 如果他没有明确回答，confidence 为 0
- 只返回 JSON，不要解释`
    : /* English equivalent */;
  
  try {
    const raw = await generateText({ prompt, temperature: 0.1, maxTokens: 100 });
    const parsed = JSON.parse(raw.match(/\{[^}]+\}/)?.[0] || '{}');
    if (parsed.confidence > 0.5) return parsed;
    return null;
  } catch {
    return null;
  }
}
```

### 11.5 采集流程示例

```
对话流程（开场白 → 第一轮采集）：

[Sofia 开场白] "...你好，我是Sofia。在隔壁住的，夜班护士。
                其实一直想打个招呼。你喜欢别人怎么叫你？"

[用户回复]     "叫我小龙就好"

  ┌──────────────────────────────────────────────────────┐
  │  系统后台：                                           │
  │  1. extractProfileField() 检测到 nickname = "小龙"     │
  │  2. UPDATE companion_profiles_ext                     │
  │     SET user_profile = user_profile || '{"nickname":"小龙"}'  │
  │  3. 标记 _fields_collected += ["nickname"]             │
  │  4. 同时写入 memories 表（已有逻辑）                     │
  └──────────────────────────────────────────────────────┘

[Sofia 下一轮] prompt 注入："你已经知道他叫小龙"
               LLM 生成："小龙...好可爱的名字...以后就这么叫你了 😊"

  ┌──────────────────────────────────────────────────────┐
  │  系统后台：                                           │
  │  shouldCollectField() 检查：                           │
  │  - nickname ✅ 已采集                                  │
  │  - 下一个优先级：occupation（intro_phase）                │
  │  - 但 messagesSinceLastAsk = 1，冷却期未过 → 本轮不提问  │
  └──────────────────────────────────────────────────────┘

[几轮对话后...]

[Sofia] prompt 注入："你可以自然地问一下他的职业。聊到工作/白天做什么时。"
          LLM 生成："小龙白天做什么工作呀...我都是夜班，白天都在睡觉..."

[用户]     "我是程序员，经常加班到很晚"

  ┌──────────────────────────────────────────────────────┐
  │  系统后台：                                           │
  │  1. extractProfileField() → occupation = "程序员"       │
  │  2. 同时 memory-extract.ts 提取 → "工作是程序员"        │
  │  3. 两条数据各存各的，互不干扰                          │
  │  4. user_profile.occupation = "程序员"                  │
  │  5. memories 表新增一条 type=fact category=work         │
  └──────────────────────────────────────────────────────┘

[Sofia 下一轮] prompt 注入："你知道他是程序员，作息可能偏晚"
               LLM 生成："程序员...那你也经常熬夜吧？
                         我们作息好像呢...以后晚上了可以一起..."
```

### 11.6 "你已经知道的"注入 prompt

每次对话时，将已采集的用户档案注入 system prompt，让 LLM 自然地使用这些信息：

```typescript
function buildKnownUserProfilePrompt(profile: UserProfile, zh: boolean): string {
  const entries = Object.entries(profile)
    .filter(([k, v]) => !k.startsWith('_') && v);
  
  if (entries.length === 0) return '';
  
  const items = entries.map(([k, v]) => {
    const label = FIELD_LABELS[k] || k;
    const value = Array.isArray(v) ? v.join('、') : String(v);
    return `- ${label}：${value}`;
  }).join('\n');
  
  return zh
    ? `\n【你了解的他】\n${items}\n\n请在对话中自然地使用这些信息，比如用他喜欢的称呼叫他，提到他的爱好时表现出记得。不要刻意罗列这些信息。`
    : `\n[What you know about him]\n${items}\n\nUse this naturally — call him by his preferred name, show you remember his interests. Don't list these out mechanically.`;
}
```

---

## 第十二部分：角色信息防混淆体系

### 核心问题

对话中同时存在两个人的信息：

| | 伴侣（她） | 用户（他） |
|---|---------|--------|
| 名字 | Sofia / Emily / Victoria | 小龙 / Annie / 用户选的 |
| 职业 | 护士 / CEO / 教练 | 程序员 / 设计师 / ... |
| 爱好 | 烘焙 / 品酒 / 排球 | 游戏 / 摄影 / ... |
| 城市 | 设定中的城市 | 用户真实城市 |

如果记忆提取器把"我是护士"存成用户的职业，或把"我是程序员"当成伴侣的职业，整个系统就会混乱。

### 12.1 数据严格分离

```typescript
// 两条完全独立的数据通道

// 通道 A：伴侣自身信息（只读，创建时确定，不可被聊天修改）
interface CompanionIdentity {
  name: string;           // girlfriends.name
  occupation: string;     // girlfriends.occupation  
  hobbies: string;        // girlfriends.hobbies
  backstory: string;      // girlfriends.backstory
  age: number;            // girlfriends.age
  gender: string;         // girlfriends.gender
  // ... 这些字段全部来自 girlfriends 表，聊天过程中不会变更
}

// 通道 B：用户信息（只写，通过对话逐步采集）
// 存储在 companion_profiles_ext.user_profile JSONB
// 就是上面第十部分定义的 UserProfile
```

**绝对规则**：
- 伴侣信息只从 `girlfriends` 表读取，**永远不从聊天消息中写入**
- 用户信息只从聊天消息中提取，**永远不从 girlfriends 表读取**
- 两个通道在代码层面完全隔离

### 12.2 记忆提取器的"谁说的"识别

```typescript
// 改造 memory-extract.ts 的 EXTRACT_PROMPT

const EXTRACT_PROMPT_V2 = `Extract memorable facts about the USER from this chat.

IMPORTANT RULES:
- ONLY extract facts about the USER (the human), NOT about the AI companion
- The AI companion's name is {companion_name}, her occupation is {companion_occupation}
- Do NOT confuse the companion's information with the user's information
- If the companion says "I am a nurse", that is NOT about the user — skip it
- If the user says "I am a programmer", that IS about the user — extract it

Return ONLY a JSON array. Each item: { "content": "<one sentence>", "type": "<type>", "category": "<category>" }

Types: interest, event, fact, emotion, preference, intent, physical, social
Categories: interest, daily, career, social, emotional, future, health, work, family

Only extract things that:
- Are about the USER (their job, hobbies, family, preferences, plans, health)
- Would be useful to remember in future conversations
- Are stated as facts, not transient chat

Return [] if nothing memorable.

Messages:
"""%s"""`;
```

### 12.3 角色身份锚定（Identity Anchoring）

在**每次** LLM 调用时，明确标注"你是谁"和"他是谁"：

```typescript
// 在 buildPersonaPrompt / generateProactiveMessage 的所有 system prompt 中注入
function buildIdentityAnchor(input: {
  companionName: string;
  companionOccupation: string;
  companionHobbies: string;
  userNickname?: string;
  userOccupation?: string;
  zh: boolean;
}): string {
  return input.zh
    ? `【身份锚定 - 绝对不可混淆】
你是：${input.companionName}，${input.companionOccupation}，爱好${input.companionHobbies}
他是：${input.userNickname || '你还不了解他的名字'}${input.userOccupation ? `，${input.userOccupation}` : ''}

注意：你的信息是他的信息，不要搞混。他说的是他的，你说的是你的。`
    : `/* Identity anchor — never confuse */
You are: ${input.companionName}, ${input.companionOccupation}, hobbies: ${input.companionHobbies}
He is: ${input.userNickname || 'unknown name yet'}${input.userOccupation ? `, ${input.userOccupation}` : ''}

Your info is yours. His info is his. Never mix them up.`;
}
```

### 12.4 写入隔离机制

```typescript
// src/lib/memory-write-guard.ts

/**
 * 写入守卫 —— 在记忆入库前检查是否混淆了身份
 */
export function guardMemoryWrite(input: {
  memory: ExtractedMemory;
  companionIdentity: CompanionIdentity;
}): { allowed: boolean; reason?: string } {
  const content = input.memory.content.toLowerCase();
  const companion = input.companionIdentity;
  
  // 检查：这条记忆是否其实在描述伴侣自己？
  const companionName = companion.name.toLowerCase();
  const companionJob = companion.occupation.toLowerCase();
  
  // 如果记忆内容匹配伴侣的已知信息，大概率是搞混了
  if (content.includes(companionName) && 
      (content.includes('是') || content.includes('is') || content.includes('叫'))) {
    // "Sofia是护士" → 这是伴侣信息，不应存入用户记忆
    if (content.includes(companionJob)) {
      return { allowed: false, reason: 'memory_describes_companion_not_user' };
    }
  }
  
  // 检查：是否包含伴侣的职业/爱好关键词但主语模糊
  const ambiguousPatterns = [
    new RegExp(`(?:她|her|${companionName}).*(?:职业|工作|job|occupation)`, 'i'),
    new RegExp(`(?:她|her|${companionName}).*(?:爱好|hobb|like|喜欢)`, 'i'),
  ];
  
  for (const pattern of ambiguousPatterns) {
    if (pattern.test(content)) {
      return { allowed: false, reason: 'ambiguous_subject_might_be_companion' };
    }
  }
  
  return { allowed: true };
}
```

### 12.5 防混淆架构图

```
聊天消息流
  │
  ├──→ 记忆提取器 (memory-extract.ts)
  │      │
  │      ├── EXTRACT_PROMPT_V2 明确标注"只提取用户信息"
  │      │
  │      ▼
  │    ExtractedMemory[]
  │      │
  │      ├──→ 写入守卫 (memory-write-guard.ts)
  │      │      │
  │      │      ├── 检查是否描述了伴侣而非用户
  │      │      ├── 检查主语是否模糊
  │      │      │
  │      │      ├── allowed → 写入 memories 表
  │      │      └── blocked → 丢弃 + 日志
  │      │
  │      └──→ 字段提取器 (profile-field-extractor.ts)
  │             │
  │             ├── 检测用户回答了伴侣的提问
  │             └── 写入 companion_profiles_ext.user_profile
  │
  └──→ 伴侣身份层（只读）
         │
         ├── girlfriends 表（name/occupation/hobbies/backstory）
         ├── PresetSoul（voice_style/scenario/behavior_rules）
         └── 注入 prompt 的身份锚定，永不修改
```

### 12.6 典型混淆场景与防御

| 场景 | 混淆风险 | 防御机制 |
|------|---------|--------|
| 伴侣说"我是护士" | 记忆提取器可能存为"用户是护士" | EXTRACT_PROMPT_V2 明确排除伴侣自述 |
| 用户说"我也是护士" | 正确，应存储 | 正常提取 |
| 伴侣说"你喜欢编程对吧" | 可能遗漏 | 已有记忆提取覆盖（type=fact） |
| 用户说"你叫什么"→伴侣说"我叫Sofia" | 可能存"Sofia是用户的名字" | 写入守卫检测到 companionName，拦截 |
| 两人聊到同一城市 | 可能混淆谁住哪里 | 身份锚定 + prompt 中明确标注 |
| 伴侣说"我喜欢烘焙" | 可能存为用户爱好 | EXTRACT_PROMPT_V2 排除伴侣自述 |

---

## 总结

```
                           ┌──────────────────────────────────────┐
                           │         系统层（规则引擎）             │
                           │  ┌───────┐  ┌────────────┐  ┌───────┐ │
                           │  │时间窗口│  │ 语气选择器  │  │生命周期 │ │
                           │  │20-24时 │  │ sweet/撒娇  │  │破冰→成熟│ │
                           │  │2-3条/天│  │ /拒绝/生气  │  │       │ │
                           │  └───┬───┘  └─────┬──────┘  └──┬───┘ │
                           │      │            │             │      │
                           │  ┌───┴───┐  ┌────┴─────┐  ┌───┴────┐ │
                           │  │情境上下文│  │ 随机引擎  │  │采集策略 │ │
                           │  │天气/节日 │  │ 8%突发   │  │渐进提问 │ │
                           │  │季节/时段 │  │ 5%惊喜   │  │档案存储 │ │
                           │  └───┬───┘  └────┬─────┘  └───┬────┘ │
                           └──────┼───────────┼────────────┼────────┘
                                  │           │            │
                       ┌──────────┼───────────┼────────────┼────────┐
                       │          ▼           ▼            ▼        │
                       │    ┌─────────────────────────────────┐  │
                       │    │        Prompt 组装引擎             │  │
                       │    │                                 │  │
                       │    │  系统指令  +  情境信息           │  │
                       │    │  + 语气指令 + 阶段规则          │  │
                       │    │  + 身份锚定 + 已知用户档案     │  │
                       │    │  + 采集指令（自然提问）         │  │
                       │    └───────────────┬───────────────┘  │
                       │                    │                    │
                       │                    ▼                    │
                       │    ┌─────────────────────────────────┐  │
                       │    │          LLM 生成器              │  │
                       │    │                                 │  │
                       │    │  输入: prompt + 灵魂             │  │
                       │    │  输出: 独一无二的消息          │  │
                       │    └───────────────┬───────────────┘  │
                       │                    │                    │
                       │      ┌─────────┼─────────┐          │
                       │      ▼         ▼         ▼          │
                       │  ┌───────┐ ┌───────┐ ┌────────┐  │
                       │  │情绪声明│ │突发事件│ │惊喜奖励│  │
                       │  │冷处理  │ │洗澡/外卖│ │+分/+图│  │
                       │  └───────┘ └───────┘ └────────┘  │
                       │                                       │
                       │     灵魂层（角色个性）                  │
                       │  ┌────────┐  ┌────────────┐         │
                       │  │voice   │  │scenario    │         │
                       │  │_style  │  │（生活世界）  │         │
                       │  └────────┘  └────────────┘         │
                       │  ┌────────┐  ┌────────────┐         │
                       │  │behavior│  │examples    │         │
                       │  │_rules  │  │（语气锚点）  │         │
                       │  └────────┘  └────────────┘         │
                       │  ┌────────────────────────┐         │
                       │  │occupation/hobbies/     │         │
                       │  │backstory/personality   │         │
                       │  └────────────────────────┘         │
                       │                                       │
                       │     记忆层（用户认知）                  │
                       │  ┌────────────────┐ ┌────────────┐  │
                       │  │user_profile    │ │记忆写入守卫 │  │
                       │  │（渐进式采集）  │ │（防混淆）   │  │
                       │  └────────────────┘ └────────────┘  │
                       └─────────────────────────────────────────┘
```

**系统管"何时、何境、何语气、何奖励"。灵魂管"怎么说、说什么"。记忆管"我了解他多少"。LLM 是演员，灵魂是剧本，系统是导演。**

---

## 版本变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v2.0 | 2026-08-17 | 初始版本：灵魂驱动架构，从模板库转型为 LLM 自由生成 |
| v2.1 | 2026-08-17 | 新增「对话式记忆采集系统」（第十一部分）+ 「角色信息防混淆体系」（第十二部分） |
| v2.2 | 2026-08-17 | 「已读不回」改为「情绪声明式冷处理」（6.3） |
| v2.3 | 2026-08-17 | 新增「真人突发事件」（16 种生活事件，6.4） |
| v2.4 | 2026-08-17 | 新增「正反馈惊喜奖励」（9 种奖励类型，5% 触发，6.7）；修复部分编号；补充文件清单/Schema/系统集成/总结架构图 |
