-- Handyman On The Go: initial database foundation.
-- Apply in Supabase SQL Editor after reviewing. Production job writes remain disabled
-- until relationship-aware RLS and transactional offer acceptance are implemented.
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('customer', 'handyman', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.job_status as enum ('open', 'offer_selected', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.offer_status as enum ('pending', 'countered', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  service_category_id uuid not null references public.service_categories(id),
  title text not null,
  description text not null,
  suburb text,
  city text not null default 'Johannesburg',
  province text not null default 'Gauteng',
  latitude double precision,
  longitude double precision,
  customer_offer_zar integer check (customer_offer_zar is null or customer_offer_zar >= 0),
  urgency text not null default 'standard' check (urgency in ('standard','urgent','emergency')),
  status public.job_status not null default 'open',
  created_at timestamptz not null default now()
);
create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  handyman_id uuid not null references public.profiles(id),
  amount_zar integer not null check (amount_zar >= 0),
  message text,
  estimated_arrival_minutes integer,
  status public.offer_status not null default 'pending',
  created_at timestamptz not null default now()
);
create table if not exists public.fairprice_catalogue (
  id uuid primary key default gen_random_uuid(),
  service_category_id uuid not null references public.service_categories(id),
  region text not null default 'Gauteng',
  complexity text not null check (complexity in ('simple','standard','complex')),
  hourly_rate_zar integer not null check (hourly_rate_zar >= 0),
  callout_fee_zar integer not null default 0 check (callout_fee_zar >= 0),
  travel_fee_zar integer not null default 0 check (travel_fee_zar >= 0),
  emergency_multiplier numeric(5,2) not null default 1.0 check (emergency_multiplier >= 1),
  illustrative boolean not null default true,
  active boolean not null default false,
  version text not null default 'draft',
  updated_at timestamptz not null default now()
);

-- Create a profile automatically after signup. Public signup may request only
-- customer or handyman; admin accounts must be provisioned by a trusted operator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'customer');
  if requested_role not in ('customer', 'handyman') then
    requested_role := 'customer';
  end if;
  insert into public.profiles (id, role, full_name)
  values (new.id, requested_role::public.app_role,
          coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.jobs enable row level security;
alter table public.job_offers enable row level security;
alter table public.fairprice_catalogue enable row level security;

drop policy if exists "Profiles can read own profile" on public.profiles;
create policy "Profiles can read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);
-- Deliberately no client-side profile UPDATE policy: role and identity fields
-- cannot be changed by a signed-in user. Trusted admin workflows come later.
drop policy if exists "Profiles can update own profile" on public.profiles;

drop policy if exists "Active services are readable" on public.service_categories;
create policy "Active services are readable"
  on public.service_categories for select to anon, authenticated
  using (active = true);
drop policy if exists "Active FairPrice entries are readable" on public.fairprice_catalogue;
create policy "Active FairPrice entries are readable"
  on public.fairprice_catalogue for select to anon, authenticated
  using (active = true);

-- Job and offer writes remain blocked until relationship-aware policies and
-- atomic offer acceptance are implemented and tested.
