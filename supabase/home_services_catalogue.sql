-- Expand Handyman On The Go to a broader home-services marketplace.
-- Run once in Supabase SQL Editor after the app deployment is Live.

-- Rename the original catch-all category without changing its ID, so existing
-- requests using "Other" remain linked and can be matched as "Other Home Services".
update public.service_categories
set name = 'Other Home Services',
    description = 'Other suitable home, property and household services not listed elsewhere',
    active = true
where name = 'Other'
  and not exists (
    select 1 from public.service_categories existing
    where existing.name = 'Other Home Services'
  );

insert into public.service_categories (name, description, active)
values
  ('Plumbing', 'Leaks, taps, toilets, blocked drains, pipes and water systems', true),
  ('Electrical', 'Lights, plugs, switches, wiring and electrical fault finding', true),
  ('Painting & Decorating', 'Interior and exterior painting, touch-ups and decorating', true),
  ('Carpentry', 'Doors, cupboards, shelves, wooden fittings and wood repairs', true),
  ('Building & Renovations', 'Tiling, plastering, ceilings, minor building and renovation work', true),
  ('Gardening & Outdoor', 'Grass cutting, lawn care, hedge trimming and garden cleanups', true),
  ('Cleaning', 'Home cleaning, deep cleaning and move-in or move-out cleaning', true),
  ('Appliance Repairs', 'Repairs to household appliances such as stoves, fridges and washing machines', true),
  ('Roofing & Gutters', 'Roof leaks, roof maintenance and gutter cleaning or repairs', true),
  ('Locks & Security', 'Locks, door hardware, gates and basic property security repairs', true),
  ('Furniture Assembly', 'Flat-pack furniture assembly, furniture setup and mounting', true),
  ('General Home Repairs', 'General household maintenance, fittings, handles, hinges and odd jobs', true),
  ('Other Home Services', 'Other suitable home, property and household services not listed elsewhere', true)
on conflict (name) do update
set description = excluded.description,
    active = true;
