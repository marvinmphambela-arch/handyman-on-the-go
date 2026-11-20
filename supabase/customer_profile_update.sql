-- Allow customers to edit only their own name and phone number.
-- Email remains managed by Supabase Auth; role and account controls stay protected.
drop policy if exists "Customers can update own personal details" on public.profiles;
create policy "Customers can update own personal details"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id and role = 'customer')
  with check (auth.uid() = id and role = 'customer');

grant update (full_name, phone)
  on public.profiles to authenticated;
