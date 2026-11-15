-- Proximity matching preferences for handymen.
-- Apply in Supabase SQL Editor after the matching profile-form deployment.

alter table public.profiles
  add column if not exists search_radius_km integer not null default 10
  check (search_radius_km in (5, 10, 20, 30));

grant update (search_radius_km) on public.profiles to authenticated;
