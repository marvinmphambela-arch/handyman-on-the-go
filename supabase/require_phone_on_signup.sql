-- Save the required phone number supplied during new customer/handyman signup.
-- Existing profiles and their phone values are not changed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  supplied_phone text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'customer');
  if requested_role not in ('customer', 'handyman') then
    requested_role := 'customer';
  end if;

  supplied_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    requested_role::public.app_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    supplied_phone
  );

  return new;
end;
$$;
