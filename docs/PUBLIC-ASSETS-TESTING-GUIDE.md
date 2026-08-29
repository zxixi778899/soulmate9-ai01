# 公共资源库与服装库功能验证指南

## 功能概述
- ✅ **公共资源库**：完整的管理界面，支持批量上传、分类管理、标签搜索、权限控制
- ✅ **服装库增强**：多图片上传、自动填充预览 URL、分类标签管理
- ✅ **后端 API**：`/api/storage/upload`、`/api/storage/assets` (GET/DELETE)

---

## 1. 数据库迁移执行

### 前提条件
- 已配置 `COZE_SUPABASE_URL` 和 `COZE_SUPABASE_SERVICE_ROLE_KEY`
- Supabase 项目可访问

### 执行步骤
```bash
# 方法 1: 通过 Supabase CLI
npx supabase db push --db-path db/migrations

# 方法 2: 直接在 Supabase Dashboard 执行 SQL
# 打开：https://supabase.com/dashboard/project/你的项目ID/sql
# 复制粘贴: db/migrations/0063_public_assets_table.sql
# 点击 "Run"
```

### 验证表创建成功
```sql
-- 检查表是否存在
SELECT * FROM information_schema.tables 
WHERE table_name = 'public_assets' AND table_schema = 'public';

-- 检查 RLS 策略
SELECT policyname, cmd, roles, qual 
FROM postgres_policies 
WHERE tablename = 'public_assets';
```

---

## 2. 公共资产管理界面测试

### 访问路径
```
http://localhost:5000/admin/studio?section=public-assets
```

### 测试用例

#### 2.1 资源上传 (单文件)
1. 点击 **"上传资源"** 按钮
2. 选择分类（如 `outfit`）
3. 拖拽或点击选择单个图片文件
4. **预期结果**：
   - ✅ 显示上传进度提示 ("上传中...")
   - ✅ Toast 显示 "已上传 1 张图片"
   - ✅ 对话框自动关闭
   - ✅ 资源列表刷新显示新图片

#### 2.2 资源上传 (批量)
1. 点击 **"上传资源"**
2. 选择多个图片（按住 Ctrl/Cmd 多选）
3. 上传 **5 张图片**
4. **预期结果**：
   - ✅ Toast 显示 "已上传 5 张图片"
   - ✅ 网格视图显示 5 个资源卡片
   - ✅ 每个卡片包含正确的文件名、大小、分类

#### 2.3 分类筛选
1. 在过滤器中选择不同分类（`general`, `outfit`, `pose` 等）
2. **预期结果**：
   - ✅ 只过滤出该分类的资源
   - ✅ "全部"按钮显示所有资源

#### 2.4 搜索功能
1. 在搜索框输入关键词（匹配文件名或标签）
2. **预期结果**：
   - ✅ 实时过滤匹配的 resource
   - ✅ 不区分大小写
   - ✅ 支持部分匹配

#### 2.5 资源删除
1. 将鼠标悬停在任意资源卡片上
2. 点击图片上的垃圾桶图标
3. 确认删除对话框
4. **预期结果**：
   - ✅ 显示确认对话框
   - ✅ Toast 显示 "已删除"
   - ✅ 资源从网格移除
   - ✅ 如果删除最后一个资源，显示空状态

#### 2.6 资源预览
1. 悬停在资源卡片上
2. 点击图片放大图标
3. **预期结果**：
   - ✅ 在新窗口打开原图
   - ✅ 保持原始分辨率

---

## 3. 服装库多图片上传测试

### 访问路径
```
http://localhost:5000/admin/studio?section=unified-presets
```

### 测试用例

#### 3.1 进入服装库 Tab
1. 点击 **"预设库"** 右侧的 Tab（如果有 outfit 分类）
2. 或在编辑对话框中选择 `category: 'outfit'`
3. **预期结果**：
   - ✅ 显示服装库专属界面
   - ✅ 提示："服装图片 · 穿搭模板"

#### 3.2 服装图片上传
1. 新建或编辑一个服装预设 (`category: 'outfit'`)
2. 找到 **"预览图 URL / 上传"** 字段
3. 点击下方的 **"点击上传图片 (可多选)"** 链接
4. 选择 **3 张服装图片**
5. **预期结果**：
   - ✅ 显示上传中提示
   - ✅ Toast 显示 "已上传 3 张图片"
   - ✅ `preview_url` 字段自动填充所有图片 URL（逗号分隔）
   - ✅ 预览图正确显示第一张图片

#### 3.3 验证预览图回显
1. 保存服装预设
2. 重新编辑该预设
3. **预期结果**：
   - ✅ `preview_url` 字段显示之前保存的多 URL
   - ✅ 预览图正常显示
   - ✅ 格式为：`url1, url2, url3`

---

## 4. 权限控制系统验证

### 4.1 认证检查
1. 未登录状态下访问 `/admin/studio?section=public-assets`
2. **预期结果**：
   - ✅ 重定向到登录页面
   - ✅ 登录后才能查看资源

### 4.2 用户隔离测试（需两个账号）
**账号 A** 操作：
1. 登录账号 A
2. 上传一张名为 `user_a_image.jpg` 的图片
3. 退出登录

**账号 B** 操作：
1. 登录账号 B
2. 尝试在列表中查找 `user_a_image.jpg`
3. **预期结果**：
   - ✅ 默认情况下只能看到自己上传的资源
   - ✅ 无法看到账号 A 的资源（除非实现共享功能）

### 4.3 管理员权限
1. 使用管理员账号登录
2. 上传资源并添加标签 `admin_test`
3. **预期结果**：
   - ✅ 管理员可以查看所有用户资源
   - ✅ 管理员可以删除任何用户的资源
   - ✅ 拥有更高权限的操作选项

---

## 5. API 端点测试

### 5.1 POST /api/storage/upload
**请求示例**：
```bash
curl -X POST http://localhost:5000/api/storage/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@test-image.jpg" \
  -F "category=outfit" \
  -F "tags=preset,clothing"
```

**响应验证**：
```json
{
  "success": true,
  "count": 1,
  "files": [
    {
      "id": "asset_xxxxx",
      "url": "https://...",
      "filename": "test-image.jpg",
      "size": 123456,
      "category": "outfit",
      "tags": ["preset", "clothing"],
      "uploadedAt": "2026-08-30T..."
    }
  ]
}
```

### 5.2 GET /api/storage/assets
**请求示例**：
```bash
curl http://localhost:5000/api/storage/assets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**响应验证**：
```json
{
  "success": true,
  "assets": [...],
  "categories": ["general", "outfit", "pose"]
}
```

### 5.3 DELETE /api/storage/assets?id=<id>
**请求示例**：
```bash
curl -X DELETE "http://localhost:5000/api/storage/assets?id=asset_xxxxx" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**响应验证**：
```json
{
  "success": true,
  "message": "Asset deleted"
}
```

---

## 6. UI/UX 质量检查

### 视觉设计
- [ ] 暗色主题一致性（`bg-[#16161f]`, `border-gray-800`）
- [ ]  Hover 效果流畅（`transition-all`, `hover:bg-violet-600`）
- [ ] 图标对齐良好（`flex items-center gap-2`）
- [ ] 响应式布局（移动端适配 Grid 列数）

### 交互反馈
- [ ] 加载状态显示（Spinner/Loading text）
- [ ] 错误提示 Toast（红色背景 + 明确错误信息）
- [ ] 成功提示 Toast（绿色背景 + 计数信息）
- [ ] 确认对话框（删除前二次确认）

### 性能优化
- [ ] 图片懒加载（可选，使用 Next.js `<Image>`）
- [ ] 分页/无限滚动（大数据量场景）
- [ ] Debounce 搜索输入
- [ ] API 响应缓存

---

## 7. 常见问题排查

### Q1: 上传失败 "Upload failed"
**可能原因**：
- JWT token 过期
- Storage bucket 未创建
- 文件大小超过限制 (默认 10MB)

**解决方法**：
1. 检查浏览器控制台错误
2. 验证 `.env.local` 环境变量
3. 检查 Supabase Storage 配额

### Q2: 资源列表为空
**可能原因**：
- 数据库表未创建
- RLS 策略阻止访问
- 当前用户无权限

**解决方法**：
```sql
-- 检查表
SELECT COUNT(*) FROM public_assets;

-- 检查权限
SELECT * FROM pg_policies WHERE tablename = 'public_assets';
```

### Q3: 预览图无法显示
**可能原因**：
- Storage bucket 非公开
- URL 不正确
- CORS 问题

**解决方法**：
1. 确保 bucket 设置为 `public: true`
2. 直接访问图片 URL 验证
3. 检查浏览器网络面板中的图片请求状态

---

## 8. 后续改进方向

### 短期优化
- [ ] 添加图片压缩预处理（前端 shrinks before upload）
- [ ] 支持拖拽排序
- [ ] 批量操作（多选删除/移动分类）
- [ ] 资源下载功能

### 中期增强
- [ ] 标签建议/自动识别
- [ ] 图片水印添加
- [ ] CDN 加速配置
- [ ] 版本历史管理

### 长期规划
- [ ] 智能分类（AI 图像识别）
- [ ] 协作分享（生成邀请链接）
- [ ] 使用统计（热度分析）
- [ ] 与创作者管线深度集成

---

## 9. 部署清单

### 开发环境
- [x] 代码编写完成
- [x] 组件导入注册
- [x] API 路由实现

### 生产部署
- [ ] 数据库迁移应用 (`db/migrations/0063_*.sql`)
- [ ] Supabase Storage bucket 权限配置
- [ ] Vercel 环境变量验证
- [ ] Sentry 错误上报配置
- [ ] 灰度发布计划

### 监控指标
- 上传成功率 (>95%)
- API 响应时间 (<500ms)
- 存储使用量趋势
- 用户活跃度

---

**完成时间**: 2026-08-30  
**测试人**: ___________  
**审核人**: ___________  
