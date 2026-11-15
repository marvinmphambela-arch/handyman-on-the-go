-- Secure first release of handyman offers.
-- Apply in Supabase SQL Editor after the matching inbox migration.

-- One active offer per handyman per job. Pending/countered offers remain unique;
-- an accepted offer cannot be recreated for the same job.
create unique index if not exists job_offers_one_active_per_handyman_job
  on public.job_offers (job_id, handyman_id)
  where status in ('pending'::public.offer_status, 'countered'::public.offer_status, 'accepted'::public.offer_status);

alter table public.job_offers enable row level security;

drop policy if exists "Handymen can submit matching offers" on public.job_offers;
create policy "Handymen can submit matching offers"
  on public.job_offers for insert to authenticated
  with check (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and exists (
      select 1
      from public.profiles p
      join public.jobs j on j.id = job_offers.job_id
      join public.service_categories sc on sc.id = j.service_category_id
      where p.id = auth.uid()
        and p.role = 'handyman'::public.app_role
        and p.available = true
        and j.status = 'open'::public.job_status
        and sc.name = any(p.services)
        and exists (
          select 1 from unnest(p.service_areas) as area
          where lower(trim(area)) = lower(trim(coalesce(j.suburb, '')))
             or lower(trim(area)) = lower(trim(coalesce(j.city, '')))
        )
    )
  );

drop policy if exists "Customers and handymen can read relevant offers" on public.job_offers;
create policy "Customers and handymen can read relevant offers"
  on public.job_offers for select to authenticated
  using (
    handyman_id = auth.uid()
    or exists (
      select 1 from public.jobs j
      where j.id = job_offers.job_id and j.customer_id = auth.uid()
    )
  );

-- Handymen may revise only their own pending offer while the job remains open.
drop policy if exists "Handymen can update their pending offers" on public.job_offers;
create policy "Handymen can update their pending offers"
  on public.job_offers for update to authenticated
  using (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and exists (select 1 from public.jobs j where j.id = job_offers.job_id and j.status = 'open'::public.job_status)
  )
  with check (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and exists (select 1 from public.jobs j where j.id = job_offers.job_id and j.status = 'open'::public.job_status)
  );

revoke all on table public.job_offers from anon, authenticated;
grant select, insert on table public.job_offers to authenticated;
grant update (amount_zar, message, estimated_arrival_minutes) on table public.job_offers to authenticated;
