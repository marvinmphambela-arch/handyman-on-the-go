-- Customer protection when a booking is already in progress.
-- Customers request review; only an administrator can resolve the request.
create table if not exists public.booking_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  concern_type text not null check (concern_type in ('safety_or_behaviour','quality_or_competence','other')),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.booking_cancellation_requests enable row level security;

drop policy if exists "Customers read own cancellation requests" on public.booking_cancellation_requests;
create policy "Customers read own cancellation requests"
  on public.booking_cancellation_requests for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists "Admins read cancellation requests" on public.booking_cancellation_requests;
create policy "Admins read cancellation requests"
  on public.booking_cancellation_requests for select to authenticated
  using (public.is_hgo_admin());

revoke all on public.booking_cancellation_requests from anon, authenticated;
grant select on public.booking_cancellation_requests to authenticated;

create or replace function public.submit_in_progress_cancellation_request(
  p_job_id uuid,
  p_reason text,
  p_concern_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status public.job_status;
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Please provide a reason.'; end if;
  if p_concern_type not in ('safety_or_behaviour','quality_or_competence','other') then
    raise exception 'Choose a valid concern type.';
  end if;

  select customer_id, status into v_customer_id, v_status
  from public.jobs where id = p_job_id for update;

  if not found or v_customer_id <> auth.uid() then
    raise exception 'You can only request a review for your own booking.';
  end if;
  if v_status <> 'in_progress'::public.job_status then
    raise exception 'This review request is only for bookings marked in progress.';
  end if;
  if exists (select 1 from public.booking_cancellation_requests
             where job_id = p_job_id and status = 'pending') then
    raise exception 'A review request is already awaiting admin review.';
  end if;

  insert into public.booking_cancellation_requests(job_id, customer_id, reason, concern_type)
  values (p_job_id, auth.uid(), left(btrim(p_reason),1000), p_concern_type)
  returning id into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.submit_in_progress_cancellation_request(uuid,text,text) from public, anon;
grant execute on function public.submit_in_progress_cancellation_request(uuid,text,text) to authenticated;

create or replace function public.admin_resolve_cancellation_request(
  p_request_id uuid,
  p_approve boolean,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_request_status text;
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can review this request.';
  end if;

  select job_id, status into v_job_id, v_request_status
  from public.booking_cancellation_requests
  where id = p_request_id for update;

  if not found or v_request_status <> 'pending' then
    raise exception 'This request is no longer awaiting review.';
  end if;

  update public.booking_cancellation_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      admin_note = nullif(left(btrim(coalesce(p_admin_note,'')),1000),''),
      reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    update public.jobs
    set status = 'cancelled'::public.job_status,
        cancellation_reason = 'Admin-approved customer cancellation request: ' ||
          (select reason from public.booking_cancellation_requests where id = p_request_id),
        cancellation_compensation_zar = 0
    where id = v_job_id and status = 'in_progress'::public.job_status;
    if not found then raise exception 'The booking is no longer in progress.'; end if;
  end if;
end;
$$;

revoke all on function public.admin_resolve_cancellation_request(uuid,boolean,text) from public, anon;
grant execute on function public.admin_resolve_cancellation_request(uuid,boolean,text) to authenticated;
