-- Handyman On The Go: customer-confirmed completion and Access Wallet commission collection.
-- Commission is charged once, atomically, when the customer confirms the job is complete.
-- The accepted offer amount is the labour amount; no client-supplied amount is trusted.

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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to confirm completion.';
  end if;

  if p_payment_method not in ('platform', 'direct_eft') then
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

    return jsonb_build_object(
      'job_id', p_job_id,
      'status', 'completed',
      'labour_amount_zar', v_existing.labour_amount_zar,
      'commission_amount_zar', v_existing.commission_amount_zar,
      'net_earnings_zar', v_existing.net_earnings_zar,
      'payment_method', v_existing.payment_method,
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

  if v_wallet_balance < v_commission_amount then
    raise exception 'The handyman Access Wallet needs R% to collect the commission. Current balance: R%. Please ask the handyman to top up before confirming completion.',
      v_commission_amount, v_wallet_balance;
  end if;

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

  if v_commission_amount > 0 then
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
  else
    v_new_balance := v_wallet_balance;
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
    'wallet_balance_zar', v_new_balance,
    'already_completed', false
  );
end;
$$;

revoke all on function public.customer_confirm_job_completion(uuid, text) from public, anon;
grant execute on function public.customer_confirm_job_completion(uuid, text) to authenticated;

commit;
