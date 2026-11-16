-- Travel-aware cancellation and fixed call-out compensation.
-- Initial fee is R250. The amount is snapshotted onto each cancelled booking.
alter table public.jobs
  add column if not exists handyman_en_route_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_compensation_zar integer
    check (cancellation_compensation_zar is null or cancellation_compensation_zar >= 0);

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  cancellation_callout_fee_zar integer not null default 250
    check (cancellation_callout_fee_zar >= 0),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, cancellation_callout_fee_zar)
values (true, 250)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
  on public.platform_settings for all to authenticated
  using (public.is_hgo_admin())
  with check (public.is_hgo_admin());

grant select, insert, update, delete on public.platform_settings to authenticated;

create or replace function public.handyman_mark_booking_en_route(p_job_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.job_offers o
    join public.jobs j on j.id = o.job_id
    where o.job_id = p_job_id
      and o.handyman_id = auth.uid()
      and o.status = 'accepted'::public.offer_status
      and j.status = 'confirmed'::public.job_status
  ) then
    raise exception 'Only the selected handyman can mark this confirmed booking as on the way.';
  end if;

  update public.jobs
  set handyman_en_route_at = coalesce(handyman_en_route_at, now())
  where id = p_job_id
    and status = 'confirmed'::public.job_status
  returning handyman_en_route_at into v_started_at;

  if v_started_at is null then
    raise exception 'This booking is no longer awaiting travel.';
  end if;

  return v_started_at;
end;
$$;

revoke all on function public.handyman_mark_booking_en_route(uuid) from public, anon;
grant execute on function public.handyman_mark_booking_en_route(uuid) to authenticated;

create or replace function public.cancel_customer_booking(
  p_job_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status public.job_status;
  v_en_route_at timestamptz;
  v_fee integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel a booking.';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Please provide a reason for cancelling.';
  end if;

  select customer_id, status, handyman_en_route_at
    into v_customer_id, v_status, v_en_route_at
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'This booking could not be found.';
  end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who created this booking can cancel it.';
  end if;
  if v_status <> 'confirmed'::public.job_status then
    raise exception 'This booking cannot be cancelled directly after work has started.';
  end if;

  if v_en_route_at is not null then
    select cancellation_callout_fee_zar into v_fee
    from public.platform_settings where id = true;
    v_fee := coalesce(v_fee, 250);
  end if;

  update public.jobs
  set status = 'cancelled'::public.job_status,
      cancellation_reason = left(btrim(p_reason), 1000),
      cancellation_compensation_zar = v_fee
  where id = p_job_id
    and customer_id = auth.uid()
    and status = 'confirmed'::public.job_status;

  return v_fee;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid, text) from public, anon;
grant execute on function public.cancel_customer_booking(uuid, text) to authenticated;
