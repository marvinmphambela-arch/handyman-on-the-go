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
