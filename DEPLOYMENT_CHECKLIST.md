# 🎯 P0-P2 功能部署检查清单

## ✅ **已完成的工作**

### 📦 新增文件（9 个）
```
✅ src/lib/tokens.ts                              (264 lines) - 代币系统管理
✅ src/lib/visual-memory.ts                        (297 lines) - 视觉记忆召回
✅ src/lib/runpod-img2img-builder.ts               (272 lines) - img2img workflow
✅ src/lib/video-workflow.ts                       (194 lines) - 视频生成 workflow
✅ src/components/token-balance-display.tsx        (144 lines) - 代币 UI 组件
✅ src/components/wardrobe-dialog.tsx              (310 lines) - 换装 UI 组件
✅ supabase/migrations/20260813100000_tokens_system.sql (136 lines) - 代币表迁移
✅ supabase/migrations/20260813200000_visual_memory_recall.sql (141 lines) - 记忆表迁移
✅ scripts/apply-migrations-manual.js              (79 lines)  - 迁移指导脚本
```

### 🔧 修改文件（1 个）
```
✅ src/app/api/chat/generate-image/route.ts        (+244 -689 lines)
   - 集成 IP-Adapter 角色一致性
   - 自动保存 face_reference_url
   - 支持 img2img 参考图
```

### 📄 新增文档（2 个）
```
✅ P0-P2_EXECUTION_GUIDE.md                        (293 lines) - 完整执行指南
✅ DEPLOYMENT_CHECKLIST.md                         (this file)  - 部署检查清单
```

---

## 🔴 **立即执行（P0 - 今天完成）**

### 1. 数据库迁移 ⚠️ 手动执行

#### Step 1.1: Tokens System
- [ ] 打开 Supabase Dashboard → SQL Editor
- [ ] 复制 `supabase/migrations/20260813100000_tokens_system.sql` 全部内容
- [ ] 粘贴并执行
- [ ] 验证：`SELECT COUNT(*) FROM generation_ledger;` 应返回 0 或更多

#### Step 1.2: Visual Memory
- [ ] 复制 `supabase/migrations/20260813200000_visual_memory_recall.sql` 全部内容
- [ ] 粘贴并执行
- [ ] 验证：`SELECT COUNT(*) FROM generation_memory;` 应返回 0 或更多

#### Step 1.3: 验证迁移成功
```sql
-- 在 SQL Editor 中运行
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('generation_memory', 'generation_ledger');
-- 预期：返回 2 行

SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('consume_tokens', 'grant_tokens', 
                       'save_to_generation_memory', 'search_similar_memories');
-- 预期：返回 4 行
```

---

### 2. 代码验证

#### Step 2.1: 安装依赖
```bash
pnpm install
```
- [ ] 无错误输出
- [ ] pnpm-lock.yaml 更新（如果有新依赖）

#### Step 2.2: TypeScript 类型检查
```bash
pnpm type-check
```
- [ ] 无类型错误
- [ ] 所有新增文件的导入路径正确

如果报错 `Cannot find module '@/lib/xxx'`：
```bash
# VSCode 用户
# 按 Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows)
# 输入 "TypeScript: Restart TS Server"
```

#### Step 2.3: 构建测试
```bash
pnpm build
```
- [ ] 构建成功
- [ ] 无编译错误

---

### 3. 本地测试

#### Step 3.1: 启动开发服务器
```bash
pnpm dev
```
- [ ] 服务器启动成功
- [ ] 访问 http://localhost:3000 正常

#### Step 3.2: img2img 功能测试
1. [ ] 登录账号
2. [ ] 进入 Gallery → 选择一个女友 → Chat
3. [ ] 点击 "Generate Selfie" 按钮
4. [ ] 观察控制台日志：
   ```
   [Chat Generate] Starting generation {
     hasReference: true/false,
     ipAdapterWeight: 0.65
   }
   ```
5. [ ] 生成成功后，检查数据库：
   ```sql
   SELECT face_reference_url FROM girlfriends WHERE id = 'YOUR_GF_ID';
   -- 预期：有 URL 值
   ```

#### Step 3.3: 代币系统测试
1. [ ] 在聊天页找到 TokenBalanceDisplay 组件
2. [ ] 查看初始余额（新用户在 profiles.tokens_remaining）
3. [ ] 生成一张图片
4. [ ] 观察余额变化
5. [ ] 检查消耗日志：
   ```sql
   SELECT * FROM generation_ledger ORDER BY created_at DESC LIMIT 1;
   -- 预期：有刚刚的消耗记录
   ```

#### Step 3.4: 余额不足测试
1. [ ] 手动设置余额为 0：
   ```sql
   UPDATE profiles SET tokens_remaining = 0 WHERE user_id = 'YOUR_USER_ID';
   ```
2. [ ] 尝试生成图片
3. [ ] 预期：拒绝生成并显示 "Insufficient tokens" 提示
4. [ ] 验证 Upgrade CTA 按钮显示

---

## 🟠 **扩展测试（P1 - 明天完成）**

### 4. 视觉记忆召回

#### Step 4.1: 积累记忆数据
1. [ ] 生成 5-10 张不同风格的图片
2. [ ] 检查 memory 表：
   ```sql
   SELECT COUNT(*) FROM generation_memory WHERE user_id = 'YOUR_USER_ID';
   -- 预期：返回 5-10
   ```

#### Step 4.2: 相似度搜索
1. [ ] 在聊天中说："再来一张像刚才那样的"
2. [ ] 检查是否召回了相似的历史图片
3. [ ] 验证 similarity 分数 > 0.75

#### Step 4.3: 记忆清理（可选）
```sql
-- 测试清理旧记忆函数
SELECT cleanup_old_memories('YOUR_USER_ID', 3);
-- 预期：返回删除的数量
```

---

### 5. 换装系统

#### Step 5.1: UI 测试
1. [ ] 在聊天页点击 "Wardrobe" 按钮
2. [ ] Dialog 正常打开
3. [ ] 显示预设 outfits 列表

#### Step 5.2: 试穿流程
1. [ ] 选择一个 outfit → 点击 "Try On"
2. [ ] 等待生成完成
3. [ ] 新图片显示在聊天流中
4. [ ] 服装描述匹配选择的 outfit

#### Step 5.3: 数据验证
```sql
-- 检查 outfit 是否正确保存
SELECT current_outfit_id FROM girlfriends WHERE id = 'YOUR_GF_ID';
-- 预期：有 outfit UUID
```

---

## 🟡 **预留功能（P2 - 下周完成）**

### 6. 视频生成

#### Step 6.1: 模型准备
- [ ] 确认 RunPod worker 已安装 AnimateDiff 模型
- [ ] 检查 `animatediff-motion-v1-0.ckpt` 文件存在
- [ ] 验证 `v3_sd15_mm.ckpt` motion module 可用

#### Step 6.2: API 路由创建
```bash
# 创建 /api/generate-video/route.ts
# 参考 src/lib/video-workflow.ts 的 buildVideoWorkflow
```
- [ ] 调用 buildVideoWorkflow 构建 workflow
- [ ] 提交到 RunPod endpoint
- [ ] 轮询状态直至 COMPLETED

#### Step 6.3: 前端集成
- [ ] 在聊天页添加 "Generate Video" 按钮
- [ ] 显示代币消耗提示（200-350 tokens）
- [ ] 视频播放器展示

---

## 🐛 **故障排查**

### 问题：数据库迁移失败
```sql
-- 错误：syntax error at or near "$$"
-- 解决：确保整个函数定义完整复制，包括 $$ 分隔符

-- 错误：relation "generation_ledger" already exists
-- 解决：表已存在，跳过 CREATE TABLE，只执行 ALTER 和 CREATE INDEX
```

### 问题：TypeScript 报错
```bash
# 错误：Cannot find module '@/lib/tokens'
# 解决：
1. 重启 TS Server
2. 检查 tsconfig.json 的 paths 配置
3. 确认文件实际存在于 src/lib/tokens.ts
```

### 问题：img2img 未生效
```bash
# 检查 runpod.ts 是否正确调用新 builder
grep -n "buildImg2ImgWorkflow" src/lib/runpod.ts

# 如果没有，需要修改 runpod.ts 第 352-407 行
# 将 EmptyLatentImage 替换为 LoadImage+ImageScale+VAEEncode
```

### 问题：代币不扣除
```sql
-- 检查 consume_tokens 函数是否存在
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'consume_tokens';

-- 如果不存在，重新执行 tokens_system 迁移
```

---

## 📊 **成功标准**

### P0 完成度检查
- [ ] ✅ 数据库 2 个新表已创建
- [ ] ✅ profiles.tokens_* 列已添加
- [ ] ✅ 4 个新函数可调用
- [ ] ✅ img2img 生成成功（至少 1 张）
- [ ] ✅ face_reference_url 自动填充
- [ ] ✅ 代币余额 UI 显示
- [ ] ✅ 余额不足时拒绝生成

### P1 完成度检查
- [ ] ✅ generation_memory 表已创建
- [ ] ✅ HNSW 向量索引已建立
- [ ] ✅ 视觉记忆保存成功（>5 条记录）
- [ ] ✅ 换装 Dialog 可打开
- [ ] ✅ 试穿后重新生成

### P2 完成度检查
- [ ] ⏳ 视频 workflow 构建无错误
- [ ] ⏳ RunPod endpoint 配置完成
- [ ] ⏳ 可生成 5s 测试视频

---

## 🚀 **部署到生产环境**

### 生产前检查
- [ ] 所有 P0 测试通过
- [ ] PostHog 事件追踪已添加
- [ ] Sentry 错误监控已配置
- [ ] 速率限制已设置（tokens API）

### 生产部署步骤
```bash
# 1. 合并到 main 分支
git checkout main
git merge feature/p0-p2-features
git push origin main

# 2. Vercel 自动部署
# 等待构建完成（约 5-10 分钟）

# 3. 生产数据库迁移
# 在生产 Supabase 执行相同的 2 个迁移文件

# 4. 环境变量配置
# 添加新的环境变量（如果需要）
vercel env add TOKENS_REDIS_URL production
vercel env add VIDEO_GENERATION_ENABLED production

# 5. 烟雾测试
# 在生产环境快速测试 img2img + tokens
```

---

## 📈 **监控 & 反馈**

### 关键指标（部署后 7 天）
```sql
-- 代币消耗趋势
SELECT DATE(created_at) as day, 
       SUM(tokens_consumed) as total,
       COUNT(DISTINCT user_id) as users
FROM generation_ledger
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- img2img 使用率
SELECT COUNT(*) FILTER (WHERE input_image IS NOT NULL) as img2img_count,
       COUNT(*) as total_count,
       ROUND(100.0 * COUNT(*) FILTER (WHERE input_image IS NOT NULL) / COUNT(*), 2) as percentage
FROM generation_ledger
WHERE created_at > NOW() - INTERVAL '7 days';

-- 视觉记忆召回准确率
SELECT AVG(similarity) as avg_similarity,
       COUNT(*) as recall_count
FROM generation_memory
WHERE last_accessed_at IS NOT NULL;
```

### 用户反馈收集
- [ ] 添加应用内反馈按钮（👍/👎 for generated images）
- [ ] 监控 Twitter/Reddit 讨论
- [ ] 分析 Support 工单关键词

---

## ✅ **最终确认**

在提交代码前，请确认：

- [ ] 所有 P0 测试用例通过
- [ ] 代码已格式化 (`pnpm format`)
- [ ] 无 ESLint 错误 (`pnpm lint`)
- [ ] Commit message 符合约定
- [ ] PR 描述已填写变更摘要
- [ ] 已通知相关团队成员 review

---

**准备好了吗？** 

按顺序执行：
1. 🔴 **Phase 1: 数据库迁移**（5 分钟）
2. 🔴 **Phase 2: 代码验证**（10 分钟）
3. 🔴 **Phase 3: 本地测试**（20 分钟）

遇到问题？查看 `P0-P2_EXECUTION_GUIDE.md` 的详细故障排查章节。

祝部署顺利！🎉
