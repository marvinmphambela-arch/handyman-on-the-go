-- Let the selected handyman mark a confirmed booking as in progress.
-- Customers retain read access to their own jobs; only the selected handyman
-- can read the matching in-progress booking row.

create or replace function public.handyman_start_booking_work(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.job_offers o
    join public.jobs j on j.id = o.job_id
    where o.job_id = p_job_id
      and o.handyman_id = auth.uid()
      and o.status = 'accepted'::public.offer_status
      and j.status = 'confirmed'::public.job_status
      and j.handyman_en_route_at is not null
  ) then
    raise exception 'Only the selected handyman can start work after marking the booking as on the way.';
  end if;

  update public.jobs
  set status = 'in_progress'::public.job_status
  where id = p_job_id
    and status = 'confirmed'::public.job_status
    and handyman_en_route_at is not null
  returning handyman_en_route_at into v_started_at;

  if v_started_at is null then
    raise exception 'This booking is no longer ready to start.';
  end if;

  return v_started_at;
end;
$$;

revoke all on function public.handyman_start_booking_work(uuid) from public, anon;
grant execute on function public.handyman_start_booking_work(uuid) to authenticated;

drop policy if exists "Selected handyman can read in-progress booking" on public.jobs;
create policy "Selected handyman can read in-progress booking"
  on public.jobs
  for select
  to authenticated
  using (
    status = 'in_progress'::public.job_status
    and public.handyman_has_accepted_booking(id)
  );
