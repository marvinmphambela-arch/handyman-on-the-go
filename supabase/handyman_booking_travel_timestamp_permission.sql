-- Allow the selected handyman to read the travel timestamp for their confirmed booking.
-- This is a column-level grant only; it does not change row-level policies or expose
-- any additional job data or customer street addresses to other handymen.

grant select (handyman_en_route_at)
  on public.jobs
  to authenticated;
