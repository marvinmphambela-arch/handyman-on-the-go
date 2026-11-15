-- Proximity matching preferences and private location storage for handymen.
-- Apply in Supabase SQL Editor after the matching profile-form deployment.

alter table public.profiles
  add column if not exists search_radius_km integer not null default 10
  check (search_radius_km in (5, 10, 20, 30));

alter table public.profiles
  add column if not exists current_latitude double precision,
  add column if not exists current_longitude double precision,
  add column if not exists location_updated_at timestamptz;

grant update (search_radius_km, current_latitude, current_longitude, location_updated_at)
  on public.profiles to authenticated;
