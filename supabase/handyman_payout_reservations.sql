-- Handyman On The Go: payout reservation and settlement ledger.
-- This migration prevents the same earnings from being paid twice.
-- It does NOT call Paystack or initiate transfers.
begin;

alter table public.handyman_earnings
  add column if not exists payout_reserved_zar integer not null default 0,
  add column if not exists paid_out_zar integer not null default 0;

alter table public.handyman_earnings
  drop constraint if exists handyman_earnings_payout_amounts_check;

alter table public.handyman_earnings
  add constraint handyman_earnings_payout_amounts_check
  check (
    payout_reserved_zar >= 0
    and paid_out_zar >= 0
    and payout_reserved_zar + paid_out_zar <= net_earnings_zar
  );

create table if not exists public.handyman_payout_request_earnings (
  payout_request_id uuid not null references public.handyman_payout_requests(id) on delete cascade,
  earning_id uuid not null references public.handyman_earnings(id) on delete restrict,
  amount_zar integer not null check (amount_zar > 0),
  created_at timestamptz not null default now(),
  primary key (payout_request_id, earning_id)
);

create unique index if not exists handyman_payout_request_earnings_earning_uidx
  on public.handyman_payout_request_earnings (earning_id);

alter table public.handyman_payout_request_earnings enable row level security;

drop policy if exists "Handymen can read own payout request earnings"
  on public.handyman_payout_request_earnings;
create policy "Handymen can read own payout request earnings"
  on public.handyman_payout_request_earnings for select to authenticated
  using (
    exists (
      select 1
      from public.handyman_payout_requests p
      where p.id = payout_request_id
        and p.handyman_id = auth.uid()
    )
  );

drop policy if exists "Admins can read all payout request earnings"
  on public.handyman_payout_request_earnings;
create policy "Admins can read all payout request earnings"
  on public.handyman_payout_request_earnings for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

revoke all on public.handyman_payout_request_earnings from anon;
grant select on public.handyman_payout_request_earnings to authenticated;

create index if not exists handyman_payout_request_earnings_request_idx
  on public.handyman_payout_request_earnings (payout_request_id);

create index if not exists handyman_earnings_payout_eligibility_idx
  on public.handyman_earnings (handyman_id, status, payment_method, completed_at)
  where payment_method = 'platform'
    and status in ('held', 'available');

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
as $$
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
    and cp.status = 'paid'
    and j.status = 'completed'::public.job_status
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
$$;

revoke all on function public.request_instant_handyman_payout(integer)
  from public, anon;
grant execute on function public.request_instant_handyman_payout(integer)
  to authenticated;

-- Trusted server-side transition after Paystack accepts a transfer request.
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
begin
  if p_transfer_reference is null
     or length(p_transfer_reference) < 16
     or length(p_transfer_reference) > 50
     or p_transfer_reference !~ '^[a-z0-9_-]+$' then
    raise exception 'Invalid transfer reference.';
  end if;

  update public.handyman_payout_requests
  set status = 'processing',
      transfer_reference = p_transfer_reference,
      transfer_code = p_transfer_code,
      transfer_status = 'pending'
  where id = p_payout_request_id
    and status = 'requested';

  if not found then
    raise exception 'Payout request is not awaiting transfer.';
  end if;
end;
$$;

revoke all on function public.mark_handyman_payout_processing(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.mark_handyman_payout_processing(uuid,text,text)
  to service_role;

-- Trusted server-side settlement from Paystack's conclusive transfer result.
-- success pays the reserved gross earnings; failed/reversed releases them.
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
begin
  select * into v_request
  from public.handyman_payout_requests
  where transfer_reference = p_transfer_reference
  for update;

  if not found then
    raise exception 'Payout request not found for transfer reference.';
  end if;

  if v_request.status = 'paid' then
    return;
  end if;

  if p_transfer_status = 'success' then
    for v_link in
      select earning_id, amount_zar
      from public.handyman_payout_request_earnings
      where payout_request_id = v_request.id
      for update
    loop
      update public.handyman_earnings
      set payout_reserved_zar = payout_reserved_zar - v_link.amount_zar,
          paid_out_zar = paid_out_zar + v_link.amount_zar,
          status = case
            when paid_out_zar + v_link.amount_zar >= net_earnings_zar
              then 'paid'
            else status
          end,
          paid_at = case
            when paid_out_zar + v_link.amount_zar >= net_earnings_zar
              then now()
            else paid_at
          end
      where id = v_link.earning_id;
    end loop;

    update public.handyman_payout_requests
    set status = 'paid',
        transfer_status = 'success',
        processed_at = now(),
        transfer_failure_reason = null
    where id = v_request.id;
  elsif p_transfer_status in ('failed','reversed') then
    for v_link in
      select earning_id, amount_zar
      from public.handyman_payout_request_earnings
      where payout_request_id = v_request.id
      for update
    loop
      update public.handyman_earnings
      set payout_reserved_zar = payout_reserved_zar - v_link.amount_zar
      where id = v_link.earning_id;
    end loop;

    update public.handyman_payout_requests
    set status = 'failed',
        transfer_status = p_transfer_status,
        processed_at = now(),
        transfer_failure_reason = nullif(left(coalesce(p_failure_reason,''),1000),'')
    where id = v_request.id;
  else
    raise exception 'Transfer status is not conclusive.';
  end if;
end;
$$;

revoke all on function public.settle_handyman_payout(text,text,text)
  from public, anon, authenticated;
grant execute on function public.settle_handyman_payout(text,text,text)
  to service_role;

commit;
