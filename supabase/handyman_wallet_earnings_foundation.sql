-- Handyman On The Go: Access Wallet, earnings and payout foundation.
-- This migration creates accounting records only. It does not process payments,
-- credit top-ups, deduct commissions, or execute withdrawals.
begin;

create table if not exists public.platform_financial_settings (
  id boolean primary key default true check (id = true),
  commission_percent numeric(5,2) not null default 10.00 check (commission_percent >= 0 and commission_percent <= 100),
  minimum_access_wallet_topup_zar integer not null default 100 check (minimum_access_wallet_topup_zar >= 1),
  minimum_offer_wallet_balance_zar integer not null default 10 check (minimum_offer_wallet_balance_zar >= 0),
  instant_withdrawal_percent numeric(5,2) not null default 2.00 check (instant_withdrawal_percent >= 0 and instant_withdrawal_percent <= 100),
  instant_withdrawal_minimum_fee_zar integer not null default 5 check (instant_withdrawal_minimum_fee_zar >= 0),
  weekly_payout_day smallint not null default 1 check (weekly_payout_day between 0 and 6),
  updated_at timestamptz not null default now()
);

insert into public.platform_financial_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.handyman_access_wallets (
  handyman_id uuid primary key references public.profiles(id) on delete cascade,
  balance_zar integer not null default 0 check (balance_zar >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.handyman_access_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references public.profiles(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('top_up', 'commission_debit', 'refund', 'admin_adjustment')),
  direction text not null check (direction in ('credit', 'debit')),
  amount_zar integer not null check (amount_zar > 0),
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed', 'reversed')),
  payment_reference text,
  description text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create table if not exists public.handyman_earnings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id),
  handyman_id uuid not null references public.profiles(id),
  labour_amount_zar integer not null check (labour_amount_zar >= 0),
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  commission_amount_zar integer not null check (commission_amount_zar >= 0),
  net_earnings_zar integer not null check (net_earnings_zar >= 0),
  payment_method text not null check (payment_method in ('platform', 'direct_eft')),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'held', 'available', 'paid', 'disputed', 'cancelled')),
  completed_at timestamptz not null default now(),
  available_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (commission_amount_zar + net_earnings_zar = labour_amount_zar)
);

create table if not exists public.handyman_payout_requests (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references public.profiles(id),
  payout_type text not null check (payout_type in ('weekly', 'instant')),
  gross_amount_zar integer not null check (gross_amount_zar > 0),
  fee_amount_zar integer not null default 0 check (fee_amount_zar >= 0),
  net_amount_zar integer not null check (net_amount_zar >= 0),
  status text not null default 'requested' check (status in ('requested', 'processing', 'paid', 'failed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  check (fee_amount_zar + net_amount_zar = gross_amount_zar)
);

create index if not exists handyman_access_wallet_transactions_owner_date_idx
  on public.handyman_access_wallet_transactions (handyman_id, created_at desc);
create index if not exists handyman_earnings_owner_status_idx
  on public.handyman_earnings (handyman_id, status, created_at desc);
create index if not exists handyman_payout_requests_owner_date_idx
  on public.handyman_payout_requests (handyman_id, requested_at desc);

alter table public.platform_financial_settings enable row level security;
alter table public.handyman_access_wallets enable row level security;
alter table public.handyman_access_wallet_transactions enable row level security;
alter table public.handyman_earnings enable row level security;
alter table public.handyman_payout_requests enable row level security;

drop policy if exists "Authenticated users can read financial settings" on public.platform_financial_settings;
create policy "Authenticated users can read financial settings"
  on public.platform_financial_settings for select to authenticated
  using (true);

drop policy if exists "Admins can update financial settings" on public.platform_financial_settings;
create policy "Admins can update financial settings"
  on public.platform_financial_settings for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

drop policy if exists "Handymen can read own access wallet" on public.handyman_access_wallets;
create policy "Handymen can read own access wallet"
  on public.handyman_access_wallets for select to authenticated
  using (handyman_id = auth.uid());

drop policy if exists "Handymen can read own wallet transactions" on public.handyman_access_wallet_transactions;
create policy "Handymen can read own wallet transactions"
  on public.handyman_access_wallet_transactions for select to authenticated
  using (handyman_id = auth.uid());

drop policy if exists "Handymen can read own earnings" on public.handyman_earnings;
create policy "Handymen can read own earnings"
  on public.handyman_earnings for select to authenticated
  using (handyman_id = auth.uid());

drop policy if exists "Handymen can read own payout requests" on public.handyman_payout_requests;
create policy "Handymen can read own payout requests"
  on public.handyman_payout_requests for select to authenticated
  using (handyman_id = auth.uid());

drop policy if exists "Admins can read all access wallets" on public.handyman_access_wallets;
create policy "Admins can read all access wallets"
  on public.handyman_access_wallets for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can read all wallet transactions" on public.handyman_access_wallet_transactions;
create policy "Admins can read all wallet transactions"
  on public.handyman_access_wallet_transactions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can read all handyman earnings" on public.handyman_earnings;
create policy "Admins can read all handyman earnings"
  on public.handyman_earnings for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins can read all payout requests" on public.handyman_payout_requests;
create policy "Admins can read all payout requests"
  on public.handyman_payout_requests for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Clients can read their own records and settings. All financial writes are
-- intentionally reserved for trusted server-side/payment-provider workflows.
grant select on public.platform_financial_settings to authenticated;
grant select on public.handyman_access_wallets to authenticated;
grant select on public.handyman_access_wallet_transactions to authenticated;
grant select on public.handyman_earnings to authenticated;
grant select on public.handyman_payout_requests to authenticated;

commit;
