-- SoulMate financial ledger and recoverable Stripe webhook processing.
-- Generated with `supabase migration new financial_ledger_webhook_reliability`.

alter table public.profiles
  add column if not exists extra_girlfriend_slots integer not null default 0;

alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists unit_amount_cents integer,
  add column if not exists currency text,
  add column if not exists billing_interval text,
  add column if not exists billing_interval_count integer;

do $$ begin
  alter table public.profiles
    add constraint profiles_extra_girlfriend_slots_nonnegative
    check (extra_girlfriend_slots >= 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  currency text not null default 'tokens' check (currency = 'tokens'),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null,
  reference_type text,
  reference_id text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);
create index if not exists wallet_ledger_reference_idx
  on public.wallet_ledger (reference_type, reference_id)
  where reference_id is not null;

alter table public.wallet_ledger enable row level security;
revoke all on table public.wallet_ledger from public, anon, authenticated;
grant select on table public.wallet_ledger to authenticated;
grant select, insert on table public.wallet_ledger to service_role;

drop policy if exists "wallet ledger owner read" on public.wallet_ledger;
create policy "wallet ledger owner read"
  on public.wallet_ledger
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, updated_at desc);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.stripe_webhook_events to service_role;

create table if not exists public.ai_model_usage_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_id text not null,
  task_type text not null,
  user_id uuid,
  girlfriend_id uuid,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  cost_usd numeric(14, 8) not null default 0 check (cost_usd >= 0),
  success boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_model_usage_created_idx
  on public.ai_model_usage_logs (created_at desc);
create index if not exists ai_model_usage_model_created_idx
  on public.ai_model_usage_logs (model_id, created_at desc);
create index if not exists ai_model_usage_user_created_idx
  on public.ai_model_usage_logs (user_id, created_at desc)
  where user_id is not null;

alter table public.ai_model_usage_logs enable row level security;
revoke all on table public.ai_model_usage_logs from public, anon, authenticated;
grant select, insert on table public.ai_model_usage_logs to service_role;

alter table if exists public.purchase_history
  add column if not exists payment_event_id text;

-- Legacy rows receive a stable unique value. New payment rows use the Stripe
-- event id, making purchase history inserts idempotent as well.
update public.purchase_history
set payment_event_id = 'legacy:' || id::text
where payment_event_id is null;

create unique index if not exists purchase_history_payment_event_idx
  on public.purchase_history (payment_event_id)
  where payment_event_id is not null;
create index if not exists purchase_history_status_created_idx
  on public.purchase_history (status, created_at desc);

create table if not exists public.commerce_fulfillments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  fulfillment_type text not null,
  quantity bigint not null check (quantity > 0),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists commerce_fulfillments_user_created_idx
  on public.commerce_fulfillments (user_id, created_at desc);

alter table public.commerce_fulfillments enable row level security;
revoke all on table public.commerce_fulfillments from public, anon, authenticated;
grant select, insert on table public.commerce_fulfillments to service_role;

create or replace function public.apply_wallet_ledger(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(applied boolean, balance bigint, ledger_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.wallet_ledger%rowtype;
  v_balance bigint;
  v_ledger_id uuid;
begin
  if p_user_id is null or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'user_id and idempotency_key are required';
  end if;
  if p_amount = 0 then
    raise exception 'wallet amount must not be zero';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into v_existing
  from public.wallet_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return query select false, v_existing.balance_after, v_existing.id;
    return;
  end if;

  insert into public.user_tokens (
    user_id, balance_tokens, lifetime_tokens_earned, lifetime_tokens_spent,
    monthly_tokens_spent, last_updated_at
  ) values (p_user_id, 0, 0, 0, 0, now())
  on conflict (user_id) do nothing;

  select balance_tokens into v_balance
  from public.user_tokens
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0) + p_amount;
  if v_balance < 0 then
    raise exception 'insufficient wallet balance';
  end if;

  update public.user_tokens
  set balance_tokens = v_balance,
      lifetime_tokens_earned = lifetime_tokens_earned + greatest(p_amount, 0),
      lifetime_tokens_spent = lifetime_tokens_spent + greatest(-p_amount, 0),
      monthly_tokens_spent = monthly_tokens_spent + greatest(-p_amount, 0),
      last_updated_at = now()
  where user_id = p_user_id;

  -- Transitional mirror for legacy readers. All new writes must go through
  -- this function until profiles.credits_remaining is fully retired.
  update public.profiles
  set credits_remaining = v_balance,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, amount, balance_after, reason, reference_type, reference_id,
    idempotency_key, metadata
  ) values (
    p_user_id, p_amount, v_balance, p_reason, p_reference_type, p_reference_id,
    p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_ledger_id;

  insert into public.token_transactions (
    user_id, transaction_type, amount_tokens, reason, related_entity_type,
    balance_after, metadata
  ) values (
    p_user_id,
    case when p_amount > 0 then 'earn' else 'spend' end,
    abs(p_amount),
    left(p_reason, 128),
    left(p_reference_type, 32),
    v_balance,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('ledger_id', v_ledger_id)
  );

  return query select true, v_balance, v_ledger_id;
end;
$$;

revoke all on function public.apply_wallet_ledger(uuid, bigint, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_wallet_ledger(uuid, bigint, text, text, text, text, jsonb)
  to service_role;

create or replace function public.grant_companion_seats_idempotent(
  p_user_id uuid,
  p_seats integer,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(applied boolean, total_bonus_seats integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.commerce_fulfillments%rowtype;
  v_total integer;
begin
  if p_user_id is null or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'user_id and idempotency_key are required';
  end if;
  if p_seats <= 0 then
    raise exception 'seats must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 2));
  select * into v_existing
  from public.commerce_fulfillments
  where idempotency_key = p_idempotency_key;

  if found then
    select coalesce(extra_girlfriend_slots, 0) into v_total
    from public.profiles
    where user_id = p_user_id;
    return query select false, coalesce(v_total, 0);
    return;
  end if;

  update public.profiles
  set extra_girlfriend_slots = coalesce(extra_girlfriend_slots, 0) + p_seats,
      updated_at = now()
  where user_id = p_user_id
  returning extra_girlfriend_slots into v_total;

  if not found then
    raise exception 'profile not found';
  end if;

  insert into public.commerce_fulfillments (
    user_id, fulfillment_type, quantity, idempotency_key, metadata
  ) values (
    p_user_id, 'companion_seats', p_seats, p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select true, v_total;
end;
$$;

revoke all on function public.grant_companion_seats_idempotent(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_companion_seats_idempotent(uuid, integer, text, jsonb)
  to service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text
)
returns table(claimed boolean, attempts integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'event_id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id, 1));
  select * into v_event
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if found and v_event.status = 'succeeded' then
    return query select false, v_event.attempt_count;
    return;
  end if;

  -- A short processing lease prevents concurrent Stripe deliveries from
  -- fulfilling the same event. Stale leases are recoverable after 10 minutes.
  if found
     and v_event.status = 'processing'
     and v_event.updated_at > now() - interval '10 minutes' then
    return query select false, v_event.attempt_count;
    return;
  end if;

  if found then
    update public.stripe_webhook_events
    set event_type = p_event_type,
        status = 'processing',
        attempt_count = attempt_count + 1,
        last_error = null,
        updated_at = now()
    where event_id = p_event_id
    returning * into v_event;
  else
    insert into public.stripe_webhook_events (event_id, event_type)
    values (p_event_id, p_event_type)
    returning * into v_event;
  end if;

  return query select true, v_event.attempt_count;
end;
$$;

create or replace function public.complete_stripe_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.stripe_webhook_events
  set status = 'succeeded', processed_at = now(), last_error = null, updated_at = now()
  where event_id = p_event_id;
$$;

create or replace function public.fail_stripe_webhook_event(p_event_id text, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.stripe_webhook_events
  set status = 'failed', last_error = left(coalesce(p_error, 'unknown error'), 1000), updated_at = now()
  where event_id = p_event_id;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text) to service_role;
grant execute on function public.fail_stripe_webhook_event(text, text) to service_role;

create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with boundaries as (
    select now() - interval '24 hours' as since_24h,
           now() - interval '7 days' as since_7d
  ),
  cache as (
    select count(*)::bigint as entries,
           coalesce(sum(hit_count), 0)::bigint as hits
    from public.generation_cache, boundaries
    where created_at >= boundaries.since_7d
  )
  select jsonb_build_object(
    'totalUsers', (select count(*) from public.profiles),
    'totalGirlfriends', (select count(*) from public.girlfriends),
    'publicGirlfriends', (select count(*) from public.girlfriends where is_public = true),
    'pendingReview', (select count(*) from public.girlfriends where review_status = 'pending'),
    'activeAds', (select count(*) from public.admin_ads where active = true),
    'dau', (select count(distinct user_id) from public.chat_messages, boundaries where created_at >= boundaries.since_24h),
    'wau', (select count(distinct user_id) from public.chat_messages, boundaries where created_at >= boundaries.since_7d),
    'mrr_cents', (
      select coalesce(round(sum(
        case
          when billing_interval = 'year' then unit_amount_cents::numeric / (12 * greatest(coalesce(billing_interval_count, 1), 1))
          when billing_interval = 'month' then unit_amount_cents::numeric / greatest(coalesce(billing_interval_count, 1), 1)
          else 0
        end
      )), 0)::bigint
      from public.subscriptions
      where status in ('active', 'trialing')
    ),
    'proMembers', (select count(*) from public.profiles where membership_tier = 'pro'),
    'unlimitedMembers', (select count(*) from public.profiles where membership_tier = 'unlimited'),
    'paidMembers', (select count(*) from public.profiles where membership_tier in ('pro', 'unlimited')),
    'totalPaidCents', (select coalesce(sum(amount_cents), 0) from public.purchase_history where status = 'completed'),
    'revenue7dCents', (select coalesce(sum(amount_cents), 0) from public.purchase_history, boundaries where status = 'completed' and created_at >= boundaries.since_7d),
    'newUsers7d', (select count(*) from public.profiles, boundaries where created_at >= boundaries.since_7d),
    'images7d', (select count(*) from public.chat_messages, boundaries where media_type = 'image' and media_url is not null and created_at >= boundaries.since_7d),
    'failedPayments7d', (select count(*) from public.stripe_webhook_events, boundaries where event_type = 'invoice.payment_failed' and created_at >= boundaries.since_7d),
    'tokenLiability', (select coalesce(sum(balance_tokens), 0) from public.user_tokens),
    'aiCost7dCents', (
      select coalesce(round(sum(cost_usd) * 100), 0)::bigint
      from public.ai_model_usage_logs, boundaries
      where created_at >= boundaries.since_7d
    ),
    'llmSuccessRate7d', (
      select case when count(*) = 0 then 0
                  else round(count(*) filter (where success)::numeric / count(*), 4) end
      from public.ai_model_usage_logs, boundaries
      where created_at >= boundaries.since_7d
    ),
    'cacheHitRate', (
      select case when entries + hits = 0 then 0
                  else round(hits::numeric / (entries + hits), 4) end
      from cache
    )
  );
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics() to service_role;
