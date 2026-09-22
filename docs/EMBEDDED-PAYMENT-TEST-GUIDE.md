# 嵌入式加密支付完整测试指南

## 📋 当前状态

✅ **代码已部署**: 最新 commit `3c87928` 已推送到 GitHub  
✅ **Vercel 自动部署**: 等待部署完成（通常 2-5 分钟）  
✅ **功能已实现**: 
- `/api/crypto/embed-payment` - 创建嵌入式支付订单
- `/api/crypto/ipn/handler` - IPN webhook 接收器
- Wallet 页面 - 显示二维码和收款地址

---

## 🔍 测试前检查清单

### 1. Vercel 部署状态

**登录 Vercel Dashboard**: https://vercel.com/dashboard

检查项目部署是否成功：
```
Projects → soulmate9-ai01 → Deployments
Look for: "Ready" status (绿色)
```

如果部署失败，查看 Logs 诊断：
```bash
# Via CLI (if installed locally)
vercel logs --since 5m

# Or in Dashboard:
Project Settings → Logs → Filter by "embed-payment" or "ipn"
```

### 2. 环境变量配置

在 Vercel Dashboard 确认以下变量存在且正确：

```env
NOWPAYMENTS_API_KEY = sk_your_actual_api_key_here
NOWPAYMENTS_IPN_SECRET = your_ipn_secret_value
NEXT_PUBLIC_APP_URL = https://www.yourdomain.com  # 生产域名
```

⚠️ **重要**: 修改环境变量后必须 **Rebuild** 应用！

### 3. NOWPayments 配置验证

访问你的 NOWPayments dashboard: https://nowpayments.io/dashboard

**检查项:**
- [ ] API Key 有效且未过期
- [ ] IPN URL 设置为：`https://www.yourdomain.com/api/crypto/ipn/handler`
- [ ] Currencies 中启用了 USDT TRC-20
- [ ] Webhook 签名验证已启用
- [ ] 钱包地址可接收加密货币

**测试 IPN 通知:**
```
Settings → IPN Settings → Test Notification Button
Should return: { "status": "ok" }
```

---

## 🧪 完整测试流程

### Step 1: 访问钱包页面

**URL**: https://www.yourdomain.com/wallet

**预期结果:**
- ✅ 页面正常加载，显示用户余额
- ✅ 顶部显示今日统计（Earned/Spent/Net）
- ✅ 一排卡片展示不同金额套餐（$5.99, $9.99, $22.99, etc.）
- ✅ 右侧显示信用消耗参考表

**截图检查点:**
1. Balance card 应该显示类似 `1,250` 的余额数字
2. Credit packages 应该以横向滚动形式展示
3. 每个套餐卡片应该有视频背景或图片

### Step 2: 选择购买套餐

**操作:**
点击任意套餐卡片（例如 `$5.99 · Starter`）

**预期结果:**
1. ✅ 弹出货币选择模态框（Currency Selector Dialog）
2. ✅ 显示标题 "选择支付方式"
3. ✅ 显示套餐信息：`$5.99 · Starter`
4. ✅ 网格布局展示 5 种货币选项：
   - USDT (TRC-20) ⓤ
   - Bitcoin ₿
   - Ethereum Ξ
   - Litecoin Ł
   - Solana ◎

**UI 细节:**
- 模态框背景半透明遮罩
- 取消按钮在底部
- 每个货币卡片有图标 + 名称
- 悬停效果：边框变粉色 (#FF2D78)

### Step 3: 选择 USDT 并开始支付

**操作:**
点击 "USDT (TRC-20)" 卡片

**预期结果:**
1. ✅ 关闭货币选择器
2. ✅ 打开支付对话框（嵌入式的）
3. ✅ 显示标题："扫码支付"
4. ✅ 副标题提示发送金额和套餐名称

**支付对话框内容:**
```
┌─────────────────────────────────────┐
│ 🔒 扫码支付                          │
│                                     │
│ 请向以下地址发送价值 $5.99 美元的    │
│ Starter 加密货币。                    │
│                                     │
│ ┌─────────────────┐                │
│ │    [QR Code]    │                │
│ │                 │                │
│ │                 │                │
│ └─────────────────┘                │
│                                     │
│ 收款地址                           │
│ TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  [复制] │
│ ⚠ USDT TRC-20 网络...               │
│                                     │
│ 💡 自动检测已启用                   │
│ 区块链会自动检测到您的付款！无需    │
│ 手动提交交易哈希。                  │
│                                     │
│ 手动提交（备用）                    │
│ [输入框：TRC-20 tx hash...]         │
│                                     │
│ [取消]      [确认支付]              │
└─────────────────────────────────────┘
```

**关键特性:**
- QR 码居中显示（基于 address 自动生成）
- 地址旁边有复制按钮
- 蓝色提示框强调自动检测
- 手动 txHash 输入框作为 fallback
- 两个按钮：灰色 "取消" / 渐变色 "确认支付"

### Step 4: 扫码并发起实际支付

**操作:**
使用手机钱包（如 TronLink、TrustWallet）扫描二维码

**预期结果:**
1. ✅ 手机显示 NOWPayments 收款地址
2. ✅ 显示应付金额（根据 USD 价格动态计算）
3. ✅ 网络标识：TRC-20
4. ✅ 倒计时：15 分钟支付时限

**实际支付:**
在手机上确认交易并支付（需要支付少量 Gas 费）

### Step 5: 等待自动检测

**观察网页变化:**

**Option A: 自动检测模式（推荐）**
- 支付完成后 30 秒 -2 分钟内
- 支付对话框应自动更新状态
- 显示 "Verifying payment..." 旋转图标
- 成功后显示绿色对勾 ✓ 和 "Payment Confirmed"
- 页面自动刷新，余额增加

**Option B: 手动提交模式**
- 如果 3 分钟仍未到账
- 在手机钱包中复制交易哈希 (txHash)
- 粘贴到网页的手动输入框
- 点击 "确认支付"
- 后端验证后发放代币

### Step 6: 验证代币到账

**检查项:**

1. **余额更新**
   ```
   /wallet 页面顶部 Balance card
   应该从 "1,250" 变为 "1,350" (+100 credits)
   ```

2. **交易日志**
   ```
   /wallet 页面下方 Transaction History
   新记录应该排在首位:
   - 图标：黄色闪电图标 (Zap)
   - Label: "购买代币"
   - Amount: +100 (绿色文字)
   - Time: 刚刚
   - Ref ID: ep_user_uuid_credits-1000_timestamp
   ```

3. **数据库验证 (PostgreSQL)**
   ```sql
   -- Check crypto_payments table
   SELECT * FROM crypto_payments 
   WHERE user_id = 'YOUR_USER_UUID' 
   ORDER BY created_at DESC LIMIT 3;

   -- Expected result:
   -- status: 'completed'
   -- currency: 'usdt'
   -- amount_usd: 5.99
   -- tx_hash: payment_id from NOWPayments
   -- completed_at: timestamp
   ```

4. **User Profile 验证**
   ```sql
   SELECT credits_remaining, membership_tier 
   FROM profiles 
   WHERE user_id = 'YOUR_USER_UUID';

   -- Should show increased credits
   -- credits_remaining: 1350 (example)
   ```

---

## 📊 网络请求监控

### Chrome DevTools → Network Tab

**请求 1: 获取代币套餐**
```
GET /api/v2/shop/tokens
Response:
{
  "packages": [...],
  "balance": 1250
}
```

**请求 2: 创建嵌入式支付**
```
POST /api/crypto/embed-payment
Body:
{
  "package_id": "credits-1000",
  "payment_method": "usdttrc20",
  "is_membership_upgrade": false
}

Response (200 OK):
{
  "success": true,
  "provider": "nowpayments",
  "paymentId": "1234567890",
  "payAddress": "Txxxxxxxx...",
  "payAmount": 5.99,
  "payCurrency": "USDT",
  "network": "TRC-20",
  "amountUsd": 5.99,
  "orderId": "ep_..._",
  "qrCodeURL": "%...",
  "status": "awaiting_payment",
  "expiresAt": "2024-09-18T12:30:00Z"
}
```

**请求 3: 提交支付（可选，如果 auto-detect 失败）**
```
POST /api/crypto/submit
Body:
{
  "paymentId": "1234567890",
  "txHash": "abc123def456..."
}

Response:
{
  "success": true,
  "autoConfirmed": true/false,
  "message": "Payment confirmed"
}
```

### Console 日志检查

```javascript
// Open DevTools → Console
console.log("Embedded Payment Test Started");

// Should NOT see any errors like:
// Error: Failed to create payment
// TypeError: Cannot read property 'x' of undefined
// 404 Not Found: /api/crypto/embed-payment
```

---

## 🐛 常见问题排查

### Issue 1: 支付对话框未弹出

**症状:**
点击套餐后无反应，或 Toast 提示错误

**原因:**
- NOWPayments API Key 无效
- API 端点 404

**排查:**
```bash
# 1. Check API endpoint exists
curl -X POST http://localhost:3000/api/crypto/embed-payment \
  -H "Content-Type: application/json" \
  -d '{"package_id":"test","payment_method":"usdt"}'

# Should get: Unauthorized (401) if no auth
# or Invalid package (404) if key invalid
```

**解决方案:**
- 确认环境变量已配置
- 重启 Vercel deployment

### Issue 2: QR 码为空或报错

**症状:**
支付对话框中 QR 码区域空白，或显示 "Error generating QR"

**原因:**
- payAddress 字段返回空字符串
- Base64 编码问题

**排查:**
```javascript
// In browser console after clicking payment button:
const res = await fetch('/api/crypto/embed-payment', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    package_id: 'credits-1000',
    payment_method: 'usdttrc20'
  })
});
const data = await res.json();
console.log(data.payAddress); // Should be non-empty string
```

**解决方案:**
- 检查 NOWPayments API response
- 验证 API Key 权限

### Issue 3: 支付完成但余额未增加

**症状:**
用户扫描并完成支付，但区块链确认后余额仍是原值

**可能原因:**
1. IPN webhook 未触发
2. IPN handler 逻辑错误
3. order_id 格式解析失败
4. RPC 函数调用失败

**排查:**

**Step A: 检查 IPN 日志**
```bash
# Vercel logs
vercel logs --project your-project-name --since 10m | grep ipn

# Should see:
[ipn] Received event { payment_id: "123...", status: "finished" }
[ipn] Credits delivered successfully { userId: "...", credits: 1000 }
```

**Step B: 检查 NOWPayments 后台**
```
Dashboard → Payments history
Find the payment with matching amount
Check status: should be "finished"
Check payout transaction: should have a tx hash
```

**Step C: 手动触发 IPN**
```
In NOWPayments dashboard:
Settings → IPN Settings → Send test notification
Should receive {"status":"ok"} response
```

**Step D: SQL 查询验证**
```sql
-- Check if payment record exists
SELECT * FROM crypto_payments 
WHERE user_id = 'YOUR_UUID' 
ORDER BY created_at DESC;

-- If status is 'awaiting_payment' for > 10 minutes,
-- IPN may not have been triggered

-- Manually check if credits were added
SELECT credits_remaining FROM profiles 
WHERE user_id = 'YOUR_UUID';
```

**Solution:**
- Ensure NOWPayments IPN URL is correctly set
- Verify callback URL is publicly accessible (not localhost)
- Check firewall doesn't block incoming webhooks
- Restart Vercel deployment after setting env vars

### Issue 4: Auto-detect 未工作

**症状:**
用户反馈需要手动提交 txHash，即使支付了也没有自动更新

**排查:**
```javascript
// Check if there's polling logic
// The wallet page should auto-refresh or poll every 30s

// In /wallet/page.tsx, look for:
useEffect(() => {
  if (cryptoDialog?.step === 'submitting') {
    // Polling interval to check payment status
    const interval = setInterval(async () => {
      const res = await fetch(`/api/crypto/status?paymentId=${id}`);
      // Update UI based on response
    }, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }
}, [cryptoDialog]);
```

**Current Implementation Status:**
- ✅ IPN triggers immediately upon blockchain confirmation
- ✅ Page stays open during verification
- ✅ Success toast appears within ~1 minute
- ❌ **Missing**: Auto-refresh polling mechanism

**Fix Needed:**
Add polling interval in wallet page to handle delayed IPN:

```typescript
useEffect(() => {
  if (cryptoDialog?.step === 'submitting') {
    const poll = async () => {
      const res = await authedFetch(
        `/api/crypto/status?paymentId=${cryptoDialog.paymentId}`
      );
      const data = await res.json();
      
      if (data.status === 'confirmed') {
        setCryptoDialog({ ...cryptoDialog, step: 'done' });
        refreshBalance();
      }
    };
    
    poll();
    const interval = setInterval(poll, 15000); // Check every 15s
    return () => clearInterval(interval);
  }
}, [cryptoDialog?.step]);
```

---

## 🎯 成功验收标准

通过所有以下检查点后，嵌入式支付功能才算完全正常工作：

### UI/UX 验收 ✅
- [ ] 钱包页面正常加载，显示余额
- [ ] 套餐卡片可点击，有 hover 效果
- [ ] 货币选择器弹窗出现，5 个货币选项
- [ ] 支付对话框显示，包含：
  - [ ] 清晰的标题和说明
  - [ ] 可见的 QR 码
  - [ ] 可复制的地址文本框
  - [ ] 自动检测提示
  - [ ] Fallback 手动输入框
  - [ ] 双按钮布局

### 支付流程验收 ✅
- [ ] 点击套餐 → 选货币 → 弹支付对话框
- [ ] 二维码可被手机正常扫描
- [ ] 手机钱包显示正确的收款地址
- [ ] 支付金额与套餐价格一致

### 到账验收 ✅
- [ ] 支付完成后 2 分钟内余额自动增加
- [ ] 交易历史新增一条记录
- [ ] database 中 crypto_payments 状态为 'completed'
- [ ] profiles.credits_remaining 正确增加

### Fallback 验收 ✅
- [ ] 手动输入 txHash 后可提交
- [ ] 提交后验证并处理支付

---

## 📈 性能指标监控

理想的嵌入式支付体验应该满足：

| 指标 | 目标 | 实测 |
|------|------|------|
| 页面加载时间 | < 2s | ? |
| 支付对话框弹出 | < 1s | ? |
| QR 码生成 | Instant | ? |
| IPN 延迟 | < 30s | ? |
| 到账时间 | < 2min | ? |

---

## 🔄 回滚方案

如果测试中发现严重 bug，可以快速回滚：

```bash
# Local rollback
git revert 3c87928  # Revert embedded payment commit
git push origin main

# Or use Vercel Dashboard
Deployments → Click previous successful deployment → Promote to Production
```

---

## 📞 技术支持

遇到未覆盖的问题？

1. 检查 Vercel Logs：https://vercel.com/dashboard/your-project/deployments
2. 查看 NOWPayments dashboard 交易记录
3. 联系支持：support@nowpayments.io

---

##  测试完成确认

完成上述所有步骤并打勾后，你可以自信地宣布：

> ✅ **嵌入式加密货币支付系统已成功部署并测试！**

系统现在提供：
- 无缝的用户体验（不跳出网站）
- 自动到账保障（IPN webhook）
- 双重保险机制（fallback 手动提交）
- 全币种支持（USDT/BTC/ETH/LTC/SOL）
