-- Apply after handyman_weekly_earnings_cycle.sql.
-- Completed, platform-paid jobs become withdrawable after eight hours.
begin;

create or replace function public.set_handyman_weekly_payout_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'held' and new.payment_method = 'platform' then
    new.available_at := new.completed_at + interval '8 hours';
  end if;
  return new;
end;
$$;

update public.handyman_earnings
set available_at = completed_at + interval '8 hours'
where status = 'held'
  and payment_method = 'platform'
  and available_at is distinct from completed_at + interval '8 hours';

commit;
