-- Shared in-app notifications for customers and handymen.
-- Phase 1: secure storage and realtime publication only.
-- Trusted event triggers/RPCs will be added in a separate migration.

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('customer', 'handyman')),
  actor_id uuid references public.profiles(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  notification_type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create index if not exists notifications_job_idx
  on public.notifications (job_id, created_at desc)
  where job_id is not null;

alter table public.notifications enable row level security;

drop policy if exists "Users read their own notifications" on public.notifications;
create policy "Users read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists "Users mark their own notifications as read" on public.notifications;
create policy "Users mark their own notifications as read"
  on public.notifications
  for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Clients can read notifications and update only the read timestamp.
-- They cannot create, alter, or delete notification content.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- Publish inserts/updates so both dashboards can refresh immediately.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

commit;
