# 🔍 NOWPayments 支付错误的精准诊断方案

## 📊 **你的 Network 面板显示**

根据截图分析：
- ✅ 前端代码在正常工作 → 调用了 `/api/crypto/initiate`
- ❌ 后端返回 **500 错误**
- ⚠️ 响应体只有 0.3 kB（说明是短的错误消息）
- 🎯 具体错误：`Failed to create payment with NOWPayments`

---

## 🎯 **根本原因确认**

从代码 `src/app/api/crypto/initiate/route.ts` 可以看到：

```typescript
// 第 75-86 行：调用 NOWPayments API
const paymentResult = await nowPaymentsCreatePayment({
  price_amount: amountUsd,
  pay_currency: PAYMENT_CURRENCY, // 'usdttrc20'
  order_id: orderId,
  // ... 其他参数
});
```

**这个调用一定会经过 `src/lib/nowpayments-server.ts` 第 15-21 行的检查：**

```typescript
function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY || '';
  if (!key) {
    logger.error('[nowpayments] API Key not configured!');
    throw new Error('NOWPayments is misconfigured - API Key missing in environment variables');
  }
  return key;
}
```

---

## 📋 **立即执行：检查 Vercel 日志**

### **步骤 1: 使用 Vercel CLI 查看实时日志**

如果你安装了 Vercel CLI：

```powershell
# Login to Vercel (如果还没登录)
vercel login

# 开始实时监控生产环境日志
vercel logs --prod
```

然后保持这个窗口打开，在浏览器中点击 "使用 USDT 支付" 按钮，观察日志输出。

**期望看到类似这样的日志：**

```
[info] [crypto/initiate] Received request: {"planId":"pro","billing":"monthly"}
[error] [nowpayments] API Key not configured!
或
[error] NOWPayments API error: {"path":"/payment","status":401,"body":"..."}
```

---

### **步骤 2: 如果没有安装 Vercel CLI**

访问 **Vercel Dashboard** 查看日志：

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/logs
2. 选择 **"Production"** 环境
3. 点击购买按钮后立即刷新页面
4. 查找包含以下关键词的日志：
   - `[crypto/initiate]`
   - `[nowpayments]`
   - `API Key`
   - `misconfigured`

---

## 🔍 **三种可能的错误场景**

### **场景 A: API Key 确实没有配置** ⚠️ (最可能)

**日志特征：**
```
[error] [nowpayments] API Key not configured!
[error] NOWPayments create payment: API Key missing in environment variables
```

**解决方案：**
1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables
2. 删除现有的 `NOWPAYMENTS_API_KEY`
3. 重新添加，确保：
   - Name: `NOWPAYMENTS_API_KEY` (完全匹配大小写)
   - Value: `162736a2-82ea-4a6b-85b5-18b0f72cd132` (完整复制，不要有空格)
   - ☑️ Production (必须勾选！)
   - ☑️ Preview
   - ☑️ Development

4. 点击 **"Deployments"** → **"Redeploy"** 强制重新部署
5. 等待构建完成（约 2-3 分钟）

---

### **场景 B: API Key 已配置但格式有问题** ❌

**日志特征：**
```
[error] NOWPayments API error: {"path":"/payment","status":401,"body":{"message":"Invalid API Key"}}
```

**原因分析：**
- API Key 被截断（如 `162736a2...cd132` 被省略为简略显示）
- Value 字段包含多余空格
- 使用了错误的 API Key

**解决方案：**
1. 在 Vercel Dashboard 的环境变量页面
2. 点击 `NOWPAYMENTS_API_KEY` 的编辑按钮
3. 删除整个 Value
4. **完整复制粘贴**这个值：
   ```
   162736a2-82ea-4a6b-85b5-18b0f72cd132
   ```
   ⚠️ 注意：不要有前导或尾随空格
5. 保存并重新部署

---

### **场景 C: API Key 正确但 NOWPayments 服务问题** 🤷

**日志特征：**
```
[error] NOWPayments API error: {"path":"/payment","status":500,"body":"Service temporarily unavailable"}
或
[error] NOWPayments API error: {"path":"/payment","status":403,"body":"IP blocked"}
```

**解决方案：**
这种情况比较少见，需要联系 NOWPayments 支持团队。

你可以先测试 API Key 是否有效：

```powershell
# PowerShell 测试命令
$headers = @{ 'x-api-key' = '162736a2-82ea-4a6b-85b5-18b0f72cd132' }
try {
    $response = Invoke-RestMethod `
        -Uri 'https://api.nowpayments.io/v1/status' `
        -Headers $headers `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "✅ NOWPayments API works!" -ForegroundColor Green
    Write-Host $response.message
    Write-Host "`nYour API Key is valid." -ForegroundColor Cyan
} catch {
    Write-Host "❌ NOWPayments API Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    Write-Host "`nPlease check with NOWPayments support." -ForegroundColor Magenta
}
```

---

## ✅ **推荐的快速验证流程**

### **方法 1: 通过 Browser Console 直接获取错误详情**

虽然 Network 面板只显示简短的错误消息，但我们可以尝试让前端显示完整的 details：

1. 打开 Browser DevTools (`F12`)
2. 切换到 **Console** 标签
3. 找到控制台中的错误消息
4. 点击展开查看完整堆栈

或者手动修改一下代码让它显示更多细节：

临时修改 `src/app/(main)/pricing/page.tsx` 的支付处理逻辑（可选）：

```javascript
if (!res.ok) {
  const data = await res.json().catch(() => ({ error: 'Unknown error' }));
  toast.error(`${data.details || data.error || 'Checkout failed'}`);
  return;
}
```

这样就能直接在页面提示中看到完整的错误详情！

---

### **方法 2: 使用 `vercel env ls --prod` 直接验证**

如果你有 Vercel CLI 并已登录：

```powershell
# 列出生产环境的所有环境变量
vercel env ls --prod

# 应该看到类似这样的输出：
# CREATED AT           NAME                           DESCRIPTION
# 2024-08-28T10:xx     NOWPAYMENTS_API_KEY            
# 2024-08-28T10:xx     NOWPAYMENTS_IPN_SECRET         
# 2024-08-28T10:xx     NOWPAYMENTS_PAY_CURRENCY       
# 2024-08-28T10:xx     CRYPTO_TOKENS_500_PRICE        
# ... 等等
```

如果看不到 `NOWPAYMENTS_API_KEY` 这一行，说明环境变量确实没添加成功！

---

## 🆘 **最终建议**

根据你的情况，我怀疑是以下两种之一：

1. **环境变量添加了但没有勾选 Production 环境**
   - 解决：重新添加，三个环境全部打勾
   
2. **添加了但没有重新部署**
   - 解决：Dashboard → Deployments → Redeploy → Clear Caches

---

## 📝 **下一步操作清单**

请按顺序执行以下步骤，并提供反馈：

### **Step 1: 验证环境变量状态**
```bash
# 运行这个命令（如果有 vercel cli）
vercel env ls --prod | Select-String 'NOWPAYMENTS'
```

**如果看不到 3 个 NOWPAYMENTS 相关变量：**
- → 直接在 Vercel Dashboard 重新添加这 8 个变量
- → 确保每个都勾选了 **Production + Preview + Development**

### **Step 2: 强制重新部署**
访问：https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
- 找到最近一次部署
- 点击 **"Redeploy"**
- **勾选 "Clear Caches and Rebuild"**
- 等待构建完成

### **Step 3: 清除浏览器缓存**
```bash
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)
```

### **Step 4: 再次测试支付**
- 刷新 pricing 页面
- 点击 Pro 会员的 "使用 USDT 支付"
- 观察浏览器 Console 是否有更详细的错误信息

---

如果还是不行，请提供：

1. **Browser Console 的完整错误堆栈**（不仅仅是 Network 面板）
2. **Network 面板中 `/api/crypto/initiate` 的 Response 内容截图**（展开 Details 标签）
3. **Vercel Dashboard Logs 的输出**（如果有的话）

这些信息能帮我精准定位问题所在！
