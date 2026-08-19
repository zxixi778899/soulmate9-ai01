# 💬 对话页智能图生图功能 - 快速使用指南

## ✅ 已完成的功能实现

### 1. 后端 API: `/api/chat/generate-image-from-context`

**核心特性**:
- ✅ 上下文感知的提示词构建
- ✅ 批量生成 (1-4 张)
- ✅ 进度跟踪与异步处理
- ✅ 图片上传到 Storage
- ✅ 数据库记录保存

**API 端点**: `POST /api/chat/generate-image-from-context`

**请求参数**:
```typescript
{
  girlfriend_id: string,          // 必需 - 伴侣 ID
  message?: string,               // 用户的聊天消息 (用于提示词优化)
  existing_prompt?: string,       // 可选 - 直接提供的提示词
  context_type?: string,          // 可选 - 'outfit'/'pose'/'scene'/'portrait'
  count?: number,                 // 生成数量 (1-4, default: 1)
}
```

**响应示例**:
```json
{
  "success": true,
  "images": ["https://..."],      // 立即生成的图片 URL
  "pending_jobs": [],              // 后台处理的作业队列
  "prompt_generated": "...",       // 实际使用的提示词
  "count": 2,
  "message": "Images are being generated..."
}
```

---

### 2. 前端组件：`ChatImageGenerator`

**Props**:
```tsx
<ChatImageGenerator 
  girlfriendId={girlfriend.id}
  onImageGenerated={(imageUrl) => {
    // Handle new image - add to chat or display
  }}
/>
```

**UI 组成部分**:
1. ✨ 智能图生图标题
2. 📋 上下文类型选择器 (换装/姿势/场景/重绘)
3. 💬 提示词输入框 + 生成按钮
4. 📊 实时进度条显示
5. 🖼️ 参考图上传 (可选)
6. 🔢 生成数量选择 (1-4 张)
7. 👁️ 预览区域

---

## 🎯 使用示例

### 在聊天页面中集成

```tsx
// In src/app/(main)/chat/[id]/page.tsx or similar

import { ChatImageGenerator } from '@/components/chat-image-generator';

export default function ChatPage({ params }: { params: { id: string } }) {
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  
  return (
    <div className="flex flex-col h-screen">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Your existing chat messages */}
      </div>
      
      {/* Input area with image generator */}
      <div className="p-4 border-t">
        {/* Your normal chat input */}
        
        {/* Image generator component */}
        <ChatImageGenerator 
          girlfriendId={params.id}
          onImageGenerated={(url) => {
            setNewImageUrl(url);
            console.log('New portrait generated:', url);
          }}
        />
      </div>
    </div>
  );
}
```

---

## 🔧 配置说明

### 环境变量 (可选增强)

```bash
# Enable face detailer for sharper faces
RUNPOD_ADETAILER_READY=true
RUNPOD_ADETAILER_MODEL=face_yolov8m.pt

# Enable upscaling for higher resolution
RUNPOD_UPSCALE_READY=true
RUNPOD_UPSCALE_MODEL=4x-UltraSharp.pth
```

### 提示词优化策略

当前实现使用基础的字符特征构建提示词，后续可升级 LLM 驱动的智能优化：

```typescript
// Current: Basic prompt builder
const parts = [
  'natural editorial photograph with realistic skin texture',
  `gorgeous young adult ${gender} age 22-28 named ${name}`,
  `${ethnicity} features`,
  // ... etc
];

// Future: LLM-powered context analysis
async function enhancePromptWithContext(
  conversationHistory: Message[],
  contextType: string,
): Promise<string> {
  // Analyze chat for visual keywords
  // Extract outfit/pose/scene details
  // Optimize for image quality
}
```

---

## 🧪 测试步骤

### 1. 启动开发服务器
```bash
pnpm dev
```

### 2. 访问聊天页面
打开浏览器到 `http://localhost:3000/chat/<your-gf-id>`

### 3. 测试流程
1. 在输入区域找到"智能图生图"卡片
2. 选择上下文类型 (例如：换装)
3. 输入提示词："穿红色连衣裙，站在海边"
4. 点击生成按钮
5. 观察进度条动画
6. 等待完成后查看生成的图片

### 4. API 直接测试
```bash
curl -X POST http://localhost:3000/api/chat/generate-image-from-context \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "girlfriend_id": "<GF_ID>",
    "message": "今天看起来很漂亮",
    "context_type": "portrait",
    "count": 2
  }'
```

---

## 📈 下一步优化建议

### Phase 2: 高级功能
- [ ] LLM 驱动的提示词分析和优化
- [ ] 历史记忆持久化 (保存常用 prompt)
- [ ] A/B 测试对比视图
- [ ] 风格迁移模板库
- [ ] 批量下载功能

### Phase 3: 商业化
- [ ] 积分系统 (每次消耗 X credits)
- [ ] 会员特权区分
- [ ] 优先队列加速通道
- [ ] 高清版本升级 (额外付费)

### Phase 4: 用户体验
- [ ] 失败重试机制
- [ ] 生成质量评分
- [ ] 相似推荐系统
- [ ] 一键替换现有头像

---

## ⚠️ 已知限制

| 问题 | 影响范围 | 缓解方案 |
|------|----------|----------|
| 无 toast 通知 | 用户体验 | 使用 console 日志替代 |
| LLM 提示词未启用 | Prompt 质量基础版 | 先使用基础构建器 |
| 单例 UI 位置固定 | 布局灵活性 | 可在任意父组件使用 |

---

## 📝 部署检查清单

- [ ] TypeScript 编译通过 (`pnpm run ts-check`)
- [ ] ESLint 检查通过 (`pnpm lint`)
- [ ] RunPod 端点配置正确
- [ ] Supabase Storage bucket 有写权限
- [ ] User 已登录且 token 有效

---

*Created: August 17, 2026*  
*Status: ✅ Ready for Testing*  
*Author: Qoder AI Agent*  
*Next: QA Validation → User Acceptance Test → Production Deploy*
