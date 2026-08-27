# 🚀 JangoPay 支付集成指南

## 📋 **背景**

由于 NOWPayments API 存在问题（HTTP 403 Forbidden），已切换到 **JangoPay** 作为新的支付网关。

---

## 🔧 **第一步：注册 JangoPay 账户**

1. 访问：https://www.jangopay.org/zh/register
2. 注册企业账户（Merchant Account）
3. 完成 KYC 验证（Business verification）
4. 获取 API 凭证

---

## 📦 **第二步：配置环境变量**

### **在 Vercel Dashboard 添加以下环境变量：**

| Name | Value | Description |
|------|-------|-------------|
| `JANGOPAY_API_KEY` | [从 Dashboard 复制] | 商户 API 密钥 |
| `JANGOPAY_SECRET_KEY` | [从 Dashboard 复制] | HMAC 签名密钥 |
| `JANGOPAY_URL` | `https://api.jangopay.com` | 生产环境 URL（测试用 `https://apitest.jangopay.com`） |
| `JANGOPAY_RECIPIENT_ID` | [你的收款账号 ID] | 用于接收资金的账户 ID |
| `NEXT_PUBLIC_SITE_URL` | `https://www.oxmate-ai.com` | 站点基础 URL |
| `NEXT_PUBLIC_APP_URL` | `https://www.oxmate-ai.com` | 应用主 URL |

**⚠️ 注意：**
- 所有变量都要勾选三个环境（Production + Preview + Development）
- 测试阶段使用沙盒环境 (`JANGOPAY_URL = https://apitest.jangopay.com`)
- 正式使用前必须将 URL 切换为生产环境

---

## ✅ **第三步：创建 Webhook 处理器**

已创建的 webhook 路由：`/api/jangopay/webhook`

### **功能说明：**
- 接收 JangoPay 支付状态回调
- 验证签名（待实现）
- 更新订单状态
- 自动发放会员权益

### **配置步骤：**

1. **在 JangoPay Dashboard → Webhook Settings**
   ```
   Webhook URL: https://www.oxmate-ai.com/api/jangopay/webhook
   Events: payment.completed, payment.failed
   Secret: [填写 JANGOPAY_SECRET_KEY]
   ```

2. **保存后等待 JangoPay 验证回调 URL**

---

## 🔄 **第四步：提交并部署代码**

```bash
git add src/app/api/jangopay/ \
       src/lib/jangopay-server.ts \
       src/app/(main)/pricing/page.tsx
       
git commit -m "feat: Integrate JangoPay payment gateway"
git push
```

等待 Vercel 自动部署完成（约 2-3 分钟）。

---

## 🧪 **第五步：测试支付流程**

### **测试步骤：**

1. 刷新浏览器（Ctrl + Shift + R）
2. 访问 pricing 页面
3. 点击任意会员套餐的 "使用 USDT 支付" 按钮
4. **预期结果：**
   - ✅ 跳转至 JangoPay 支付页面
   - ✅ 显示金额和支付方式选择
   - ✅ 完成支付后自动回调到 success=true

### **如果失败：**

查看 Browser Console 的完整错误信息，特别是 Network Panel 中的响应体内容。

---

## 📊 **第六步：验证数据库记录**

SQL 查询最近支付记录：

```sql
SELECT * FROM crypto_payments 
ORDER BY created_at DESC 
LIMIT 10;
```

应该看到新增的记录包含：
- `order_id`: jangopay_pro_monthly_xxx
- `status`: awaiting_payment / completed / failed
- `amount_usd`: 对应的美元金额

---

## 🔍 **常见问题排查**

### **Q1: 跳转时显示 "Failed to create payment with JangoPay"**

**原因分析：**
1. API Key 无效或未配置
2. Recipient ID 不存在或格式错误
3. 域名未通过 SSL 验证

**解决方案：**
- 检查 JangoPay Dashboard 确认 API Key 有效
- 验证 JANGOPAY_RECIPIENT_ID 是否正确
- 查看 Vercel Logs 获取详细错误信息

---

### **Q2: 支付成功后没有自动发放会员权益**

**原因分析：**
- Webhook 未正确接收到达
- Signature 验证失败

**解决方案：**
- 确保 `/api/jangopay/webhook` 路由可访问
- 检查 Webhook URL 是否带 HTTPS
- 临时关闭签名验证进行调试

---

### **Q3: 如何在测试环境和生产环境之间切换？**

通过修改 `JANGOPAY_URL` 环境变量：

```
# 测试环境
JANGOPAY_URL=https://apitest.jangopay.com

# 生产环境
JANGOPAY_URL=https://api.jangopay.com
```

---

## 📝 **第七步：迁移现有用户数据**

如果需要将从 NOWPayments 切换到 JangoPay 时的历史支付数据进行迁移：

### **备份当前支付记录：**
```sql
-- Backup all existing payments
CREATE TABLE crypto_payments_backup AS SELECT * FROM crypto_payments;
```

### **更新 payment provider 标识：**
```sql
-- Add new column for tracking payment provider
ALTER TABLE crypto_payments ADD COLUMN payment_provider VARCHAR(50) DEFAULT 'manual';

-- Update existing records (if any came from NOWPayments or other providers)
UPDATE crypto_payments 
SET payment_provider = 'nowpayments' 
WHERE tx_hash LIKE 'np_%';

UPDATE crypto_payments 
SET payment_provider = 'jangopay' 
WHERE order_id LIKE 'jangopay_%';
```

---

## 🆘 **技术支持资源**

### **官方文档：**
- https://docs.jangopay.com
- https://www.jangopay.org/zh/developer

### **联系支持：**
- Email: support@jangopay.com
- Discord: [加入官方 Discord](https://discord.gg/jangopay)

---

## ✅ **上线检查清单**

- [ ] JangoPay 账户已完成 KYC 验证
- [ ] API Key 和 Secret Key 已配置到 Vercel
- [ ] Recipient ID 已正确设置
- [ ] Webhook URL 已配置并通过验证
- [ ] 测试环境下完成完整支付流程测试
- [ ] 数据库中支付记录正常写入
- [ ] Vercel 日志无报错
- [ ] 已将 JANGOPAY_URL 切换为生产环境

---

## 📞 **下一步行动**

1. 立即去 JangoPay 注册账户
2. 获取 API 凭证并配置环境变量
3. 提交代码并等待部署
4. 在测试环境完成支付流程测试
5. 配置 Webhook URL
6. 切换到生产环境并开始收取真实付款

如果遇到问题，请参考上面的常见问题排查部分或联系 JangoPay 技术支持！🚀
