-- Migration: Add billing_interval and related columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval text DEFAULT 'monthly';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval_count integer DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS unit_amount_cents integer;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'usd';
