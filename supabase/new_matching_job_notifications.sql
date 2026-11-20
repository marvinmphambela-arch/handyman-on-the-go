-- Notify only eligible handymen when a new matching job is posted.
-- Uses the same approval, availability, fresh-location, service and radius
-- checks as the handyman open-job visibility policy.
-- Safe to re-run: one notification per job/handyman pair.

begin;

create or replace function public.notify_matching_handymen_of_new_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open'::public.job_status
     or new.latitude is null
     or new.longitude is null then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    recipient_role,
    actor_id,
    job_id,
    notification_type,
    title,
    message,
    metadata,
    event_key
  )
  select
    p.id,
    'handyman',
    new.customer_id,
    new.id,
    'new_matching_job',
    'New job near you',
    'A new ' || sc.name || ' job has been posted in '
      || coalesce(nullif(new.suburb, ''), nullif(new.city, ''), 'your area')
      || ': "' || new.title || '".',
    jsonb_build_object(
      'job_title', new.title,
      'service_category', sc.name,
      'suburb', new.suburb,
      'city', new.city
    ),
    'new_matching_job:' || new.id::text || ':' || p.id::text
  from public.profiles p
  join public.service_categories sc
    on sc.id = new.service_category_id
  where p.role = 'handyman'::public.app_role
    and p.verification_status = 'approved'
    and p.available = true
    and p.current_latitude is not null
    and p.current_longitude is not null
    and p.location_updated_at > now() - interval '24 hours'
    and sc.name = any(p.services)
    and 6371 * acos(
      least(1.0, greatest(-1.0,
        sin(radians(p.current_latitude)) * sin(radians(new.latitude))
        + cos(radians(p.current_latitude)) * cos(radians(new.latitude))
        * cos(radians(new.longitude) - radians(p.current_longitude))
      ))
    ) <= p.search_radius_km
  on conflict (event_key) where event_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists notify_matching_handymen_of_new_job on public.jobs;
create trigger notify_matching_handymen_of_new_job
after insert on public.jobs
for each row
execute function public.notify_matching_handymen_of_new_job();

revoke all on function public.notify_matching_handymen_of_new_job()
  from public, anon, authenticated;

commit;
