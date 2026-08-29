# 公共资源库 - 本地测试指南

## 🚀 服务器已启动！

**访问地址**: http://localhost:5001  
**状态**: ✅ Next.js 15.5.20 运行中

---

## 📋 测试清单

### ✅ Step 1: 数据库迁移 (请手动执行)

打开 Supabase Dashboard:
```
https://supabase.com/dashboard/project/vvblrkngzuyxeeoslzkl/editor

👉 SQL Editor → New Query
👉 粘贴以下内容并点击 "Run"
```

```sql
-- Create public_assets table for resource management
CREATE TABLE IF NOT EXISTS public_assets (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Thumbnail URLs (JSON format)
  thumbnail_urls JSONB DEFAULT '{}'::jsonb,
  
  -- Indexes for common queries
  INDEX idx_public_assets_category (category),
  INDEX idx_public_assets_uploaded_by (uploaded_by),
  INDEX idx_public_assets_uploaded_at (uploaded_at DESC)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public_assets ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public assets are viewable by all authenticated users"
  ON public_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own assets"
  ON public_assets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Users can delete their own assets"
  ON public_assets FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Admins can manage all assets"
  ON public_assets TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.role IN ('admin','superadmin')))
  WITH CHECK (true);

COMMENT ON TABLE public_assets IS '公共资产管理 - 存储用户上传的图片、模型等资源';
COMMENT ON COLUMN public_assets.category IS '资源分类：general, outfit, pose, scene, character 等';
COMMENT ON COLUMN public_assets.tags IS '标签数组，用于搜索和过滤';
```

✅ **完成后继续下一步**

---

### ✅ Step 2: 访问公共资源库

浏览器打开以下 URL:
```
http://localhost:5001/admin/studio?section=public-assets
```

#### 预期 UI:
- 左侧导航栏显示 "创作工作台 | 预设库 | **公共资源库**"
- 页面标题："公共资产管理"
- 右上角有上传按钮

---

### ✅ Step 3: 测试图片上传功能

#### 测试操作:
1. 点击右上角 **"上传"** 按钮或 **"点击或拖拽图片到这里"** 区域
2. 选择 3-5 张图片 (建议混合 JPG/PNG/WebP 格式)
3. 选择分类 (如 `outfit` 服装类)
4. 等待压缩预览

#### 预期结果:
✅ **压缩统计面板显示**
```
🎉 压缩完成!
2450 KB → 890 KB
节省空间：63.7%
```

✅ Toast 通知显示
```
已上传 3 张图片 (压缩节省 63.7%)
```

✅ 网格展示新图片

---

### ✅ Step 4: 测试分类过滤

#### 操作:
1. 点击分类按钮 `全部` / `general` / `outfit` / `pose` / `scene` / `character`
2. 观察 Grid 列表过滤效果

#### 预期结果:
✅ 只显示对应分类的资源  
✅ 按钮高亮显示当前选中的分类

---

### ✅ Step 5: 测试搜索功能

#### 操作:
1. 在搜索框输入关键词 (如 `dress`, `portrait`)
2. 观察实时过滤效果

#### 预期结果:
✅ 文件名包含关键词的资源被筛选  
✅ Tags 匹配的资源也被筛选  
✅ 支持多关键词模糊搜索

---

### ✅ Step 6: 测试分页功能

#### 前提条件:
先上传至少 25 张图片以触发分页

#### 操作:
1. 滚动到页面底部
2. 查看分页组件

#### 预期 UI:
```
← 上一页  [第 1/2 页 · 共 25 个资源]  下一页 →
```

#### 测试步骤:
1. 点击 "下一页" → 切换到第 2 页
2. 再次点击查看每页只渲染 20 个项目
3. 第一页时 "上一页" 应禁用

✅ **分页逻辑验证通过**

---

### ✅ Step 7: 测试缩略图生成

#### 手动触发 (可选):

##### 方法 A: API 调用
```javascript
// 打开浏览器 DevTools Console
fetch('http://localhost:5001/api/storage/thumbnails/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session': localStorage.getItem('sb-vvblrkngzuyxeeoslzkl-auth-token')
  },
  body: JSON.stringify({
    assetIds: ['asset_123'], // 替换为你的资产 ID
    sizes: ['thumb', 'medium', 'large']
  })
})
.then(r => r.json())
.then(console.log);
```

##### 方法 B: 自动触发 (上传后)
上传新图片时，系统会自动生成缩略图

#### 验证方式:
```sql
-- 在 Supabase SQL Editor 执行
SELECT id, filename, thumbnail_urls 
FROM public_assets 
ORDER BY uploaded_at DESC 
LIMIT 5;
```

✅ **预期结果**: `thumbnail_urls` 字段包含三规格 URL
```json
{
  "thumb": "https://xxx.supabase.co/storage/v1/object/public/assets/thumb.jpg",
  "medium": "https://xxx.supabase.co/storage/v1/object/public/assets/medium.jpg",
  "large": "https://xxx.supabase.co/storage/v1/object/public/assets/large.jpg"
}
```

---

### ✅ Step 8: 性能指标验证

#### 压缩比测试:
使用 Chrome DevTools → Network 面板观察上传流量

| 原图总大小 | WebP 压缩后 | 节省比例 |
|----------|-----------|---------|
| 5MB | ~1.2MB | **76%** ↓ |
| 10MB | ~2.5MB | **75%** ↓ |

✅ **验证标准**: 实际带宽占用 < 原图的 30%

#### 加载速度测试:
使用 Lighthouse 测试公版页面

| 指标 | 优化前 | 目标值 |
|------|-------|--------|
| First Contentful Paint | 4.2s | **< 1.5s** |
| Time to Interactive | 6.8s | **< 2.5s** |
| Total Bundle Size | 2.1MB | **< 1.0MB** |

---

## 🐛 常见问题排查

### ❌ Issue 1: 登录失败 "Invalid API key"

**原因**: JWT token 损坏  
**解决方法**:
```bash
# 清理本地缓存
localStorage.clear()

# 重新登录
```

或检查 `.env.local`:
```bash
SUPABASE_ANON_KEY=<valid-key-from-dashboard>
```

---

### ❌ Issue 2: Sharp 依赖报错

**错误**: `Cannot find module 'sharp'`  
**解决方法**:
```bash
pnpm add sharp
```

**验证**:
```bash
node -e "console.log(require('sharp').libvipsVersion)"
```

---

### ❌ Issue 3: 数据库表不存在

**错误**: `relation "public_assets" does not exist`  
**解决方法**:
```sql
-- 重新运行迁移脚本
-- db/migrations/0063_public_assets_table.sql
```

---

### ❌ Issue 4: CORS 错误

**错误**: `Access-Control-Allow-Origin` 相关  
**解决方法**:
检查 `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Credentials', value: 'true' },
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
      { key: 'Access-Control-Allow-Headers', value: 'Sec-XRSAPISignature, X-CSRF-Token, Authorization, Content-Type, Accept, Origin, Cache-Control' }
    ]
  }]
}
```

---

## 📊 测试结果记录

请在完成所有测试后填写此表格:

| 测试项 | 预期 | 实际结果 | 是否通过 | 备注 |
|--------|-----|---------|---------|------|
| 数据库迁移 | 表创建成功 | | □ | |
| 页面访问 | 正常加载 | | □ | |
| 图片压缩 | WebP 转换 + 统计显示 | | □ | |
| 分类过滤 | 正确过滤 | | □ | |
| 搜索功能 | 文件名/tags 匹配 | | □ | |
| 分页导航 | 每页 20 条 | | □ | |
| 缩略图生成 | JSONB 字段填充 | | □ | |
| 性能指标 | 压缩率≥60% | | □ | |
| Toast 通知 | 成功提示显示 | | □ | |
| 错误处理 | 友好提示 | | □ | |

---

## 🚀 下一步：Vercel 部署

完成所有本地测试后，按以下步骤部署生产环境:

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录账号
vercel login

# 3. 部署到生产环境
vercel --prod

# 4. 或部署到预发布环境
vercel --deploy
```

**详细部署文档**: [`docs/CDN-CONFIGURATION-GUIDE.md`](./CDN-CONFIGURATION-GUIDE.md)

---

**测试完成时间**: ___________  
**测试人员**: ___________  
**备注**: _________________________
