-- Add missing fields to crypto_payments table for NOWPayments integration
-- Adds: network, expires_at columns that are used in initiate/route.ts

alter table if exists public.crypto_payments 
add column if not exists network varchar(32) default 'TRC-20';

alter table if exists public.crypto_payments 
add column if not exists expires_at timestamptz;

-- billing field already added in previous migration (20260802000000_crypto_payments_billing.sql)
-- Verify it exists:
comment on column public.crypto_payments.billing is
  'Billing cycle: monthly or yearly';
