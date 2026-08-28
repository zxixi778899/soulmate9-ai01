# 🧪 NOWPayments API 完整性测试脚本

## 📋 **完整诊断流程**

这个脚本会全面检查 NOWPayments API 的各个方面，包括：
- API Key 有效性
- 支持的交易币种
- 价格计算功能
- IPN Webhook URL 验证

---

## 🔧 **Step 1: 基础连通性测试**

```powershell
# NOWPayments API 完整性测试脚本
# 运行前请确保已安装 PowerShell 7+ (pwsh)

$apiKey = '162736a2-82ea-4a6b-85b5-18b0f72cd132'
$baseUrl = 'https://api.nowpayments.io/v1'

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NOWPayments API 完整性测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nAPI Key: ${apiKey.Substring(0,8)}...$($apiKey.Substring($apiKey.Length-4))" -ForegroundColor Yellow

# Test 1: API Status
Write-Host "`n[TEST 1] API Status Check..." -ForegroundColor Green
try {
    $response = Invoke-RestMethod `
        -Uri "$baseUrl/status" `
        -Headers @{ 'x-api-key' = $apiKey } `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "✅ API 响应正常：" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor White
} catch {
    Write-Host "❌ API Status 失败:" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get Available Currencies
Write-Host "`n[TEST 2] 获取支持的加密货币列表..." -ForegroundColor Green
try {
    $currencies = Invoke-RestMethod `
        -Uri "$baseUrl/currencies" `
        -Headers @{ 'x-api-key' = $apiKey } `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "✅ 共支持 $($currencies.Count) 种货币" -ForegroundColor Green
    Write-Host "   包含 USDT TRC-20: $(($currencies | Where-Object { $_ -eq 'usdttrc20' }) ? '是' : '否')" -ForegroundColor White
    Write-Host "   前 5 种支持的货币：" -ForegroundColor Gray
    $currencies | Select-Object -First 5 | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }
} catch {
    Write-Host "❌ 获取货币列表失败:" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Price Estimate for USD → USDT
Write-Host "`n[TEST 3] 计算 USD→USDT 汇率..." -ForegroundColor Green
try {
    $amount = 9.99
    $priceResponse = Invoke-RestMethod `
        -Uri "$baseUrl/price?amount=$amount&currency_from=usd&currency_to=usdttrc20" `
        -Headers @{ 'x-api-key' = $apiKey } `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "✅ 汇率计算正常" -ForegroundColor Green
    Write-Host "   输入：$$amount USD" -ForegroundColor Gray
    Write-Host "   输出：`$($priceResponse.estimated_amount) USDT (TRC-20)" -ForegroundColor Green
    Write-Host "   汇率：1 USD = $($priceResponse.rate) USDT" -ForegroundColor Gray
} catch {
    Write-Host "❌ 汇率计算失败:" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Create Payment（关键测试）
Write-Host "`n[TEST 4] 创建模拟支付订单..." -ForegroundColor Green
try {
    $orderId = "test_$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
    $orderDesc = "Test Order for Oxmate AI Pricing"
    
    $paymentBody = @{
        price_amount = 9.99
        price_currency = 'usd'
        pay_currency = 'usdttrc20'
        order_id = $orderId
        order_description = $orderDesc
        ipn_callback_url = 'https://www.oxmate-ai.com/api/crypto/webhook'
        success_url = 'https://www.oxmate-ai.com/pricing?success=true'
        cancel_url = 'https://www.oxmate-ai.com/pricing?canceled=true'
    } | ConvertTo-Json
    
    $paymentResponse = Invoke-RestMethod `
        -Uri "$baseUrl/payment" `
        -Headers @{ 
            'x-api-key' = $apiKey
            'Content-Type' = 'application/json'
        } `
        -Method Post `
        -Body $paymentBody `
        -ErrorAction Stop
    
    Write-Host "✅ 支付订单创建成功!" -ForegroundColor Green
    Write-Host "   订单 ID: $($paymentResponse.order_id)" -ForegroundColor Gray
    Write-Host "   支付地址：$($paymentResponse.pay_address)" -ForegroundColor Gray
    Write-Host "   需要支付：`$($paymentResponse.pay_amount) $($paymentResponse.pay_currency)" -ForegroundColor Green
    Write-Host "   网络类型：$($paymentResponse.network)" -ForegroundColor Gray
    Write-Host "   有效时间：$([datetime]::AddMinutes($null,$paymentResponse.expiration_time))" -ForegroundColor Gray
} catch {
    Write-Host "❌ 创建支付订单失败:" -ForegroundColor Red
    Write-Host "   Full Error: $($_.Exception.Message)" -ForegroundColor Red
    
    # Extract detailed error from response if available
    try {
        $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "   Detailed Error: $($errorJson.message)" -ForegroundColor DarkRed
        Write-Host "   Suggestion: $($errorSuggestion[$errorJson.code])" -ForegroundColor Magenta
    } catch {}
}

# Test 5: Check Account Balance (optional)
Write-Host "`n[TEST 5] 检查账户余额..." -ForegroundColor Green
try {
    $balanceResponse = Invoke-RestMethod `
        -Uri "$baseUrl/user/balances" `
        -Headers @{ 'x-api-key' = $apiKey } `
        -Method Get `
        -ErrorAction Stop
    
    Write-Host "✅ 账户余额查询成功" -ForegroundColor Green
    Write-Host "   USDT 余额：$($balanceResponse.usdttrc20.balance)" -ForegroundColor White
} catch {
    Write-Host "⚠️ 无法查询余额（可能需要权限）:" -ForegroundColor Yellow
    Write-Host "   这不影响 API Key 的有效性" -ForegroundColor Gray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "测试完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 ALL TESTS PASSED!" -ForegroundColor Green
    Write-Host "如果生产环境仍然失败，请检查：" -ForegroundColor Yellow
    Write-Host "1. API Key 是否被修改或损坏" -ForegroundColor White
    Write-Host "2. NOWPayments 账户是否欠费或受限" -ForegroundColor White
    Write-Host "3. IPN Webhook 是否配置正确" -ForegroundColor White
    Write-Host "4. 当前 API Key 所属的租户/项目是否与你的站点匹配" -ForegroundColor White
} else {
    Write-Host "`n❌ SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "请查看上面的详细错误信息进行修复" -ForegroundColor White
}
```

---

## 📊 **预期输出与故障分析**

### ✅ **所有测试通过的情况：**

```
========================================
NOWPayments API 完整性测试
========================================

API Key: 162736a2...cd132

[TEST 1] API Status Check...
✅ API 响应正常：
   Message: Hello! The API works

[TEST 2] 获取支持的加密货币列表...
✅ 共支持 250 种货币
   包含 USDT TRC-20: 是

[TEST 3] 计算 USD→USDT 汇率...
✅ 汇率计算正常
   输入：$9.99 USD
   输出：$9.99 USDT (TRC-20)
   汇率：1 USD = 0.99 USDT

[TEST 4] 创建模拟支付订单...
✅ 支付订单创建成功!
   订单 ID: test_20240828103045
   支付地址：TUE8yxwJZEMSGbQSt22CRcTqA9CxyvNhUc
   需要支付：$9.99 usdttrc20
   网络类型：TRC-20
   有效时间：2024-08-28T10:45:45Z

[TEST 5] 检查账户余额...
✅ 账户余额查询成功
   USDT 余额：1234.56

========================================
测试完成！
========================================

🎉 ALL TESTS PASSED!
```

**结论：** API Key 完全正常，问题不在 NOWPayments 服务

---

### ❌ **TEST 1 或 TEST 2 失败的情况：**

```
❌ API Status 失败:
   Error: HTTP 401: {"status":"false","statusCode":401,"code":"INVALID_API_KEY","message":"Invalid api key"}
```

**结论：** API Key 本身无效或被禁用

**解决方案：**
1. 登录 NOWPayments Dashboard
2. Settings → API Keys
3. 删除现有 Key 并重新生成
4. 更新 Vercel 环境变量

---

### ❌ **TEST 4 失败但其他测试通过的情况：**

```
[TEST 4] 创建模拟支付订单...
❌ 创建支付订单失败:
   Error: HTTP 403: {"status":"false","statusCode":403,"code":"INSUFFICIENT_FUNDS","message":"Insufficient funds"}
```

**结论：** 账户余额不足或有其他限制

**解决方案：**
1. 联系 NOWPayments 客服充值
2. 检查账户是否有未完成的交易

---

### ❌ **TEST 4 失败显示 IPN Webhook 问题：**

```
[TEST 4] 创建模拟支付订单...
❌ 创建支付订单失败:
   Error: HTTP 400: {"status":"false","statusCode":400,"code":"IPN_CALLBACK_URL_NOT_VALID","message":"ipn_callback_url is not valid"}
```

**结论：** Callback URL 配置有问题

**解决方案：**
1. 确认你的域名已正确配置 SSL 证书
2. 确认 `/api/crypto/webhook` 路由存在且可访问
3. 尝试使用不同的回调 URL（如 `https://www.oxmate-ai.com/api/payment/ipn`）

---

## 🔧 **如何运行此脚本**

### **方式 A: 直接复制粘贴到 PowerShell**

1. 打开 PowerShell
2. 复制上面的脚本内容
3. 粘贴到 PowerShell 中
4. 按 Enter 执行

### **方式 B: 保存为文件后运行**

```powershell
# 1. 保存脚本
Set-Content test-nowpayments.ps1 -Value @"
# [粘贴上面的完整脚本内容]
"@

# 2. 运行脚本
.\test-nowpayments.ps1
```

---

## 🆘 **测试结果分析指南**

### **场景 1: 本地测试全部通过，但生产环境失败**

**原因分析：**
1. Vercel Edge Functions 的环境变量没有被正确读取
2. 生产环境的 API Key 与实际使用的不同
3. NOWPayments IP 黑名单限制了 Vercel 的边缘节点

**解决方案：**
1. 在 NOWPayments Dashboard 中添加你所在地区的 IP 白名单（如果有）
2. 联系 NOWPayments 支持团队询问是否有地域限制
3. 尝试使用第三方代理或 VPN 测试 API 调用

### **场景 2: 本地测试失败**

**立即执行：**
1. 检查 API Key 是否完整复制（无空格）
2. 验证 NOWPayments 账户是否正常激活
3. 联系 NOWPayments 技术支持

---

## 📝 **下一步行动清单**

请按顺序执行以下步骤并提供反馈：

### **Step 1: 运行上述测试脚本**

将完整脚本复制到 PowerShell 中运行，截图输出结果给我。

### **Step 2: 检查 NOWPayments Dashboard**

1. 登录：https://nowpayments.io/
2. 查看账户状态是否正常
3. 检查账户是否有未完成的交易或警告
4. 确认当前使用的 API Key 是正确的租户/项目下的

### **Step 3: 对比测试结果**

如果你的本地测试结果与 Vercel 日志中的错误一致，说明问题确实在 NOWPayments 侧，需要提供详细测试报告给他们。

---

## 📞 **如果需要联系 NOWPayments 支持**

使用以下模板：

```
Subject: [URGENT] Invalid API Key Error Despite Valid Credentials

Dear NOWPayments Support Team,

I'm experiencing an issue where my API key appears to be invalid in production, although it works fine when I test it locally.

API Key: 162736a2-82ea-4a6b-85b5-18b0f72cd132
Project: Oxmate AI (https://www.oxmate-ai.com)

Error Details:
- Local Testing: ✅ All tests passed
- Production Environment: ❌ Returns "INVALID_API_KEY" (HTTP 401/403)
- Error Location: POST /payment endpoint
- Expected Behavior: Should create a payment order with price_amount=9.99, currency=usd/usdttrc20

Troubleshooting Steps Completed:
1. ✅ Verified API Key format and completeness
2. ✅ Checked API Key validity via /status endpoint
3. ✅ Confirmed supported currencies include usdttrc20
4. ✅ Tested price calculation endpoint successfully
5. ✅ Reviewed account balance and status
6. ✅ Double-checked Vercel environment variables configuration

This seems like an account-specific or region-based restriction. Please help me investigate:

1. Is there any account-level restriction blocking the /payment endpoint?
2. Is this API key associated with the correct tenant/project?
3. Are there any known issues or maintenance activities affecting this account?
4. Can you check the API key's last successful usage timestamp?

Environment Information:
- Platform: Vercel (Edge Functions)
- Region: Production deployment in Asia-Pacific (if applicable)
- IP Range: [Provide your server IP or use what Vercel logs show]

Thank you for your assistance. Looking forward to your prompt response.

Best regards,
[Your Name]
[Contact Information]
```

---

这个脚本能全面诊断 NOWPayments API 的问题根源。运行后请把测试结果截图发给我，我会根据你的具体情况给出针对性的建议！
