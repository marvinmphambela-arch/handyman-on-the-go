-- Handyman On The Go: customer-confirmed completion and Access Wallet commission collection.
-- Commission is charged once, atomically, when the customer confirms the job is complete.
-- If the wallet cannot cover the full commission, it is recorded as pending and
-- automatically collected from a future verified wallet top-up before new offers are allowed.

begin;

alter table public.handyman_access_wallet_transactions
  add column if not exists job_id uuid references public.jobs(id) on delete restrict;

create unique index if not exists handyman_wallet_one_commission_per_job
  on public.handyman_access_wallet_transactions (job_id, transaction_type)
  where job_id is not null and transaction_type = 'commission_debit';

create index if not exists handyman_wallet_transactions_job_idx
  on public.handyman_access_wallet_transactions (job_id)
  where job_id is not null;

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

  -- Repeated confirmation is safe and never charges the wallet twice.
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
    else 'awaiting_payment'
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

-- Outstanding commission is collected in order from the next verified top-up.
-- The top-up transaction and wallet row are locked to prevent double-crediting.
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
  v_commission record;
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

  if not found then
    raise exception 'Top-up reference not found';
  end if;

  if v_transaction.amount_zar <> p_amount_zar then
    raise exception 'Top-up amount does not match';
  end if;

  if v_transaction.status = 'posted' then
    select balance_zar into v_balance
    from public.handyman_access_wallets
    where handyman_id = p_handyman_id;
    return coalesce(v_balance, 0);
  end if;

  if v_transaction.status <> 'pending' then
    raise exception 'Top-up is not pending';
  end if;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (p_handyman_id, 0)
  on conflict (handyman_id) do nothing;

  update public.handyman_access_wallets
  set balance_zar = balance_zar + p_amount_zar,
      updated_at = now()
  where handyman_id = p_handyman_id
  returning balance_zar into v_balance;

  update public.handyman_access_wallet_transactions
  set status = 'posted', posted_at = now()
  where id = v_transaction.id;

  for v_commission in
    select t.id, t.amount_zar
    from public.handyman_access_wallet_transactions t
    where t.handyman_id = p_handyman_id
      and t.transaction_type = 'commission_debit'
      and t.status = 'pending'
    order by t.created_at, t.id
    for update
  loop
    exit when v_balance < v_commission.amount_zar;

    update public.handyman_access_wallets
    set balance_zar = balance_zar - v_commission.amount_zar,
        updated_at = now()
    where handyman_id = p_handyman_id
    returning balance_zar into v_balance;

    update public.handyman_access_wallet_transactions
    set status = 'posted',
        posted_at = now(),
        description = '10% platform commission collected after wallet top-up'
    where id = v_commission.id;
  end loop;

  return v_balance;
end;
$$;

revoke all on function public.post_verified_handyman_topup(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.post_verified_handyman_topup(uuid, text, integer) to service_role;

-- Do not allow further offers while an earlier commission debit is still outstanding.
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
          select w.balance_zar
          from public.handyman_access_wallets w
          where w.handyman_id = p_handyman_id
        ), 0) >= coalesce((
          select s.minimum_offer_wallet_balance_zar
          from public.platform_financial_settings s
          where s.id = true
        ), 10)
        and not exists (
          select 1
          from public.handyman_access_wallet_transactions t
          where t.handyman_id = p_handyman_id
            and t.transaction_type = 'commission_debit'
            and t.status = 'pending'
        )
    );
$$;

revoke all on function public.handyman_can_offer_on_job(uuid, uuid) from public, anon;
grant execute on function public.handyman_can_offer_on_job(uuid, uuid) to authenticated;

commit;
