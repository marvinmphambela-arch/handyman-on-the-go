-- Apply after instant_payout_safety_hardening.sql and handyman_eight_hour_earning_release.sql.
-- Reserve the remaining eligible balance at the Monday cutoff in Johannesburg.
begin;

create unique index if not exists handyman_weekly_payout_one_request_per_cycle
  on public.handyman_payout_requests (handyman_id, period_end)
  where payout_type = 'weekly' and period_end is not null;

create or replace function public.reserve_handyman_weekly_payout(p_handyman_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := date_trunc('week', now(), 'Africa/Johannesburg');
  v_monday date := (v_cutoff at time zone 'Africa/Johannesburg')::date;
  v_bank public.handyman_bank_accounts%rowtype;
  v_request_id uuid;
  v_gross integer;
  v_earning_ids uuid[];
begin
  if (now() at time zone 'Africa/Johannesburg')::date <> v_monday then
    raise exception 'Weekly payouts can only be reserved on Monday.';
  end if;

  -- Share the instant withdrawal lock so the same balance cannot be claimed twice.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_handyman_id::text, 0)
  );

  if exists (
    select 1 from public.handyman_payout_requests
    where handyman_id = p_handyman_id
      and (status in ('requested', 'processing')
           or (payout_type = 'weekly' and period_end = v_monday - 1))
  ) then
    return null;
  end if;

  select * into v_bank
  from public.handyman_bank_accounts
  where handyman_id = p_handyman_id
    and is_active
    and nullif(btrim(paystack_recipient_code), '') is not null
  for update;
  if not found then return null; end if;

  with eligible as (
    select e.id, e.net_earnings_zar - e.paid_out_zar - e.payout_reserved_zar as remaining
    from public.handyman_earnings e
    join public.jobs j on j.id = e.job_id
    where e.handyman_id = p_handyman_id
      and e.payment_method = 'platform'
      and e.status in ('held', 'available')
      and e.available_at <= v_cutoff
      and e.net_earnings_zar > e.paid_out_zar + e.payout_reserved_zar
      and j.status::text = 'completed'
      and exists (
        select 1 from public.customer_job_payments p
        where p.job_id = e.job_id and p.handyman_id = e.handyman_id and p.status = 'paid'
      )
    order by e.id
    for update of e
  )
  select array_agg(id), coalesce(sum(remaining), 0)
  into v_earning_ids, v_gross
  from eligible;

  if v_gross = 0 then return null; end if;

  insert into public.handyman_payout_requests (
    handyman_id, payout_type, gross_amount_zar, fee_amount_zar, net_amount_zar,
    period_start, period_end, bank_name_snapshot, bank_code_snapshot,
    account_holder_name_snapshot, account_number_last4_snapshot,
    paystack_recipient_code_snapshot
  ) values (
    p_handyman_id, 'weekly', v_gross, 0, v_gross,
    v_monday - 7, v_monday - 1, v_bank.bank_name, v_bank.bank_code,
    v_bank.account_holder_name, v_bank.account_number_last4, v_bank.paystack_recipient_code
  ) returning id into v_request_id;

  with allocation as materialized (
    select id, net_earnings_zar - paid_out_zar - payout_reserved_zar as amount_zar
    from public.handyman_earnings
    where id = any(v_earning_ids)
  ), reserved as (
    update public.handyman_earnings e
    set payout_reserved_zar = e.payout_reserved_zar + a.amount_zar
    from allocation a
    where e.id = a.id
    returning e.id, a.amount_zar
  )
  insert into public.handyman_payout_request_earnings (payout_request_id, earning_id, amount_zar)
  select v_request_id, id, amount_zar from reserved;

  return v_request_id;
end;
$$;

revoke all on function public.reserve_handyman_weekly_payout(uuid) from public, anon, authenticated;
grant execute on function public.reserve_handyman_weekly_payout(uuid) to service_role;

commit;
