-- Allow a customer to decline one pending handyman offer without closing the job.
create or replace function public.decline_handyman_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_customer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to decline an offer.';
  end if;

  select j.id, j.customer_id
    into v_job_id, v_customer_id
  from public.job_offers o
  join public.jobs j on j.id = o.job_id
  where o.id = p_offer_id
  for update of j;

  if v_job_id is null then
    raise exception 'This offer could not be found.';
  end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who posted this job can decline an offer.';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = v_job_id and status = 'open'::public.job_status
  ) then
    raise exception 'This job is no longer accepting offer decisions.';
  end if;
  if not exists (
    select 1 from public.job_offers
    where id = p_offer_id
      and status in ('pending'::public.offer_status, 'countered'::public.offer_status)
  ) then
    raise exception 'This offer is no longer available to decline.';
  end if;

  update public.job_offers
  set status = 'rejected'
  where id = p_offer_id and job_id = v_job_id;
end;
$$;

revoke all on function public.decline_handyman_offer(uuid) from public, anon;
grant execute on function public.decline_handyman_offer(uuid) to authenticated;
