# 🚀 捏脸系统紧急修复指南

## ❗ 问题现状

**症状**: 捏脸页面点击"生成立绘"后显示 loading 但图片不出现

**根本原因**: FLUX 端点未配置 (`RUNPOD_ENDPOINT_ID_FLUX` 为空)

---

## ✅ 立即修复（3 分钟搞定）

### Step 1: 获取 RunPod 端点 ID

1. 登录 [RunPod Console](https://www.runpod.io/console/serverless)
2. 找到 **ComfyUI IPAdapter-Flux** 端点
3. 复制端点 ID（示例：`e40cgshtouocg8`）

或者使用现有端点：
- **统一 ComfyUI 端点**: `e40cgshtouocg8` (已部署 flux1-dev-fp8)

---

### Step 2: 配置环境变量

打开 `.env.local` 文件（如果不存在就创建），添加：

```bash
# === 生图核心配置 ===
RUNPOD_API_KEY=your_runpod_api_key_here
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8
```

替换 `your_runpod_api_key_here` 为你的实际 API Key（从 RunPod Console → Settings → API Keys 获取）

---

### Step 3: 验证配置

在终端运行：

```bash
cd c:\Users\71489\soulmate9
pnpm run runpod:check
```

**预期输出**:
```
🔍 RunPod 端点诊断工具
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 环境变量配置:

  FLUX 端点 ID     : e40cgshtouocg8 ✅
  SDXL Pony       : ❌ 未配置
  SDXL Illustrious: ❌ 未配置
  SDXL 总闸       : ⏸️ 关闭
  API Key         : 🔑 sk-xxxxx...

🔄 生图路由策略推断:

  ⚡ FLUX 统一方案（稳定模式）
     ├─ 所有类型 → FLUX e40cgshtouocg8
     └─ 质量：⭐⭐⭐⭐⭐ | 速度：8-15 秒/张

🧪 下一步操作建议:

  🎉 一切就绪！可以直接使用:

    http://localhost:5000/create
```

---

### Step 4: 重启开发服务器

```bash
# 停止当前 server (Ctrl+C)
pnpm dev
```

---

### Step 5: 测试捏脸功能

1. 打开浏览器：`http://localhost:5000/create`
2. 填写基础信息：
   - Name: `Test User`
   - Hair Style: `long flowing`
   - Hair Color: `#d4a574` (brown)
   - Eye Color: `brown`
   - Visual Style: `realistic`
3. 点击 **"生成立绘"**
4. 等待 8-15 秒 → 4 张候选图出现 ✨

---

## 🐛 仍然失败？排查清单

### 检查项 1: .env.local 文件位置

确保文件在项目根目录：
```
soulmate9/
  ├── .env.local  ← 必须在最外层
  ├── package.json
  └── src/
```

### 检查项 2: Supabase Token

捏脸功能需要先登录：
```bash
# 检查 localStorage 中是否有 token
localStorage.getItem('sb-soulmate9-auth-token')
```

如果没有 → 先登录再访问 `/create`

### 检查项 3: 浏览器控制台错误

打开 DevTools (F12) → Console 标签，查看是否有红色错误：

**常见错误**:
```json
// ✅ 成功响应
{
  "success": true,
  "images": ["data:image/png;base64,..."],
  "portrait_url": "..."
}

// ❌ 端点错误
{
  "error": "Endpoint not found or inactive",
  "success": false
}

// ❌ 认证失败
{
  "error": "Unauthorized",
  "success": false
}
```

### 检查项 4: RunPod Pod 状态

在 RunPod Console 确认：
- Pod 状态：`ACTIVE` (绿色)
- GPU 内存充足（≥8GB 空闲）
- 网络连接正常

---

## 🚀 进阶优化（可选）

### 方案 A: 启用 SDXL 矩阵（更快）

如果你有以下资源：
- RTX 3090 / RTX 4090 GPU
- 至少两个端点（Pony + Illustrious）

配置：
```bash
# .env.local
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8        # 兜底端点
RUNPOD_ENDPOINT_ID_SDXL_PONY=abc123def456     # 写实专用
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS=xyz789ghi  # 二次元专用

RUNPOD_SDXL_MODELS_READY=true
RUNPOD_SDXL_CHECKPOINTS=pony_realism_v11,illustrious_v4
```

性能对比：
| 方案 | 写实速度 | 二次元速度 | NSFW 支持 |
|------|---------|-----------|----------|
| FLUX 统一 | ~12 秒 | ~14 秒 | ⚠️ 低质量 |
| SDXL 矩阵 | **~6 秒** | **~7 秒** | ✅ 高质量 |

### 方案 B: 多区域端点容灾

配置多个端点（自动 failover）：
```bash
RUNPOD_ENDPOINT_ID_FLUX_DC1=dc1-endpoint-id
RUNPOD_ENDPOINT_ID_FLUX_DC2=dc2-endpoint-id
```

---

## 📊 性能监控指标

捏脸生成成功后，关注以下指标：

1. **成功率**: 目标 >90%（4 张中至少 2 张成功）
2. **耗时**: 目标 <20 秒
3. **多样性**: 4 张图应有明显差异（不同发型/角度/表情）

**监控命令**:
```bash
# 查看详细日志（Next.js 开发服务器输出）
Console output:
[Generate Portrait] Batch generating { name: "Test", count: 4, status: "success" }
```

---

## 🆘 紧急回退方案

如果以上都无效，临时使用旧版生成器（兼容性更好）：

```bash
# .env.local 中添加
USE_LEGEND_GENERATOR=true
```

这会将请求转发到 legacy generator（稳定性稍差但兼容性好）

---

## 📞 仍无法解决？

收集以下信息并联系技术支持：

1. `pnpm run runpod:check` 的完整输出
2. 浏览器 Network 标签的 POST 请求响应体
3. Next.js 终端的错误堆栈

---

## 📝 相关文档链接

- [生图路由架构详解](IMAGE_GENERATION_GUIDE.md)
- [RunPod 配置完整手册](RUNPOD-CONFIG-GUIDE.md)
- [捏脸系统提示词优化](BIRTHMODEL-FIX-SUMMARY.md)

---

**最后更新**: 2026-08-30  
**版本**: v1.0
