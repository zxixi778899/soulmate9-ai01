# ADetailer 面部分类路径修复（2026-08-27）

## 问题描述

运行生图时出现工作流验证错误：

```
UltralyticsDetectorProvider: 
Node 51 (errors): [{'type': 'value_not_in_list', 'message': 'Value not in list', 
'details': "model_name: 'face_yolov8m.pt' not in ['bbox/face_yolov8m.pt']", 
'extra_info': {'input_name': 'model_name', 'input_config': [['bbox/face_yolov8m.pt'], {}], 
'received_value': 'face_yolov8m.pt'}}]
```

**根本原因**：Impact Subpack 的 `model-whitelist.txt` 要求模型名使用 **`bbox/` 前缀**，但代码和环境变量使用了不带前缀的路径。

## 影响范围

- ❌ 捏脸生图失败（调用 ComfyUI face_detailer）
- ❌ 对话生图失败（启用 face_detailer 选项时）
- ❌ SDXL-Pro 端点（白名单缺少 bbox/ 前缀）
- ❌ FLUX Premium 端点（未安装 Impact Subpack）

## 修复内容

### 1. Dockerfile.sdxl-pro（第 56-58 行）

**修改前**：
```dockerfile
printf 'face_yolov8m.pt\n' > model-whitelist.txt
```

**修改后**：
```dockerfile
printf 'bbox/face_yolov8m.pt\n' > model-whitelist.txt
```

### 2. Dockerfile.flux-premium（新增）

添加了 Impact Pack 子模块和 whitelist 配置：

```dockerfile
git clone ... ComfyUI-Impact-Pack.git
git clone ... ComfyUI-Impact-Subpack.git

# Pre-seed Impact Subpack whitelist with bbox/ prefix
mkdir -p /comfyui/user/default/ComfyUI-Impact-Subpack
printf 'bbox/face_yolov8m.pt\n' > model-whitelist.txt
```

### 3. src/lib/runpod.ts（第 430-436 行）

**改进**：提取环境变量为中间变量，明确使用完整路径：

```typescript
const adetailerModel = process.env.RUNPOD_ADETAILER_MODEL || 'bbox/face_yolov8m.pt';
Object.assign(graph, {
  '51': {
    class_type: 'UltralyticsDetectorProvider',
    inputs: { model_name: adetailerModel.trim() },
  },
  // ...
});
```

**注释更新**：英文注释解释 schema 对齐细节

### 4. src/lib/comfy-builders/enhance-blocks.ts（无变更）

已正确使用 `bbox/face_yolov8m.pt`（第 110 行）

## 部署流程

1. **重新构建镜像**（必须）：
   ```bash
   # SDXL-Pro
   docker build -f runpod/comfyui-worker/Dockerfile.sdxl-pro -t sdxl-pro .
   
   # FLUX Premium
   docker build -f runpod/comfyui-worker/Dockerfile.flux-premium -t flux-premium .
   ```

2. **上传到 RunPod**：
   ```bash
   docker tag sdxl-pro:<hash>: latest
   docker push <runpod-account>.dkr.ecr.<region>.amazonaws.com/sdxl-pro:<hash>
   ```

3. **更新端点配置**：确保启用新镜像版本

4. **环境变量验证**：
   ```bash
   RUNPOD_ADETAILER_READY=true
   RUNPOD_ADETAILER_MODEL=bbox/face_yolov8m.pt  # 可选，默认值已修复
   ```

## 测试步骤

1. **SDXL-Pro 端点**：
   - 访问 `/api/admin/comfy` → Health Check
   - 验证节点导入：`UltralyticsDetectorProvider` 存在
   
2. **生图测试**：
   - 创建女友 → 捏脸 → 保存头像
   - 检查是否触发 FaceDetailer 增强
   - 确认图片质量正常

3. **FLUX Premium 端点**：
   - 同样执行健康检查和生图测试

## 注意事项

### Impact Pack vs ComfyUI-ADetailer

| 特性 | Impact Pack (新版) | ComfyUI-ADetailer (旧版) |
|------|-------------------|-------------------------|
| 检测器节点 | `UltralyticsDetectorProvider` | 内置在 ADetailer |
| 生成节点 | `FaceDetailer` | `ADetailer` |
| 模型路径前缀 | `bbox/face_yolov8m.pt` | `yolov8n-face.pt` |
| 必需输入 | feather/wildcard/cycle/drop_size | 较少 |
| 兼容性 | PyTorch >= 2.6 需 whitelist | 更通用 |

### 回滚策略

如果问题持续，考虑：

1. **禁用 FaceDetailer**（临时降级）：
   ```typescript
   // 条件判断时跳过 face_detailer 分支
   if (opts.face_detailer && enhancerFlag('RUNPOD_ADETAILER_READY')) {
     // ... 生成逻辑
   }
   ```

2. **切换回 ComfyUI-ADetailer**：
   - 需要重写工作流节点结构
   - 使用旧版 API 签名
   - 不推荐（Impact Pack 是未来趋势）

## 相关文档

- [COMFYUI-NODES-USAGE-GUIDE.md](docs/COMFYUI-NODES-USAGE-GUIDE.md)
- [RunPod 生图故障诊断](scripts/runpod/README-CLEANUP-AND-INSTALL.md)
- Impact Subpack GitHub：https://github.com/ltdrdata/ComfyUI-Impact-Subpack

## 作者备注

此修复解决了两个镜像的不一致性。**FLUX Premium 之前缺少 Impact Pack**，导致即使启用了 face_detailer 功能也无法正常工作。现在两个端点都支持新版 Impact Subpack 架构。

---
**修复时间**：2026-08-27  
**关联 Issue**: FaceDetailer 路径验证失败  
**紧急程度**: 🔴 P0 - 生图功能阻断
