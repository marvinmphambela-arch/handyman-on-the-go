-- Generate shared notifications from trusted database events.
-- Safe to re-run: event keys prevent duplicate notifications.
-- Does not alter booking, payment, commission, or payout calculations.

begin;

alter table public.notifications
  add column if not exists event_key text;

create unique index if not exists notifications_event_key_uidx
  on public.notifications (event_key)
  where event_key is not null;

-- New handyman offer -> notify the customer who owns the job.
create or replace function public.notify_customer_of_new_handyman_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_job_title text;
begin
  select j.customer_id, j.title
    into v_customer_id, v_job_title
  from public.jobs j
  where j.id = new.job_id;

  if v_customer_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      v_customer_id, 'customer', new.handyman_id, new.job_id,
      'handyman_offer_received', 'New handyman offer',
      'A handyman has submitted an offer for "' || coalesce(v_job_title, 'your job') || '".',
      'offer_received:' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_customer_of_new_handyman_offer on public.job_offers;
create trigger notify_customer_of_new_handyman_offer
after insert on public.job_offers
for each row
execute function public.notify_customer_of_new_handyman_offer();

-- Offer accepted/rejected -> notify the affected handyman.
create or replace function public.notify_handyman_of_offer_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_title text;
begin
  if old.status is distinct from new.status
     and new.status in ('accepted'::public.offer_status, 'rejected'::public.offer_status) then
    select j.title into v_job_title
    from public.jobs j
    where j.id = new.job_id;

    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      new.handyman_id,
      'handyman',
      (select j.customer_id from public.jobs j where j.id = new.job_id),
      new.job_id,
      case when new.status = 'accepted'::public.offer_status
        then 'offer_accepted' else 'offer_not_selected' end,
      case when new.status = 'accepted'::public.offer_status
        then 'Your offer was accepted' else 'Offer not selected' end,
      case when new.status = 'accepted'::public.offer_status
        then 'Your offer for "' || coalesce(v_job_title, 'the job') || '" was accepted.'
        else 'The customer selected another offer for "' || coalesce(v_job_title, 'the job') || '".' end,
      'offer_' || new.status::text || ':' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_handyman_of_offer_decision on public.job_offers;
create trigger notify_handyman_of_offer_decision
after update of status on public.job_offers
for each row
execute function public.notify_handyman_of_offer_decision();

-- Booking milestones -> notify the other party.
create or replace function public.notify_booking_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handyman_id uuid;
  v_job_title text;
begin
  select o.handyman_id into v_handyman_id
  from public.job_offers o
  where o.job_id = new.id
    and o.status = 'accepted'::public.offer_status
  order by o.created_at desc
  limit 1;

  v_job_title := coalesce(new.title, 'your booking');

  -- Handyman marks en route -> customer.
  if old.handyman_en_route_at is null and new.handyman_en_route_at is not null then
    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      new.customer_id, 'customer', v_handyman_id, new.id,
      'handyman_en_route', 'Handyman is on the way',
      'Your handyman is on the way for "' || v_job_title || '".',
      'handyman_en_route:' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  -- Work starts -> customer.
  if old.status is distinct from new.status
     and new.status = 'in_progress'::public.job_status then
    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      new.customer_id, 'customer', v_handyman_id, new.id,
      'work_started', 'Work has started',
      'Your handyman has started work on "' || v_job_title || '".',
      'work_started:' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  -- Customer confirms completion -> handyman.
  if old.status is distinct from new.status
     and new.status = 'completed'::public.job_status
     and v_handyman_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      v_handyman_id, 'handyman', new.customer_id, new.id,
      'job_completed', 'Job marked as completed',
      'The customer confirmed that "' || v_job_title || '" is complete.',
      'job_completed:' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  -- Customer cancellation -> selected handyman. Existing legacy alert is retained.
  if old.status is distinct from new.status
     and new.status = 'cancelled'::public.job_status
     and v_handyman_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, actor_id, job_id,
      notification_type, title, message, event_key
    ) values (
      v_handyman_id, 'handyman', new.customer_id, new.id,
      'booking_cancelled', 'Booking cancelled',
      'The customer has cancelled "' || v_job_title || '".',
      'booking_cancelled:' || new.id::text
    )
    on conflict (event_key) where event_key is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_booking_milestone on public.jobs;
create trigger notify_booking_milestone
after update of status, handyman_en_route_at on public.jobs
for each row
execute function public.notify_booking_milestone();

-- Trigger functions are not callable by application roles.
revoke all on function public.notify_customer_of_new_handyman_offer() from public, anon, authenticated;
revoke all on function public.notify_handyman_of_offer_decision() from public, anon, authenticated;
revoke all on function public.notify_booking_milestone() from public, anon, authenticated;

commit;
