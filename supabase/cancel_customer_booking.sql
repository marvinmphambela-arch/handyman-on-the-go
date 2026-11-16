-- Allow the customer who owns a confirmed booking to cancel it before work starts.
-- The database accepts cancellation only while the job is still confirmed.
create or replace function public.cancel_customer_booking(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status public.job_status;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel a booking.';
  end if;

  select customer_id, status
    into v_customer_id, v_status
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'This booking could not be found.';
  end if;

  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who created this booking can cancel it.';
  end if;

  if v_status <> 'confirmed'::public.job_status then
    raise exception 'This booking can only be cancelled before the handyman starts work.';
  end if;

  update public.jobs
  set status = 'cancelled'::public.job_status
  where id = p_job_id
    and customer_id = auth.uid()
    and status = 'confirmed'::public.job_status;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid) from public, anon;
grant execute on function public.cancel_customer_booking(uuid) to authenticated;
