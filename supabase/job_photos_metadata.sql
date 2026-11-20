-- Store private Storage object paths for customer job photos.
-- Photo files remain in the private "job-photos" bucket.

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint job_photos_path_matches_job
    check (split_part(storage_path, '/', 1) = job_id::text)
);

alter table public.job_photos enable row level security;

revoke all on table public.job_photos from anon, public;
grant select, insert on table public.job_photos to authenticated;

drop policy if exists "Customers record photos for their own jobs" on public.job_photos;
create policy "Customers record photos for their own jobs"
  on public.job_photos
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_upload_job_photos(job_id)
  );

drop policy if exists "Relevant users view job photo records" on public.job_photos;
create policy "Relevant users view job photo records"
  on public.job_photos
  for select
  to authenticated
  using (public.can_view_job_photos(job_id));
