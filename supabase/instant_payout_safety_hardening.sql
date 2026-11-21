-- Instant payout safety hardening.
-- Keeps the agreed 2% fee / R5 minimum and does not initiate transfers.
begin;

-- Only platform earnings whose release time has arrived may be withdrawn.
create or replace function public.get_handyman_withdrawable_earnings(p_handyman_id uuid)
returns table (
  earning_id uuid,
  remaining_zar integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    greatest(e.net_earnings_zar - e.paid_out_zar - e.payout_reserved_zar, 0)::integer,
    e.completed_at
  from public.handyman_earnings e
  join public.customer_job_payments cp on cp.job_id = e.job_id
  join public.jobs j on j.id = e.job_id
  where e.handyman_id = p_handyman_id
    and e.payment_method = 'platform'
    and e.status in ('held', 'available')
    and e.available_at is not null
    and e.available_at <= now()
    and cp.status = 'paid'
    and j.status::text = 'completed'
    and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar;
$$;

revoke all on function public.get_handyman_withdrawable_earnings(uuid)
  from public, anon, authenticated;

-- Creates an instant-withdrawal request and atomically reserves the exact earnings
-- behind it. Only verified platform-paid, completed jobs are eligible.
-- p_amount_zar is the gross amount before the instant-withdrawal fee.
create or replace function public.request_instant_handyman_payout(
  p_amount_zar integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_handyman_id uuid := auth.uid();
  v_fee_percent numeric(5,2);
  v_minimum_fee integer;
  v_eligible integer;
  v_gross integer := 0;
  v_fee integer;
  v_net integer;
  v_request_id uuid;
  v_bank public.handyman_bank_accounts%rowtype;
  v_earning record;
  v_take integer;
begin
  if v_handyman_id is null then
    raise exception 'Please sign in.';
  end if;

  if p_amount_zar is null or p_amount_zar <= 0 then
    raise exception 'Enter a valid withdrawal amount.';
  end if;

  select * into v_bank
  from public.handyman_bank_accounts
  where handyman_id = v_handyman_id and is_active = true
  for update;

  if not found then
    raise exception 'Please add and save your payout bank details first.';
  end if;

  select instant_withdrawal_percent, instant_withdrawal_minimum_fee_zar
    into v_fee_percent, v_minimum_fee
  from public.platform_financial_settings
  where id = true;

  if exists (
    select 1 from public.handyman_payout_requests
    where handyman_id = v_handyman_id
      and status in ('requested','processing')
  ) then
    raise exception 'You already have a withdrawal being processed.';
  end if;

  select coalesce(sum(
    greatest(e.net_earnings_zar - e.paid_out_zar - e.payout_reserved_zar, 0)
  ), 0)
    into v_eligible
  from public.handyman_earnings e
  join public.customer_job_payments cp on cp.job_id = e.job_id
  join public.jobs j on j.id = e.job_id
  where e.handyman_id = v_handyman_id
    and e.payment_method = 'platform'
    and e.status in ('held','available')
    and e.available_at is not null
    and e.available_at <= now()
    and cp.status = 'paid'
    and j.status::text = 'completed'
    and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar;

  if p_amount_zar > v_eligible then
    raise exception 'You do not have enough eligible earnings for this withdrawal.';
  end if;

  v_gross := p_amount_zar;
  v_fee := greatest(
    ceil(v_gross * v_fee_percent / 100.0)::integer,
    v_minimum_fee
  );

  -- The product has no platform-set minimum withdrawal. The request must,
  -- however, leave a non-negative amount after its stated instant fee.
  if v_fee > v_gross then
    raise exception 'This withdrawal amount is smaller than the instant withdrawal fee.';
  end if;

  v_net := v_gross - v_fee;

  insert into public.handyman_payout_requests (
    handyman_id, payout_type, gross_amount_zar, fee_amount_zar,
    net_amount_zar, status, requested_at,
    bank_name_snapshot, bank_code_snapshot, account_holder_name_snapshot,
    account_number_last4_snapshot, paystack_recipient_code_snapshot
  ) values (
    v_handyman_id, 'instant', v_gross, v_fee, v_net, 'requested', now(),
    v_bank.bank_name, v_bank.bank_code, v_bank.account_holder_name,
    v_bank.account_number_last4, v_bank.paystack_recipient_code
  )
  returning id into v_request_id;

  -- Lock and reserve earnings oldest-first. The unique earning index prevents
  -- a second payout request from reserving the same earning concurrently.
  for v_earning in
    select e.id,
           greatest(e.net_earnings_zar - e.paid_out_zar - e.payout_reserved_zar, 0) as remaining
    from public.handyman_earnings e
    join public.customer_job_payments cp on cp.job_id = e.job_id
    join public.jobs j on j.id = e.job_id
    where e.handyman_id = v_handyman_id
      and e.payment_method = 'platform'
      and e.status in ('held','available')
      and e.available_at is not null
      and e.available_at <= now()
      and cp.status = 'paid'
      and j.status = 'completed'::public.job_status
      and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar
    order by e.completed_at, e.id
    for update
  loop
    exit when v_gross <= 0;
    v_take := least(v_earning.remaining, v_gross);

    update public.handyman_earnings
    set payout_reserved_zar = payout_reserved_zar + v_take
    where id = v_earning.id;

    insert into public.handyman_payout_request_earnings (
      payout_request_id, earning_id, amount_zar
    ) values (
      v_request_id, v_earning.id, v_take
    );

    v_gross := v_gross - v_take;
  end loop;

  if v_gross <> 0 then
    raise exception 'Could not reserve the full withdrawal amount.';
  end if;

  return jsonb_build_object(
    'payout_request_id', v_request_id,
    'gross_amount_zar', p_amount_zar,
    'fee_amount_zar', v_fee,
    'net_amount_zar', v_net,
    'account_last4', v_bank.account_number_last4
  );
exception
  when unique_violation then
    raise exception 'Some earnings are already reserved for another payout. Please try again.';
end;
$;

revoke all on function public.request_instant_handyman_payout(integer)
  from public, anon;
grant execute on function public.request_instant_handyman_payout(integer)
  to authenticated;


-- Processing is idempotent for the same deterministic transfer reference.
create or replace function public.mark_handyman_payout_processing(
  p_payout_request_id uuid,
  p_transfer_reference text,
  p_transfer_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.handyman_payout_requests%rowtype;
begin
  if p_transfer_reference is null
     or length(p_transfer_reference) < 16
     or length(p_transfer_reference) > 50
     or p_transfer_reference !~ '^[a-z0-9_-]+$' then
    raise exception 'Invalid transfer reference.';
  end if;

  select * into v_request
  from public.handyman_payout_requests
  where id = p_payout_request_id
  for update;

  if not found then
    raise exception 'Payout request not found.';
  end if;

  if v_request.status = 'processing'
     and v_request.transfer_reference = p_transfer_reference then
    update public.handyman_payout_requests
    set transfer_code = coalesce(p_transfer_code, transfer_code)
    where id = p_payout_request_id;
    return;
  end if;

  if v_request.status <> 'requested'
     or (v_request.transfer_reference is not null
         and v_request.transfer_reference <> p_transfer_reference) then
    raise exception 'Payout request is not awaiting this transfer.';
  end if;

  update public.handyman_payout_requests
  set status = 'processing',
      transfer_reference = p_transfer_reference,
      transfer_code = p_transfer_code,
      transfer_status = 'pending'
  where id = p_payout_request_id;
end;
$$;

revoke all on function public.mark_handyman_payout_processing(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.mark_handyman_payout_processing(uuid,text,text)
  to service_role;

-- Settlement is locked, idempotent for the same terminal result, and refuses
-- contradictory callbacks rather than risking a second debit/credit.
create or replace function public.settle_handyman_payout(
  p_transfer_reference text,
  p_transfer_status text,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.handyman_payout_requests%rowtype;
  v_link record;
  v_earning public.handyman_earnings%rowtype;
  v_allocated bigint;
begin
  if p_transfer_status not in ('success', 'failed', 'reversed') then
    raise exception 'Transfer status is not conclusive.';
  end if;

  select * into v_request
  from public.handyman_payout_requests
  where transfer_reference = p_transfer_reference
  for update;

  if not found then
    raise exception 'Payout request not found for transfer reference.';
  end if;

  if v_request.status = 'paid' then
    if p_transfer_status = 'success' then return; end if;
    raise exception 'A paid payout received a contradictory terminal event; manual reconciliation is required.';
  end if;

  if v_request.status = 'failed' then
    if p_transfer_status in ('failed', 'reversed') then return; end if;
    raise exception 'A failed payout received a contradictory success event; manual reconciliation is required.';
  end if;

  if v_request.status <> 'processing' then
    raise exception 'Payout request is not in processing state.';
  end if;

  -- Never settle a payout unless its allocation ledger exactly covers gross.
  select coalesce(sum(amount_zar), 0)
    into v_allocated
  from public.handyman_payout_request_earnings
  where payout_request_id = v_request.id;

  if v_allocated <> v_request.gross_amount_zar then
    raise exception 'Payout allocation total does not match the requested gross amount; manual reconciliation is required.';
  end if;

  for v_link in
    select earning_id, amount_zar
    from public.handyman_payout_request_earnings
    where payout_request_id = v_request.id
    order by earning_id
  loop
    select * into v_earning
    from public.handyman_earnings
    where id = v_link.earning_id
    for update;

    if not found then
      raise exception 'Reserved earning record is missing.';
    end if;

    if v_earning.payout_reserved_zar < v_link.amount_zar then
      raise exception 'Reserved payout balance is inconsistent; manual reconciliation is required.';
    end if;

    if p_transfer_status = 'success'
       and v_earning.paid_out_zar + v_link.amount_zar > v_earning.net_earnings_zar then
      raise exception 'Payout would exceed the earning balance; manual reconciliation is required.';
    end if;
  end loop;

  for v_link in
    select earning_id, amount_zar
    from public.handyman_payout_request_earnings
    where payout_request_id = v_request.id
    order by earning_id
  loop
    if p_transfer_status = 'success' then
      update public.handyman_earnings
      set payout_reserved_zar = payout_reserved_zar - v_link.amount_zar,
          paid_out_zar = paid_out_zar + v_link.amount_zar,
          status = case
            when paid_out_zar + v_link.amount_zar >= net_earnings_zar then 'paid'
            else status
          end,
          paid_at = case
            when paid_out_zar + v_link.amount_zar >= net_earnings_zar then now()
            else paid_at
          end
      where id = v_link.earning_id;
    else
      update public.handyman_earnings
      set payout_reserved_zar = payout_reserved_zar - v_link.amount_zar
      where id = v_link.earning_id;
    end if;
  end loop;

  update public.handyman_payout_requests
  set status = case when p_transfer_status = 'success' then 'paid' else 'failed' end,
      transfer_status = p_transfer_status,
      processed_at = now(),
      transfer_failure_reason = case
        when p_transfer_status = 'success' then null
        else nullif(left(coalesce(p_failure_reason, ''), 1000), '')
      end
  where id = v_request.id;
end;
$$;

revoke all on function public.settle_handyman_payout(text,text,text)
  from public, anon, authenticated;
grant execute on function public.settle_handyman_payout(text,text,text)
  to service_role;

commit;
