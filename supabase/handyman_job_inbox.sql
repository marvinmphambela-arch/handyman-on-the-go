-- Secure handyman job inbox: matching open jobs without exposing street addresses.
-- Apply once in the Supabase SQL Editor after the app deployment is Live.

-- Handymen may read only open jobs that match their saved services and service areas.
drop policy if exists "Matching available handymen can read open jobs" on public.jobs;
create policy "Matching available handymen can read open jobs"
  on public.jobs
  for select
  to authenticated
  using (
    status = 'open'::public.job_status
    and exists (
      select 1
      from public.profiles p
      join public.service_categories sc
        on sc.id = jobs.service_category_id
      where p.id = auth.uid()
        and p.role = 'handyman'::public.app_role
        and p.available = true
        and sc.name = any(p.services)
        and exists (
          select 1
          from unnest(p.service_areas) as area
          where lower(trim(area)) = lower(trim(coalesce(jobs.suburb, '')))
             or lower(trim(area)) = lower(trim(coalesce(jobs.city, '')))
        )
    )
  );

-- Restrict column-level reads so the customer's street address is never available
-- through the handyman inbox, even if someone changes the browser code.
revoke select on table public.jobs from anon, authenticated;
grant select (
  id,
  customer_id,
  service_category_id,
  title,
  description,
  suburb,
  city,
  province,
  latitude,
  longitude,
  customer_offer_zar,
  urgency,
  status,
  created_at
) on table public.jobs to authenticated;

-- Customer job submission remains available; the customer insert policy still applies.
