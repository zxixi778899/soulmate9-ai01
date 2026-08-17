# Oxmate AI — A 站（广告承接展示页）

FB/Meta 投流漏斗的 **A 站**：纯静态、零依赖、零构建，单目录即可部署到任意 CDN/静态托管（Vercel / Cloudflare Pages / Netlify），适合域名轮换策略。

## 定位

- **角色**：接广告审核与泛流量，SFW 炫酷展示，CTA 全部导流 B 站（oxmate-ai.com）
- **素材合规**：本页文案全部 SFW（陪伴/记忆/自定义向），不含露骨内容，符合 AB 站漏斗式方案
- **禁止**：不要在本页添加 NSFW 文案或图片——A 站是审核面

## 目录结构

```
a-site/
├── index.html          # 单页（所有区块）
├── assets/
│   ├── styles.css      # 视觉（星空暗色 + 玫瑰紫渐变 #e11d48→#d946ef）
│   └── main.js         # 星空/聊天演示/滚动动效/CTA 归因跳转
└── README.md
```

## 本地预览

```powershell
# 任选其一
pnpm dlx serve a-site -l 4300
# 或
python -m http.server 4300 --directory a-site
```

## 配置（全部在 `assets/main.js` 顶部 CONFIG）

| 字段 | 说明 |
|------|------|
| `bSiteUrl` / `bSitePath` | B 站跳转目标，默认 `https://www.oxmate-ai.com/landing/meta` |
| `channel` / `medium` | 归因标识，写入跳转 URL 的 `src` / `medium` |
| `pixelId` | Meta Pixel ID（Events Manager），留 `YOUR_META_PIXEL_ID` 占位则不加载 Pixel |
| `capiEndpoint` | B 站 CAPI 代理端点 `/api/meta/capi`（token 只存 B 站服务端） |
| `capiKey` | 与 B 站 env `META_CAPI_SHARED_KEY` 一致的共享密钥 |

## 归因与事件链路

```
广告 → A站?utm_*&fbclid
  → Pixel init + PageView（浏览器端）
  → 生成/复用 subid（sessionStorage，一次访问唯一）
  → CTA 点击：
      ① fbq('track','Lead',{placement,subid},{eventID})   —— Pixel
      ② sendBeacon → B站 /api/meta/capi（同 eventID → Meta 去重）—— CAPI
  → 跳转 B站 /landing/meta?src=meta&medium=astar&placement=hero&subid=xxx&utm_*&fbclid
  → B站 middleware 写 lead_src Cookie → 注册时落库 profiles.lead_source
      + 服务端 CAPI CompleteRegistration
```

归因查询：Supabase `profiles` 表 `lead_source` jsonb 列（含 subid/placement/utm），可直接按 A 站点位（hero / chat_demo / girl_luna / final…）统计转化。

## 动效清单

- Canvas 星空（闪烁 + 鼠标视差 + 流星）
- 渐变流光标题 / 呼吸光晕 CTA / 漂浮手机聊天演示（自动循环对话 + 打字机）
- 跑马灯、卡片 spotlight 跟随、角色卡 3D tilt、滚动显现、数字滚动计数

## 部署与域名轮换

1. 新域名（独立 Cloudflare 账户）→ Pages/静态托管，直接把本目录发布
2. `index.html` 已加 `<meta name="robots" content="noindex">`，避免 A 站被搜索引擎收录留下痕迹
3. 头像/Logo 直链 B 站（`oxmate-ai.com/avatars/*`）；如需彻底隔离，把 4 张头像与 mark 图拷贝到 `assets/img/` 并替换 src
4. Privacy/Terms 链接目前是占位（`onclick="return false"`），**正式投流前必须替换为真实政策页**（Meta 审核要求）

## 投流前检查清单

- [ ] 替换真实 Privacy Policy / Terms 链接
- [ ] 统计数字（companions created 等）改为真实可举证数值，否则 FTC 风险
- [ ] CONFIG 填入真实 `pixelId` / `capiKey`，B 站配齐 `META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` / `META_CAPI_SHARED_KEY`
- [ ] B 站已执行 `db/migrations/0043_lead_source.sql`（profiles.lead_source 列）
