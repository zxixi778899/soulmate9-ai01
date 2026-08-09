-- One-time backfill: create subscription records for existing confirmed USDT payments
-- that don't have a corresponding active subscription row.
-- Safe to re-run (WHERE NOT EXISTS guard).
INSERT INTO subscriptions (user_id, plan_id, status, billing_interval, billing_interval_count, unit_amount_cents, currency, current_period_end, created_at, updated_at)
SELECT
  cp.user_id, cp.plan_id, 'active',
  COALESCE(cp.billing, 'monthly'), 1,
  ROUND((COALESCE(cp.amount_usd, 0)::numeric) * 100)::integer, 'usd',
  CASE WHEN cp.billing = 'yearly' THEN cp.confirmed_at::timestamptz + INTERVAL '365 days'
       ELSE cp.confirmed_at::timestamptz + INTERVAL '30 days' END,
  cp.confirmed_at, NOW()
FROM crypto_payments cp
WHERE cp.status = 'confirmed' AND cp.confirmed_at IS NOT NULL
  AND cp.tx_hash IS NOT NULL
  AND cp.tx_hash NOT LIKE 'np_%' AND cp.tx_hash NOT LIKE 'nxp_%'
  AND cp.tx_hash NOT LIKE 'stripe_%' AND cp.tx_hash NOT LIKE 'cs_%'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = cp.user_id AND s.status = 'active' AND s.plan_id = cp.plan_id);
