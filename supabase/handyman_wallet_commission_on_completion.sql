-- Collect the platform's 10% commission from the handyman's Access Wallet
-- when the customer confirms successful completion. Applies to both platform
-- payments and customer-direct EFT. Any unpaid commission remains pending and
-- is automatically collected from a later verified wallet top-up.
begin;

alter table public.handyman_earnings
  add column if not exists commission_status text not null default 'not_applicable'
  check (commission_status in ('not_applicable', 'pending', 'paid'));

alter table public.handyman_access_wallet_transactions
  add column if not exists related_job_id uuid references public.jobs(id);

create unique index if not exists handyman_wallet_one_commission_per_job
  on public.handyman_access_wallet_transactions (related_job_id)
  where transaction_type = 'commission_debit' and related_job_id is not null;

create index if not exists handyman_wallet_pending_commissions_idx
  on public.handyman_access_wallet_transactions (handyman_id, created_at)
  where transaction_type = 'commission_debit' and status = 'pending';

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
  v_job_status public.job_status;
  v_job_title text;
  v_handyman_id uuid;
  v_labour_amount integer;
  v_commission_percent numeric(5,2);
  v_commission_amount integer;
  v_net_amount integer;
  v_wallet_balance integer;
  v_commission_status text;
  v_earnings_status text;
  v_existing public.handyman_earnings%rowtype;
  v_transaction_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_payment_method is null or p_payment_method not in ('platform', 'direct_eft') then
    raise exception 'Choose a valid payment method.';
  end if;

  select j.customer_id, j.status, j.title
    into v_customer_id, v_job_status, v_job_title
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
      raise exception 'This job is marked completed but its earnings record is missing. Contact support.';
    end if;
    return jsonb_build_object(
      'completed', true,
      'already_completed', true,
      'labour_amount_zar', v_existing.labour_amount_zar,
      'commission_amount_zar', v_existing.commission_amount_zar,
      'net_earnings_zar', v_existing.net_earnings_zar,
      'commission_status', v_existing.commission_status,
      'payment_method', v_existing.payment_method
    );
  end if;

  if v_job_status <> 'in_progress'::public.job_status then
    raise exception 'This job must be in progress before you can confirm completion.';
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

  select commission_percent into v_commission_percent
  from public.platform_financial_settings
  where id = true;

  v_commission_percent := coalesce(v_commission_percent, 10.00);
  v_commission_amount := round(v_labour_amount * v_commission_percent / 100.0)::integer;
  v_net_amount := v_labour_amount - v_commission_amount;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (v_handyman_id, 0)
  on conflict (handyman_id) do nothing;

  select balance_zar into v_wallet_balance
  from public.handyman_access_wallets
  where handyman_id = v_handyman_id
  for update;

  v_commission_status := case when v_commission_amount = 0 or v_wallet_balance >= v_commission_amount
    then 'paid' else 'pending' end;

  v_earnings_status := case
    when v_commission_status = 'pending' then 'held'
    when p_payment_method = 'platform' then 'held'
    else 'available'
  end;

  insert into public.handyman_earnings (
    job_id, handyman_id, labour_amount_zar, commission_percent,
    commission_amount_zar, net_earnings_zar, payment_method,
    status, commission_status, completed_at
  ) values (
    p_job_id, v_handyman_id, v_labour_amount, v_commission_percent,
    v_commission_amount, v_net_amount, p_payment_method,
    v_earnings_status, v_commission_status, now()
  );

  if v_commission_amount > 0 then
    insert into public.handyman_access_wallet_transactions (
      handyman_id, transaction_type, direction, amount_zar, status,
      related_job_id, description, posted_at
    ) values (
      v_handyman_id, 'commission_debit', 'debit', v_commission_amount,
      case when v_commission_status = 'paid' then 'posted' else 'pending' end,
      p_job_id,
      case when v_commission_status = 'paid'
        then '10% platform commission for completed job: ' || v_job_title
        else 'Commission due for completed job: ' || v_job_title || '. It will be collected from your next wallet top-up.'
      end,
      case when v_commission_status = 'paid' then now() else null end
    )
    returning id into v_transaction_id;

    if v_commission_status = 'paid' then
      update public.handyman_access_wallets
      set balance_zar = balance_zar - v_commission_amount,
          updated_at = now()
      where handyman_id = v_handyman_id;
    end if;
  end if;

  update public.jobs
  set status = 'completed'::public.job_status
  where id = p_job_id;

  return jsonb_build_object(
    'completed', true,
    'already_completed', false,
    'labour_amount_zar', v_labour_amount,
    'commission_amount_zar', v_commission_amount,
    'net_earnings_zar', v_net_amount,
    'commission_status', v_commission_status,
    'payment_method', p_payment_method
  );
end;
$$;

revoke all on function public.customer_confirm_job_completion(uuid, text) from public, anon;
grant execute on function public.customer_confirm_job_completion(uuid, text) to authenticated;

-- Extend verified top-up posting so outstanding commission debits are collected
-- atomically from the new balance, oldest first, after the top-up is credited.
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
  v_commission public.handyman_access_wallet_transactions%rowtype;
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
    select *
    from public.handyman_access_wallet_transactions
    where handyman_id = p_handyman_id
      and transaction_type = 'commission_debit'
      and status = 'pending'
    order by created_at, id
    for update
  loop
    if v_balance >= v_commission.amount_zar then
      update public.handyman_access_wallets
      set balance_zar = balance_zar - v_commission.amount_zar,
          updated_at = now()
      where handyman_id = p_handyman_id
      returning balance_zar into v_balance;

      update public.handyman_access_wallet_transactions
      set status = 'posted',
          description = 'Commission collected from verified wallet top-up.',
          posted_at = now()
      where id = v_commission.id;

      update public.handyman_earnings
      set commission_status = 'paid',
          status = case
            when payment_method = 'direct_eft' and status = 'held' then 'available'
            else status
          end
      where job_id = v_commission.related_job_id;
    end if;
  end loop;

  return v_balance;
end;
$$;

revoke all on function public.post_verified_handyman_topup(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.post_verified_handyman_topup(uuid, text, integer) to service_role;

commit;
