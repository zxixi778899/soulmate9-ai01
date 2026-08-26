# 管理员权限完全恢复指南

## 📋 问题诊断

你提到之前制作的管理员模块全部消失了。根据代码分析，这个问题可能有以下几种原因：

1. **数据库中的 role 字段被重置或丢失**
2. **Vercel 环境变量 ALLOWED_ADMIN_EMAILS 未配置**
3. **Supabase 数据库连接问题**
4. **Admin UI 代码变更导致路由改变**

## ✅ 解决方案

### 方案 A: 直接在 Supabase 数据库中设置（推荐）

#### 步骤 1: 登录 Supabase Dashboard
1. 访问 https://supabase.com/dashboard
2. 选择你的项目
3. 进入 SQL Editor

#### 步骤 2: 运行以下 SQL 语句

```sql
-- 首先检查当前状态
SELECT user_id, email, role, membership_tier, credits_remaining 
FROM profiles 
WHERE email = 'admin888@oxmate.com';

-- 如果没有记录，创建一条
INSERT INTO profiles (user_id, email, role, membership_tier, credits_remaining, created_at, updated_at)
SELECT 
  u.id as user_id,
  u.email as email,
  'admin' as role,  -- ← 关键：赋予 admin 权限
  'free' as membership_tier,
  50 as credits_remaining,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.user_id
WHERE u.email = 'admin888@oxmate.com'
  AND p.id IS NULL;

-- 如果有记录但 role 不是 admin，更新它
UPDATE profiles 
SET 
  role = 'admin',
  membership_tier = 'free',
  credits_remaining = 50,
  updated_at = NOW()
WHERE email = 'admin888@oxmate.com';
```

#### 步骤 3: 验证设置
再次运行查询确认：
```sql
SELECT user_id, email, role, membership_tier FROM profiles WHERE email = 'admin888@oxmate.com';
```

你应该看到 `role` 字段为 `admin` 或 `superadmin`。

---

### 方案 B: 使用 Vercel 邮箱白名单（备选方案）

如果你的项目使用邮箱白名单机制作为管理员入口：

1. **登录 Vercel Dashboard**
   - 访问 https://vercel.com/dashboard
   - 选择你的项目

2. **添加环境变量**
   ```bash
   ALLOWED_ADMIN_EMAILS=admin888@oxmate.com
   ```

3. **Redeploy 部署**
   - 点击 Settings → Environment Variables
   - 确保变量已添加并保存
   - 触发一次重新部署（Redeploy）

---

### 方案 C: 使用已有的管理端 API

我们已经创建了完整的 Admin CRUD 系统，包括：

✅ **ComfyUI 控制台**: `/api/admin/comfy`  
✅ **自定义预设管理**: `/api/admin/gen-custom-presets`  
✅ **角色检查 API**: `/api/admin/check-role`  

这些接口都需要通过 `requireAdmin` 鉴权，会自动检查：
1. `profiles.role` 字段是否为 `admin` 或 `superadmin`
2. 或者 `ALLOWED_ADMIN_EMAILS` 白名单中包含你的邮箱

---

## 🔧 管理员模块列表

根据你的代码库，目前存在以下管理员功能模块：

| 路径 | 说明 | 权限要求 |
|------|------|---------|
| `/admin/comfy` | ComfyUI 操作台 | admin/superadmin |
| `/admin/gen-presets/pose` | 姿势预览卡片管理 | admin |
| `/admin/gen-presets/outfit` | 服装预览卡片管理 | admin |
| `/admin/gen-presets/scene` | 场景预览卡片管理 | admin |

这些都是基于我们刚刚添加的**编辑功能**。

---

## 🎯 快速测试流程

### 1️⃣ 本地测试（推荐先用这个）

```bash
# 启动开发服务器
pnpm dev

# 访问管理端
# 1. 登录你的账号
# 2. 访问 http://localhost:3000/admin
# 3. 如果提示无权限，检查数据库中的 role 字段
```

### 2️⃣ 生产环境测试

```bash
# 访问 https://yourdomain.com/admin
# 应该能看到左侧导航栏包括：
# - Dashboard（仪表盘）
# - Gen Presets（生成预设）
#   - Pose（姿势）
#   - Outfit（服装）
#   - Scene（场景）
# - Comfy Console（ComfyUI 控制台）
```

---

## 🐛 常见问题排查

### Q1: 显示"未找到用户档案（profiles）"
**A**: 你需要先登录一次，然后运行：
```sql
INSERT INTO profiles (user_id, email, role, membership_tier, created_at, updated_at)
SELECT id, email, 'user', 'free', NOW(), NOW()
FROM auth.users
WHERE email = 'admin888@oxmate.com'
AND NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.users.id);
```

### Q2: 显示"当前账号无管理员权限（role=user）"
**A**: 这是最正常的情况，按上面的 SQL 将 `role` 改为 `'admin'`

### Q3: 所有管理菜单都消失了
**A**: 检查是否有新的布局组件改变了 admin layout
```bash
# 查看 admin/layout.tsx 是否正确渲染侧边栏
ls src/app/(main)/admin/
```

### Q4: TypeScript 编译错误
**A**: 确保类型定义正确
```bash
pnpm ts-check
pnpm lint:build
```

---

## 📊 权限层级说明

```typescript
// src/lib/require-admin.ts
const ROLE_LEVEL = {
  reviewer: 1,  // 仅审核女友内容
  admin: 2,     // 管理 gen presets + comfy console
  superadmin: 3 // 超级管理员，包含所有权限
};
```

- **reviewer**: 只能访问审核相关功能
- **admin**: 可以访问所有管理功能（包括我们刚添加的编辑功能）
- **superadmin**: 最高权限，包括生产环境特殊操作

---

## 🚀 下一步操作

请按顺序执行以下步骤：

1. ✅ **在 Supabase 中运行 SQL 设置 role='admin'**
2. ✅ **登录账号**
3. ✅ **访问 /admin 页面**
4. ✅ **检查左侧导航是否完整显示**
5. ✅ **点击 "Gen Presets" 查看姿势/服装/场景编辑器**
6. ✅ **尝试编辑任意预设，保存后刷新验证**

---

## 📝 相关文件清单

- `src/app/api/admin/check-role/route.ts` - 角色检查 API
- `src/lib/require-admin.ts` - 管理员鉴权逻辑
- `src/app/(main)/admin/layout.tsx` - Admin Layout 侧边栏
- `src/lib/admin/nav.ts` - Admin Navigation 定义
- `src/components/generate-workbench/PresetSlotPicker.tsx` - 编辑 UI
- `src/components/generate-workbench/GenerateWorkbench.tsx` - 父级集成
- `src/lib/gen-custom-presets-store.ts` - Store 数据层
- `src/app/api/admin/gen-custom-presets/route.ts` - CRUD API

---

## 💡 额外建议

### 1. 启用双重认证保护
建议在 Supabase Auth 中启用 MFA：
```
Settings → Authentication → Multi-Factor Auth
```

### 2. 定期审计日志
监控哪些管理员在执行敏感操作：
```typescript
logger.info('[admin] action', { userId, action, target });
```

### 3. Rate Limiting
防止暴力破解和滥用（已经在代码中实现）：
```typescript
const ADMIN_WRITE_LIMIT = { maxRequests: 300, windowMs: 60 * 60 * 1000 };
```

---

## ✅ 预期结果

完成以上步骤后，你应该能够：

- ✅ 成功登录管理后台
- ✅ 看到完整的左侧导航栏
- ✅ 点击姿势/服装/场景预设进行**编辑**
- ✅ 保存修改后立即生效
- ✅ 删除不需要的自定义预设

如果仍有问题，请提供具体的错误信息截图或报错文本。
