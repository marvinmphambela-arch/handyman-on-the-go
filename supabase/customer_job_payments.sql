-- Customer Paystack job payments.
-- Every checkout attempt has its own reference. Abandoned attempts may still settle late;
-- the first verified payment for a job wins and later successful attempts are flagged duplicate_paid.

begin;

create table if not exists public.customer_job_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  handyman_id uuid not null references public.profiles(id) on delete restrict,
  amount_zar integer not null check (amount_zar > 0),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  payment_reference text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'abandoned', 'failed', 'paid', 'duplicate_paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists customer_job_payments_job_status_idx
  on public.customer_job_payments (job_id, status, created_at desc);
create index if not exists customer_job_payments_customer_date_idx
  on public.customer_job_payments (customer_id, created_at desc);

alter table public.customer_job_payments enable row level security;

drop policy if exists "Customers and assigned handymen can read job payments" on public.customer_job_payments;
create policy "Customers and assigned handymen can read job payments"
  on public.customer_job_payments
  for select to authenticated
  using (
    customer_id = auth.uid()
    or handyman_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.app_role
    )
  );

-- No client-side INSERT, UPDATE, or DELETE policies. Trusted server code uses service_role.

create or replace function public.record_verified_customer_job_payment(
  p_reference text,
  p_amount_zar integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.customer_job_payments%rowtype;
  v_existing_paid uuid;
begin
  if p_reference is null or p_amount_zar is null or p_amount_zar <= 0 or p_currency <> 'ZAR' then
    raise exception 'Invalid verified payment details';
  end if;

  select * into v_payment
  from public.customer_job_payments
  where payment_reference = p_reference
  for update;

  if not found then
    raise exception 'Customer job payment reference not found';
  end if;

  if v_payment.amount_zar <> p_amount_zar or v_payment.currency <> p_currency then
    raise exception 'Verified payment amount or currency does not match';
  end if;

  -- Serialise successful attempts for a job, including late settlement of an abandoned attempt.
  perform 1 from public.jobs where id = v_payment.job_id for update;

  if v_payment.status = 'paid' then
    return 'paid';
  end if;
  if v_payment.status = 'duplicate_paid' then
    return 'duplicate_paid';
  end if;
  if v_payment.status = 'failed' then
    raise exception 'This payment attempt was marked failed and cannot be credited';
  end if;

  select id into v_existing_paid
  from public.customer_job_payments
  where job_id = v_payment.job_id
    and status = 'paid'
    and id <> v_payment.id
  limit 1;

  if v_existing_paid is not null then
    update public.customer_job_payments
    set status = 'duplicate_paid', paid_at = now(), updated_at = now()
    where id = v_payment.id;
    return 'duplicate_paid';
  end if;

  update public.customer_job_payments
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = v_payment.id;

  return 'paid';
end;
$$;

revoke all on function public.record_verified_customer_job_payment(text, integer, text) from public, anon, authenticated;
grant execute on function public.record_verified_customer_job_payment(text, integer, text) to service_role;

-- Replace completion RPC so platform completion requires a verified customer payment.
-- The existing Access Wallet commission collection and idempotency rules are preserved.
create or replace function public.customer_confirm_job_completion(
  p_job_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_handyman_id uuid;
  v_labour_amount integer;
  v_commission_percent numeric(5,2);
  v_commission_amount integer;
  v_net_amount integer;
  v_wallet_balance integer;
  v_new_balance integer;
  v_existing public.handyman_earnings%rowtype;
  v_job_status public.job_status;
  v_earning_status text;
  v_commission_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to confirm completion.';
  end if;

  if p_payment_method is null or p_payment_method not in ('platform', 'direct_eft') then
    raise exception 'Choose a valid payment method.';
  end if;

  select j.customer_id, j.status
    into v_customer_id, v_job_status
  from public.jobs j
  where j.id = p_job_id
  for update;

  if v_customer_id is null then
    raise exception 'Job not found.';
  end if;

  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who posted this job can confirm completion.';
  end if;

  if v_job_status = 'completed'::public.job_status then
    select * into v_existing
    from public.handyman_earnings
    where job_id = p_job_id;

    if not found then
      raise exception 'This job is completed but has no earnings record. Please contact support.';
    end if;

    select t.status into v_commission_status
    from public.handyman_access_wallet_transactions t
    where t.job_id = p_job_id
      and t.transaction_type = 'commission_debit'
    limit 1;

    return jsonb_build_object(
      'job_id', p_job_id,
      'status', 'completed',
      'labour_amount_zar', v_existing.labour_amount_zar,
      'commission_amount_zar', v_existing.commission_amount_zar,
      'net_earnings_zar', v_existing.net_earnings_zar,
      'payment_method', v_existing.payment_method,
      'commission_status', coalesce(v_commission_status, 'not_applicable'),
      'already_completed', true
    );
  end if;

  if v_job_status <> 'in_progress'::public.job_status then
    raise exception 'This job must be in progress before completion can be confirmed.';
  end if;

  select o.handyman_id, o.amount_zar
    into v_handyman_id, v_labour_amount
  from public.job_offers o
  where o.job_id = p_job_id
    and o.status = 'accepted'::public.offer_status
  for update;

  if v_handyman_id is null or v_labour_amount is null then
    raise exception 'The accepted handyman offer could not be found.';
  end if;

  if p_payment_method = 'platform' and not exists (
    select 1
    from public.customer_job_payments cp
    where cp.job_id = p_job_id
      and cp.customer_id = auth.uid()
      and cp.handyman_id = v_handyman_id
      and cp.amount_zar = v_labour_amount
      and cp.currency = 'ZAR'
      and cp.status = 'paid'
  ) then
    raise exception 'A verified Paystack payment for the accepted offer is required before completion.';
  end if;

  select s.commission_percent
    into v_commission_percent
  from public.platform_financial_settings s
  where s.id = true;

  if v_commission_percent is null then
    raise exception 'Platform commission settings are missing.';
  end if;

  v_commission_amount := round(v_labour_amount * v_commission_percent / 100.0)::integer;
  v_net_amount := v_labour_amount - v_commission_amount;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (v_handyman_id, 0)
  on conflict (handyman_id) do nothing;

  select w.balance_zar
    into v_wallet_balance
  from public.handyman_access_wallets w
  where w.handyman_id = v_handyman_id
  for update;

  v_earning_status := case
    when p_payment_method = 'direct_eft' then 'paid'
    else 'held'
  end;

  insert into public.handyman_earnings (
    job_id, handyman_id, labour_amount_zar, commission_percent,
    commission_amount_zar, net_earnings_zar, payment_method, status,
    completed_at, available_at, paid_at
  ) values (
    p_job_id, v_handyman_id, v_labour_amount, v_commission_percent,
    v_commission_amount, v_net_amount, p_payment_method, v_earning_status,
    now(),
    case when p_payment_method = 'direct_eft' then now() else null end,
    case when p_payment_method = 'direct_eft' then now() else null end
  );

  if v_commission_amount > 0 and v_wallet_balance >= v_commission_amount then
    update public.handyman_access_wallets
    set balance_zar = balance_zar - v_commission_amount,
        updated_at = now()
    where handyman_id = v_handyman_id
    returning balance_zar into v_new_balance;

    insert into public.handyman_access_wallet_transactions (
      handyman_id, job_id, transaction_type, direction, amount_zar,
      status, description, posted_at
    ) values (
      v_handyman_id, p_job_id, 'commission_debit', 'debit',
      v_commission_amount, 'posted',
      '10% platform commission for completed job ' || p_job_id::text,
      now()
    );
    v_commission_status := 'posted';
  elsif v_commission_amount > 0 then
    insert into public.handyman_access_wallet_transactions (
      handyman_id, job_id, transaction_type, direction, amount_zar,
      status, description
    ) values (
      v_handyman_id, p_job_id, 'commission_debit', 'debit',
      v_commission_amount, 'pending',
      'Commission due for completed job ' || p_job_id::text || '; awaiting wallet top-up'
    );
    v_new_balance := v_wallet_balance;
    v_commission_status := 'pending';
  else
    v_new_balance := v_wallet_balance;
    v_commission_status := 'not_applicable';
  end if;

  update public.jobs
  set status = 'completed'::public.job_status
  where id = p_job_id
    and customer_id = auth.uid()
    and status = 'in_progress'::public.job_status;

  if not found then
    raise exception 'The job status changed before completion could be saved.';
  end if;

  return jsonb_build_object(
    'job_id', p_job_id,
    'status', 'completed',
    'labour_amount_zar', v_labour_amount,
    'commission_percent', v_commission_percent,
    'commission_amount_zar', v_commission_amount,
    'net_earnings_zar', v_net_amount,
    'payment_method', p_payment_method,
    'commission_status', v_commission_status,
    'wallet_balance_zar', v_new_balance,
    'already_completed', false
  );
end;
$$;

revoke all on function public.customer_confirm_job_completion(uuid, text) from public, anon;
grant execute on function public.customer_confirm_job_completion(uuid, text) to authenticated;

commit;
