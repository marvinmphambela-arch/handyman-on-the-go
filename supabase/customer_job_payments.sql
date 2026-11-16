-- Customer Paystack job payments and wallet-first commission accounting.
-- Commission is 10% (or the configured rate) of the accepted labour amount.
-- Wallet funds are used first. Platform payments recover any remaining amount from
-- the current held earnings. Direct EFT shortfalls are carried to future platform-held earnings.

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
    check (status in ('pending', 'abandoned', 'failed', 'paid', 'duplicate_paid', 'refund_required')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists customer_job_payments_job_status_idx
  on public.customer_job_payments (job_id, status, created_at desc);
create index if not exists customer_job_payments_customer_date_idx
  on public.customer_job_payments (customer_id, created_at desc);
create unique index if not exists customer_job_payments_one_paid_per_job
  on public.customer_job_payments (job_id) where status = 'paid';

alter table public.customer_job_payments enable row level security;
drop policy if exists "Customers and assigned handymen can read job payments" on public.customer_job_payments;
create policy "Customers and assigned handymen can read job payments"
  on public.customer_job_payments for select to authenticated
  using (
    customer_id = auth.uid()
    or handyman_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.app_role)
  );

-- Outstanding Direct EFT commission is an internal ledger. Only trusted RPCs may change it.
create table if not exists public.handyman_commission_carryforwards (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references public.profiles(id) on delete restrict,
  source_job_id uuid not null references public.jobs(id) on delete restrict,
  original_amount_zar integer not null check (original_amount_zar > 0),
  remaining_amount_zar integer not null check (remaining_amount_zar >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_job_id)
);
create index if not exists handyman_commission_carryforwards_owner_idx
  on public.handyman_commission_carryforwards (handyman_id, created_at)
  where remaining_amount_zar > 0;
alter table public.handyman_commission_carryforwards enable row level security;
drop policy if exists "Handymen and admins can read commission carryforwards" on public.handyman_commission_carryforwards;
create policy "Handymen and admins can read commission carryforwards"
  on public.handyman_commission_carryforwards for select to authenticated
  using (
    handyman_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.app_role)
  );

-- Preserve the existing earnings constraint: commission_amount_zar is the amount
-- actually withheld from this job's earnings, and net_earnings_zar is the remainder.
alter table public.handyman_earnings
  add column if not exists commission_total_zar integer not null default 0,
  add column if not exists commission_wallet_amount_zar integer not null default 0,
  add column if not exists commission_shortfall_zar integer not null default 0,
  add column if not exists commission_carryforward_deducted_zar integer not null default 0;

-- Correct historic records: wallet debits are not also deducted from earnings.
update public.handyman_earnings e
set commission_total_zar = e.commission_amount_zar,
    commission_wallet_amount_zar = coalesce((
      select least(e.commission_amount_zar, sum(t.amount_zar)::integer)
      from public.handyman_access_wallet_transactions t
      where t.job_id = e.job_id
        and t.transaction_type = 'commission_debit'
        and t.status = 'posted'
    ), 0),
    commission_shortfall_zar = case
      when e.payment_method = 'direct_eft' then greatest(
        e.commission_amount_zar - coalesce((
          select least(e.commission_amount_zar, sum(t.amount_zar)::integer)
          from public.handyman_access_wallet_transactions t
          where t.job_id = e.job_id
            and t.transaction_type = 'commission_debit'
            and t.status = 'posted'
        ), 0), 0)
      else 0
    end,
    commission_amount_zar = case
      when e.payment_method = 'direct_eft' then 0
      else greatest(
        e.commission_amount_zar - coalesce((
          select least(e.commission_amount_zar, sum(t.amount_zar)::integer)
          from public.handyman_access_wallet_transactions t
          where t.job_id = e.job_id
            and t.transaction_type = 'commission_debit'
            and t.status = 'posted'
        ), 0), 0)
    end,
    net_earnings_zar = e.labour_amount_zar - case
      when e.payment_method = 'direct_eft' then 0
      else greatest(
        e.commission_amount_zar - coalesce((
          select least(e.commission_amount_zar, sum(t.amount_zar)::integer)
          from public.handyman_access_wallet_transactions t
          where t.job_id = e.job_id
            and t.transaction_type = 'commission_debit'
            and t.status = 'posted'
        ), 0), 0)
    end;

-- Historical Direct EFT shortfalls become carryforwards instead of being treated
-- as if they had been withheld from a payment made directly to the handyman.
insert into public.handyman_commission_carryforwards (
  handyman_id, source_job_id, original_amount_zar, remaining_amount_zar
)
select e.handyman_id, e.job_id, e.commission_shortfall_zar, e.commission_shortfall_zar
from public.handyman_earnings e
where e.payment_method = 'direct_eft'
  and e.commission_shortfall_zar > 0
on conflict (source_job_id) do nothing;

-- Pending legacy debits must never be collected from future wallet top-ups.
update public.handyman_access_wallet_transactions
set status = 'reversed',
    description = 'Legacy pending commission reversed; any Direct EFT shortfall is tracked in the commission carryforward ledger'
where transaction_type = 'commission_debit'
  and status = 'pending';

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
  if p_reference is null or p_amount_zar is null or p_amount_zar <= 0 or p_currency is distinct from 'ZAR' then
    raise exception 'Invalid verified payment details';
  end if;

  select * into v_payment
  from public.customer_job_payments
  where payment_reference = p_reference
  for update;

  if not found then raise exception 'Customer job payment reference not found'; end if;
  if v_payment.amount_zar <> p_amount_zar or v_payment.currency <> p_currency then
    raise exception 'Verified payment amount or currency does not match';
  end if;

  perform 1 from public.jobs where id = v_payment.job_id for update;

  if v_payment.status = 'paid' then return 'paid'; end if;
  if v_payment.status = 'duplicate_paid' then return 'duplicate_paid'; end if;
  if v_payment.status = 'refund_required' then return 'refund_required'; end if;
  if v_payment.status = 'failed' then raise exception 'This payment attempt was marked failed and cannot be credited'; end if;

  if not exists (
    select 1
    from public.jobs j
    join public.job_offers o on o.job_id = j.id and o.status = 'accepted'::public.offer_status
    where j.id = v_payment.job_id
      and j.customer_id = v_payment.customer_id
      and j.status = 'in_progress'::public.job_status
      and o.handyman_id = v_payment.handyman_id
      and o.amount_zar = v_payment.amount_zar
  ) then
    update public.customer_job_payments
    set status = 'refund_required', paid_at = now(), updated_at = now()
    where id = v_payment.id;
    return 'refund_required';
  end if;

  select id into v_existing_paid
  from public.customer_job_payments
  where job_id = v_payment.job_id and status = 'paid' and id <> v_payment.id
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
  v_commission_total integer;
  v_wallet_contribution integer;
  v_current_shortfall integer;
  v_carryforward_deducted integer := 0;
  v_earnings_deduction integer := 0;
  v_net_amount integer;
  v_wallet_balance integer;
  v_new_balance integer;
  v_existing public.handyman_earnings%rowtype;
  v_job_status public.job_status;
  v_earning_status text;
  v_commission_status text;
  v_carry record;
  v_to_collect integer;
  v_collect integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in to confirm completion.'; end if;
  if p_payment_method is null or p_payment_method not in ('platform', 'direct_eft') then
    raise exception 'Choose a valid payment method.';
  end if;

  select j.customer_id, j.status into v_customer_id, v_job_status
  from public.jobs j where j.id = p_job_id for update;
  if v_customer_id is null then raise exception 'Job not found.'; end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who posted this job can confirm completion.';
  end if;

  if v_job_status = 'completed'::public.job_status then
    select * into v_existing from public.handyman_earnings where job_id = p_job_id;
    if not found then raise exception 'This job is completed but has no earnings record. Please contact support.'; end if;
    return jsonb_build_object(
      'job_id', p_job_id, 'status', 'completed',
      'labour_amount_zar', v_existing.labour_amount_zar,
      'commission_total_zar', v_existing.commission_total_zar,
      'commission_wallet_amount_zar', v_existing.commission_wallet_amount_zar,
      'commission_shortfall_zar', v_existing.commission_shortfall_zar,
      'commission_carryforward_deducted_zar', v_existing.commission_carryforward_deducted_zar,
      'commission_amount_zar', v_existing.commission_amount_zar,
      'net_earnings_zar', v_existing.net_earnings_zar,
      'payment_method', v_existing.payment_method,
      'commission_status', 'already_recorded',
      'already_completed', true
    );
  end if;

  if v_job_status <> 'in_progress'::public.job_status then
    raise exception 'This job must be in progress before completion can be confirmed.';
  end if;

  select o.handyman_id, o.amount_zar into v_handyman_id, v_labour_amount
  from public.job_offers o
  where o.job_id = p_job_id and o.status = 'accepted'::public.offer_status
  for update;
  if v_handyman_id is null or v_labour_amount is null then
    raise exception 'The accepted handyman offer could not be found.';
  end if;

  if p_payment_method = 'platform' and not exists (
    select 1 from public.customer_job_payments cp
    where cp.job_id = p_job_id
      and cp.customer_id = auth.uid()
      and cp.handyman_id = v_handyman_id
      and cp.amount_zar = v_labour_amount
      and cp.currency = 'ZAR'
      and cp.status = 'paid'
  ) then
    raise exception 'A verified Paystack payment for the accepted offer is required before completion.';
  end if;

  select s.commission_percent into v_commission_percent
  from public.platform_financial_settings s where s.id = true;
  if v_commission_percent is null then raise exception 'Platform commission settings are missing.'; end if;

  v_commission_total := round(v_labour_amount * v_commission_percent / 100.0)::integer;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (v_handyman_id, 0)
  on conflict (handyman_id) do nothing;

  select w.balance_zar into v_wallet_balance
  from public.handyman_access_wallets w
  where w.handyman_id = v_handyman_id for update;

  v_wallet_contribution := least(v_wallet_balance, v_commission_total);
  v_current_shortfall := v_commission_total - v_wallet_contribution;

  if v_wallet_contribution > 0 then
    update public.handyman_access_wallets
    set balance_zar = balance_zar - v_wallet_contribution, updated_at = now()
    where handyman_id = v_handyman_id
    returning balance_zar into v_new_balance;
  else
    v_new_balance := v_wallet_balance;
  end if;

  if p_payment_method = 'platform' then
    -- Current job shortfall is withheld first. Older Direct EFT obligations use
    -- only the remaining held earnings, oldest first.
    v_earnings_deduction := v_current_shortfall;
    v_to_collect := greatest(v_labour_amount - v_earnings_deduction, 0);

    for v_carry in
      select c.id, c.remaining_amount_zar
      from public.handyman_commission_carryforwards c
      where c.handyman_id = v_handyman_id and c.remaining_amount_zar > 0
      order by c.created_at, c.id
      for update
    loop
      exit when v_to_collect <= 0;
      v_collect := least(v_carry.remaining_amount_zar, v_to_collect);
      update public.handyman_commission_carryforwards
      set remaining_amount_zar = remaining_amount_zar - v_collect, updated_at = now()
      where id = v_carry.id;
      v_carryforward_deducted := v_carryforward_deducted + v_collect;
      v_to_collect := v_to_collect - v_collect;
    end loop;

    v_earnings_deduction := v_earnings_deduction + v_carryforward_deducted;
    v_net_amount := v_labour_amount - v_earnings_deduction;
    v_commission_status := case
      when v_current_shortfall = 0 and v_carryforward_deducted = 0 then 'wallet_paid'
      when v_carryforward_deducted > 0 then 'earnings_and_carryforward'
      else 'deducted_from_earnings'
    end;
  else
    v_net_amount := v_labour_amount;
    if v_current_shortfall > 0 then
      insert into public.handyman_commission_carryforwards (
        handyman_id, source_job_id, original_amount_zar, remaining_amount_zar
      ) values (
        v_handyman_id, p_job_id, v_current_shortfall, v_current_shortfall
      );
    end if;
    v_commission_status := case when v_current_shortfall > 0 then 'carried_forward' else 'wallet_paid' end;
  end if;

  insert into public.handyman_earnings (
    job_id, handyman_id, labour_amount_zar, commission_percent,
    commission_amount_zar, net_earnings_zar, payment_method, status,
    completed_at, available_at, paid_at,
    commission_total_zar, commission_wallet_amount_zar,
    commission_shortfall_zar, commission_carryforward_deducted_zar
  ) values (
    p_job_id, v_handyman_id, v_labour_amount, v_commission_percent,
    v_earnings_deduction, v_net_amount, p_payment_method, 
    case when p_payment_method = 'direct_eft' then 'paid' else 'held' end,
    now(),
    case when p_payment_method = 'direct_eft' then now() else null end,
    case when p_payment_method = 'direct_eft' then now() else null end,
    v_commission_total, v_wallet_contribution,
    case when p_payment_method = 'direct_eft' then v_current_shortfall else 0 end,
    v_carryforward_deducted
  );

  -- A legacy pending row may already occupy the unique job/type index. Reuse it
  -- rather than creating a duplicate. No pending commission is ever collected later.
  update public.handyman_access_wallet_transactions
  set amount_zar = v_wallet_contribution,
      status = case when v_wallet_contribution > 0 then 'posted' else 'reversed' end,
      direction = 'debit',
      description = case
        when v_wallet_contribution > 0 then 'Access Wallet contribution to commission for job ' || p_job_id::text
        else 'No Access Wallet contribution was available; any Direct EFT shortfall is carried forward'
      end,
      posted_at = case when v_wallet_contribution > 0 then now() else null end
  where job_id = p_job_id and transaction_type = 'commission_debit';

  if not found and v_wallet_contribution > 0 then
    insert into public.handyman_access_wallet_transactions (
      handyman_id, job_id, transaction_type, direction, amount_zar,
      status, description, posted_at
    ) values (
      v_handyman_id, p_job_id, 'commission_debit', 'debit',
      v_wallet_contribution, 'posted',
      'Access Wallet contribution to commission for job ' || p_job_id::text,
      now()
    );
  end if;

  update public.jobs set status = 'completed'::public.job_status
  where id = p_job_id and customer_id = auth.uid()
    and status = 'in_progress'::public.job_status;
  if not found then raise exception 'The job status changed before completion could be saved.'; end if;

  return jsonb_build_object(
    'job_id', p_job_id, 'status', 'completed',
    'labour_amount_zar', v_labour_amount,
    'commission_percent', v_commission_percent,
    'commission_total_zar', v_commission_total,
    'commission_wallet_amount_zar', v_wallet_contribution,
    'commission_shortfall_zar', case when p_payment_method = 'direct_eft' then v_current_shortfall else 0 end,
    'commission_carryforward_deducted_zar', v_carryforward_deducted,
    'commission_amount_zar', v_earnings_deduction,
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

-- Restore the wallet top-up RPC to a simple verified credit. Top-ups never collect
-- commission carryforwards; those are recovered only from platform-held job earnings.
create or replace function public.post_verified_handyman_topup(
  p_handyman_id uuid,
  p_reference text,
  p_amount_zar integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.handyman_access_wallet_transactions%rowtype;
  v_balance integer;
begin
  if p_handyman_id is null or p_reference is null or length(p_reference) < 8
     or p_amount_zar < 100 then
    raise exception 'Invalid top-up details';
  end if;
  select * into v_transaction
  from public.handyman_access_wallet_transactions
  where payment_reference = p_reference
    and handyman_id = p_handyman_id
    and transaction_type = 'top_up'
  for update;
  if not found then raise exception 'Top-up reference not found'; end if;
  if v_transaction.amount_zar <> p_amount_zar then raise exception 'Top-up amount does not match'; end if;
  if v_transaction.status = 'posted' then
    select balance_zar into v_balance from public.handyman_access_wallets where handyman_id = p_handyman_id;
    return coalesce(v_balance, 0);
  end if;
  if v_transaction.status <> 'pending' then raise exception 'Top-up is not pending'; end if;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (p_handyman_id, 0) on conflict (handyman_id) do nothing;
  update public.handyman_access_wallets
  set balance_zar = balance_zar + p_amount_zar, updated_at = now()
  where handyman_id = p_handyman_id returning balance_zar into v_balance;
  update public.handyman_access_wallet_transactions
  set status = 'posted', posted_at = now() where id = v_transaction.id;
  return v_balance;
end;
$$;
revoke all on function public.post_verified_handyman_topup(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.post_verified_handyman_topup(uuid, text, integer) to service_role;

-- Keep all existing eligibility, location, matching and R10 minimum-wallet rules,
-- but remove the obsolete block on pending commission top-up collection.
create or replace function public.handyman_can_offer_on_job(
  p_job_id uuid,
  p_handyman_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_handyman_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      join public.jobs j on j.id = p_job_id
      join public.service_categories sc on sc.id = j.service_category_id
      where p.id = p_handyman_id
        and p.role = 'handyman'::public.app_role
        and p.verification_status = 'approved'
        and p.available = true
        and p.current_latitude is not null
        and p.current_longitude is not null
        and p.location_updated_at > now() - interval '24 hours'
        and j.status = 'open'::public.job_status
        and j.latitude is not null
        and j.longitude is not null
        and sc.name = any(p.services)
        and 6371 * acos(
          least(1.0, greatest(-1.0,
            sin(radians(p.current_latitude)) * sin(radians(j.latitude))
            + cos(radians(p.current_latitude)) * cos(radians(j.latitude))
            * cos(radians(j.longitude) - radians(p.current_longitude))
          ))
        ) <= p.search_radius_km
        and coalesce((
          select w.balance_zar from public.handyman_access_wallets w
          where w.handyman_id = p_handyman_id
        ), 0) >= coalesce((
          select s.minimum_offer_wallet_balance_zar
          from public.platform_financial_settings s where s.id = true
        ), 10)
    );
$$;
revoke all on function public.handyman_can_offer_on_job(uuid, uuid) from public, anon;
grant execute on function public.handyman_can_offer_on_job(uuid, uuid) to authenticated;

commit;
