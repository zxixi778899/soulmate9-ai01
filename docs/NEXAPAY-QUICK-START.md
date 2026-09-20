# NEXA Pay - 快速启动指南 ⚡

## 🎯 一句话总结

**NEXA Pay 已完全集成到你的项目中，支持巴西 Pix、信用卡等多种 LATAM 支付方式。**

---

## ✅ 已完成的工作

### 1. 后端 API 实现 ✅
- ✨ `src/lib/nexapay-server.ts` - NEXA Pay API 客户端
- ✨ `src/app/api/nexapay/route.ts` - 创建支付接口
- ✨ `src/app/api/nexapay/webhook/route.ts` - Webhook 处理（自动授权代币）
- ✨ `src/app/api/v2/shop/tokens/route.ts` - 集成到代币购买流程

### 2. 前端 UI 更新 ✅
- 🎨 Shop 页面新增 **Payment Provider Selection**
- 💎 用户可选择：
  - NOWPayments (USDT/BTC/ETH 等加密货币)
  - **NEXA Pay (Pix/TED/Credit Card)** ← 新功能！

### 3. 文档完整 ✅
- 📖 [配置指南](./NEXAPAY-PAYMENT-CONFIGURATION.md) - 注册账户 + 环境变量 + 上线 checklist
- 📖 [测试指南](./NEXAPAY-TESTING-GUIDE.md) - 端到端测试步骤 + 常见问题排查

---

## 🚀 立即开始测试（3 步）

### Step 1: 获取 API 密钥（5 分钟）

1. 访问 https://www.nexapay.com → Sign Up
2. 完成商户注册（需要 ID/Bank info）
3. Dashboard → Settings/API → 复制：
   ```
   NEXAPAY_API_KEY=nxp_live_xxx
   NEXAPAY_API_SECRET=xxx
   NEXAPAY_MERCHANT_ID=M123456
   NEXAPAY_WEBHOOK_SECRET=whsec_xxx
   ```

### Step 2: 添加环境变量（1 分钟）

在项目根目录创建 `.env.local`：

```bash
NEXAPAY_API_KEY=nxp_live_your_key_here
NEXAPAY_API_SECRET=your_secret_here
NEXAPAY_MERCHANT_ID=M_your_merchant_id
NEXAPAY_WEBHOOK_SECRET=whsec_your_webhook_secret
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

⚠️ 不要提交到 Git！

### Step 3: 启动并测试（2 分钟）

```bash
# 启动开发服务器
pnpm dev

# 打开浏览器
http://localhost:3000/shop?tab=credits

# 点击任意代币包 → 选择 "NEXA Pay" → 选择 "Pix" → 扫描支付
```

---

## 🔍 预期行为

### 用户操作流程
```
Shop → Credits Tab → Click Pack → 
[Provider Selection Dialog]
├── NOWPayments (Crypto)
└── NEXA Pay ← You choose this!
    └── Payment Method Selection
        ├── Pix (Instant!)
        ├── Credit Card
        ├── TED (Bank Transfer)
        └── Boleto
```

### 后端自动处理
```
1. User clicks "Pix"
   ↓
2. POST /api/v2/shop/tokens created
   ↓
3. Create NexaPay payment → Get checkout URL
   ↓
4. Redirect to https://checkout.nexapay.com/pay/xxx
   ↓
5. User scans Pix QR code in app
   ↓
6. NexaPay sends webhook → Your server processes
   ↓
7. Tokens granted automatically! 💰
```

---

## 🧪 快速 API 测试（无需 UI）

```bash
# Test payload
PAYLOAD='{
  "package_id": "credits-1000",
  "provider": "nexapay",
  "payment_method": "pix"
}'

# Execute (replace JWT token)
curl -X POST http://localhost:3000/api/v2/shop/tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_JWT_TOKEN" \
  -d "$PAYLOAD"

# Expected response:
{
  "status": "checkout_created",
  "provider": "nexapay",
  "url": "https://checkout.nexapay.com/pay/xxxxx",
  "amountBrl": 49.90,
  "token_count": 1000
}
```

---

## 📊 定价策略（默认）

编辑 `src/lib/nexapay-server.ts`:

```typescript
const basePrices: Record<string, number> = {
  basic: 999,     // $9.99/month
  pro: 1999,      // $19.99/month
  unlimited: 2999,// $29.99/month
};
```

折扣计算：
- Monthly: 100% (no discount)
- Quarterly: 85% (15% off × 3 months)
- Yearly: 70% (30% off × 12 months)

---

## 🆘 常见问题

### Q: API key not working?
A: 确保 .env.local 存在且变量名称正确（无空格/拼写错误）

### Q: Payment fails immediately?
A: 检查 NexaPay 账户是否激活，沙箱环境还是生产环境

### Q: Webhook not received?
A: 本地测试需要用 ngrok 暴露 HTTPS:
```bash
npm install -g ngrok
ngrok http 3000
```

### Q: Tokens not granted after payment?
A: 检查数据库 `crypto_payments` table:
```sql
SELECT * FROM crypto_payments WHERE user_id = 'xxx' ORDER BY created_at DESC LIMIT 1;
-- status should be 'confirmed' after webhook
```

---

## 📝 下一步行动

### 生产环境部署
1. Railway/Vercel → Project Settings → Environment Variables
2. 添加全部 5 个 NEXA Pay 变量
3. Redeploy 应用
4. NexaPay Dashboard → Webhooks → Add production URL
5. 开启正式商户权限（如有需要）

### 监控与审计
- Webhook 日志记录在控制台
- 检查 `purchase_history` 表统计成功支付
- Monitor `crypto_payments` for pending/failed payments

---

## 📞 参考链接

| 资源 | 链接 |
|------|------|
| NEXA Pay Docs | https://docs.nexapay.com |
| NEXA Pay Dashboard | https://dashboard.nexapay.com |
| 完整配置指南 | [`./NEXAPAY-PAYMENT-CONFIGURATION.md`](NEXAPAY-PAYMENT-CONFIGURATION.md) |
| 详细测试步骤 | [`./NEXAPAY-TESTING-GUIDE.md`](NEXAPAY-TESTING-GUIDE.md) |

---

**准备好接受第一笔 Pix 付款了吗？** 🎉 

如果遇到问题，查看测试指南中的 FAQ 部分或直接联系 NEXA Pay 技术支持。
