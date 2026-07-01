# SoulMate AI — 前端视觉规范

## 气质与意象
深夜仰望星空，点点星光在指尖流转；暧昧的粉色光晕从界面深处透出，像恋人手机屏幕的微光。每个按钮都像一颗可以触碰的星，每次交互都有心跳感。整体节奏像 H5 单页：屏幕之间用动态过场串起来，卡片、文字、星点都在缓慢呼吸。

## 设计关键词
深色渐变星空 · 毛玻璃 · 粉色高亮 · 暧昧诱惑 · 字体设计感 · H5 动态

## 色彩

### 渐变星空背景（多层叠加）
- 主底色：#07070F（极深靛黑）
- 渐变 1：`radial-gradient(at 20% 0%, rgba(255,45,120,0.18) 0%, transparent 50%)` —— 顶左粉色光晕
- 渐变 2：`radial-gradient(at 80% 100%, rgba(157,78,221,0.16) 0%, transparent 55%)` —— 底右紫色光晕
- 渐变 3：`radial-gradient(at 50% 50%, rgba(255,107,166,0.06) 0%, transparent 70%)` —— 中央柔光
- 星点：3 层 CSS box-shadow 星点（小/中/大）+ float 动画 30s-100s 慢速漂移
- 极光带：1-2 条对角 radial 极淡粉紫光带（opacity 0.05，blur 80px，subtle 浮动）

### 主色板
- 粉色高亮：#FF2D78（选中态 / CTA / 关键提示）
- 粉色柔光：#FF6BA6（hover 态 / 次级强调）
- 粉色辉光：rgba(255,45,120,0.25)（glow / shadow / 辉光）
- 紫色辅色：#C026D3（渐变副色）
- 卡片背景：rgba(255,255,255,0.04)（微透白）

### 文字色
- 主文本：#F0F0F5
- 次文本：#8B8BA3
- 粉色文本：#FF6BA6
- 标题渐变：`linear-gradient(135deg, #FFFFFF 0%, #FF6BA6 60%, #FF2D78 100%)` + bg-clip-text

### 语义色
- 成功：#22C55E
- 警告：#FBBF24
- 错误：#EF4444

### 边框与分割
- 默认边框：rgba(255,255,255,0.08)
- 毛玻璃边框：rgba(255,255,255,0.12)
- 分割线：rgba(255,255,255,0.06)

## 字体（重点 · 设计感）

### 字体系统
- 标题 Display：`'Playfair Display'` (serif)，用于 Hero / 大标题 / 品牌名 —— 字母 a/g/f 有意大利体韵味，配粉色渐变填充极有诱惑感
- 副标题 / 大字：`'Sora'` (sans, geometric) —— 现代干净，字面方正
- 正文 / UI：`'Inter'` (sans) —— 通用清晰
- 数字 / 标签：`'Space Grotesk'` (sans, 等距感) —— tabular-nums
- 中文：`'Noto Sans SC'`（fallback 系统黑体）

### 字体规格
- Hero 主标：`font-display text-5xl md:text-7xl tracking-tight leading-[1.05]` + 渐变填充
- Section 标：`font-display text-3xl md:text-4xl tracking-tight`
- 卡片标：`font-sans font-semibold text-lg`
- 正文：`font-sans text-sm/relaxed text-[#8B8BA3]`
- 按钮：`font-sans font-semibold text-sm tracking-wide uppercase`（CTA 大写凸显）
- 数字：`font-mono tabular-nums text-[#FF2D78]`

### 全 Google Fonts CN 域加载
通过 globals.css `@import "https://fonts.googleapis.cn/css2?family=Playfair+Display:wght@600;700;800;900&family=Sora:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap"` 引入。

## 毛玻璃效果
- 按钮/卡片：`backdrop-blur-xl bg-white/[0.04] border border-white/[0.12]`
- 弹窗面板：`backdrop-blur-2xl bg-[#0E0E1A]/90 border border-white/[0.12]`
- 输入框：`backdrop-blur-md bg-white/[0.06] border border-white/[0.10] focus:border-[#FF2D78]/50 focus:ring-2 focus:ring-[#FF2D78]/20`
- Header / TopBar：`backdrop-blur-2xl bg-[#07070F]/70 border-b border-white/[0.06]`

## 选中态与高亮
- 按钮 selected：`bg-[#FF2D78] text-white shadow-[0_0_20px_rgba(255,45,120,0.4)]`
- 按钮 hover：`bg-white/[0.08] border-[#FF6BA6]/40 text-[#FF6BA6]`
- Tab active：底部 2px `#FF2D78` + 文字粉色 + 进入动画 layoutId
- 卡片选中：`ring-2 ring-[#FF2D78]/50 shadow-[0_0_30px_rgba(255,45,120,0.15)]`

## 弹窗与蒙层
- 重要提示/广告弹窗：蒙层 `bg-black/50 backdrop-blur-sm`
- 弹窗本体：`backdrop-blur-2xl bg-[#0E0E1A]/95 rounded-2xl border border-white/[0.12] shadow-2xl`
- 弹窗进入：opacity 0→1 + scale(0.92→1) + translateY(20→0) 0.35s easeOut
- CTA 按钮：`bg-[#FF2D78] hover:bg-[#FF6BA6] text-white shadow-[0_0_25px_rgba(255,45,120,0.5)]`

## H5 动态效果 [重点]

### 入场动效
- Hero 主标：`opacity 0→1 + translateY(20→0) + blur(8→0) 0.6s easeOut`
- 卡片网格：每张延迟 0.05s `opacity 0→1 + translateY(30→0)` —— 错落出场
- 文字段落：opacity 渐入 0.5s + slide 12px
- 按钮：scale(0.9→1) + opacity 0→1 0.4s

### 持续动效
- 星空：3 层星点 `animation: drift 30s/60s/100s infinite linear`，方向不同
- 极光带：`animation: aurora 14s infinite ease-in-out`（左右轻微浮动 + opacity 0.04↔0.08 呼吸）
- 标题流光：渐变文字 `background-position` 200% 横向移动 6s linear infinite —— 像 spotlight 扫过
- Hero 头像：`animation: floaty 6s infinite ease-in-out`（轻微 translateY ±6px）

### 交互动效
- 按钮 hover：scale(1.04) + translateY(-2px) + glow 增强 0.2s ease
- 卡片 hover：translateY(-6px) + ring 粉色 + 内图 scale(1.05) 0.4s ease
- 按下：scale(0.97) 0.1s
- 选中切换：使用 framer-motion layout / layoutId 做磁性过渡

### 滚动动效
- Section 进入：IntersectionObserver 触发，class 切换 opacity + translateY
- 视差：Hero 头像 / 极光带绑定 scrollY 微动（translateY 0→-40px）

### 性能约束
- 仅使用 transform / opacity / filter 做动画（GPU 加速）
- 长列表禁止全屏粒子动画
- 用 `prefers-reduced-motion` 给动画降级

## 排版与节奏（H5 单页式）
- Section 之间用 `min-h-[80vh]` 或 `min-h-screen` 充分留白
- 单屏只放一个核心信息焦点
- 标题之间 `space-y-24` 大间距，制造"翻页"节奏
- Hero 与卡片之间用 1 条粉色到透明的渐变分割线（h-px linear gradient）

## 交互文案风格
- 暧昧诱惑导向：用 "She's waiting…" "Feel the spark" "Start your story" 等感性短句
- 按钮：Chat Now / Meet Her / Unleash / Start Talking
- 功能标签用情绪词：Romantic / Passionate / Playful / Submissive / Dominant
- 避免冷冰冰的技术词汇

## 设计禁忌
- 不要白色/浅色大面积背景
- 不要扁平纯色按钮（必须有毛玻璃或 glow）
- 不要灰色默认态按钮（用半透明白代替灰色）
- 不要蓝色系高亮（用粉色系）
- 不要满屏密密麻麻的信息（留白 + 呼吸感）
- 不要在桌面端用单一通用 sans 字体当 Hero —— 必须用 Playfair Display 等带衬线的设计字体撑场
- 不要把动效叠到正在阅读的正文上（动效只用于装饰层与交互层）

## 对话/IM 风格（重要 · 参考微信 + WhatsApp）

### 整体结构
对话相关页面采用「IM 三段式」框架：**顶部 AppBar / 中部消息流 / 底部输入栏**，参考微信与 WhatsApp 的信息密度与操作节奏，同时保持本站深色暧昧主题。

### 会话列表（/messages）
- 顶部：粘性搜索框 `bg-white/[0.06] backdrop-blur-xl rounded-full h-10 pl-10` + 右上角新建按钮 `bg-[#FF2D78] shadow-pink-glow`
- 列表项：`flex gap-3 px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06]`
  - 头像 14×14（`h-14 w-14`）圆形，右下角在线点 `w-3 h-3 bg-emerald-400 ring-2 ring-[#07070F]`（可选）
  - 主体：上行 名字（`text-sm font-semibold`）+ 时间（`text-[11px] text-[#8B8BA3]`）
  - 下行 最新消息预览（`text-xs text-[#8B8BA3] truncate`）+ 未读 badge（`bg-[#FF2D78] text-white rounded-full px-1.5 min-w-5 h-5 text-[10px] tabular-nums`）
- 分隔线：`divide-y divide-white/[0.04]` 极淡，不破坏沉浸感
- 列表进入动画：stagger 40ms slide+fade
- 长按 / 右键 / 悬停露出操作：置顶 / 静音 / 删除（暂可省略，预留 hover 区域）

### 聊天详情（/chat/[id]）

#### AppBar（顶部固定，毛玻璃）
- 容器：`sticky top-0 z-30 backdrop-blur-2xl bg-[#07070F]/70 border-b border-white/[0.06] px-3 py-2.5`
- 布局：返回箭头 + 头像 36px + 名字与状态（双行：粉色 `Lv.X · Title` 状态行）+ 右侧菜单按钮（生图、衣柜、礼物折叠到「⋯」菜单或直接显式）
- 在线点：头像右下绿色，`typing` 状态时切换为 `… 正在输入` 文案 + 粉色脉动

#### 消息流
- 容器：`flex-1 overflow-y-auto px-3 py-3 space-y-1` 紧凑节奏（不是 space-y-4，参考 IM 紧凑感）
- 日期分隔条：`flex justify-center my-3` 内嵌 `text-[10px] text-[#8B8BA3] bg-white/[0.04] px-2.5 py-0.5 rounded-full backdrop-blur-md` 文案 `Today / Yesterday / Mon, Mar 12`
- 气泡（关键差异化）：
  - 对方（assistant）：`bg-white/[0.06] backdrop-blur-md border border-white/[0.08] text-[#F0F0F5] rounded-2xl rounded-tl-md px-3.5 py-2 max-w-[78%]`，左侧第一条带头像 28px，连续消息合并不再露头像
  - 自己（user）：`bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white rounded-2xl rounded-tr-md px-3.5 py-2 max-w-[78%] shadow-[0_4px_14px_rgba(255,45,120,0.25)]`，无头像（IM 通常自己一侧不显头像）
  - 主动消息（is_proactive）：对方气泡 + 左侧 2px 粉色高亮条
  - 时间戳：附在气泡右下角内部 `text-[10px] opacity-60`（自己气泡白色 / 对方气泡灰色），与气泡同行 inline，不占额外行
  - 已读对勾：自己消息发送成功后右下加 ✓ 单勾，已读 ✓✓ 粉色
- 连续消息合并规则（IM 紧凑）：同一发送方且与上一条间隔 < 3 分钟，间距 `mt-0.5`；否则 `mt-3` 拉开
- Typing 指示器：对方一侧出现 `inline-flex gap-1 px-3.5 py-2.5 bg-white/[0.06] rounded-2xl` 内三个小圆点 `animate-bounce` 错位（delay 0/150/300ms）
- 图片消息：气泡内圆角图片 `rounded-xl max-h-[280px] object-cover`，点击放大全屏 lightbox（`bg-black/90 backdrop-blur-xl`）
- 长按消息（移动）/ 悬停（桌面）露出工具条：复制 / 引用 / 删除（暂可只做复制 + 删除）
- 浮动「滚到底部」按钮：在用户向上滚动 ≥ 200px 时显示 `fixed right-4 bottom-28 h-10 w-10 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/[0.10]` + 新消息时附未读 badge

#### 底部输入栏（IM 标准）
- 容器：`sticky bottom-0 backdrop-blur-2xl bg-[#07070F]/80 border-t border-white/[0.06] px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]`
- 左侧 `+` 按钮 44×44 触发附件抽屉（礼物 / 衣柜 / 生图 / 记忆 / 预设）—— 把当前 4 个图标按钮折叠
- 中间输入框：`flex-1 rounded-full bg-white/[0.06] border border-white/[0.10] px-4 py-2.5 min-h-[40px] max-h-[120px] text-base md:text-sm focus:border-[#FF2D78]/40`
- 右侧按钮：空状态显示麦克风图标，输入有内容时切换为粉色发送按钮（`bg-gradient-to-br from-[#FF2D78] to-[#C026D3]` 圆形 + scale 弹入）
- 回车发送，Shift+Enter 换行
- 输入栏会随键盘弹起自动跟随（依赖 viewport-fit + dvh），iOS 上输入框 `text-base` 防缩放

#### 附件抽屉（+ 按钮触发）
- 自下而上 sheet，`rounded-t-3xl bg-[#0E0E1A]/95 backdrop-blur-2xl`，内置 4-6 个圆形大图标（礼物、衣柜、自拍、记忆、预设、相册），间距宽松，触摸目标 ≥56px
- 进入：`translateY(100%→0) 0.3s ease-out`，蒙层 `bg-black/50 backdrop-blur-sm`

### IM 交互细节（必须遵守）
- 触摸反馈：所有可点击元素 `active:scale-[0.97] active:bg-white/[0.06]` 提供物理感
- 单手可达：底部 5%-15% 高度区域全部留给输入栏与高频操作
- 新消息自动滚到底部，但用户已上滚时不打断 —— 显示"x 条新消息"浮动提示
- 消息发送态：发送中（半透明 + spinner 小圆）→ 已发送（恢复不透明）→ 失败（红色感叹号 + 重试）
- 长列表懒加载历史：滚到顶部触发 `Load earlier messages`
