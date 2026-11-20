-- Secure access for customer job photos in the private job-photos bucket.
-- File paths must be: <job_uuid>/<unique_filename>
-- Only INSERT and SELECT are granted by these policies. No client UPDATE/DELETE access.

create or replace function public.can_upload_job_photos(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.jobs j
      join public.profiles p on p.id = j.customer_id
      where j.id = p_job_id
        and j.customer_id = auth.uid()
        and p.role = 'customer'::public.app_role
    );
$$;

create or replace function public.can_view_job_photos(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      -- The customer who posted the job can view its photos.
      exists (
        select 1
        from public.jobs j
        where j.id = p_job_id
          and j.customer_id = auth.uid()
      )
      -- A handyman with an accepted offer can view the assigned job's photos.
      or exists (
        select 1
        from public.job_offers o
        where o.job_id = p_job_id
          and o.handyman_id = auth.uid()
          and o.status = 'accepted'::public.offer_status
      )
      -- Available handymen can view photos for open jobs matching the
      -- same service and live radius rules used by the job inbox.
      or exists (
        select 1
        from public.jobs j
        join public.service_categories sc on sc.id = j.service_category_id
        join public.profiles p on p.id = auth.uid()
        where j.id = p_job_id
          and j.status = 'open'::public.job_status
          and j.latitude is not null
          and j.longitude is not null
          and p.role = 'handyman'::public.app_role
          and p.available = true
          and p.current_latitude is not null
          and p.current_longitude is not null
          and p.location_updated_at > now() - interval '24 hours'
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
$$;

revoke all on function public.can_upload_job_photos(uuid) from public, anon;
revoke all on function public.can_view_job_photos(uuid) from public, anon;
grant execute on function public.can_upload_job_photos(uuid) to authenticated;
grant execute on function public.can_view_job_photos(uuid) to authenticated;

drop policy if exists "Customers upload photos for their own jobs" on storage.objects;
create policy "Customers upload photos for their own jobs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] is not null
    and public.can_upload_job_photos(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Relevant users view job photos" on storage.objects;
create policy "Relevant users view job photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] is not null
    and public.can_view_job_photos(((storage.foldername(name))[1])::uuid)
  );
