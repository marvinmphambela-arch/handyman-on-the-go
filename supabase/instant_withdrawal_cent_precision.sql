-- Preserve instant-withdrawal fees and transfers to the cent end-to-end.
-- Gross earnings remain whole rand; fee/net payout values are stored to two decimals.
begin;

-- Keep the agreed product rule in sync with the client-side confirmation preview.
update public.platform_financial_settings
set instant_withdrawal_percent = 2.00,
    instant_withdrawal_minimum_fee_zar = 5
where id = true;

alter table public.handyman_payout_requests
  alter column fee_amount_zar type numeric(12,2)
    using fee_amount_zar::numeric(12,2),
  alter column net_amount_zar type numeric(12,2)
    using net_amount_zar::numeric(12,2);

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
  v_minimum_fee numeric(12,2);
  v_eligible integer;
  v_gross integer := 0;
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_net_kobo bigint;
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

  if v_fee_percent is null or v_minimum_fee is null then
    raise exception 'Instant withdrawal pricing is not configured.';
  end if;

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
    and j.status::text = 'completed'
    and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar;

  if p_amount_zar > v_eligible then
    raise exception 'You do not have enough eligible earnings for this withdrawal.';
  end if;

  v_gross := p_amount_zar;
  v_fee := greatest(round(v_gross * v_fee_percent / 100.0, 2), v_minimum_fee);

  -- No platform-set minimum withdrawal applies. The fee must not exceed gross.
  if v_fee >= v_gross then
    raise exception 'This withdrawal amount is too small to cover the instant withdrawal fee.';
  end if;

  v_net := round(v_gross - v_fee, 2);
  v_net_kobo := (v_net * 100)::bigint;

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

  -- Reserve eligible whole-rand earnings oldest-first.
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
    'net_amount_kobo', v_net_kobo,
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

commit;
