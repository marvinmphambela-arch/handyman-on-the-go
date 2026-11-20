-- Handyman On The Go: administrator customer and handyman account management.
-- Adds temporary account suspension without changing identity verification,
-- existing bookings, financial records, wallet balances, or Paystack settlement.

begin;

-- Account access is deliberately separate from identity verification_status.
alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended'));

-- Private audit trail for administrator account-status decisions.
create table if not exists public.account_status_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('suspended', 'reactivated')),
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.account_status_audit enable row level security;
revoke all on public.account_status_audit from public, anon, authenticated;

-- A signed-in user may check only their own account status.
create or replace function public.get_my_account_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.account_status
  from public.profiles p
  where p.id = auth.uid()
$$;
revoke all on function public.get_my_account_status() from public, anon;
grant execute on function public.get_my_account_status() to authenticated;

-- Admin-only directory. Return only fields needed for account management.
create or replace function public.admin_list_managed_accounts(p_role text default null)
returns table (
  id uuid,
  role text,
  full_name text,
  phone text,
  created_at timestamptz,
  account_status text,
  verification_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can view managed accounts.';
  end if;
  if p_role is not null and p_role not in ('customer', 'handyman') then
    raise exception 'Choose customers or handymen.';
  end if;

  return query
  select p.id, p.role::text, p.full_name, p.phone, p.created_at,
         p.account_status, p.verification_status
  from public.profiles p
  where p.role in ('customer'::public.app_role, 'handyman'::public.app_role)
    and (p_role is null or p.role::text = p_role)
  order by p.created_at desc;
end;
$$;
revoke all on function public.admin_list_managed_accounts(text) from public, anon;
grant execute on function public.admin_list_managed_accounts(text) to authenticated;

-- Admin-only suspend/reactivate action with a mandatory reason and audit record.
create or replace function public.admin_set_account_status(
  p_account_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_old_status text;
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can change account status.';
  end if;
  if p_new_status not in ('active', 'suspended') then
    raise exception 'Account status must be active or suspended.';
  end if;
  if nullif(btrim(p_reason), '') is null or char_length(btrim(p_reason)) > 1000 then
    raise exception 'Enter a reason of up to 1000 characters.';
  end if;

  select p.role, p.account_status into v_role, v_old_status
  from public.profiles p
  where p.id = p_account_id
  for update;

  if not found or v_role not in ('customer'::public.app_role, 'handyman'::public.app_role) then
    raise exception 'Customer or handyman account not found.';
  end if;
  if v_old_status = p_new_status then
    raise exception 'This account already has that status.';
  end if;

  update public.profiles
  set account_status = p_new_status
  where id = p_account_id;

  insert into public.account_status_audit(account_id, action, reason, admin_id)
  values (
    p_account_id,
    case when p_new_status = 'suspended' then 'suspended' else 'reactivated' end,
    left(btrim(p_reason), 1000),
    auth.uid()
  );
end;
$$;
revoke all on function public.admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

-- Suspended customers cannot create new jobs. Existing jobs remain readable
-- and all existing booking/payment records remain untouched.
drop policy if exists "Customers can create their own jobs" on public.jobs;
create policy "Customers can create their own jobs"
  on public.jobs for insert to authenticated
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'customer'::public.app_role
        and p.account_status = 'active'
    )
  );

-- Matching job discovery also requires an active handyman account.
drop policy if exists "Matching available handymen can read open jobs" on public.jobs;
create policy "Matching available handymen can read open jobs"
  on public.jobs for select to authenticated
  using (
    status = 'open'::public.job_status
    and latitude is not null
    and longitude is not null
    and exists (
      select 1
      from public.profiles p
      join public.service_categories sc on sc.id = jobs.service_category_id
      where p.id = auth.uid()
        and p.role = 'handyman'::public.app_role
        and p.account_status = 'active'
        and p.verification_status = 'approved'
        and p.available = true
        and p.current_latitude is not null
        and p.current_longitude is not null
        and p.location_updated_at > now() - interval '24 hours'
        and sc.name = any(p.services)
        and 6371 * acos(
          least(1.0, greatest(-1.0,
            sin(radians(p.current_latitude)) * sin(radians(jobs.latitude))
            + cos(radians(p.current_latitude)) * cos(radians(jobs.latitude))
            * cos(radians(jobs.longitude) - radians(p.current_longitude))
          ))
        ) <= p.search_radius_km
    )
  );

-- Enforce active status at the database boundary for new and revised offers.
create or replace function public.handyman_can_offer_on_job(
  p_job_id uuid,
  p_handyman_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_handyman_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      join public.jobs j on j.id = p_job_id
      join public.service_categories sc on sc.id = j.service_category_id
      where p.id = p_handyman_id
        and p.role = 'handyman'::public.app_role
        and p.account_status = 'active'
        and p.verification_status = 'approved'
        and p.available = true
        and p.current_latitude is not null
        and p.current_longitude is not null
        and p.location_updated_at > now() - interval '24 hours'
        and j.status = 'open'::public.job_status
        and j.latitude is not null
        and j.longitude is not null
        and sc.name = any(p.services)
        and 6371 * acos(
          least(1.0, greatest(-1.0,
            sin(radians(p.current_latitude)) * sin(radians(j.latitude))
            + cos(radians(p.current_latitude)) * cos(radians(j.latitude))
            * cos(radians(j.longitude) - radians(p.current_longitude))
          ))
        ) <= p.search_radius_km
    );
$$;
revoke all on function public.handyman_can_offer_on_job(uuid, uuid) from public, anon;
grant execute on function public.handyman_can_offer_on_job(uuid, uuid) to authenticated;

-- Rebuild offer policies using the updated eligibility helper.
drop policy if exists "Handymen can submit matching offers" on public.job_offers;
create policy "Handymen can submit matching offers"
  on public.job_offers for insert to authenticated
  with check (
    status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  );

drop policy if exists "Handymen can revise their pending or rejected offers" on public.job_offers;
drop policy if exists "Handymen can update their pending offers" on public.job_offers;
create policy "Handymen can revise their pending or rejected offers"
  on public.job_offers for update to authenticated
  using (
    handyman_id = auth.uid()
    and status in ('pending'::public.offer_status, 'rejected'::public.offer_status)
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  )
  with check (
    handyman_id = auth.uid()
    and status = 'pending'::public.offer_status
    and public.handyman_can_offer_on_job(job_id, handyman_id)
  );


-- Preserve the precise column-level permission used by declined-offer revisions.
grant update (amount_zar, message, estimated_arrival_minutes, status)
  on table public.job_offers to authenticated;

-- A suspended customer cannot turn an open job into a new confirmed booking.
-- Existing confirmed/in-progress booking actions remain unchanged.
create or replace function public.accept_handyman_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $
declare
  v_job_id uuid;
  v_customer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to accept an offer.';
  end if;

  select j.id, j.customer_id
    into v_job_id, v_customer_id
  from public.job_offers o
  join public.jobs j on j.id = o.job_id
  where o.id = p_offer_id
  for update of j;

  if v_job_id is null then
    raise exception 'This offer could not be found.';
  end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who posted this job can accept an offer.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'customer'::public.app_role
      and p.account_status = 'active'
  ) then
    raise exception 'Your account is suspended and cannot accept new offers.';
  end if;

  if not exists (
    select 1 from public.job_offers
    where id = p_offer_id and status in ('pending'::public.offer_status, 'countered'::public.offer_status)
  ) then
    raise exception 'This offer is no longer available.';
  end if;

  if not exists (
    select 1 from public.jobs
    where id = v_job_id and status = 'open'::public.job_status
  ) then
    raise exception 'This job already has a selected offer or is no longer open.';
  end if;

  update public.job_offers
  set status = 'accepted'
  where id = p_offer_id and job_id = v_job_id;

  update public.job_offers
  set status = 'rejected'
  where job_id = v_job_id
    and id <> p_offer_id
    and status in ('pending'::public.offer_status, 'countered'::public.offer_status);

  update public.jobs
  set status = 'confirmed'
  where id = v_job_id and customer_id = auth.uid() and status = 'open'::public.job_status;
end;
$;

revoke all on function public.accept_handyman_offer(uuid) from public, anon;
grant execute on function public.accept_handyman_offer(uuid) to authenticated;

commit;
