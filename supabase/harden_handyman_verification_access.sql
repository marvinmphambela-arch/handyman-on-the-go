-- Harden private handyman verification access.
-- Apply after handyman_verification_submissions.sql.

-- SECURITY DEFINER role check avoids relying on the caller's profiles SELECT policy.
create or replace function public.is_hgo_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_hgo_admin() from public, anon;
grant execute on function public.is_hgo_admin() to authenticated;

-- Handymen may read their own status only. They cannot alter submitted paths,
-- reviewer fields, notes, or status through the table API.
drop policy if exists "Handymen can submit verification once" on public.handyman_verification_submissions;
drop policy if exists "Handymen can resubmit rejected verification" on public.handyman_verification_submissions;
drop policy if exists "Admins can review handyman verification" on public.handyman_verification_submissions;

create policy "Admins manage handyman verification submissions"
  on public.handyman_verification_submissions
  for all to authenticated
  using (public.is_hgo_admin())
  with check (public.is_hgo_admin());

-- Explicit grants: submission writes are performed by a narrow SECURITY DEFINER RPC.
revoke all on public.handyman_verification_submissions from anon, authenticated;
grant select on public.handyman_verification_submissions to authenticated;

create or replace function public.submit_handyman_verification(
  p_id_document_path text,
  p_selfie_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'handyman'
  ) then
    raise exception 'Only handyman accounts can submit verification.';
  end if;

  if split_part(p_id_document_path, '/', 1) <> v_uid::text
     or split_part(p_selfie_path, '/', 1) <> v_uid::text then
    raise exception 'Invalid private document path.';
  end if;

  if exists (
    select 1 from public.handyman_verification_submissions s
    where s.handyman_id = v_uid
      and s.status <> 'rejected'
  ) then
    raise exception 'A verification submission is already awaiting review or has been approved.';
  end if;

  insert into public.handyman_verification_submissions (
    handyman_id, id_document_path, selfie_path, status,
    submitted_at, reviewed_at, reviewer_id, admin_notes
  )
  values (v_uid, p_id_document_path, p_selfie_path, 'under_review', now(), null, null, null)
  on conflict (handyman_id) do update
    set id_document_path = excluded.id_document_path,
        selfie_path = excluded.selfie_path,
        status = 'under_review',
        submitted_at = now(),
        reviewed_at = null,
        reviewer_id = null,
        admin_notes = null
    where public.handyman_verification_submissions.status = 'rejected';
end;
$$;

revoke all on function public.submit_handyman_verification(text, text) from public, anon;
grant execute on function public.submit_handyman_verification(text, text) to authenticated;

-- Private files: only the owning handyman may upload to their own folder;
-- only admins may read. Do not allow client-side file replacement.
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
  using (bucket_id = 'handyman-verification' and public.is_hgo_admin());

drop policy if exists "Handymen replace own verification files" on storage.objects;
drop policy if exists "Handymen update own verification files" on storage.objects;
