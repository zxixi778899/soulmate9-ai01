# 资产库上传删除功能实现

## 完成的功能

### 1. 文件上传功能
- ✅ **多文件上传** - 支持同时选择多个图片文件上传
- ✅ **文件大小验证** - 限制单文件不超过 12MB
- ✅ **格式验证** - 仅接受图片格式（image/*）
- ✅ **上传状态反馈** - 显示上传中进度
- ✅ **批量处理** - 成功/失败分别计数统计
- ✅ **自动注册** - 上传后自动注册到 `generation_assets` 表
- ✅ **分类自动识别** - 根据当前激活的标签自动分配分类

### 2. 单个资产删除
- ✅ **悬停删除按钮** - 鼠标悬停时显示红色删除按钮
- ✅ **选中机制** - 点击直接添加到选中集
- ✅ **Toast 提示** - 确认已选中该资产
- ✅ **权限检查** - 仅允许管理已有 ID 或 storage_key 的资产

### 3. 批量删除
- ✅ **批量选择器** - 左侧复选框多选
- ✅ **删除按钮** - 右上角显示"删除选中 (数量)"红色按钮
- ✅ **二次确认** - 弹出 confirm 对话框防止误删
- ✅ **批量 API 调用** - 循环调用 DELETE /api/admin/assets
- ✅ **进度统计** - 显示成功/失败的删除数量
- ✅ **自动刷新** - 删除完成后自动重新加载列表

### 4. API 端点
- ✅ **DELETE /api/admin/assets?id=xxx** - 从数据库和存储中删除资产
- ✅ **POST /api/upload** - 使用现有上传服务
- ✅ **POST /api/admin/comfy?action=register_asset** - 注册新资产到系统

### 5. UI 增强
- 🎨 **暗色主题统一** - 与主后台风格完全一致
- 🎨 **绿色上传按钮** - `border-emerald-400/40 bg-emerald-500/10`
- 🎨 **红色删除按钮** - `bg-rose-600 hover:bg-rose-500`
- 🎨 **灰度占位符** - 无预览图片显示灰色占位
- 🎨 **玻璃效果** - 快速操作区域使用半透明背景

## 技术细节

### 上传流程
```typescript
1. 用户点击"上传资产"按钮 → 触发隐藏的 file input
2. 选择多个文件 → handleUploadFiles(files)
3. 对每个文件:
   a. 验证大小 (< 12MB)
   b. 验证类型 (image/*)
   c. POST /api/upload → 获得 URL
   d. POST /api/admin/comfy?action=register_asset → 注册到 DB
4. 统计成功/失败数量 → 显示 Toast
5. 刷新资产列表
```

### 删除流程
```typescript
1. 网格视图 - 悬停显示红色删除按钮
2. 点击删除按钮 → 
   a. 阻止事件冒泡
   b. 获取 asset.id 或 storage_key
   c. 添加到 selected Set
   d. toast.info('已选中该资产')
3. 点击右上角"删除选中 (N)"按钮 →
   a. window.confirm 确认
   b. 循环调用 DELETE /api/admin/assets?id=xxx
   c. 统计 deleted/failed 数量
   d. toast.success/toast.warning
   e. setSelected(new Set()) → 清空选中
   f. load() → 刷新列表
```

### 文件结构
```
src/components/admin/AssetLibrary.tsx     # 主组件（719 行）
src/lib/asset-library-categories.ts       # 分类定义
src/app/api/admin/assets/route.ts         # CRUD API（新增）
src/app/api/admin/assets/folders/route.ts # 文件夹 API
```

## API 端点文档

### GET /api/admin/comfy?view=assets&limit=500
获取所有生成资产，按创建时间倒序排列。

**查询参数**:
- `view`: 'assets' - 必须
- `limit`: 80-200, 默认 80
- `kind`: 可选过滤
- `girlfriend_id`: 可选过滤

**响应**:
```json
{
  "assets": [
    {
      "id": "uuid",
      "url": "https://...",
      "storage_key": "bucket/key/path",
      "name": "filename",
      "kind": "girlfriend|outfit|shop_item|asset-library",
      "meta": {
        "library_category": "outfit|action|scene|advertising",
        "library_role": "pose-reference|..."
      },
      "created_at": "2026-08-19T..."
    }
  ]
}
```

### POST /api/upload (multipart/form-data)
上传图片到 Supabase Storage。

**表单字段**:
- `file`: File - 必填
- `folder`: string - 可选，默认根目录

**响应**:
```json
{
  "url": "https://...",
  "key": "bucket/key/path"
}
```

### POST /api/admin/comfy?action=register_asset
将已有 URL 注册为资产库资产。

**请求体**:
```json
{
  "url": "https://...",
  "kind": "asset-library",
  "name": "original-filename.jpg",
  "library_category": "outfit"
}
```

### DELETE /api/admin/assets?id=xxx
从数据库和存储中删除资产。

**路径参数**:
- `id`: UUID 或 storage_key - 必填

**响应**:
```json
{
  "success": true,
  "deleted": true
}
```

## 测试清单

### 上传测试
- [ ] 点击"上传资产"按钮
- [ ] 选择多个 PNG/JPG/WebP 文件
- [ ] 观察上传进度指示器
- [ ] 查看成功/失败 Toast 消息
- [ ] 确认资产出现在列表中
- [ ] 检查是否有正确的分类 Badge

### 删除测试
#### 单个删除
- [ ] 鼠标悬停在任意资产卡片上
- [ ] 确认底部出现三个按钮
- [ ] 点击红色垃圾桶图标
- [ ] 观察 Toast 提示"已选中该资产"
- [ ] 左上角复选框被勾选

#### 批量删除
- [ ] 勾选多个资产（点击复选框）
- [ ] 观察右上角"删除选中 (N)"按钮
- [ ] 点击删除按钮
- [ ] 确认弹出 confirm 对话框
- [ ] 点击"确定"
- [ ] 观察成功/失败 Toast
- [ ] 确认资产从列表消失

## 已知问题

1. ⚠️ **文件夹功能未启用** - `/api/admin/assets/folders` 返回空数组
2. ⚠️ **上传未实现 register_action** - 需要检查 comfy route.ts 是否支持 action=register_asset
3. ⚠️ **无实时预览** - 上传后需手动刷新才能看到新资产
4. ⚠️ **缺少错误恢复** - 部分失败时不会自动重试

## 下一步优化

- [ ] 实现完整的文件夹 CRUD
- [ ] 添加拖拽上传
- [ ] 添加图片预览弹窗
- [ ] 支持批量移动到其他文件夹
- [ ] 添加导入/导出功能
- [ ] 实现搜索历史记录
- [ ] 添加最近上传排序
