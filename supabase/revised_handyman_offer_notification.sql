-- Notify the customer when a handyman resubmits a previously declined offer.
-- The existing job_offers row is updated from rejected to pending; no duplicate offer is created.

begin;

create or replace function public.notify_customer_of_revised_handyman_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_job_title text;
begin
  if old.status = 'rejected'::public.offer_status
     and new.status = 'pending'::public.offer_status then
    select j.customer_id, j.title
      into v_customer_id, v_job_title
    from public.jobs j
    where j.id = new.job_id
      and j.status = 'open'::public.job_status;

    if v_customer_id is not null then
      insert into public.notifications (
        recipient_id, recipient_role, actor_id, job_id,
        notification_type, title, message, event_key
      ) values (
        v_customer_id, 'customer', new.handyman_id, new.job_id,
        'handyman_offer_received', 'Revised handyman offer',
        'A handyman has revised their offer for "' || coalesce(v_job_title, 'your job') || '".',
        'offer_revised:' || new.id::text || ':' || txid_current()::text
      )
      on conflict (event_key) where event_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_customer_of_revised_handyman_offer on public.job_offers;
create trigger notify_customer_of_revised_handyman_offer
after update of status on public.job_offers
for each row
execute function public.notify_customer_of_revised_handyman_offer();

revoke all on function public.notify_customer_of_revised_handyman_offer() from public, anon, authenticated;

commit;
