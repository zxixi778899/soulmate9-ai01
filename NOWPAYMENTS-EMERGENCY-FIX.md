# 🚨 NOWPayments 紧急修复方案 - Vercel Logs 分析

## 📊 **当前问题状态**

根据你的截图：
- ✅ NOWPayments API Key 验证正常（PowerShell 测试通过）
- ❌ `/api/crypto/initiate` 返回 500 Internal Server Error
- ⚠️ 响应体大小：0.3 kB（很短，说明是简化的错误消息）

---

## 🔍 **最可能的三个原因**

根据代码分析和 Network 面板，问题出在这两个位置之一：

### **原因 A: 第 53-73 行 数据库插入失败** ❌ (可能性：60%)
```typescript
// 如果 crypto_payments 表的 RLS 策略或权限有问题
const { data: payment, error: dbError } = await supabase
  .from('crypto_payments')
  .insert({ user_id, plan_id, amount_usd, ... });

if (dbError || !payment) {
  // ← 这里会返回简化的错误消息 "Failed to initiate payment"
  return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
}
```

### **原因 B: 第 75-118 行 NOWPayments API 调用失败** ❌ (可能性：40%)
```typescript
try {
  const paymentResult = await nowPaymentsCreatePayment({...});
  // ← 如果这里的 URL 构建有问题（如 NEXT_PUBLIC_SITE_URL 为空）
} catch (err) {
  // 这里会记录详细的 NOWPayments 错误日志到 Vercel
  logger.error('NOWPayments API call failed:', { err, ... });
  return NextResponse.json(
    { 
      error: 'Failed to create payment with NOWPayments', 
      details: err.message  // ← 这会包含更详细的信息
    }, 
    { status: 500 }
  );
}
```

---

## ✅ **立即执行的关键步骤**

### **Step 1: 查看 Response Body 的完整 JSON 内容**

在 Browser DevTools → Network 标签页：

1. **找到红色的 `initiate` 请求**
2. **点击该请求**（会显示右侧详情面板）
3. **切换到 "Response" 或 "Preview" 标签**
4. **截图完整的 JSON 响应内容给我看**

**期望看到的两种可能：**

#### ✅ 如果是数据库问题（原因 A）：
```json
{
  "error": "Failed to initiate payment"
}
```

#### ✅ 如果是 NOWPayments API 问题（原因 B）：
```json
{
  "error": "Failed to create payment with NOWPayments",
  "details": "具体错误信息..."
}
```

这个 Response Body 能直接告诉我问题的根源！

---

### **Step 2: 访问 Vercel Dashboard Logs（必做）**

这是获取后端详细日志的最快方式：

#### **方法 A: 网页版操作**
1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/logs
2. 左侧选择 **"Production"** 环境（不是 Preview 或 Development）
3. 点击右上角的刷新按钮或时间过滤器
4. 在浏览器中刷新 pricing 页面并点击购买按钮
5. **观察日志流中的输出**
6. **截图显示包含以下关键词的日志：**
   - `[crypto/initiate]`
   - `[nowpayments]`
   - `API call failed`
   - `Failed to create crypto payment record`

#### **方法 B: 使用 Vercel CLI（推荐）**
```bash
# 登录 Vercel（如果还没登录）
vercel login

# 开始实时监控生产环境日志
vercel logs --prod

# 然后在浏览器中点击购买按钮，实时复制输出的内容给我
```

**期望在日志中看到的内容：**

#### ✅ 如果是数据库问题：
```
[error] Failed to create crypto payment record: {
  code: "PGRST116",
  details: "row is not allowed",
  hint: "Updates on tables with no primary key are not allowed."
}
```

#### ✅ 如果是 NOWPayments API 问题：
```
[crypto/initiate] Received request: {planId: 'pro', billing: 'monthly'}
[info] [nowpayments] Creating payment: {price_amount: 9.99, order_id: '...'}
[error] NOWPayments API call failed: {
  err: "NOWPayments /payment HTTP 401: {\"message\":\"Invalid API Key\"}",
  planId: 'pro',
  billing: 'monthly'
}
```

---

### **Step 3: 检查 Vercel Deployment 和 Cache**

确认你的部署是在添加环境变量之后进行的：

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
2. 查看最近几次部署的时间戳
3. **确认最后一次的部署时间晚于你添加所有 10 个环境变量的时间**

如果没有，手动触发重新部署：
- 找到绿色对钩的部署
- 点击右侧的三个点 (...)
- 选择 **"Redeploy"**
- ⚠️ **务必勾选 "Clear Caches and Rebuild"**

---

## 🔧 **快速诊断命令（如果有 Vercel CLI）**

```powershell
# 1. 查看生产环境的环境变量列表
vercel env ls --prod | Select-String 'NOWPAYMENTS\|SITE_URL\|APP_URL'

# 期望看到 10 行输出：
# NOWPAYMENTS_API_KEY
# NOWPAYMENTS_IPN_SECRET
# NOWPAYMENTS_PAY_CURRENCY
# NEXT_PUBLIC_SITE_URL
# NEXT_PUBLIC_APP_URL
# CRYPTO_TOKENS_500_PRICE
# CRYPTO_TOKENS_1000_PRICE
# CRYPTO_TOKENS_2500_PRICE
# CRYPTO_TOKENS_5000_PRICE
# CRYPTO_TOKENS_10000_PRICE

# 2. 实时追踪日志
vercel logs --prod | Select-String "crypto|nowpayments" -Context 3,3
```

---

## 🎯 **下一步行动清单**

请按顺序提供以下信息给我：

### **必需信息（缺一不可）**

1. ✅ **Network Panel Response Body 的完整截图**
   - Network 标签 → 找到红色 initiate 请求 → Response 标签 → 截图
   
2. ✅ **Vercel Dashboard Logs 的截图**
   - Production 环境 → 点击购买后立即截图
   - 或者 vercel logs --prod 的输出内容

### **可选但有帮助的信息**

3. ⭕ **Browser Console 的错误堆栈**
   - Console 标签 → 截图显示的所有错误信息
   
4. ⭕ **Vercel env ls --prod 的输出**
   - 如果有 Vercel CLI 的话

---

## 💡 **基于不同错误的预期解决方案**

### **如果 Response 是 `{error: 'Failed to initiate payment'}`：**

**问题根源：** 数据库 `crypto_payments` 表插入失败

**解决方案：**
1. 检查 Supabase SQL Editor 中 `crypto_payments` 表是否存在
2. 检查 RLS 策略是否允许普通用户插入
3. 可能需要调整 RLS 策略或授予服务角色权限

---

### **如果 Response 包含 NOWPayments 相关错误详情：**

**问题根源：** NOWPayments API 调用被拒绝

**常见错误消息及解决方案：**

#### ❌ `"Invalid API Key"` or `"Authentication failed"`
- 虽然本地测试正常，但生产环境的 API Key 可能被修改
- **解决：** 删除现有的 `NOWPAYMENTS_API_KEY` → 重新粘贴完整值 → Redeploy

#### ❌ `"Invalid parameter: ipn_callback_url"`
- `NEXT_PUBLIC_SITE_URL` 在生产环境为空或格式错误
- **解决：** 检查并重新配置这两个环境变量：
  ```
  NEXT_PUBLIC_SITE_URL=https://www.oxmate-ai.com
  NEXT_PUBLIC_APP_URL=https://www.oxmate-ai.com
  ```

#### ❌ `"Payment already exists for this order_id"`
- 订单 ID 重复
- **解决：** 重置数据库中的旧订单记录

---

请按照上面的步骤提供详细信息，我就能给你最精准的修复方案！🔍
