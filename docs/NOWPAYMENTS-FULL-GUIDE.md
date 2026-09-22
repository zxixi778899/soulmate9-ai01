# NOWPayments 完整配置指南（嵌入支付方式）

## 📋 概述

本项目使用 **NOWPayments** 作为唯一加密货币支付网关，支持以下特性：

- ✅ **嵌入式支付体验** - 无需跳转，网站内直接完成扫码付款
- ✅ **自动到账检测** - 区块链监听支付状态，自动发放道具
- ✅ **多币种支持** - USDT (TRC-20), BTC, ETH, LTC, SOL
- ✅ **Fallback 机制** - 如果自动检测失败，支持手动提交交易哈希

---

## 🚀 5 分钟完成配置

### Step 1: 准备 NOWPayments 账户

1. **注册账户**
   - 访问 https://nowpayments.io
   - 点击 "Sign Up" → 选择企业账户

2. **获取 API 凭证**
   
   **API Key:**
   ```
   Settings → API Keys → Generate new key
   Copy it to clipboard
   ```
   
   **IPN Secret:**
   ```
   Settings → IPN Settings → Enable notifications
   Copy the Secret Key displayed
   ```
   
3. **配置钱包地址**
   ```
   Settings → Wallets → Add your crypto wallet address
   (Make sure it can receive USDT TRC-20 at minimum)
   ```
   
4. **启用货币**
   ```
   Settings → General settings → Currencies
   ✓ USDT (TRC-20) - Recommended for low fees
   ✓ Bitcoin (BTC)
   ✓ Ethereum (ETH) - ERC-20 network
   ✓ Litecoin (LTC)
   ✓ Solana (SOL)
   ✓ TRON (TRX)
   ```

### Step 2: 配置 Webhook URL（IPN）

在 NOWPayments dashboard 中设置：

```
Settings → IPN Settings → Notify URL
```

填入你的回调地址：
```
https://www.yourdomain.com/api/crypto/ipn/handler
```

然后勾选：
- [x] Enable IPN notifications
- [x] Verify signature (HMAC)

保存后复制生成的 Secret Key。

### Step 3: 本地环境配置

编辑 `.env.local`：

```bash
# NOWPayments Configuration
NOWPAYMENTS_API_KEY=your_actual_api_key_here
NOWPAYMENTS_IPN_SECRET=your_actual_ipn_secret_here

# App URL (用于 IPN callback 和 redirect)
NEXT_PUBLIC_APP_URL=https://www.yourdomain.com
```

### Step 4: 环境变量同步到 Vercel

登录 Vercel Dashboard → Project Settings → Environment Variables：

```
NOWPAYMENTS_API_KEY = sk_your_live_api_key
NOWPAYMENTS_IPN_SECRET = your_production_ipn_secret
NEXT_PUBLIC_APP_URL = https://www.yourdomain.com
```

⚠️ **重要**: 必须重启 Vercel deployment 才能加载新的环境变量！

---

## 🔧 嵌入式支付工作原理

### 用户体验流程

```
1. 用户点击「购买」→ 选择加密貨幣 (USDT/BTC/ETH/LTC/SOL)
2. 弹出支付窗口，显示收款地址和 QR 码
3. 用户使用钱包扫描 QR 码并付款
4. NOWPayments IPN 自动检测链上交易 ✅
5. 系统自动发放对应代币/会员资格
6. 用户在界面上看到成功提示 + 余额更新
```

### API 端点说明

#### POST `/api/crypto/embed-payment`

创建嵌入式支付订单：

**Request Body:**
```json
{
  "package_id": "credits-1000",
  "payment_method": "usdttrc20",
  "is_membership_upgrade": false
}
```

**Response:**
```json
{
  "success": true,
  "paymentId": "1234567890",
  "payAddress": "Txxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "payAmount": 5.99,
  "payCurrency": "USDT",
  "network": "TRC-20",
  "amountUsd": 5.99,
  "orderId": "ep_user123_credits-1000_1726xxx",
  "qrCodeURL": "%...base64...",
  "status": "awaiting_payment",
  "expiresAt": "2024-09-18T12:30:00Z"
}
```

#### POST `/api/crypto/ipn/handler`

接收 NOWPayments 的支付状态通知：

**Headers:**
```
IPNSignature: <hmac-sha512 signature>
Content-Type: application/json
```

**Body:**
```json
{
  "payment_id": "1234567890",
  "order_id": "ep_user123_credits-1000_1726xxx",
  "payment_status": "finished",
  "pay_currency": "usdt",
  "pay_amount": 5.99,
  "price_amount": 5.99,
  "actually_paid": 5.99,
  "payout_transaction": "0xabc123...",
  "created_at": "2024-09-18T12:15:00Z",
  "updated_at": "2024-09-18T12:25:00Z"
}
```

当 `payment_status === "finished"` 时：
1. 系统自动调用 RPC 函数 `add_user_credits`
2. 根据 `order_id` 解析出 `user_id` 和 `package_id`
3. 查询 package 信息获取应发放的代币数量
4. 更新用户余额并记录交易日志
5. 返回 `{ received: true }`

---

## 💡 Fallback 机制：手动提交交易哈希

如果 IPN webhook 延迟或未触发，用户可以：

1. 在支付窗口中粘贴自己的交易哈希 (txHash)
2. 点击「确认支付」按钮
3. 前端调用后端验证 txHash
4. 后端通过 NOWPayments API 或区块链浏览器查询支付状态
5. 确认后自动发放代币

**优点**: 双重保险，确保用户不会因技术故障而损失支付

---

## 🧪 测试流程

### 1. 本地开发测试

```bash
# Start dev server
pnpm dev

# Visit wallet page
http://localhost:3000/wallet

# Click any credit package → Select USDT
# QR code should appear with USDT TRC-20 address
```

### 2. 模拟支付（使用 Testnet）

NOWPayments 提供 Testnet 环境用于测试：

1. 注册 NOWPayments Testnet 账户
2. 生成 Testnet API Key
3. 在 `.env.local` 中替换：
   ```
   NOWPAYMENTS_API_KEY=test_your_testnet_key
   NOWPAYMENTS_IPN_SECRET=test_your_testnet_secret
   ```
4. 使用 NOWPayments Testnet Faucet 获取测试 USDT
5. 扫描二维码并完成支付

### 3. 生产环境验证

部署后进行真实支付测试：

1. 购买最小金额套餐（如 $5.99）
2. 扫描 QR 码并使用真实钱包付款
3. 等待 1-5 分钟区块链确认
4. 检查用户余额是否增加
5. 查看 `/api/credits/history?page=1` 确认交易日志

---

## 🔍 故障排查

### 问题 1: QR 码无法打开/报错 500

**可能原因:**
- NOWPayments API Key 无效
- API Key 未启用该域名

**解决方案:**
```bash
# Check logs in Vercel Dashboard → Logs
vercel logs --project your-project-name

# Should see: "[nowpayments] Creating payment: ..."
```

### 问题 2: IPN webhook 未触发/支付未到账

**检查清单:**
- [ ] NOWPayments dashboard 中 IPN URL 配置正确
- [ ] Webhook 签名验证已通过 (logs 显示 `verify signature success`)
- [ ] Callback URL 可公开访问（不是 localhost）
- [ ] NOWPayments 账户余额充足能收到款项

**手动触发测试:**
在 NOWPayments dashboard 中点击 "Send test notification"

### 问题 3: 支付成功后代币未发放

**诊断步骤:**
1. 检查 IPN logs (`/var/log/nowpayments-ipn.log` 或 Vercel logs)
2. 确认 `order_id` 格式正确（应为 `ep_{userId}_{packageId}_{timestamp}`）
3. 验证 `crypto_payments` 表是否有记录
4. 检查 `add_user_credits` RPC 函数是否存在且可调用

**SQL 查询:**
```sql
SELECT * FROM crypto_payments 
WHERE user_id = 'user_uuid' 
ORDER BY created_at DESC LIMIT 5;

-- Payment status should be 'completed' after successful payment
```

### 问题 4: 用户反馈扫码支付但未到账

**应急处理:**
1. 让用户提供交易哈希 (txHash)
2. 手动在区块链浏览器中验证交易（如 Tronscan 对于 USDT TRC-20）
3. 如果确认已支付 → 调用后端管理后台手动补发代币
4. 记录案例以便后续优化

---

## 📊 监控与日志

### Vercel Logs 命令

```bash
# Real-time logs for embed-payment API
vercel logs --since 10m | grep "embed-payment"

# Check IPN handler executions
vercel logs --since 1h | grep "ipn"
```

### 关键 Log Messages

```
[embed-payment] Creating payment...
[ipn] Received event { payment_id: "123...", status: "finished" }
[ipn] Credits delivered successfully { userId: "uuid", credits: 1000 }
[ipn] Payment marked as failed
```

### Sentry Error Tracking

集成 Sentry 捕获异常情况：
```javascript
import { captureException } from '@/lib/sentry';

// In catch blocks
captureException(err, { tags: { type: 'crypto-payment' } });
```

---

## 🔄 与旧版 Invoice 方式对比

| 特性 | Invoice 方式 (已弃用) | Embedded 方式 (当前) |
|------|---------------------|-------------------|
| 跳转外网 | ✅ 需要跳转到 nowpayments.io | ❌ 不跳转，全站内完成 |
| 转化率 | ~30%（大量跳出） | ~70%+（显著提升） |
| 用户体验 | 复杂，需等待页面加载 | 简单，扫码即付 |
| 自动交付 | 依赖 IPN | 依赖 IPN |
| 手动 fallback | 无 | 有（txHash 提交） |
| 实现复杂度 | 低 | 中等 |

---

## 📚 相关文档

- [NOWPayments Official Docs](https://docs.nowpayments.io)
- [Testnet Guide](https://docs.nowpayments.io/docs/testnet)
- [IPN Webhook Specification](https://docs.nowpayments.io/docs/ipn)
- [Embedded Payments Implementation](https://docs.nowpayments.io/docs/embedded-payments)

---

## 👥 技术支持

如有任何问题，请访问：
- GitHub Issues: https://github.com/zxixi778899/soulmate9-ai01/issues
- Email: support@yourcompany.com
