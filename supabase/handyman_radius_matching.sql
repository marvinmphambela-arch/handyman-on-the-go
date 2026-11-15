-- Radius-based matching for available handymen.
-- Run after the customer request form and private handyman location fields are deployed.

-- Handymen can see open jobs within their saved radius, for matching services.
-- A location must have been refreshed within the last 24 hours.
drop policy if exists "Matching available handymen can read open jobs" on public.jobs;
create policy "Matching available handymen can read open jobs"
  on public.jobs
  for select
  to authenticated
  using (
    status = 'open'::public.job_status
    and latitude is not null
    and longitude is not null
    and exists (
      select 1
      from public.profiles p
      join public.service_categories sc on sc.id = jobs.service_category_id
      where p.id = auth.uid()
        and p.role = 'handyman'::public.app_role
        and p.available = true
        and p.current_latitude is not null
        and p.current_longitude is not null
        and p.location_updated_at > now() - interval '24 hours'
        and sc.name = any(p.services)
        and 6371 * acos(
          least(1.0, greatest(-1.0,
            sin(radians(p.current_latitude)) * sin(radians(jobs.latitude))
            + cos(radians(p.current_latitude)) * cos(radians(jobs.latitude))
            * cos(radians(jobs.longitude) - radians(p.current_longitude))
          ))
        ) <= p.search_radius_km
    )
  );

-- Handymen may submit offers only when the same service and distance rules match.
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
        and p.current_latitude is not null
        and p.current_longitude is not null
        and p.location_updated_at > now() - interval '24 hours'
        and j.status = 'open'::public.job_status
        and j.latitude is not null
        and j.longitude is not null
        and sc.name = any(p.services)
        and 6371 * acos(
          least(1.0, greatest(-1.0,
            sin(radians(p.current_latitude)) * sin(radians(j.latitude))
            + cos(radians(p.current_latitude)) * cos(radians(j.latitude))
            * cos(radians(j.longitude) - radians(p.current_longitude))
          ))
        ) <= p.search_radius_km
    )
  );

-- Keep exact job coordinates private from handyman browser queries.
revoke select (latitude, longitude) on public.jobs from authenticated;
