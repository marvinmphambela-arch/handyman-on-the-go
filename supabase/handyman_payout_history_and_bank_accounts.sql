-- Handyman On The Go: secure bank details and payout-history metadata.
-- This migration stores no plaintext bank account numbers and does not initiate transfers.
-- Bank account encryption/decryption and all writes must be performed by trusted server code.

begin;

create table if not exists public.handyman_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null unique references public.profiles(id) on delete cascade,
  bank_name text not null,
  bank_code text not null,
  account_holder_name text not null,
  account_type text not null check (account_type in ('current', 'savings', 'transmission')),
  account_number_ciphertext text not null,
  account_number_last4 text not null check (account_number_last4 ~ '^[0-9]{4}$'),
  paystack_recipient_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.handyman_bank_accounts is
  'Private payout destination details. Account numbers must be encrypted by trusted application code before storage.';
comment on column public.handyman_bank_accounts.account_number_ciphertext is
  'Application-encrypted account number; never store plaintext in this column.';
comment on column public.handyman_bank_accounts.paystack_recipient_code is
  'Paystack transfer recipient code created by trusted server-side integration.';

alter table public.handyman_payout_requests
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists bank_name_snapshot text,
  add column if not exists bank_code_snapshot text,
  add column if not exists account_holder_name_snapshot text,
  add column if not exists account_number_last4_snapshot text,
  add column if not exists paystack_recipient_code_snapshot text,
  add column if not exists transfer_reference text,
  add column if not exists transfer_code text,
  add column if not exists transfer_status text,
  add column if not exists transfer_failure_reason text;

alter table public.handyman_payout_requests
  add constraint handyman_payout_requests_period_range_check
  check (
    (period_start is null and period_end is null)
    or
    (period_start is not null and period_end is not null and period_end >= period_start)
  );

alter table public.handyman_payout_requests
  add constraint handyman_payout_requests_account_last4_check
  check (
    account_number_last4_snapshot is null
    or account_number_last4_snapshot ~ '^[0-9]{4}$'
  );

create unique index if not exists handyman_payout_requests_transfer_reference_uidx
  on public.handyman_payout_requests (transfer_reference)
  where transfer_reference is not null;

create index if not exists handyman_bank_accounts_owner_idx
  on public.handyman_bank_accounts (handyman_id);

alter table public.handyman_bank_accounts enable row level security;

-- No authenticated-user policies or grants are created for this table.
-- Supabase service_role bypasses RLS and is used only by trusted server-side code.
revoke all on public.handyman_bank_accounts from anon, authenticated;
grant all on public.handyman_bank_accounts to service_role;

commit;
