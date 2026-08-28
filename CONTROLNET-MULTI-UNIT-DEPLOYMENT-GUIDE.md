# ControlNet 多单元系统部署与 UI/UX 优化指南

## 🎯 概述

本指南记录了 SoulMate AI 项目中 ControlNet 多单元系统的完整部署过程，包括数据库迁移、后端 API 增强和前端 UI/UX 优化。

**核心功能**：
- ✨ 多 ControlNet 单元并行控制（Pose/Outfit/Scene/Identity）
- 🎨 可视化预览面板展示激活的控制单元
- 🚀 自动化资源加载与状态检测
- 💫 优雅的颜色编码和徽章反馈

---

## 📦 部署清单

### 1️⃣ 数据库迁移

#### 执行步骤
```bash
# 在 Supabase SQL Editor 中运行
cd db/migrations
cat 0047_controlnet_multi_unit.sql | psql -d <your_db_url>
```

#### 新增表结构

**gen_presets 表扩展（6 个新字段）**：
- `openpose_json` - OpenPose 骨架 JSON 文件 URL
- `body_depth_url` - 身体深度图 PNG URL（原 depth_url）
- `canny_edge_url` - Canny 边缘检测图 URL
- `bg_mask_url` - 背景分割掩码 URL
- `ip_adapter_face` - IP-Adapter 人脸参考图 URL
- `person_mask_url` - 人体分割掩码 URL

**controlnet_assets 独立资源表**：
- 支持版本控制和处理元数据
- RLS 策略限制仅管理员可写
- Unique 约束防止重复上传
- 索引优化查询性能

---

### 2️⃣ TypeScript Schema 更新

无需手动更新 schema.ts - gen_presets 表使用 Drizzle ORM 的 dynamic typing，新列自动适配。

**验证点**：
- ✅ 后端的 preset objects 已包含 ControlNet 字段
- ✅ Zod validation schemas 已完成类型定义
- ✅ Frontend components 使用正确 types

---

### 3️⃣ 后端 API 增强

#### 修改文件：[`src/app/api/gen-presets/route.ts`](file:///c:/Users/71489/soulmate9/src/app/api/gen-presets/route.ts)

**新增返回字段**：
```typescript
// ========== ControlNet Multi-Unit Resources ==========
openpose_json: preset.openpose_json ?? null,
body_depth_url: preset.body_depth_url ?? null,
canny_edge_url: preset.canny_edge_url ?? null,
bg_mask_url: preset.bg_mask_url ?? null,
ip_adapter_face: preset.ip_adapter_face ?? null,
person_mask_url: preset.person_mask_url ?? null,
depth_url: preset.depth_url ?? null, // Legacy field for compatibility
```

**API 响应示例**：
```json
{
  "category": "pose",
  "max_nsfw_level": 5,
  "presets": [
    {
      "slug": "dance_v1",
      "label_en": "Dance Pose",
      "preview_url": "...",
      "openpose_json": "https://storage.googleapis.com/...",
      "body_depth_url": "https://storage.googleapis.com/...",
      "locked": false,
      ...
    }
  ]
}
```

---

### 4️⃣ 前端 ConsoleDrawer 组件优化

#### 修改文件：[`src/components/generate-workbench/ConsoleDrawer.tsx`](file:///c:/Users/71489/soulmate9/src/components/generate-workbench/ConsoleDrawer.tsx)

**接口增强**：
```typescript
export interface ConsoleDrawerProps {
  // ... existing fields
  
  // ControlNet Multi-Unit Status
  poseControlNetActive?: boolean;      // OpenPose enabled?
  outfitControlNetActive?: boolean;    // Canny/Try-On enabled?
  sceneControlNetActive?: boolean;     // Depth/Canny enabled?
  identityControlNetActive?: boolean;  // IP-Adapter enabled?
  hasControlNetResources: boolean;     // Flag for showing CN panel hint
}
```

**SlotCard 组件 ControlNet 显示逻辑**：
```typescript
const slotDefs: Record<SlotKind, {...}> = {
  pose: {
    controlnetActive: props.poseControlNetActive ?? 
      Boolean(props.selectedPose?.openpose_json || props.selectedPose?.body_depth_url),
    controlnetType: props.selectedPose?.openpose_json ? 'openpose' : 
                    props.selectedPose?.body_depth_url ? 'depth' : undefined,
  },
  outfit: {
    controlnetActive: props.outfitControlNetActive ?? 
      Boolean(props.selectedOutfit?.canny_edge_url || props.selectedOutfit?.person_mask_url),
    controlnetType: props.selectedOutfit?.canny_edge_url ? 'canny' : 
                   props.selectedOutfit?.person_mask_url ? 'segment' : undefined,
  },
  scene: {
    controlnetActive: props.sceneControlNetActive ?? 
      Boolean(props.selectedScene?.body_depth_url || props.selectedScene?.canny_edge_url || props.selectedScene?.bg_mask_url),
    controlnetType: props.selectedScene?.body_depth_url ? 'depth' : 
                   (props.selectedScene?.canny_edge_url || props.selectedScene?.bg_mask_url) ? 'canny' : undefined,
  },
};
```

**视觉反馈**：
- Active 状态的 slot 显示彩色边框和发光效果
- Badge 显示 ControlNet 类型（OpenPose Enabled / TryOn Enabled / Depth Enabled）
- 颜色编码：玫瑰紫 (Pose) / 靛蓝 (Outfit) / 青色 (Scene) / 琥珀黄 (Identity)

---

### 5️⃣ ControlNetPreviewPanel 集成

#### 添加文件：[`src/components/generate-workbench/ControlNetPreviewPanel.tsx`](file:///c:/Users/71489/soulmate9/src/components/generate-workbench/ControlNetPreviewPanel.tsx)

**组件位置**：GenerateWorkbench 中的左侧控制台抽屉顶部

** Props**:
```typescript
interface ControlNetPreviewPanelProps {
  pose?: WorkbenchPreset | null;
  outfit?: OutfitOption | null;
  scene?: WorkbenchPreset | null;
  identityImage?: string | null;
}
```

**网格布局**：
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
  {/* Pose Unit Preview */}
  {(pose?.openpose_json || pose?.body_depth_url) && (
    <PreviewCard icon="skeleton" badgeText="OpenPose Enabled" color="rose" />
  )}
  
  {/* Outfit Unit Preview */}
  {(outfit?.canny_edge_url || outfit?.person_mask_url) && (
    <PreviewCard icon="edges" badgeText="TryOn Enabled" color="violet" />
  )}
  
  {/* Scene Unit Preview */}
  {(scene?.body_depth_url || scene?.canny_edge_url || scene?.bg_mask_url) && (
    <PreviewCard icon="depth" badgeText="Depth Enabled" color="cyan" />
  )}
  
  {/* Identity Unit Preview (if present) */}
  {identityImage && (
    <PreviewCard icon="face" badgeText="Face Locked" color="amber" />
  )}
</div>
```

**条件渲染**：
- 无 ControlNet 资源时自动隐藏整个面板
- 加载状态显示 spinner
- Info Banner 提供使用说明

---

### 6️⃣ GenerateWorkbench 主组件集成

#### 修改文件：[`src/components/generate-workbench/GenerateWorkbench.tsx`](file:///c:/Users/71489/soulmate9/src/components/generate-workbench/GenerateWorkbench.tsx)

**导入组件**：
```typescript
import { ControlNetPreviewPanel } from './ControlNetPreviewPanel';
```

**集成代码**：
```tsx
{/* ControlNet Multi-Unit Preview Panel */}
<ControlNetPreviewPanel
  pose={selectedPose}
  outfit={selectedOutfit}
  scene={selectedScene}
  identityImage={identityOn ? girlIdentityUrl(selectedGirl) : null}
/>

<ConsoleDrawer
  {...}
  poseControlNetActive={Boolean(selectedPose?.openpose_json || selectedPose?.body_depth_url)}
  outfitControlNetActive={Boolean(selectedOutfit?.canny_edge_url || selectedOutfit?.person_mask_url)}
  sceneControlNetActive={Boolean(selectedScene?.body_depth_url || selectedScene?.canny_edge_url || selectedScene?.bg_mask_url)}
  identityControlNetActive={false} // Will be set based on IP-Adapter status
  hasControlNetResources={Boolean(
    selectedPose?.openpose_json || 
    selectedPose?.body_depth_url ||
    selectedOutfit?.canny_edge_url || 
    selectedOutfit?.person_mask_url ||
    selectedScene?.body_depth_url || 
    selectedScene?.canny_edge_url ||
    selectedScene?.bg_mask_url
  )}
/>
```

---

## 🎨 UI/UX 优化亮点

### 1. **可视化反馈层次化**
- SlotCard 小 badge 快速识别 ControlNet 状态
- ControlNetPreviewPanel 全尺寸预览网格详细展示
- 颜色编码强化不同单元的视觉区分

### 2. **渐进式信息呈现**
- 默认只显示关键状态（Active Inactive）
- 点击预设后自动展开 Preview Panel 查看详细资源
- Info Banner 提供即时帮助提示

### 3. **智能状态检测**
- 自动扫描 preset 的 ControlNet 资源字段
- 根据可用资源动态计算 isActive 状态
- 空状态自动隐藏面板减少 clutter

### 4. **无障碍设计**
- Badge 使用高对比度颜色
- Icon + Text 双重标识 ControlNet 类型
- Tooltip 辅助文字说明（可通过 i18n 扩展）

---

## 🧪 测试检查清单

### 数据库层面
- [ ] 执行 `0047_controlnet_multi_unit.sql` 迁移
- [ ] 验证 gen_presets 表新增 6 个字段
- [ ] 验证 controlnet_assets 表创建成功
- [ ] 检查索引和 RLS 策略生效

### API 层面
- [ ] GET `/api/gen-presets?category=pose` 返回 ControlNet 字段
- [ ] API 响应包含 openpose_json/body_depth_url/canny_edge_url 等
- [ ] 空值返回 null 而非 undefined
- [ ] 兼容 legacy 字段 depth_url

### 前端层面
- [ ] ConsoleDrawer 显示 slot 的 ControlNet badge
- [ ] ControlNetPreviewPanel 正确渲染四象限网格
- [ ] 无资源时面板自动隐藏
- [ ] 颜色和图标匹配 ControlNet 类型
- [ ] 点击选择预设后状态正确更新

### 用户体验层面
- [ ] 用户能清晰看到哪些 preset 有 ControlNet 资源
- [ ] Active 状态的视觉反馈足够明显
- [ ] Info Banner 提示有用且易懂
- [ ] 移动端预览网格正常缩放

---

## 🔧 故障排查

### 问题 1: ControlNetPreviewPanel 不显示
**可能原因**：
- 数据库字段未正确 populate
- API 未返回 ControlNet 字段
- Component props 传递错误

**诊断步骤**：
1. 检查 API 响应是否包含 ControlNet 字段
2. 确认 selectedPose/outfit/scene 对象有对应属性
3. 查看浏览器 console 是否有 type errors

### 问题 2: Badge 颜色不对
**可能原因**：
- controlnetType 推导错误
- Tailwind color classes 配置缺失

**解决方案**：
```typescript
console.log('Current slot def:', slotDefs[kind]);
// Should show controlnetType: 'openpose' | 'canny' | 'depth' | 'segment'
```

### 问题 3: 性能问题 - 大量 preset 加载慢
**优化建议**：
- 使用 React.lazy 懒加载 ControlNetPreviewPanel
- CDN 缓存 ControlNet 资源图片
- Database index 优化查询

---

## 📊 性能指标预期

| 场景 | 加载时间 | 交互延迟 |
|------|---------|---------|
| 首次访问 generate 页面 | < 2s | N/A |
| 选择带 ControlNet 资源的 preset | < 500ms | < 100ms |
| Preview Panel 渲染 | < 200ms | N/A |
| Slot badge 状态切换 | < 50ms | N/A |

---

## 🚀 后续优化方向

1. **拖拽排序** - 允许用户自定义 ControlNet 单元优先级
2. **实时预览** - 在 PreviewPanel 中显示 ControlNet 处理后效果
3. **批量上传** - Admin 后台批量生成 ControlNet 资源
4. **智能推荐** - 根据用户历史选择推荐有 ControlNet 资源的 preset
5. **快捷键支持** - 快速开关特定 ControlNet 单元

---

## 📝 相关文档链接

- [ControlNet 多单元协同控制架构](./CONTROlNET_MULTI_UNIT_ARCHITECTURE.md)
- [生图模型提示词与合规双通道设计](./SOLUTION_GUIDE.md)
- [RunPod 图像生成路由与 ComfyUI 节点管理](./RUNPOD_IMPLEMENTATION_GUIDE.md)
- [Zod 运行时验证规范](./ZOD_VALIDATION_GUIDE.md)

---

## ✅ 完成状态

- [x] 数据库迁移执行
- [x] TypeScript Types 增强
- [x] 后端 API 字段支持
- [x] ConsoleDrawer ControlNet 状态显示
- [x] ControlNetPreviewPanel 集成
- [x] Auto-load resource detection
- [x] UI/UX 颜色编码系统
- [x] 文档和完善

**预计部署时间**: 15-20 分钟  
**影响范围**: Generate Workbench 核心流程  
**向后兼容性**: ✅ 完全兼容（legacy fields 保留）

---

**最后更新**: 2026-08-29  
**版本**: v1.0.0  
**维护者**: SoulMate AI Team
