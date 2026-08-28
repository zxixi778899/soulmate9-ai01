# 🚨 NOWPayments 紧急修复方案（2 分钟完成）

## 问题原因
所有支付失败的根本原因：**Vercel Dashboard 没有配置环境变量**！

本地 `.env.prod.local` 被 git ignore，不会推送到 GitHub，所以 Vercel 部署时看不到这些变量。

## ✅ 立即修复步骤（3 步搞定）

### Step 1: 登录 Vercel Dashboard
访问 https://vercel.com/dashboard  
找到项目：`soulmate9-ai01`

### Step 2: 进入环境配置
1. 点击左侧菜单 → **Settings** (设置)
2. 点击左侧菜单 → **Environment variables** (环境变量)

### Step 3: 添加这 8 个环境变量

复制下面的表格内容到 Vercel Dashboard：

| Name | Value | Environments to apply to |
|------|-------|--------------------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_500_PRICE` | `599` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_1000_PRICE` | `999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_2500_PRICE` | `2299` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_5000_PRICE` | `3999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_10000_PRICE` | `6999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |

**重要提示：**
- ✅ 必须勾选 Production、Preview、Development **三个环境**
- ⚠️ 价格单位是 cents（美分），所以 `$5.99 = 599`

### Step 4: 重新部署
配置完成后：
1. 点击 **Deployments** (部署) 标签页
2. 找到最近一次部署，点击 **Redeploy** (重新部署)
3. 等待构建完成（约 1-2 分钟）

## 🧪 验证是否成功

### 测试会员订阅
1. 刷新页面
2. 点击 Pro 会员的 "使用 USDT 支付" 按钮
3. 应该看到弹出窗口显示 NOWPayments 的支付地址或 QR 码

### 测试积分充值
1. 切换到 Shop 页面的 Credits 标签
2. 点击 1000 credits ($9.99)
3. 选择 NowPayments
4. 应该跳转到 NOWPayments 的发票页面

## 📊 预期结果

✅ **成功后的表现：**
- 弹窗显示 NOWPayments 官方 UI（不是老式的填写 TX Hash）
- URL 类似：https://nowpayments.io/invoice/[invoice-id]
- 支付方式：USDT TRC-20
- 金额正确显示

❌ **仍然失败的表现：**
- 错误信息："Failed to create payment with NOWPayments"
- 说明环境变量还没生效，请检查：
  1. 环境变量是否正确添加？
  2. 是否选了 Production 环境？
  3. 是否重新部署了？

## 🔍 故障排查

### Q1: 环境变量添加了但没生效
A: 
1. 检查是否勾选了 Production 环境
2. 等待 30 秒让 Vercel 同步配置
3. 强制重新部署（不是 redeploy，是 delete + deploy）

### Q2: 价格还是不对
A: 检查数据库中的 `token_packages` 表，确认是否有正确记录

### Q3: API Key 验证
A: 运行这个 curl 命令测试：
```bash
curl -X GET "https://api.nowpayments.io/v1/status" \
  -H "x-api-key: 162736a2-82ea-4a6b-85b5-18b0f72cd132"
```

如果返回 {"message": "Hello! The API works"} 就说明 API Key 有效。

## 🆘 需要帮助？

如果按照上述步骤后仍有问题，请提供：
1. Vercel Dashboard 的环境变量截图（脱敏）
2. Browser Console 的错误信息
3. Vercel logs 输出（`vercel logs --prod`）
