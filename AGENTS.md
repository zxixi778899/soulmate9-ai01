# SoulMate AI — 项目规范

## 项目概述
AI 女友独立站（欧美市场 · 高 NSFW · 精神陪伴）
- **技术栈**：Next.js 16 (App Router) / React 19 / TypeScript 5 / Tailwind CSS 4 / shadcn/ui
- **后端**：Supabase (Auth + PostgreSQL + Storage)
- **支付**：Stripe
- **部署**：Vercel

## 目录结构

```
src/
├── app/                      # 页面路由
│   ├── layout.tsx            # 根布局 (暗色主题 + AuthProvider + AgeVerification)
│   ├── globals.css           # 全局样式 + Tailwind + 字体
│   ├── page.tsx              # 公开落地页 (Hero + 女友卡片网格 + 标签筛选)
│   ├── girlfriend/
│   │   └── [slug]/page.tsx   # 公开女友预览页 + Chat Now
│   ├── login/                # 登录页
│   ├── register/             # 注册页
│   ├── auth/callback/        # Auth 回调
│   ├── (main)/               # 主应用路由组 (需要登录)
│   │   ├── layout.tsx        # 主布局 (Sidebar + 内容区)
│   │   ├── page.tsx          # 私人女友展馆 (Gallery)
│   │   ├── create/page.tsx   # 女友创建/定制页
│   │   ├── chat/[id]/        # 聊天室
│   │   ├── shop/             # 商城
│   │   ├── wardrobe/         # 衣柜
│   │   └── profile/          # 个人中心
│   └── api/                  # API 路由 (BFF 层)
│       ├── girlfriends/      # 女友 CRUD (GET/POST/PATCH/DELETE)
│       │   ├── public/       # 公开女友 (GET list + GET [slug] detail)
│       │   └── [id]/         # 单女友操作
│       ├── intimacy/         # 亲密值管理
│       ├── outfits/          # 服装列表 (静态数据)
│       ├── admin/review/     # 管理审核 API
│       ├── chat/
│       │   ├── stream/       # SSE 流式聊天
│       │   ├── [id]/         # 聊天记录
│       │   └── last-messages/ # 最新消息列表
│       └── proactive/check/  # 主动问候检查
├── components/
│   ├── ui/                   # shadcn/ui 组件
│   ├── AuthProvider.tsx      # Supabase Auth 上下文
│   ├── AgeVerification.tsx   # 18+ 年龄验证 (全屏覆盖 z-[9999])
│   └── Sidebar.tsx           # 主侧栏导航 (My Girls / Messages / Shop / Profile)
├── hooks/                    # 自定义 Hooks
├── lib/
│   ├── supabase.ts           # Supabase 客户端 (Browser + authedFetch) — 客户端安全
│   ├── supabase-server.ts    # getAuthUser() — 服务端专用 (通过 Coze proxy 连接完整 Schema)
│   └── constants.ts          # 常量 (INTIMACY_LEVELS 等)
├── storage/
│   └── database/
│       ├── supabase-client.ts # Coze Proxy Supabase 客户端 (service_role, 通过 createWrappedFetch 代理)
│       └── shared/schema.ts  # Drizzle ORM 表定义
└── server.ts                 # 自定义服务端入口
```

## 用户流程漏斗
```
游客 → 18+年龄验证 → 公开落地页(Hero+女友库) → 女友详情预览页 → 
登录/注册 → 私人展馆(Gallery) → 创建/定制女友 → 聊天互动 → 
Free限制(50条/日+Lv3上限) → 充值 → 完整功能
```

## API 路由

| 路径 | 方法 | 用途 | 鉴权 |
|------|------|------|------|
| `/api/girlfriends` | GET | 获取用户所有女友 | 需要 |
| `/api/girlfriends` | POST | 创建女友 (含服装/外观/性格) | 需要 |
| `/api/girlfriends` | PATCH | 更新女友/切换review_status | 需要 |
| `/api/girlfriends` | DELETE | 删除女友 | 需要 |
| `/api/girlfriends/public` | GET | 公开女友列表 (review_status=approved) | 否 |
| `/api/girlfriends/public/[slug]` | GET | 公开女友详情 | 否 |
| `/api/outfits` | GET | 服装列表 (支持category/tier筛选) | 否 |
| `/api/admin/review` | GET | 待审核女友列表 | 管理员 |
| `/api/admin/review` | PATCH | 审批/驳回女友 | 管理员 |
| `/api/intimacy` | GET/POST | 亲密值管理 | 需要 |
| `/api/chat/stream` | POST | 流式聊天 (SSE) | 需要 |
| `/api/chat/[id]` | GET | 聊天历史 | 需要 |
| `/api/proactive/check` | POST | 主动问候检查 | 需要 |

## 开发规范

### 包管理
- **仅限 pnpm**，禁止 npm/yarn

### 编码规范
- TypeScript strict 模式
- 禁止隐式 any 和 as any
- 函数参数/返回值必须标注类型
- API 路由使用 `getAuthUser(req)` 获取认证用户 — **从 `@/lib/supabase-server` 导入**
- 所有 API 通过 `x-session` header 传递 Supabase token

### i18n 多语言规范 (CRITICAL)
- 支持 7 种语言：en / zh / ja / ko / es / fr / de
- 翻译源文件：`src/lib/i18n/translations.ts`，类型定义：`src/lib/i18n/types.ts`
- **新增功能必须同步添加翻译 key**：先在 `TranslationKey` 类型加 key，再在 7 个语言块补值
- 国际通用借词（Pro/Genre/Tags/Admin/Shop 等）可保持原文，但必须加入 `scripts/i18n-allowlist.json`
- 工具链（`pnpm run`）：
  - `i18n:check` — 检查所有语言翻译完整度，结合 allowlist 报告真实缺译
  - `i18n:sync` — 将 en 的新 key 自动回填到其它语言（标记 `// TODO`），防遗漏
  - `i18n:extract` — 扫描 `src/` 下硬编码英文，输出候选 key 列表，帮助发现漏翻译
- **开发流程**：新增页面/组件 → 用 `t('key')` 替代硬编码 → `pnpm i18n:check` 验证 → 补翻译 → 提交

### 双 Supabase 架构 (CRITICAL)
项目使用两个不同的 Supabase 实例：

| 用途 | URL | 访问方式 | Key |
|------|-----|----------|-----|
| **Auth** (登录/注册) | `NEXT_PUBLIC_SUPABASE_URL` (public, 可解析) | `createClient` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **数据** (girlfriends/chat/intimacy 等完整 schema) | `COZE_SUPABASE_URL` (Coze proxy, 不可直接解析) | `getSupabaseClient()` via `createWrappedFetch` (Coze 代理) | `COZE_SUPABASE_SERVICE_ROLE_KEY` |

**认证流程**:
1. 用户登录/注册 → PUBLIC Supabase (Auth)
2. 前端通过 `authedFetch()` 自动从 localStorage 读取 token，注入 `x-session` header
3. API 路由调用 `getAuthUser(req)` (位于 `@/lib/supabase-server`)
4. `getAuthUser` 先用 PUBLIC Supabase 验证 token，再返回 Coze Proxy 客户端 (service_role) 用于数据查询

**文件职责**:
- `src/lib/supabase.ts` — 客户端安全 (`createBrowserClient`, `getSessionToken`, `authedFetch`), **不得导入 server-only 模块**
- `src/lib/supabase-server.ts` — 服务端专用 (`getAuthUser`), 导入 `getSupabaseClient` 通过 Coze proxy 连接
- `src/storage/database/supabase-client.ts` — Coze Proxy 客户端工厂, 使用 `createWrappedFetch` 代理 HTTP 请求

### 服装 API (outfits)
- 使用静态数据 (FALLBACK_OUTFITS 数组)，不依赖数据库查询
- 10 套服装, 3 个 tier (free/premium/unlimited)
- 支持 category 和 tier 查询参数筛选

### 审核流程 (Review Workflow)
1. 用户创建女友 → review_status = 'draft' (私有)
2. 用户点击 Publish → review_status = 'pending' + submitted_at
3. 管理员 GET /api/admin/review → 查看待审核列表
4. 管理员 PATCH approve → review_status = 'approved', is_public = true
5. 公开女友出现在 /api/girlfriends/public 和落地页

### UI 规范
- 默认暗色主题（class="dark"）
- shadcn/ui 组件优先
- 英文界面
- 18+ 年龄验证：所有页面访问前检查
- 配色：玫瑰紫主色 #e11d48 → #d946ef, 极深灰背景 #0a0a0f
- 玻璃效果：bg-card/50 backdrop-blur-xl border-border/40