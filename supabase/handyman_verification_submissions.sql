-- Private handyman identity verification submissions.
-- Apply in Supabase SQL Editor. Documents are private and visible only to admins.
create table if not exists public.handyman_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null unique references public.profiles(id) on delete cascade,
  id_document_path text not null,
  selfie_path text not null,
  status text not null default 'under_review'
    check (status in ('under_review','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id),
  admin_notes text,
  constraint verification_id_path_owner check (split_part(id_document_path, '/', 1) = handyman_id::text),
  constraint verification_selfie_path_owner check (split_part(selfie_path, '/', 1) = handyman_id::text)
);

alter table public.handyman_verification_submissions enable row level security;

drop policy if exists "Handymen can view own verification submission" on public.handyman_verification_submissions;
create policy "Handymen can view own verification submission"
  on public.handyman_verification_submissions for select to authenticated
  using (handyman_id = auth.uid());

drop policy if exists "Handymen can submit verification once" on public.handyman_verification_submissions;
create policy "Handymen can submit verification once"
  on public.handyman_verification_submissions for insert to authenticated
  with check (
    handyman_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'handyman')
  );

drop policy if exists "Handymen can resubmit rejected verification" on public.handyman_verification_submissions;
create policy "Handymen can resubmit rejected verification"
  on public.handyman_verification_submissions for update to authenticated
  using (handyman_id = auth.uid() and status = 'rejected')
  with check (handyman_id = auth.uid() and status = 'under_review');

drop policy if exists "Admins can review handyman verification" on public.handyman_verification_submissions;
create policy "Admins can review handyman verification"
  on public.handyman_verification_submissions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace function public.sync_handyman_verification_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set verification_status = new.status
  where id = new.handyman_id;
  return new;
end;
$$;

drop trigger if exists sync_handyman_verification_status on public.handyman_verification_submissions;
create trigger sync_handyman_verification_status
  after insert or update of status on public.handyman_verification_submissions
  for each row execute function public.sync_handyman_verification_status();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'handyman-verification',
  'handyman-verification',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "Handymen upload own verification files" on storage.objects;
create policy "Handymen upload own verification files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handyman-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'handyman')
  );

drop policy if exists "Admins view verification files" on storage.objects;
create policy "Admins view verification files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'handyman-verification'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "Handymen replace own verification files" on storage.objects;
create policy "Handymen replace own verification files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'handyman-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'handyman-verification'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
