-- Allow a handyman to revise their own declined offer when the job is still open.
-- The revised offer returns to pending and uses the existing offer row.

drop policy if exists "Handymen can update their pending offers" on public.job_offers;
create policy "Handymen can revise their pending or rejected offers"
  on public.job_offers for update to authenticated
  using (
    handyman_id = auth.uid()
    and status in ('pending'::public.offer_status, 'rejected'::public.offer_status)
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  )
  with check (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  );

grant update (amount_zar, message, estimated_arrival_minutes, status)
  on table public.job_offers to authenticated;
