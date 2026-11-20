-- Add real Supabase email-confirmation status to the admin account directory.
-- Email confirmation is independent of handyman identity verification.

begin;

drop function if exists public.admin_list_managed_accounts(text);

create function public.admin_list_managed_accounts(p_role text default null)
returns table (
  id uuid,
  role text,
  full_name text,
  phone text,
  created_at timestamptz,
  account_status text,
  verification_status text,
  email_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can view managed accounts.';
  end if;
  if p_role is not null and p_role not in ('customer', 'handyman') then
    raise exception 'Choose customers or handymen.';
  end if;

  return query
  select
    p.id,
    p.role::text,
    p.full_name,
    p.phone,
    p.created_at,
    p.account_status,
    p.verification_status,
    (u.email_confirmed_at is not null) as email_verified
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.role in ('customer'::public.app_role, 'handyman'::public.app_role)
    and (p_role is null or p.role::text = p_role)
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_managed_accounts(text) from public, anon;
grant execute on function public.admin_list_managed_accounts(text) to authenticated;

commit;
