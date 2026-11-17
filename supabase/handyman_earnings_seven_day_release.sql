-- Seven-day holding period for platform-paid handyman earnings.
-- Direct EFT earnings remain outside the platform payout lifecycle.

begin;

-- Backfill existing held platform earnings with a seven-day availability date.
update public.handyman_earnings
set available_at = completed_at + interval '7 days'
where status = 'held'
  and payment_method = 'platform'
  and available_at is null;

-- Ensure new held platform earnings receive the same release date.
create or replace function public.set_handyman_earning_release_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'held'
     and new.payment_method = 'platform'
     and new.available_at is null then
    new.available_at := coalesce(new.completed_at, now()) + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists handyman_earnings_set_release_date
  on public.handyman_earnings;

create trigger handyman_earnings_set_release_date
before insert or update of status, payment_method, completed_at, available_at
on public.handyman_earnings
for each row
execute function public.set_handyman_earning_release_date();

create index if not exists handyman_earnings_due_release_idx
  on public.handyman_earnings (available_at, handyman_id)
  where status = 'held' and payment_method = 'platform';

-- This function only releases earnings whose seven-day hold has elapsed.
-- It does not initiate or mark any payout as paid.
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
