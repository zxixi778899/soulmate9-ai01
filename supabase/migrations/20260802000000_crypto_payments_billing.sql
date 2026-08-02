-- crypto_payments: record which billing cycle was paid for (monthly / yearly).
-- Needed because memberships are now sold via USDT with a real yearly
-- discount, and admin verification must know the paid period.

alter table public.crypto_payments
  add column if not exists billing varchar(16) not null default 'monthly';

comment on column public.crypto_payments.billing is
  'Billing cycle paid for: monthly or yearly';

notify pgrst, 'reload schema';
