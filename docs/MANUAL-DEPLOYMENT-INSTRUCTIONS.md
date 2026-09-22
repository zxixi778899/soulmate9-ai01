# 手动部署指南（SSL/TLS 连接问题）

## 📋 当前状态

✅ **翻译修复已完成**: 添加了所有嵌入式的支付方式所需的翻译 key  
⚠️ **Git Push 失败**: SSL/TLS 握手问题导致无法推送到 GitHub  
🔧 **解决方案**: 通过 Vercel Dashboard 手动部署

---

## 🔍 需要部署的修改

### Commit 历史
```
26c9424 - fix: add missing embedded payment translation keys
ff5f4e0 - feat: embedded crypto payment with auto-delivery  
3c87928 - docs: Add comprehensive embedded payment guide
db16ee8 - docs: Add comprehensive test guide
```

### 主要代码变更

#### 1. 新增翻译 Keys (src/lib/i18n/translations.ts)
- `wallet.scanToPay`: "扫码支付" / "Scan to Pay"
- `wallet.scanToPayDesc`: "请向以下地址发送..." 
- `wallet.paymentAddress`: "收款地址"
- `wallet.autoDetect`: "自动检测已启用"
- `wallet.autoDetectDesc`: "区块链会自动检测到您的付款！"
- `wallet.manualSubmit`: "手动提交（备用）"
- `wallet.confirmPayment`: "确认支付"

#### 2. 嵌入式支付 API (`/api/crypto/embed-payment`)
- 创建 QR code + 收款地址的支付订单
- 支持 USDT TRC-20, BTC, ETH, LTC, SOL

#### 3. IPN Webhook Handler (`/api/crypto/ipn/handler`)
- 监听区块链交易
- 自动发放代币给已付用户

#### 4. Wallet Page UI Updates
- 修改支付对话框显示逻辑
- 添加二维码扫描支付界面
- 实现自动检测 + fallback 机制

---

## 🚀 方法 1: 通过 Vercel Dashboard 部署（推荐）

### Step 1: 上传代码到 GitLab/GitHub（可选）

如果你有另一个可访问的 git repo：

```bash
# Add remote
git remote add backup git@github.com:your-backup-repo/soulmate9.git

# Push
git push backup main

# Then deploy from that branch in Vercel
```

### Step 2: 直接使用 Vercel CLI 部署

**Local Deployment（在你的电脑上运行）：**

1. **安装 Vercel CLI:**
   ```powershell
   npm i -g vercel
   ```

2. **登录:**
   ```bash
   vercel login
   ```

3. **本地测试构建:**
   ```bash
   cd E:/soulmate9
   pnpm install
   pnpm build
   ```
   
   ✅ 如果构建成功，说明修复有效

4. **部署到生产环境:**
   ```bash
   vercel --prod
   ```

### Step 3: Vercel Dashboard 手动触发

如果没有本地开发环境：

1. **访问**: https://vercel.com/dashboard/projects/soulmate9-ai01
2. **点击**: "Deployments" → "Add Project"
3. **选择**: Import Git Repository → soulmate9-ai01
4. **配置**: Environment Variables 应该已经同步
5. **部署**: Click "Deploy"

---

## 🐛 本地测试验证步骤

在部署之前，先在本地测试确保一切正常：

### 1. 安装依赖并启动 dev server

```bash
cd E:/soulmate9
pnpm install
pnpm dev
```

服务器应该在 **Port 5000** 上运行（根据 scripts/dev.sh）

### 2. 构建测试

```bash
pnpm build
```

**预期结果**: 
- ✅ "Compiled successfully"
- ✅ No TypeScript errors
- ✅ Build completed in ~30-60 seconds

**如果出现错误**:
- 检查是否所有翻译 key 都已添加
- 运行 `pnpm lint` 检查代码质量问题

### 3. 功能测试流程

访问 http://localhost:5000/wallet：

#### Test A: 页面加载
- [ ] Balance card 显示正确
- [ ] Credit packages 卡片横向滚动
- [ ] Transaction history 显示记录

#### Test B: 购买流程
1. 点击任意套餐卡片
2. 应该弹出货币选择器
3. 点击 "USDT (TRC-20)"
4. 应该显示支付对话框，包含：
   - [ ] QR Code
   - [ ] Payment Address
   - [ ] Blue banner: "Auto-Detection Enabled"
   - [ ] Manual txHash input field
   - [ ] Confirm Payment button

#### Test C: 网络请求监控

打开浏览器 DevTools → Network:

**Request 1: GET /api/v2/shop/tokens**
```json
{
  "packages": [...],
  "balance": 1250
}
```

**Request 2: POST /api/crypto/embed-payment**
```json
POST body:
{
  "package_id": "credits-1000",
  "payment_method": "usdttrc20"
}

Response:
{
  "success": true,
  "paymentId": "1234567890",
  "payAddress": "Txxxxxxxx...",
  "payAmount": 5.99,
  "payCurrency": "USDT",
  "network": "TRC-20",
  "qrCodeURL": "%...",
  ...
}
```

### 4. Console 调试

打开 DevTools Console:

```javascript
// Should see NO errors like:
// TypeError: Cannot read properties of undefined (reading 'scanToPay')
// Missing translation key warning

// If you see these errors, it means the translation file wasn't updated properly
```

---

## 🔧 Troubleshooting Guide

### Problem 1: Build fails with "Argument of type 'x' is not assignable"

**Cause**: Translation key not added to all language sections

**Solution**: 
The edit tool should have added it automatically. Double-check:

```bash
grep "wallet.scanToPay" src/lib/i18n/translations.ts
```

Should return 7 lines (one per language).

### Problem 2: Build succeeds but wallet page shows error

**Check**:
1. Is your user logged in?
2. Check browser console for API errors
3. Verify environment variables are set in Vercel

### Problem 3: Payment dialog doesn't appear

**Debug**:
```javascript
// In browser console after clicking a package:
fetch('/api/crypto/embed-payment', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    package_id: 'credits-1000',
    payment_method: 'usdttrc20'
  })
}).then(r => r.json()).then(console.log);
```

Expected response should contain `payAddress` field.

### Problem 4: QR code shows blank/error

**Possible causes**:
- `payAddress` is empty string
- Browser doesn't support QR library
- CORS issues

**Fix**:
```javascript
// Inspect the actual data being passed to QR component
// In page.tsx line ~460:
const address = cryptoDialog.walletAddress;
console.log("QR Address:", address); // Should be valid TRC-20 address
```

---

## 📊 部署后的验证清单

### Immediate Checks (Right After Deploy)

1. **Site loads**: https://www.yourdomain.com/wallet
   - No 404 or blank page
   
2. **TypeScript works**: 
   - Open any page, check console for red errors
   
3. **Translations load**:
   - Switch language in dropdown
   - All text updates correctly
   
4. **API endpoints work**:
   - Test `/api/crypto/embed-payment` via curl or Postman

### Functional Tests (After 1 Hour)

1. **Complete purchase flow**:
   - Buy $5.99 Starter pack
   - Scan QR code
   - Complete payment
   - Credits arrive within 2 minutes
   
2. **Monitor logs**:
   ```bash
   vercel logs --since 1h | grep -E "(embed|ipn|crypto)"
   ```

### Production Metrics (After 24 Hours)

Track these KPIs:
- Purchase conversion rate (should increase by ~40%)
- Payment completion time (target < 3 min)
- Auto-detect success rate (target > 95%)
- User complaints about manual txHash entry (< 5%)

---

## 🆘 Emergency Rollback Plan

If embedded payment breaks something critical:

### Option A: Revert Specific Commit
```bash
git revert 26c9424  # Remove translation changes only
git revert ff5f4e0  # Remove embedded payment features
git push origin main
```

### Option B: Use Previous Stable Deploy
In Vercel Dashboard:
1. Go to Deployments
2. Find last successful deployment before today
3. Click "Always Promote"

### Option C: Disable Embed Mode Temporarily
Modify wallet/page.tsx to redirect back to invoice mode:

```typescript
// Instead of calling /api/crypto/embed-payment
const res = await authedFetch("/api/v2/shop/tokens", {
  method: "POST",
  body: JSON.stringify({ package_id, payment_method })
});
const result = await res.json();
window.location.href = result.invoiceUrl; // Old redirect behavior
```

---

## 📞 Quick Reference

### Key Files Modified
- `src/app/(main)/wallet/page.tsx` - Payment dialog UI
- `src/app/api/crypto/embed-payment/route.ts` - New API endpoint
- `src/app/api/crypto/ipn/handler/route.ts` - IPN receiver
- `src/lib/i18n/translations.ts` - Translation keys

### Key Endpoints
- `POST /api/crypto/embed-payment` - Create payment order
- `POST /api/crypto/ipn/handler` - Receive webhook notifications

### Configuration Requirements
```env
NOWPAYMENTS_API_KEY=sk_your_api_key_here
NOWPAYMENTS_IPN_SECRET=your_secret_here
NEXT_PUBLIC_APP_URL=https://www.yourdomain.com
```

### Testing URLs
- Local: http://localhost:5000/wallet
- Staging: https://staging.yourdomain.com/wallet
- Production: https://www.yourdomain.com/wallet

---

## ✅ Deployment Checklist

Before marking as complete:

- [ ] `pnpm build` succeeds locally
- [ ] All 7 translation keys present in translations.ts
- [ ] Wallet page loads without console errors
- [ ] Payment dialog appears when clicking package
- [ ] QR code generates correctly
- [ ] IPN endpoint is publicly accessible (test with ngrok if needed)
- [ ] NOWPayments dashboard has correct webhook URL configured
- [ ] Vercel deployment status = "Ready" (green)
- [ ] Initial purchase test completes successfully

---

## 🎉 Success Criteria

Deployment is considered successful when:

1. ✅ Users can scan QR codes and pay directly in the website
2. ✅ Automatic credit delivery works (no manual txHash submission needed)
3. ✅ Fallback mechanism handles edge cases gracefully
4. ✅ Conversion rate increases compared to external invoice redirects
5. ✅ Zero production bugs reported in first 24 hours

---

Last Updated: 2024-09-23
Status: Ready for manual deployment via Vercel Dashboard
