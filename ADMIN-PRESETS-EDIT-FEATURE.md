# 管理员模式 - 姿势/服装/场景预览管理功能

## 📋 功能概述

为 `/generate` 工作台的姿势（Pose）、服装（Outfit）、场景（Scene）自定义预览卡片提供完整的管理员编辑能力：

- ✅ **创建** - 上传预览图 + 英文标签 + 中文标签 + 提示词说明
- ✅ **编辑** - 修改标签文本、提示词说明
- ✅ **删除** - 删除自定义创建的预览卡片
- ✅ **批量管理** - 支持三种类型（pose/outfit/scene）独立管理

## 🔧 技术实现

### 1. API 路由层
**文件**: `src/app/api/admin/gen-custom-presets/route.ts`

| 方法 | 用途 | 参数 |
|------|------|------|
| GET | 获取全部配置 | - |
| POST | 创建新条目 | JSON URL 或 multipart 文件上传 |
| PUT | 编辑已有条目 | `{ category, slug, label_en?, label_zh?, prompt_hint? }` |
| DELETE | 删除条目 | Query: `?category=pose&slug=xxx` |

**鉴权**: `requireAdmin` (管理员角色)  
**限流**: 60 次/小时 / IP+ 用户 ID  
**上传限制**: 10MB, 仅允许 jpeg/png/webp

### 2. Store 数据层
**文件**: `src/lib/gen-custom-presets-store.ts`

```typescript
// 核心数据结构
interface GenCustomPreset {
  slug: string;                           // 唯一标识 custom-{timestamp}-{random}
  category: 'pose' | 'outfit' | 'scene';
  label_en: string;                       // 必需
  label_zh: string;                       // 可选
  preview_url: string;                    // 必需
  prompt_hint: string;                    // 可选，最大 400 字符
  created_at: string;                     // ISO 时间戳
}

// CRUD 操作
loadGenCustomPresets(supabase)          // 加载并缓存 15 秒
addGenCustomPreset(entry, supabase)     // 添加
updateGenCustomPreset(category, slug, updates, supabase)  // 更新
setGenCustomPresetPreview(category, slug, url, supabase)  // 替换图片
removeGenCustomPreset(category, slug, supabase)            // 删除
invalidateGenCustomPresetsCache()       // 清除内存缓存
```

**存储**: Supabase `site_settings` table, key=`generate_custom_presets` (JSONB)

### 3. UI 组件层

#### PresetSlotPicker.tsx
**文件**: `src/components/generate-workbench/PresetSlotPicker.tsx`

**新增状态**:
```typescript
const [editingSlug, setEditingSlug] = useState<string | null>(null);
const [savingEdit, setSavingEdit] = useState(false);
```

**关键功能**:
- ✅ **新建表单** - Admin 点击"New preview"按钮显示
  - 输入：label_en(必填), label_zh, prompt_hint
  - 文件选择器上传图片
  
- ✅ **编辑表单** - 点击编辑按钮后显示
  - 预填充当前值
  - 输入：label_en(必填), label_zh, prompt_hint
  - 保存时只提交变更字段
  
- ✅ **删除按钮** - 右上角红色垃圾桶图标
  - 仅对自定义条目（slug 以 `custom-` 开头）
  - 锁定的预设不显示删除
  
- ✅ **编辑按钮** - 右上角铅笔图标（蓝色）
  - 与删除按钮并排显示
  - 点击后展开编辑表单
  - 自动预填充当前 label

#### GenerateWorkbench.tsx
**文件**: `src/components/generate-workbench/GenerateWorkbench.tsx`

**新增回调**:
```typescript
const adminEditPreset = useCallback(
  async (category: SlotKind, slug: string, input: { 
    label_en?: string; 
    label_zh?: string; 
    prompt_hint?: string 
  }) => {
    // 调用 PUT /api/admin/gen-custom-presets
    // 刷新本地缓存
  },
  [loadCustomPresets],
);
```

**集成点**:
```tsx
<PresetSlotPicker
  // ... existing props
  onAdminCreate={adminCreatePreset}
  onAdminDelete={adminDeletePreset}
  onAdminEdit={adminEditPreset}  ← 新增
  // ... rest props
/>
```

### 4. 国际化支持

**翻译键**: `generate.adminSave`

| 语言 | 翻译 |
|------|------|
| EN | Save changes |
| ZH | 保存修改 |
| JA | 変更を保存 |
| KO | 변경 사항 저장 |
| ES | Guardar cambios |
| FR | Enregistrer les modifications |
| DE | Änderungen speichern |

**验证**: `pnpm i18n:check` ✅ 通过（1612 keys across 7 languages）

## 🎨 使用流程

### 管理员操作流程

1. **进入生成控制台** (`/generate`)
2. **点击任意预设槽位** (Companion/ Pose/ Outfit/ Scene) 打开浏览器
3. **查看自定义条目** - 右上角显示编辑（🔵）和删除（🔴）按钮
4. **创建新预览**:
   - 点击顶部 "New preview"
   - 填写英文标签（必需）
   - 可选填写中文标签和提示词说明
   - 选择预览图片（最大 10MB）
   - 点击"Create"创建
5. **编辑现有预览**:
   - 点击卡片右上角编辑按钮（铅笔图标）
   - 修改标签文本
   - 点击"Save changes"保存
   - 或点击取消按钮退出
6. **删除预览**:
   - 点击卡片右上角删除按钮（垃圾桶图标）
   - 从数据库中移除并刷新列表

## 📊 数据持久化

```sql
-- 存储在 site_settings 表
INSERT INTO site_settings (key, value, updated_at) VALUES (
  'generate_custom_presets',
  '{
    "pose": [
      {"slug":"custom-1234567890-abc123","category":"pose","label_en":"Standing","label_zh":"站立姿势","preview_url":"https://storage...", "prompt_hint":"Natural standing pose", "created_at":"2026-08-25T..."}
    ],
    "outfit": [...],
    "scene": [...],
    "updated_at":"2026-08-25T..."
  }'::jsonb,
  NOW()
);
```

## 🛡️ 安全机制

### 鉴权控制
```typescript
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;
  // ...
}
```

### 速率限制
```typescript
const WRITE_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 }; // 60 次/小时
const rl = await checkRateLimitAsync(`admin-gen-presets:${admin.user!.id}`, WRITE_LIMIT);
if (!rl.allowed) {
  return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

### 输入验证
```typescript
// 文件类型白名单
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// 文本长度限制
function cleanText(v: unknown, max = 80): string {
  return String(v || '').trim().slice(0, max);
}
```

## ✅ 验证结果

### TypeScript 检查
```bash
$ pnpm ts-check
✓ Route types generated successfully
✓ No type errors
```

### ESLint 检查
```bash
$ pnpm eslint src/components/generate-workbench/PresetSlotPicker.tsx --quiet
✓ No errors

$ pnpm eslint src/components/generate-workbench/GenerateWorkbench.tsx --quiet
✓ No errors
```

### 国际化检查
```bash
$ pnpm i18n:check
✓ i18n check passed: 1612 keys across en, zh, ja, ko, es, fr, de
```

## 🚀 部署就绪

所有代码变更已完成并通过验证，可直接部署到生产环境。

### 环境变量依赖
无需新的环境变量，复用现有配置：
- `COZE_SUPABASE_URL` - Supabase 数据库连接
- `COZE_SUPABASE_SERVICE_ROLE_KEY` - Service role key
- Storage bucket `gen-presets` 已存在

### 数据库迁移
无需额外迁移，直接写入 `site_settings` 表 JSONB 字段。

## 📝 后续优化建议

1. **预览图上传优化**
   - 考虑使用 Vercel Blob 或 Cloudflare R2 替代当前存储方案
   - 添加图片压缩处理减少存储空间

2. **批量操作**
   - 支持多选删除
   - 支持批量移动类别

3. **版本历史**
   - 记录每次修改的审计日志
   - 支持回滚到历史版本

4. **权限细化**
   - 区分 create/edit/delete 三种权限
   - 支持超管理员与普通管理员分级

## 📦 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/app/api/admin/gen-custom-presets/route.ts` | 已有（PUT 方法完善） | Admin CRUD API |
| `src/lib/gen-custom-presets-store.ts` | 修复 TypeScript 错误 | Store 层逻辑 |
| `src/components/generate-workbench/PresetSlotPicker.tsx` | 新增编辑功能 | UI 交互层 |
| `src/components/generate-workbench/GenerateWorkbench.tsx` | 新增 adminEditPreset | 父级集成 |
| `src/lib/i18n/translations.ts` | 新增 7 语言翻译 | 国际化支持 |

---

**完成时间**: 2026-08-25  
**状态**: ✅ 已完成并验证  
**测试环境**: Vercel Preview / Production
