# 正式上线前提醒：Stripe 价格变量（用户约定保留）

> **状态**：开发期可留空 · **正式上线前必须补齐**  
> **约定时间**：用户要求「保留这 3 个变量，等正式上线的时候提示我」  
> Agent：用户提到「上线 / 部署正式 / go live / production」时，**主动读本文并提醒**。

---

## 保留到上线再填的 3 组变量

| # | 变量 | 用途 | Stripe 后台 |
|---|------|------|-------------|
| 1 | `STRIPE_PRO_YEARLY_PRICE_ID` | Pro 年付（约 $199/年） | Products → Pro → Yearly price → 复制 `price_...` |
| 2 | `STRIPE_UNLIMITED_YEARLY_PRICE_ID` | Unlimited 年付（约 $399/年） | Products → Unlimited → Yearly price → 复制 `price_...` |
| 3 | `STRIPE_TOKENS_100_PRICE_ID` <br> `STRIPE_TOKENS_500_PRICE_ID` <br> `STRIPE_TOKENS_1000_PRICE_ID` | 代币包一次性付款 | Products → 各 Token Pack → One-time price → 复制 `price_...` |

代码读取位置：

- 年付：`src/app/api/stripe/checkout/route.ts`
- 代币：`src/app/api/v2/shop/tokens/route.ts`

---

## 为什么可以延后

未配置时，Checkout 会走 Stripe **`price_data` 动态定价**，本地和测试环境仍可完成支付链路。  
上线后建议改成固定 Price ID，便于：

- 在 Dashboard 改价、做优惠券
- 对账与报表清晰
- Webhook / 税务更稳定

---

## 上线时同步检查（相关）

不要只填 Price ID，正式环境还要切换整套 **Live** 凭证（与 Test 分离）：

- [ ] `STRIPE_SECRET_KEY` → `sk_live_...`
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
- [ ] `STRIPE_WEBHOOK_SECRET` → 生产域名 Webhook 的 `whsec_...`
- [ ] Webhook URL：`https://你的正式域名/api/stripe/webhook`
- [ ] 监听事件至少含：`checkout.session.completed`、`invoice.payment_failed`、`customer.subscription.updated`、`customer.subscription.deleted`
- [ ] 上述 3 组 Price ID 用 **Live mode** 下的 `price_...`（不要用 test 的）
- [ ] 确认 Stripe 业务类型 / NSFW 合规（见 `USER_CONFIRMATION_CHECKLIST.md`）

---

## 填好后写到哪里

- 本地：`.env.local`（勿提交 Git）
- 线上：Vercel / Railway 等平台的 Environment Variables  
- 模板参考：根目录 `.env.example`
