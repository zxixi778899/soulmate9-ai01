# NOWPayments API Key 配置指南

## 🚨 问题说明

你的 `.env.prod.local` 文件中的 NOWPayments API Key **不会被推送到 Vercel**，因为：
- `.env*.local` 被 `.gitignore` 忽略
- Vercel 需要手动配置环境变量

## ✅ 解决方案（3 选 1）

### Option 1: 通过 Vercel Dashboard（推荐）⭐

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择项目 `soulmate9-ai01`
3. 点击 **Settings → Environment Variables**
4. 添加以下变量：

| Name | Value | Environments |
|------|-------|--------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | Production<br>Preview<br>Development |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | Production<br>Preview<br>Development |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | Production<br>Preview<br>Development |

5. 保存后点击 **Deployments → Redeploy**

### Option 2: 通过 Vercel CLI

```bash
# Install Vercel CLI if not already
npm i -g vercel

# Login to Vercel
vercel login

# Set env vars for production
vercel env add NOWPAYMENTS_API_KEY 162736a2-82ea-4a6b-85b5-18b0f72cd132
vercel env add NOWPAYMENTS_IPN_SECRET "GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU"
vercel env add NOWPAYMENTS_PAY_CURRENCY usdttrc20

# When prompted, select: "production" environment
```

### Option 3: Check your deployment method

If you're deploying differently (e.g., Railway, direct Git deploy), check their docs for setting environment variables.

## 🔍 验证是否生效

部署后，测试支付功能：

```bash
# Test if API responds correctly
curl -X POST http://localhost:3000/api/crypto/initiate \
  -H "Content-Type: application/json" \
  -d '{"planId":"pro","billing":"monthly"}'
```

Expected response should include payment details, NOT an error.

## ⚠️ 安全提醒

- ❌ **不要提交真实 API Key 到 GitHub**
- ✅ 使用 Vercel/Railway 的 Secret 管理功能
- ✅ 开发环境使用 `.env.local`（也会 git ignore）
- ✅ 生产环境在平台 Dashboard 配置

## 📚 相关文档

- [NOWPayments Documentation](https://docs.nowpayments.io/)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
