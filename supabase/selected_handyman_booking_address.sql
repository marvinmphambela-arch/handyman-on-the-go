-- Reveal the exact street address only to the customer who owns the job
-- and the handyman whose offer was accepted for a confirmed booking.
--
-- The SECURITY DEFINER helper avoids circular RLS checks between jobs
-- and job_offers when a handyman loads confirmed bookings.

grant select (street_address) on public.jobs to authenticated;

create or replace function public.handyman_has_accepted_booking(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_offers o
    where o.job_id = p_job_id
      and o.handyman_id = auth.uid()
      and o.status = 'accepted'::public.offer_status
  );
$$;

revoke all on function public.handyman_has_accepted_booking(uuid) from public, anon;
grant execute on function public.handyman_has_accepted_booking(uuid) to authenticated;

drop policy if exists "Selected handyman can read confirmed booking address" on public.jobs;
create policy "Selected handyman can read confirmed booking address"
  on public.jobs
  for select
  to authenticated
  using (
    status = 'confirmed'::public.job_status
    and public.handyman_has_accepted_booking(id)
  );
