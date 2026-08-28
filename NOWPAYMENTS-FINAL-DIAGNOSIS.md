# 🛠️ NOWPayments 支付问题终极诊断方案

## 🔍 **问题分析**

从你的截图和代码分析，`/api/crypto/initiate` 返回 500 错误时，**可能是以下两个位置之一失败：**

### **可能原因 A: 数据库插入失败** ❌ (第 53-73 行)
```typescript
const { data: payment, error: dbError } = await supabase
  .from('crypto_payments')
  .insert({ user_id, plan_id, amount_usd, ... });

if (dbError || !payment) {
  logger.error('Failed to create crypto payment record:', { error: dbError });
  return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
}
```

### **可能原因 B: NOWPayments API 调用失败** ❌ (第 75-118 行)
```typescript
const paymentResult = await nowPaymentsCreatePayment({...}); // ← 如果这里报错会进入 catch
```

---

## ✅ **立即执行步骤**

### **Step 1: 通过 Browser Console 获取更详细的错误信息**

虽然 Network 面板只显示简短的错误消息，但我们可以通过修改前端来看到完整详情：

临时修改 `src/app/(main)/pricing/page.tsx` 的支付处理逻辑（可选，仅用于调试）：

找到这个部分并查看完整的错误对象。或者直接使用 Browser Console 的 **Preserve log** 选项：

1. F12 → Console 标签
2. 勾选顶部的 **"Preserve log"** (保留日志)
3. 刷新页面
4. 点击购买按钮
5. **展开错误信息的完整内容**，看是否有 `details` 字段

---

### **Step 2: 创建临时诊断端点**

我建议你创建一个临时的测试 API 来直接获取后端日志：

**临时添加这个调试路由：**

创建新文件：`src/app/api/test-nowpayments/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { nowPaymentsStatus } from '@/lib/nowpayments-server';

export async function GET(request: Request) {
  const { user, error } = await getAuthUser(request);
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 测试 NOWPayments API 连接
    const status = await nowPaymentsStatus();
    
    return NextResponse.json({
      success: true,
      api_status: status.message,
      env_vars: {
        hasApiKey: !!process.env.NOWPAYMENTS_API_KEY,
        apiKeyLength: process.env.NOWPAYMENTS_API_KEY?.length,
        ipnSecretConfigured: !!process.env.NOWPAYMENTS_IPN_SECRET,
        payCurrency: process.env.NOWPAYMENTS_PAY_CURRENCY,
      },
      urls: {
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
      },
    });
  } catch (err) {
    logger.error('Test NOWPayments API failed:', { err });
    return NextResponse.json(
      { 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

然后访问：
```
https://www.oxmate-ai.com/api/test-nowpayments
```

这会让你直接看到后端的详细配置状态！

---

### **Step 3: 检查 Vercel Logs**

这是最重要的排查方式：

```bash
# 如果有 Vercel CLI
vercel logs --prod | Select-String "crypto|nowpayments" -Context 3,3
```

或者手动操作：

1. 访问 https://vercel.com/dashboard/projects/soulmate9-ai01/logs
2. 选择 **Production** 环境
3. 清空现有日志
4. 在浏览器中刷新 pricing 页面
5. 点击购买按钮
6. 查看实时日志输出

**你期望看到的日志：**

#### ✅ **成功的场景：**
```
[info] [crypto/initiate] Received request: {"planId":"pro","billing":"monthly"}
[info] [nowpayments] Creating payment: {price_amount: 9.99, order_id: "soulmate_pro_monthly_..."}
[info] [crypto/initiate] Payment created successfully
```

#### ❌ **数据库失败的错误：**
```
[error] Failed to create crypto payment record: {
  code: "...",
  details: "...",
  hint: "..."
}
```

#### ❌ **NOWPayments API 失败的错误：**
```
[error] NOWPayments API call failed: {
  err: "NOWPayments /payment HTTP 401: {\"message\":\"Invalid API Key\"}",
  planId: "pro",
  billing: "monthly",
  amountUsd: 9.99
}
```

---

### **Step 4: 手动验证环境变量值**

在 Vercel Dashboard 中逐个点击查看每个 NOWPayments 相关的环境变量值：

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables
2. 点击 `NOWPAYMENTS_API_KEY` 前面的小眼睛图标 👁️
3. **确认显示的完整值是：** `162736a2-82ea-4a6b-85b5-18b0f72cd132`
   - ⚠️ 如果显示被截断或变短了，说明输入有问题
4. 同样检查其他几个核心变量

---

### **Step 5: 直接测试 NOWPayments API 连通性**

在本地 PowerShell 测试 API Key 是否有效：

```powershell
$headers = @{ 'x-api-key' = '162736a2-82ea-4a6b-85b5-18b0f72cd132' }

try {
    $response = Invoke-RestMethod `
        -Uri 'https://api.nowpayments.io/v1/status' `
        -Headers $headers `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "`n✅ NOWPayments API Key 有效！`n" -ForegroundColor Green
    Write-Host "Message: $($response.message)`n" -ForegroundColor Cyan
    
    # 尝试计算价格
    $testAmount = 9.99
    $currencyFrom = "usd"
    $currencyTo = "usdttrc20"
    
    $estimateResponse = Invoke-RestMethod `
        -Uri "https://api.nowpayments.io/v1/price?amount=$testAmount&currency_from=$currencyFrom&currency_to=$currencyTo" `
        -Headers $headers `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "价格估算测试:`n  USD: `$$testAmount`n  USDT TRC-20: `$($estimateResponse.estimated_amount)`n" -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ NOWPayments API 错误:`n$_" -ForegroundColor Red
    Write-Host "`n建议检查:`n1. API Key 是否正确？`n2. 账户余额是否充足？`n3. 是否开通了 USDT TRC-20 交易权限？`n" -ForegroundColor Yellow
}
```

**预期结果：**
- ✅ 应该能看到 API 正常工作，返回 estimated_amount
- ❌ 如果返回 401，说明 API Key 无效或格式错误

---

### **Step 6: 检查 Vercel 部署时间线**

确认你的部署是在添加环境变量之后进行的：

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
2. 查看最近几次部署的时间戳
3. 确认最后一次的部署时间 **晚于** 你添加环境变量的时间

如果部署在添加环境变量之前，必须手动触发重新部署：
- 找到绿色对钩的部署
- 点击右侧的三个点 (...)
- 选择 **"Redeploy"**
- **务必勾选 "Clear Caches and Rebuild"**

---

## 📊 **关键检查点总结**

按优先级顺序检查以下内容：

### **高优先级（必须检查）**

1. ✅ **Vercel Logs 中的详细错误信息**
   - 打开 https://vercel.com/dashboard/projects/soulmate9-ai01/logs
   - 选择 Production 环境
   - 点击购买按钮后立即刷新
   - 查找包含 `[crypto/initiate]` 或 `[nowpayments]` 的日志

2. ✅ **NOWPayments API Key 验证**
   - 运行上面提供的 PowerShell 测试命令
   - 确认 API Key 完全正确且未被修改

3. ✅ **环境变量添加后的重新部署**
   - 确认有 Redeploy 操作
   - 确认勾选了 "Clear Caches and Rebuild"

4. ✅ **NEXT_PUBLIC_SITE_URL 和 NEXT_PUBLIC_APP_URL 的值**
   - 在 Vercel Dashboard 中点击查看完整值
   - 确认是：`https://www.oxmate-ai.com`
   - 没有前导或尾随空格

### **中优先级**

5. ✅ **Browser Console 的详细错误堆栈**
   - F12 → Console
   - 勾选 "Preserve log"
   - 点击购买
   - 展开完整的错误信息

6. ✅ **Network 面板中 `/api/crypto/initiate` 的 Response Details**
   - F12 → Network
   - 找到红色的 `initiate` 请求
   - 展开右侧 Details 标签页
   - 复制完整的 JSON 响应内容

7. ✅ **数据库 `crypto_payments` 表的 RLS 策略**
   - 检查 Supabase SQL Editor
   - 确认 RLS 策略允许当前用户插入记录

### **低优先级（可能性较小）**

8. ✅ **NOWPayments 账户状态**
   - 登录 https://nowpayments.io/
   - 确认账户正常、未欠费、API Key 已启用

9. ✅ **网络连接和防火墙**
   - Vercel Edge Functions 能否访问外部网络

---

## 🆘 **需要你提供以下信息**

请按顺序执行以下步骤并提供反馈：

### **1. 运行 PowerShell API 测试**
```powershell
# 复制上面的 PowerShell 脚本并在本地终端运行
# 告诉我输出是什么
```

### **2. 提供 Vercel Log 的输出**
访问：https://vercel.com/dashboard/projects/soulmate9-ai01/logs
- 选择 Production 环境
- 点击购买按钮后立即截图

### **3. Browser Console 的完整错误堆栈**
F12 → Console → 截图显示的内容

### **4. Network Panel 的 Response Details**
F12 → Network → 点击红色的 `initiate` 请求 → Response 标签 → 截图

---

有了这些信息我才能精准定位问题并给出针对性解决方案！
