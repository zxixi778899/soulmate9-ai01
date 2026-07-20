-- Tax recording fields for US/EU reporting compliance
-- Adds tax tracking columns to purchase_history and creates tax reporting view

-- Add tax tracking columns to purchase_history
ALTER TABLE purchase_history
  ADD COLUMN IF NOT EXISTS tax_amount_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS user_country TEXT,
  ADD COLUMN IF NOT EXISTS user_state TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Add billing cycle tracking to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0;

-- Create tax reporting view for US/EU tax filing
CREATE OR REPLACE VIEW tax_report_monthly AS
SELECT
  date_trunc('month', ph.created_at) AS tax_month,
  ph.user_country,
  ph.user_state,
  ph.tax_type,
  ph.tax_currency,
  COUNT(*) AS transaction_count,
  SUM(ph.amount_cents) AS total_amount_cents,
  SUM(ph.tax_amount_cents) AS total_tax_cents,
  SUM(ph.amount_cents + ph.tax_amount_cents) AS total_gross_cents
FROM purchase_history ph
WHERE ph.status = 'completed'
GROUP BY date_trunc('month', ph.created_at), ph.user_country, ph.user_state, ph.tax_type, ph.tax_currency
ORDER BY tax_month DESC, total_gross_cents DESC;

-- Create US-specific tax summary (for 1099 reporting)
CREATE OR REPLACE VIEW tax_report_us_annual AS
SELECT
  EXTRACT(YEAR FROM ph.created_at) AS tax_year,
  ph.user_state,
  COUNT(*) AS transaction_count,
  SUM(ph.amount_cents) AS total_revenue_cents,
  SUM(ph.tax_amount_cents) AS total_tax_collected_cents,
  SUM(ph.amount_cents + ph.tax_amount_cents) AS total_gross_cents
FROM purchase_history ph
WHERE ph.status = 'completed'
  AND ph.user_country = 'US'
GROUP BY EXTRACT(YEAR FROM ph.created_at), ph.user_state
ORDER BY tax_year DESC, total_gross_cents DESC;

-- Create EU-specific tax summary (for VAT reporting)
CREATE OR REPLACE VIEW tax_report_eu_annual AS
SELECT
  EXTRACT(YEAR FROM ph.created_at) AS tax_year,
  ph.user_country,
  ph.tax_type,
  ph.tax_rate,
  COUNT(*) AS transaction_count,
  SUM(ph.amount_cents) AS total_revenue_cents,
  SUM(ph.tax_amount_cents) AS total_vat_collected_cents,
  SUM(ph.amount_cents + ph.tax_amount_cents) AS total_gross_cents
FROM purchase_history ph
WHERE ph.status = 'completed'
  AND ph.user_country IN ('DE','FR','IT','ES','NL','BE','AT','PT','IE','FI','DK','SE','PL','CZ','RO','HU','BG','HR','SK','SI','LT','LV','EE','LU','MT','CY','GR')
GROUP BY EXTRACT(YEAR FROM ph.created_at), ph.user_country, ph.tax_type, ph.tax_rate
ORDER BY tax_year DESC, total_gross_cents DESC;

-- Add index for tax reporting queries
CREATE INDEX IF NOT EXISTS idx_purchase_history_tax_reporting
  ON purchase_history (user_country, created_at, status)
  WHERE status = 'completed';
