-- Handyman On The Go: securely initialise Access Wallets.
-- Wallets are created only by this trusted database trigger, never by client writes.
begin;

create or replace function public.create_handyman_access_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'handyman' then
    insert into public.handyman_access_wallets (handyman_id, balance_zar)
    values (new.id, 0)
    on conflict (handyman_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_handyman_access_wallet() from public, anon, authenticated;

drop trigger if exists create_handyman_access_wallet_after_profile_insert on public.profiles;
create trigger create_handyman_access_wallet_after_profile_insert
  after insert on public.profiles
  for each row
  execute function public.create_handyman_access_wallet();

-- Initialise wallets for handymen who registered before this migration.
insert into public.handyman_access_wallets (handyman_id, balance_zar)
select p.id, 0
from public.profiles p
where p.role = 'handyman'
on conflict (handyman_id) do nothing;

commit;
