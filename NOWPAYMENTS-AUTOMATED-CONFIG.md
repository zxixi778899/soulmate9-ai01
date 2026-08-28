# 🔄 NOWPayments 环境变量一键配置脚本

## 📋 **背景说明**

由于 NOWPayments 相关的 API Key 在生产环境无效，我们提供了一个完整的自动化配置脚本。

运行此脚本后，会自动向 Vercel Dashboard 添加所有必需的环境变量。

---

## 🔧 **使用方法**

### **方法 A: 手动通过 Dashboard 添加（推荐）**

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables
2. 逐个添加下面列出的 10 个环境变量
3. 每个变量都要勾选三个复选框

### **方法 B: 使用 Vercel CLI 自动化（需要安装 CLI）**

```bash
# 安装 Vercel CLI (如果还没安装)
npm i -g vercel

# 登录 Vercel
vercel login

# 添加环境变量（生产环境）
vercel env add NOWPAYMENTS_API_KEY --prod
# 输入：162736a2-82ea-4a6b-85b5-18b0f72cd132

vercel env add NOWPAYMENTS_IPN_SECRET --prod
# 输入：GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU

vercel env add NOWPAYMENTS_PAY_CURRENCY --prod
# 输入：usdttrc20

vercel env add NEXT_PUBLIC_SITE_URL --prod
# 输入：https://www.oxmate-ai.com

vercel env add NEXT_PUBLIC_APP_URL --prod
# 输入：https://www.oxmate-ai.com

vercel env add CRYPTO_TOKENS_500_PRICE --prod
# 输入：599

vercel env add CRYPTO_TOKENS_1000_PRICE --prod
# 输入：999

vercel env add CRYPTO_TOKENS_2500_PRICE --prod
# 输入：2299

vercel env add CRYPTO_TOKENS_5000_PRICE --prod
# 输入：3999

vercel env add CRYPTO_TOKENS_10000_PRICE --prod
# 输入：6999

# 最后查看已配置的所有环境变量
vercel env ls --prod | Select-String 'NOWPAYMENTS\|SITE_URL\|APP_URL'
```

---

## 📦 **完整的 10 个环境变量清单**

### **A. NOWPayments 核心配置（3 个）**

| Name | Value | Description |
|------|-------|-------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | API Key（当前报错的就是这个） |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | IPN (Webhook) HMAC 密钥 |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | 默认支付币种 |

### **B. 应用 URL 配置（2 个）**

| Name | Value | Description |
|------|-------|-------------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.oxmate-ai.com` | 站点基础 URL |
| `NEXT_PUBLIC_APP_URL` | `https://www.oxmate-ai.com` | 应用主 URL |

### **C. 代币包价格配置（5 个）**

| Name | Value | USD 等价值 |
|------|-------|-----------|
| `CRYPTO_TOKENS_500_PRICE` | `599` | $5.99 |
| `CRYPTO_TOKENS_1000_PRICE` | `999` | $9.99 |
| `CRYPTO_TOKENS_2500_PRICE` | `2299` | $22.99 |
| `CRYPTO_TOKENS_5000_PRICE` | `3999` | $39.99 |
| `CRYPTO_TOKENS_10000_PRICE` | `6999` | $69.99 |

**注意：** 所有价格都是美分格式（cents），所以 `$9.99 = 999`

---

## ✅ **配置后的验证步骤**

### **验证 1: 检查环境变量是否存在**

```powershell
# 如果有 Vercel CLI
vercel env ls --prod | Select-String 'NOWPAYMENTS_API_KEY'

# 期望看到输出：
# CREATED AT           NAME                           VALUE
# 2024-08-28T...       NOWPAYMENTS_API_KEY            <hidden>
```

### **验证 2: 测试 API Key 有效性**

```powershell
$headers = @{ 'x-api-key' = '162736a2-82ea-4a6b-85b5-18b0f72cd132' }

try {
    $response = Invoke-RestMethod `
        -Uri 'https://api.nowpayments.io/v1/status' `
        -Headers $headers
    
    Write-Host "✅ NOWPayments API Key 有效！" -ForegroundColor Green
} catch {
    Write-Host "❌ API Key 无效：$($_.Exception.Message)" -ForegroundColor Red
}
```

### **验证 3: 在 Vercel Dashboard 中查看详细日志**

1. 访问：https://vercel.com/dashboard/projects/soulmate9-ai01/logs
2. 选择 Production 环境
3. 在 Browser 中刷新 pricing 页面
4. 点击购买按钮
5. 查看实时日志

**期望看到：**
```
[info] [crypto/initiate] Received request: {"planId":"pro","billing":"monthly"}
[info] [nowpayments] Creating payment: {price_amount: 9.99, ...}
[info] Payment created successfully
```

如果还是失败，会看到：
```
[error] NOWPayments API call failed: {...}
```

---

## 🔍 **常见问题排查**

### **Q1: API Key 已经在 Dashboard 中，但还是报错 INVALID_API_KEY**

**可能原因：**
1. API Key 的值被截断或不完整
2. 包含了前导/尾随空格
3. 使用了不同环境的 API Key（如 Development 的而非 Production 的）

**解决方案：**
1. 删除现有的 NOWPAYMENTS_API_KEY
2. 重新完整粘贴新的值（不要有空格）
3. 勾选三个环境（Production + Preview + Development）
4. Redeploy 强制重新部署

### **Q2: 添加了环境变量但没生效**

**解决方案：**
1. 确认勾选了 Production 环境
2. 执行 Redeploy（不是普通刷新）
3. 勾选 "Clear Caches and Rebuild"
4. 等待 2-3 分钟让 Vercel 完全部署

### **Q3: 如何获取正确的 API Key？**

**来源：**
1. 登录 NOWPayments Dashboard: https://nowpayments.io/
2. Settings → API Keys
3. 复制现有的 API Key
4. 如果没有 API Key，需要创建一个新的

**重要提示：**
- API Key 只在创建时显示一次
- 请务必妥善保存备份
- 不要在 GitHub 或公共代码仓库中泄露

---

## 🆘 **仍然无法解决？**

如果按照上述步骤后仍有问题，请提供：

1. **Vercel Dashboard 中 NOWPAYMENTS_API_KEY 的 Value 截图**（脱敏）
2. **Browser Console 的完整错误堆栈**
3. **Vercel Logs 的输出内容**

这样能帮我进一步诊断具体是哪一步出了问题。
