-- Allow customers to cancel immediately after work has started.
-- Compensation is recorded separately; an in-progress cancellation never adds an automatic fee.
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
    raise exception 'Please choose a reason for cancelling.';
  end if;

  select customer_id, status, handyman_en_route_at
    into v_customer_id, v_status, v_en_route_at
  from public.jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'This booking could not be found.'; end if;
  if v_customer_id <> auth.uid() then
    raise exception 'Only the customer who created this booking can cancel it.';
  end if;
  if v_status not in ('confirmed'::public.job_status, 'in_progress'::public.job_status) then
    raise exception 'This booking cannot be cancelled in its current status.';
  end if;

  -- Once work has started, customer cancellation is immediate and no travel fee is applied.
  if v_status = 'confirmed'::public.job_status and v_en_route_at is not null then
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
    and status = v_status;

  if not found then raise exception 'The booking changed before cancellation. Please refresh and try again.'; end if;
  return v_fee;
end;
$$;

revoke all on function public.cancel_customer_booking(uuid, text) from public, anon;
grant execute on function public.cancel_customer_booking(uuid, text) to authenticated;
