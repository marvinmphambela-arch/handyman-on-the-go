-- Durable cancellation alerts for the handyman who held the accepted offer.
create table if not exists public.handyman_notifications (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  notification_type text not null check (notification_type in ('booking_cancelled')),
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.handyman_notifications enable row level security;

drop policy if exists "Handymen read their own notifications" on public.handyman_notifications;
create policy "Handymen read their own notifications"
  on public.handyman_notifications
  for select to authenticated
  using (handyman_id = auth.uid());

revoke all on public.handyman_notifications from anon, authenticated;
grant select on public.handyman_notifications to authenticated;

create or replace function public.notify_selected_handyman_of_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handyman_id uuid;
begin
  if new.status = 'cancelled'::public.job_status
     and old.status is distinct from new.status then
    select o.handyman_id into v_handyman_id
    from public.job_offers o
    where o.job_id = new.id
      and o.status = 'accepted'::public.offer_status
    order by o.created_at desc
    limit 1;

    if v_handyman_id is not null then
      insert into public.handyman_notifications (
        handyman_id, job_id, notification_type, title, message
      ) values (
        v_handyman_id,
        new.id,
        'booking_cancelled',
        'Booking cancelled',
        'The customer has cancelled this booking. Please check your bookings dashboard for details.'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_selected_handyman_of_cancellation on public.jobs;
create trigger notify_selected_handyman_of_cancellation
after update of status on public.jobs
for each row
execute function public.notify_selected_handyman_of_cancellation();


-- Publish notification inserts so an open handyman dashboard updates immediately.
alter publication supabase_realtime add table public.handyman_notifications;
