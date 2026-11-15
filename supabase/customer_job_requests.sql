-- Customer job request submission: safe first release.
-- Run this once in the Supabase SQL Editor after the app code is deployed.

alter table public.jobs
  add column if not exists street_address text;

insert into public.service_categories (name, description, active)
values
  ('Plumbing', 'Leaks, taps, toilets, pipes and water systems', true),
  ('Electrical', 'Lights, plugs, wiring and electrical faults', true),
  ('Painting', 'Interior and exterior painting', true),
  ('Carpentry', 'Doors, cupboards, shelves and wood repairs', true),
  ('Home repairs', 'General household maintenance and repairs', true),
  ('Cleaning', 'Home and property cleaning', true),
  ('Other', 'Other household services', true)
on conflict (name) do update
set description = excluded.description,
    active = true;

drop policy if exists "Customers can create their own jobs" on public.jobs;
create policy "Customers can create their own jobs"
  on public.jobs
  for insert
  to authenticated
  with check (
    auth.uid() = customer_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'customer'::public.app_role
    )
  );

drop policy if exists "Customers can read their own jobs" on public.jobs;
create policy "Customers can read their own jobs"
  on public.jobs
  for select
  to authenticated
  using (auth.uid() = customer_id);
