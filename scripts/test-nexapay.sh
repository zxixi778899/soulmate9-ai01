#!/bin/bash
# ===================================================================
# NEXA Pay - 环境检查与快速测试脚本
# ===================================================================
# 用法:
#   ./scripts/test-nexapay.sh
# 
# 功能:
#   1. 检查环境变量配置
#   2. 验证 API 端点可访问性
#   3. 生成测试 curl 命令示例
# ===================================================================

set -e  # Exit on error

echo "=================================================="
echo "🔍 NEXA Pay 配置检查"
echo "=================================================="
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local 文件存在"
    
    # Extract NEXA Pay variables
    NEXAPAY_API_KEY=$(grep "^NEXAPAY_API_KEY=" .env.local | cut -d'=' -f2-)
    NEXAPAY_MERCHANT_ID=$(grep "^NEXAPAY_MERCHANT_ID=" .env.local | cut -d'=' -f2-)
    NEXAPAY_WEBHOOK_SECRET=$(grep "^NEXAPAY_WEBHOOK_SECRET=" .env.local | cut -d'=' -f2-)
    
    if [ -z "$NEXAPAY_API_KEY" ]; then
        echo "❌ NEXAPAY_API_KEY 未设置"
    else
        echo "✅ NEXAPAY_API_KEY configured (last 4 chars: ${NEXAPAY_API_KEY: -4})"
    fi
    
    if [ -z "$NEXAPAY_MERCHANT_ID" ]; then
        echo "⚠️  NEXAPAY_MERCHANT_ID 未设置（可选）"
    else
        echo "✅ NEXAPAY_MERCHANT_ID configured"
    fi
    
    if [ -z "$NEXAPAY_WEBHOOK_SECRET" ]; then
        echo "⚠️  NEXAPAY_WEBHOOK_SECRET 未设置（webhook 必需）"
    else
        echo "✅ NEXAPAY_WEBHOOK_SECRET configured (length: ${#NEXAPAY_WEBHOOK_SECRET})"
    fi
else
    echo "❌ .env.local 文件不存在"
    echo ""
    echo "💡 创建 .env.local:"
    echo "   cp .env.example .env.local"
    echo "   # 然后编辑添加 NEXA Pay 变量"
fi

echo ""
echo "=================================================="
echo "📝 完整环境变量模板"
echo "=================================================="
cat << 'EOF'
# ─── NEXA Pay (LATAM Payment Gateway) ──────────────────────────────
NEXAPAY_API_KEY=nxp_live_your_api_key_here
NEXAPAY_API_SECRET=your_secret_here
NEXAPAY_MERCHANT_ID=M_your_merchant_id_here
NEXAPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
EOF

echo ""
echo "=================================================="
echo "🧪 测试命令示例（替换 YOUR_JWT_TOKEN）"
echo "=================================================="
cat << 'EOF'
# 1. 测试创建支付（Pix）
curl -X POST http://localhost:3000/api/v2/shop/tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_JWT_TOKEN" \
  -d '{
    "package_id": "credits-1000",
    "provider": "nexapay",
    "payment_method": "pix"
  }'

# 2. 测试 NEXA Pay 订阅（年度 Pro）
curl -X POST http://localhost:3000/api/nexapay \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_JWT_TOKEN" \
  -d '{
    "plan": "pro",
    "billing": "yearly",
    "payment_method": "card_latam"
  }'

# 3. Webhook 签名生成示例（Linux/macOS）
PAYLOAD='{"payment_id":"test","status":"completed","order_id":"nxp_test_user_pro_monthly_123","amount_usd":19.99,"amount_brl":99.90}'
SECRET="your_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" --macopt hexkey:true | awk '{print $2}')
echo "Signature: $SIGNATURE"

# 4. 模拟 Webhook 回调
curl -X POST http://localhost:3000/api/nexapay/webhook \
  -H "Content-Type: application/json" \
  -H "X-NexaPay-Signature: $SIGNATURE" \
  -d '{"payment_id":"np_xxxx","status":"completed","order_id":"nxp_test_user_pro_monthly_123","amount_usd":19.99,"amount_brl":99.90,"payment_method":"pix"}'
EOF

echo ""
echo "=================================================="
echo "✅ 检查完成"
echo "=================================================="
echo ""
echo "下一步:"
echo "1. 注册 NEXA Pay 账户：https://www.nexapay.com"
echo "2. 获取 API 密钥并添加到 .env.local"
echo "3. 启动开发服务器：pnpm dev"
echo "4. 访问 Shop 页面测试支付流程："
echo "   http://localhost:3000/shop?tab=credits"
echo ""
echo "📖 详细文档:"
echo "   - 配置指南：docs/NEXAPAY-PAYMENT-CONFIGURATION.md"
echo "   - 测试指南：docs/NEXAPAY-TESTING-GUIDE.md"
echo "   - 快速开始：docs/NEXAPAY-QUICK-START.md"
echo ""
