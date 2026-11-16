-- Narrow correction for commission shortfall reporting in customer_confirm_job_completion.
-- This does not change wallet debits, earnings deductions, net earnings, or carryforward creation.
-- It reports the full amount initially uncovered by the Access Wallet for both payment methods.

begin;

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
    v_current_shortfall,
    v_carryforward_deducted
  );

  -- A legacy pending row may already occupy the unique job/type index. Reuse it
  -- rather than creating a duplicate. No pending commission is ever collected later.
  update public.handyman_access_wallet_transactions
  set amount_zar = case
        when v_wallet_contribution > 0 then v_wallet_contribution
        else amount_zar
      end,
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
    'commission_shortfall_zar', v_current_shortfall,
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

commit;
