-- Add useful, privacy-safe details to cancellation notifications.
alter table public.handyman_notifications
  add column if not exists job_title text,
  add column if not exists service_name text,
  add column if not exists cancellation_reason text,
  add column if not exists compensation_zar integer;

create or replace function public.notify_selected_handyman_of_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handyman_id uuid;
  v_service_name text;
begin
  if new.status = 'cancelled'::public.job_status
     and old.status is distinct from new.status then
    select o.handyman_id into v_handyman_id
    from public.job_offers o
    where o.job_id = new.id
      and o.status = 'accepted'::public.offer_status
    order by o.created_at desc
    limit 1;

    select sc.name into v_service_name
    from public.service_categories sc
    where sc.id = new.service_category_id;

    if v_handyman_id is not null then
      insert into public.handyman_notifications (
        handyman_id, job_id, notification_type, title, message,
        job_title, service_name, cancellation_reason, compensation_zar
      ) values (
        v_handyman_id,
        new.id,
        'booking_cancelled',
        'Booking cancelled',
        'The customer has cancelled this booking.',
        new.title,
        v_service_name,
        new.cancellation_reason,
        coalesce(new.cancellation_compensation_zar, 0)
      );
    end if;
  end if;
  return new;
end;
$$;
