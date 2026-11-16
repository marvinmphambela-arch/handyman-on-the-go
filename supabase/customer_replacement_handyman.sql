-- Offer a replacement handyman after a customer cancels a booking.
alter table public.jobs
  add column if not exists replacement_handyman_decision text not null default 'not_offered'
  check (replacement_handyman_decision in ('not_offered', 'accepted', 'declined'));

create or replace function public.reset_replacement_choice_on_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if new.status = 'cancelled'::public.job_status
     and old.status is distinct from new.status then
    new.replacement_handyman_decision := 'not_offered';
  end if;
  return new;
end;
$;

drop trigger if exists reset_replacement_choice_on_cancellation on public.jobs;
create trigger reset_replacement_choice_on_cancellation
before update of status on public.jobs
for each row execute function public.reset_replacement_choice_on_cancellation();

create or replace function public.customer_decide_replacement_handyman(
  p_job_id uuid,
  p_find_another boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status public.job_status;
  v_decision text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select customer_id, status, replacement_handyman_decision
    into v_customer_id, v_status, v_decision
  from public.jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'This job could not be found.'; end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who created this job can make this choice.';
  end if;
  if v_status <> 'cancelled'::public.job_status or v_decision <> 'not_offered' then
    raise exception 'A replacement choice is not available for this job.';
  end if;

  if p_find_another then
    update public.job_offers
      set status = 'rejected'::public.offer_status
    where job_id = p_job_id
      and status = 'accepted'::public.offer_status;

    update public.jobs
      set status = 'open'::public.job_status,
          replacement_handyman_decision = 'accepted',
          handyman_en_route_at = null
    where id = p_job_id;
  else
    update public.jobs
      set replacement_handyman_decision = 'declined'
    where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.customer_decide_replacement_handyman(uuid, boolean) from public, anon;
grant execute on function public.customer_decide_replacement_handyman(uuid, boolean) to authenticated;
