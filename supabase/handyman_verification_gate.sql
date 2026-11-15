-- Compulsory handyman identity approval gate.
-- Apply in Supabase SQL Editor after the existing radius-matching and offer-permission migrations.
-- This migration does not collect or store identity documents or selfies.

alter table public.profiles
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'under_review', 'approved', 'rejected', 'suspended'));

-- New and existing handymen remain blocked until an administrator approves them.
-- Customer profiles are unaffected by the gate.

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
        and p.verification_status = 'approved'
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

-- Recheck approval at the database boundary when creating or editing an offer.
create or replace function public.handyman_can_offer_on_job(
  p_job_id uuid,
  p_handyman_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_handyman_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      join public.jobs j on j.id = p_job_id
      join public.service_categories sc on sc.id = j.service_category_id
      where p.id = p_handyman_id
        and p.role = 'handyman'::public.app_role
        and p.verification_status = 'approved'
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
    );
$$;

revoke all on function public.handyman_can_offer_on_job(uuid, uuid) from public, anon;
grant execute on function public.handyman_can_offer_on_job(uuid, uuid) to authenticated;

drop policy if exists "Handymen can submit matching offers" on public.job_offers;
create policy "Handymen can submit matching offers"
  on public.job_offers for insert to authenticated
  with check (
    status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  );

drop policy if exists "Handymen can update their pending offers" on public.job_offers;
create policy "Handymen can update their pending offers"
  on public.job_offers for update to authenticated
  using (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  )
  with check (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  );
