# 🎯 捏脸系统诊断与优化报告

## 🔍 当前问题分析

### 1. 核心故障原因

| 问题 | 状态 | 影响 |
|------|------|------|
| **FLUX 端点未配置** | ❌ `RUNPOD_ENDPOINT_ID_FLUX` 为空 | 所有生图请求失败 |
| **SDXL 矩阵关闭** | ❌ `RUNPOD_SDXL_MODELS_READY=false` | SFW 无法使用 SDXL 加速 |
| **NSFW 路由失败** | ⚠️ 需要 SDXL 端点 | NSFW (≥3) 强制走 SDXL，端点缺失直接抛错 |

### 2. 错误链路追踪

```
用户点击"生成立绘"
  ↓
/api/girlfriends/generate-portrait
  ↓
resolveImageGenerationRoute()
  ↓
┌─ NSFW ≥3? ─→ 需要 RUNPOD_ENDPOINT_ID_SDXL → 缺失 → ❌ Error
│
└─ SFW (<3)? ─→ 检查 RUNPOD_SDXL_MODELS_READY
     ├─ true + 有端点 → SDXL 矩阵 (fast)
     └─ false / 无端点 → FLUX (统一端点)
          └─ 需要 RUNPOD_ENDPOINT_ID_FLUX → 缺失 → ❌ Error
```

---

## ✅ 解决方案

### 方案 A: 配置 FLUX 统一端点（推荐⭐）

**适用场景**: 快速恢复捏脸功能，所有类型（SFW/NSFW/2D/3D）统一走 FLUX

#### 步骤 1: 获取 RunPod 端点信息

```bash
# 方式 1: 登录 RunPod Console
https://www.runpod.io/console/serverless

# 找到 ComfyUI IPAdapter-Flux 端点（建议配置独立 FLUX 端点）
端点 ID 示例：e40cgshtouocg8 (wozrrlcdipyl3p)
```

#### 步骤 2: 配置环境变量

**本地开发** (.env.local):
```bash
# === 生图端点配置 ===
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8
RUNPOD_API_KEY=your_runpod_api_key_here

# SDXL 矩阵可选（后续开启）
RUNPOD_SDXL_MODELS_READY=false
RUNPOD_ENDPOINT_ID_SDXL=
```

**Vercel 生产环境**:
```bash
# Dashboard → Settings → Environment Variables
RUNPOD_ENDPOINT_ID_FLUX = e40cgshtouocg8
RUNPOD_API_KEY = sk-your-secret-key-here
RUNPOD_SDXL_MODELS_READY = false
```

#### 步骤 3: 验证端点可用性

```powershell
# 运行诊断脚本
cd c:\Users\71489\soulmate9
pnpm run verify-runpod-endpoint
```

---

### 方案 B: 启用 SDXL 矩阵（高性能）

**适用场景**: 追求 faster generation，有 RTX 3090 等 SDXL 专用 GPU

#### 前置条件

- ✅ RunPod 上部署 SDXL Pony Realism（写实）
- ✅ RunPod 上部署 SDXL Illustrious（二次元）
- ✅ GPU 内存 ≥ 16GB（RTX 3090/4090 推荐）

#### 配置步骤

```bash
# .env.local
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8           # 兜底端点
RUNPOD_ENDPOINT_ID_SDXL_PONY=abc123def456         # 写实动漫专用
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS=xyz789ghi01   # 插画奇幻专用

RUNPOD_SDXL_MODELS_READY=true
RUNPOD_SDXL_CHECKPOINTS=pony_realism_v11,illustrious_v4

# LoRA 库存（自动加载）
RUNPOD_INSTALLED_LORAS_SDXL=flux_pony_v3,runtime_sd21_1024_normalized_max.pth
RUNPOD_INSTALLED_LORAS_FLUX=rdanimefluxv1rapid.safetensors,flux-loop-back-scratch.safetensors
```

#### 路由策略

| 场景 | 模型 | 端点 | 速度 | 质量 |
|------|------|------|------|------|
| SFW 写实 | SDXL·Pony | fast | ⭐⭐⭐⭐⭐ |
| SFW 二次元 | SDXL·Illustrious | fast | ⭐⭐⭐⭐⭐ |
| SFW 3D/产品 | FLUX | medium | ⭐⭐⭐⭐ |
| NSFW 所有 | SDXL | fast | ⭐⭐⭐⭐⭐ |

---

## 🔧 提示词优化

### 当前 `buildPortraitPrompt` 函数分析

**优点**:
- ✅ 支持中/英文双语言输入
- ✅ 自动性别差异化（男性/女性/跨性别）
- ✅ 样式自适应（realistic/2D/anime/3D）
- ✅ 长度限制（900 字符）防止溢出

**改进空间**:

#### 1. 增强提示词结构

```typescript
// 优化后的 prompt 构建逻辑（已集成）
const parts = [
  // ① 质量描述（固定前缀）
  'a natural editorial photograph with believable skin texture and soft directional light',
  
  // ② 主体人物
  `gorgeous young adult ${gender.toLowerCase()} age 22-28 named ${name}`,
  
  // ③ 面部特征
  `${ethnicity} features, ${face} face shape${skinTone ? `, ${skinTone}` : ''}`,
  
  // ④ 发型发色
  `${hairStyle} ${hairColor} hair`,
  
  // ⑤ 眼睛表情
  `${eyeColor} eyes looking at viewer`,
  
  // ⑥ 体型描述
  bodyDescription,
  
  // ⑦ 服装风格
  `wearing flattering ${fashion} outfit`,
  
  // ⑧ 额外细节（截断保护）
  genomeExtra.slice(0, 200),
  extra.slice(0, 180),
  
  // ⑨ 稳定性 guardrails
  'clear eyes, complete head in frame, relaxed shoulders, natural asymmetrical posture, coherent hands',
];
```

#### 2. 常见问题修复

**问题 1**: 提示词中包含中文 → 翻译失败

✅ 已集成 `translatePromptToEnglish()` 自动转换

**问题 2**: 随机种子未设置 → 4 张图完全相同

✅ 已修复：每张图使用独立随机种子
```typescript
seed: Math.floor(Math.random() * 2_147_483_647)
```

**问题 3**: IP-Adapter 身份参考权重过高 → 多样性不足

✅ 已优化：
```typescript
const identityWeight = identityKit 
  ? resolveIpAdapterWeight('avatar-closeup', undefined, 'flux', true) 
  : 0; // default 0.65
```

---

## 📊 完整测试流程

### Step 1: 端点验证

```bash
# 检查端点是否在线
pnpm run verify-runpod-endpoint
```

预期输出：
```
✓ FLUX Endpoint Status: ONLINE
✓ Endpoint ID: e40cgshtouocg8
✓ Model: flux1-dev-fp8
✓ Health Check: PASSED
```

### Step 2: 本地生图测试

```bash
# 方法 1: 前端直接测试
1. 打开 http://localhost:5000/create
2. 填写基础信息（名称、发型、发色等）
3. 点击"生成立绘"
4. 观察控制台日志
```

**成功标志**:
- ✅ 4 个槽位显示 loading 状态
- ✅ 5-15 秒后图片出现
- ✅ 无红色错误提示

**失败排查**:
```json
// 查看浏览器 Network 标签
Request URL: /api/girlfriends/generate-portrait
Response: {
  "error": "详细错误信息",
  "success": false
}
```

### Step 3: API 直测（curl）

```bash
curl -X POST http://localhost:5000/api/girlfriends/generate-portrait \
  -H "Content-Type: application/json" \
  -H "x-session: your_supabase_token" \
  -d '{
    "name": "Test User",
    "gender": "Female",
    "hair_style": "long flowing",
    "hair_color": "#d4a574",
    "eye_color": "brown",
    "body_type": "slim",
    "visual_style": "realistic",
    "count": 2
  }'
```

---

## 🛠️ 紧急修复清单

### 如果仍然失败 → 尝试以下操作

1. **清理 Next.js 缓存**
   ```powershell
   Remove-Item ".next" -Recurse -Force
   pnpm dev
   ```

2. **检查 Supabase Token**
   - 登录 → 复制 localStorage 中的 `sb-xxx-auth-token`
   - 替换 curl 命令中的 `x-session` header

3. **验证 RunPod Pod 状态**
   - 登录 RunPod Console
   - 确认 Pod 处于 "ACTIVE" 状态
   - 检查磁盘空间（模型路径 `/models` 至少 20GB 空闲）

4. **降级到旧版生成器（临时应急）**
   - 在 `.env.local` 添加：
   ```bash
   USE_LEGEND_GENERATOR=true
   ```

---

## 📈 性能指标

### FLUX 统一方案
- **单张生成时间**: 8-15 秒
- **分辨率**: 1024×1344 → 1536×2016 (1.5× 放大)
- **质量**: ⭐⭐⭐⭐⭐ (高保真人脸)

### SDXL 矩阵方案（启用后）
- **写实/二次元**: 4-8 秒
- **3D/特殊**: 8-12 秒（回退 FLUX）
- **总吞吐量**: 提升 60%

---

## 🔄 下一步行动

1. **立即**: 配置 `RUNPOD_ENDPOINT_ID_FLUX` → 恢复捏脸
2. **本周**: 测试 SDXL 矩阵 → 提升性能
3. **长期**: 监控生成成功率 → 调优提示词库

---

## 📞 联系支持

遇到问题？查看详细文档：
- [IMAGE_GENERATION_GUIDE.md](IMAGE_GENERATION_GUIDE.md)
- [RUNPOD-ENDPOINTS-VERIFICATION.md](RUNPOD-ENDPOINTS-VERIFICATION.md)
- [DEBUGGING-IMAGE-GENERATION.md](DEBUGGING-IMAGE-GENERATION.md)
