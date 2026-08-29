# 公共资源库 - 快速启动指南

## 🚀 30 秒快速测试

### 1. 执行数据库迁移
```bash
# 在终端运行以下 SQL（或在 Supabase Dashboard 的 SQL 编辑器中粘贴）
```

**SQL 脚本**: `db/migrations/0063_public_assets_table.sql`

```sql
-- 复制粘贴此内容到 Supabase SQL 编辑器
CREATE TABLE IF NOT EXISTS public_assets (...);
-- (完整脚本见 db/migrations/0063_*.sql)
```

### 2. 重启开发服务器
```bash
pnpm dev
# 或手动杀死进程后重新运行
node node_modules/next/dist/bin/next dev -p 5000
```

### 3. 访问测试页面
打开浏览器 → http://localhost:5000/admin/studio?section=public-assets

### 4. 上传测试图片
1. 点击 **"上传资源"**
2. 选择分类（如 `outfit`）
3. 拖拽 1-3 张图片
4. 观察 Toast 提示和网格显示

✅ **成功标志**：
- Toast 显示 "已上传 X 张图片"
- Grid 显示 3 个资源卡片
- Hover 卡片出现预览/删除按钮

---

## 📂 文件清单

| 文件 | 作用 | 行数 |
|------|------|------|
| `src/app/api/storage/upload/route.ts` | 上传 API | 114 |
| `src/app/api/storage/assets/route.ts` | 列表/删除 API | 100 |
| `src/components/admin/PublicAssetsAdminContent.tsx` | 管理界面 | 299 |
| `db/migrations/0063_public_assets_table.sql` | 数据库表 | 56 |
| `src/app/(main)/admin/studio/page.tsx` | 路由集成 | +2 |
| `src/components/admin/AdminUnifiedPresetsContent.tsx` | 服装库增强 | +44 |

**总计**: ~670 行新代码

---

## 🔑 核心功能速查

### 批量上传
```javascript
// 前端调用示例
const formData = new FormData();
files.forEach(f => formData.append('files', f));
formData.append('category', 'outfit');
formData.append('tags', 'preset,clothing');

await fetch('/api/storage/upload', {
  method: 'POST',
  body: formData,
});
```

### 获取资源列表
```javascript
const res = await fetch('/api/storage/assets');
const { assets, categories } = await res.json();
```

### 删除资源
```javascript
await fetch(`/api/storage/assets?id=${assetId}`, {
  method: 'DELETE',
});
```

---

## ⚠️ 常见问题快速解决

### Q: Toast 提示 "Upload failed"
**A**: 检查环境变量
```bash
# .env.local 必须包含
COZE_SUPABASE_URL=https://xxx.supabase.co
COZE_SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
```

### Q: 资源列表为空
**A**: 验证表创建
```sql
SELECT COUNT(*) FROM public_assets;
-- 应该返回 > 0
```

### Q: 权限错误 401/403
**A**: 检查 JWT token
```bash
# 确保已登录并刷新页面
Ctrl+Shift+R
```

---

## 🎯 下一步

1. ✅ **基础功能**：上传/浏览/过滤/删除 ✓ 完成
2. 🔄 **待优化**：图片压缩（客户端处理）
3. 🔄 **待增强**：缩略图自动生成
4. 🔄 **待扩展**：批量操作 UI

---

**预计测试时间**: 5-10 分钟  
**所需权限**: Supabase Dashboard 访问 + Node.js 环境  
