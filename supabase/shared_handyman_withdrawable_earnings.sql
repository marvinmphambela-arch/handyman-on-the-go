-- Centralize eligible withdrawal earnings for both dashboard and payout processing.
begin;

-- Shared source of truth for earnings eligible for instant platform withdrawal.
-- Returns one row per eligible earning, including its currently unreserved remainder.
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
    and cp.status = 'paid'
    and j.status::text = 'completed'
    and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar;
$$;

revoke all on function public.get_handyman_withdrawable_earnings(uuid)
  from public, anon, authenticated;


create or replace function public.get_handyman_earnings_summary(p_handyman_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_handyman_id then
    raise exception 'Not authorised to view these earnings';
  end if;

  v_week_start := date_trunc('week', now() at time zone 'Africa/Johannesburg')
                  at time zone 'Africa/Johannesburg';
  v_week_end := v_week_start + interval '1 week';

  select jsonb_build_object(
    'platform_held_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform' and status in ('held', 'available')
      ), 0),
    'platform_available_zar',
      coalesce((
        select sum(eligible.remaining_zar)
        from public.get_handyman_withdrawable_earnings(p_handyman_id) eligible
      ), 0),
    'platform_paid_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform' and status = 'paid'
      ), 0),
    'direct_payment_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'direct_eft'
      ), 0),
    'week_start', v_week_start,
    'week_end', v_week_end,
    'week_total_zar',
      coalesce(sum(net_earnings_zar) filter (
        where completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'week_platform_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform'
          and completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'week_direct_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'direct_eft'
          and completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'daily',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', d.day_start,
          'total_zar', coalesce(x.total_zar, 0),
          'platform_zar', coalesce(x.platform_zar, 0),
          'direct_zar', coalesce(x.direct_zar, 0)
        ) order by d.day_start)
        from generate_series(v_week_start, v_week_end - interval '1 day', interval '1 day')
          as d(day_start)
        left join lateral (
          select
            sum(e.net_earnings_zar) as total_zar,
            sum(e.net_earnings_zar) filter (where e.payment_method = 'platform') as platform_zar,
            sum(e.net_earnings_zar) filter (where e.payment_method = 'direct_eft') as direct_zar
          from public.handyman_earnings e
          where e.handyman_id = p_handyman_id
            and e.completed_at >= d.day_start
            and e.completed_at < d.day_start + interval '1 day'
        ) x on true
      ), '[]'::jsonb)
  )
  into v_result
  from public.handyman_earnings e
  where e.handyman_id = p_handyman_id;

  return v_result;
end;
$$;


create or replace function public.request_instant_handyman_payout(
  p_handyman_id uuid,
  p_amount_zar integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handyman_id uuid := p_handyman_id;
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
    raise exception 'Handyman account could not be verified.';
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

  select coalesce(sum(eligible.remaining_zar), 0)
    into v_eligible
  from public.get_handyman_withdrawable_earnings(v_handyman_id) eligible;

  if p_amount_zar > v_eligible then
    raise exception 'You do not have enough eligible earnings for this withdrawal.';
  end if;

  v_gross := p_amount_zar;
  v_fee := greatest(round(v_gross * v_fee_percent / 100.0, 2), v_minimum_fee);

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

  for v_earning in
    select e.id, eligible.remaining_zar as remaining
    from public.get_handyman_withdrawable_earnings(v_handyman_id) eligible
    join public.handyman_earnings e on e.id = eligible.earning_id
    order by eligible.completed_at, eligible.earning_id
    for update of e
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


revoke all on function public.get_handyman_earnings_summary(uuid) from public, anon;
grant execute on function public.get_handyman_earnings_summary(uuid) to authenticated;

revoke all on function public.request_instant_handyman_payout(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.request_instant_handyman_payout(uuid, integer)
  to service_role;

commit;
