-- crypto_payments: tracks NowPayments / NexaPay / manual crypto payments
-- (credit packs + memberships). Provider is identified by tx_hash prefix:
--   np_%  = NowPayments, nxp_% = NexaPay, stripe_%/cs_% = Stripe, else = manual.
-- Fixes vs the (never-applied) Drizzle schema:
--   * amount_usd is numeric(12,2) so dollar amounts like 9.99 are stored exactly
--   * wallet_address is nullable (NowPayments hosted-invoice rows have no address)

create table if not exists public.crypto_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id varchar(64) not null,
  amount_usd numeric(12, 2) not null default 0,
  currency varchar(10) not null default 'USDT',
  wallet_address text,
  tx_hash varchar(255),
  amount_received varchar(50),
  status varchar(32) not null default 'awaiting_payment',
  screenshot_url text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists crypto_payments_user_id_idx on public.crypto_payments (user_id);
create index if not exists crypto_payments_status_idx on public.crypto_payments (status);
create index if not exists crypto_payments_tx_hash_idx on public.crypto_payments (tx_hash);

-- keep updated_at fresh
create or replace function public.touch_crypto_payments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crypto_payments_touch_updated_at on public.crypto_payments;
create trigger crypto_payments_touch_updated_at
  before update on public.crypto_payments
  for each row execute function public.touch_crypto_payments_updated_at();

-- RLS: users see only their own rows; service role bypasses RLS anyway.
alter table public.crypto_payments enable row level security;

drop policy if exists crypto_payments_select_own on public.crypto_payments;
create policy crypto_payments_select_own on public.crypto_payments
  for select using (auth.uid() = user_id);

drop policy if exists crypto_payments_insert_own on public.crypto_payments;
create policy crypto_payments_insert_own on public.crypto_payments
  for insert with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
