-- Admin-only review action for handyman verification.
create or replace function public.review_handyman_verification(
  p_handyman_id uuid,
  p_decision text,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_hgo_admin() then
    raise exception 'Only an administrator can review verification.';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  update public.handyman_verification_submissions
  set status = p_decision,
      reviewed_at = now(),
      reviewer_id = auth.uid(),
      admin_notes = nullif(trim(p_admin_notes), '')
  where handyman_id = p_handyman_id
    and status = 'under_review';

  if not found then
    raise exception 'No submission awaiting review was found.';
  end if;
end;
$$;

revoke all on function public.review_handyman_verification(uuid, text, text) from public, anon;
grant execute on function public.review_handyman_verification(uuid, text, text) to authenticated;
