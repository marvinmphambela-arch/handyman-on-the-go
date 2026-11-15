-- Reveal the exact street address only to the customer who owns the job
-- and the handyman whose offer was accepted for a confirmed booking.

grant select (street_address) on public.jobs to authenticated;

drop policy if exists "Selected handyman can read confirmed booking address" on public.jobs;
create policy "Selected handyman can read confirmed booking address"
  on public.jobs
  for select
  to authenticated
  using (
    status = 'confirmed'::public.job_status
    and exists (
      select 1
      from public.job_offers o
      where o.job_id = jobs.id
        and o.handyman_id = auth.uid()
        and o.status = 'accepted'::public.offer_status
    )
  );
