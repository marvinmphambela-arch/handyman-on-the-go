-- READ-ONLY preflight for instant payout safety hardening.
-- Run this in the Supabase SQL Editor BEFORE applying
-- instant_payout_safety_hardening.sql. It performs no writes.

-- 1) Required payout tables and columns.
with required as (
  select * from (values
    ('public.handyman_earnings', 'table'),
    ('public.handyman_payout_requests', 'table'),
    ('public.handyman_payout_request_earnings', 'table'),
    ('public.handyman_bank_accounts', 'table'),
    ('public.customer_job_payments', 'table'),
    ('public.jobs', 'table'),
    ('public.platform_financial_settings', 'table')
  ) as x(object_name, object_type)
)
select object_name, to_regclass(object_name) is not null as exists
from required
order by object_name;

select c.table_name, c.column_name, c.data_type, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and (
    (c.table_name = 'handyman_earnings' and c.column_name in
      ('payout_reserved_zar','paid_out_zar','available_at','handyman_id','payment_method','status'))
    or
    (c.table_name = 'handyman_payout_requests' and c.column_name in
      ('fee_amount_zar','net_amount_zar','transfer_reference','paystack_recipient_code_snapshot'))
    or
    (c.table_name = 'handyman_payout_request_earnings' and c.column_name in
      ('payout_request_id','earning_id','amount_zar'))
    or
    (c.table_name = 'handyman_bank_accounts' and c.column_name in
      ('handyman_id','is_active','paystack_recipient_code'))
  )
order by c.table_name, c.column_name;

-- 2) Both payout RPC overloads, if present, and their execution grants.
select
  p.oid::regprocedure as function_signature,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'request_instant_handyman_payout'
order by p.oid::regprocedure::text;

-- 3) Objects that depend on the obsolete UUID overload.
-- Expected result: zero rows. The migration intentionally uses DROP without CASCADE.
with target as (
  select to_regprocedure('public.request_instant_handyman_payout(uuid,integer)') as oid
)
select
  pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object,
  d.deptype
from pg_depend d
join target t
  on t.oid is not null
 and d.refclassid = 'pg_proc'::regclass
 and d.refobjid = t.oid
order by dependent_object;

-- 4) Check the core columns and payout constraints are present.
select
  to_regclass('public.handyman_earnings') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'handyman_earnings'
        and column_name = 'payout_reserved_zar'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'handyman_earnings'
        and column_name = 'paid_out_zar'
    ) as reservation_columns_ready,
  exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.handyman_earnings')
      and conname = 'handyman_earnings_payout_amounts_check'
  ) as reservation_balance_constraint_ready;
