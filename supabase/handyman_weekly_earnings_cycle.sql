-- Weekly Monday-to-Sunday earnings cycle for platform-paid handyman jobs.
-- Earnings from a Johannesburg-local Monday through Sunday cycle become payable
-- at 00:00 on the following Monday. Direct EFT earnings remain outside this flow.

begin;

-- Remove the superseded per-job seven-day release mechanism, if it was installed.
drop trigger if exists handyman_earnings_set_release_date on public.handyman_earnings;
drop function if exists public.set_handyman_earning_release_date();

-- Assign each existing held platform earning to the next Monday payout cycle.
update public.handyman_earnings
set available_at = date_trunc('week', completed_at, 'Africa/Johannesburg') + interval '1 week'
where status = 'held'
  and payment_method = 'platform';

-- New held platform earnings join the Monday-to-Sunday cycle in which
-- customer-confirmed completion was recorded.
create or replace function public.set_handyman_weekly_payout_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'held' and new.payment_method = 'platform' then
    new.available_at := date_trunc(
      'week',
      coalesce(new.completed_at, now()),
      'Africa/Johannesburg'
    ) + interval '1 week';
  end if;
  return new;
end;
$$;

drop trigger if exists handyman_earnings_set_weekly_payout_date
  on public.handyman_earnings;

create trigger handyman_earnings_set_weekly_payout_date
before insert or update of status, payment_method, completed_at
on public.handyman_earnings
for each row
execute function public.set_handyman_weekly_payout_date();

drop index if exists public.handyman_earnings_due_release_idx;
create index if not exists handyman_earnings_weekly_payout_idx
  on public.handyman_earnings (available_at, handyman_id)
  where status = 'held' and payment_method = 'platform';

-- Releases the previous Monday-Sunday cycle when its Monday payout date arrives.
-- This only changes held earnings to available; it does not initiate bank transfers
-- or mark any payout as paid.
create or replace function public.release_due_handyman_earnings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released integer;
begin
  update public.handyman_earnings
  set status = 'available'
  where status = 'held'
    and payment_method = 'platform'
    and available_at is not null
    and available_at <= now();

  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

revoke all on function public.release_due_handyman_earnings() from public, anon, authenticated;
grant execute on function public.release_due_handyman_earnings() to service_role;

commit;
