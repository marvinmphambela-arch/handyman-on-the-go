-- Handyman profile fields and safe self-service profile editing.
alter table public.profiles
  add column if not exists services text[] not null default '{}',
  add column if not exists service_areas text[] not null default '{}',
  add column if not exists years_experience integer not null default 0
    check (years_experience between 0 and 60),
  add column if not exists bio text,
  add column if not exists available boolean not null default true;

drop policy if exists "Handymen can update own profile details" on public.profiles;
create policy "Handymen can update own profile details"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id and role = 'handyman')
  with check (auth.uid() = id and role = 'handyman');

grant update (full_name, phone, services, service_areas, years_experience, bio, available)
  on public.profiles to authenticated;
