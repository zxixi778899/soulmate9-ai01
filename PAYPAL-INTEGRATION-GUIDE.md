# 💳 PayPal 集成方案

## 🎯 **优势**

- ✅ 全球接受度高
- ✅ 文档完善且示例丰富
- ✅ 支持信用卡和 PayPal 余额
- ✅ 适合中国市场

## 📦 **第一步：注册 PayPal Business 账户**

1. 访问：https://www.paypal.com/business/onboard
2. 填写企业信息（建议使用企业账户）
3. 完成验证

## 🔧 **第二步：获取 API 凭证**

### **Method 1: REST API Keys**

1. Login → Business Center
2. Developers → My Apps & Credentials
3. Live → Create App
4. 复制 **Client ID**

### **Method 2: OAuth Token**

使用 server-to-server token 生成

## 💻 **第三步：代码集成**

已在 pricing page 中添加 PayPal SDK 支持

## ✅ **配置环境变量**

```
NEXT_PUBLIC_PAYPAL_CLIENT_ID=[你的 Client ID]
PAYPAL_SECRET=[你的 Secret]
```

## 🚀 **部署后测试**

刷新页面应该看到 PayPal 支付按钮或弹窗
