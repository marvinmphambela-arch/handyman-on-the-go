-- Secure, idempotent posting of a verified Paystack Access Wallet top-up.
begin;

create unique index if not exists handyman_wallet_payment_reference_unique
  on public.handyman_access_wallet_transactions (payment_reference)
  where payment_reference is not null;

create or replace function public.post_verified_handyman_topup(
  p_handyman_id uuid,
  p_reference text,
  p_amount_zar integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.handyman_access_wallet_transactions%rowtype;
  v_balance integer;
begin
  if p_handyman_id is null or p_reference is null or length(p_reference) < 8
     or p_amount_zar < 100 then
    raise exception 'Invalid top-up details';
  end if;

  select * into v_transaction
  from public.handyman_access_wallet_transactions
  where payment_reference = p_reference
    and handyman_id = p_handyman_id
    and transaction_type = 'top_up'
  for update;

  if not found then
    raise exception 'Top-up reference not found';
  end if;

  if v_transaction.amount_zar <> p_amount_zar then
    raise exception 'Top-up amount does not match';
  end if;

  if v_transaction.status = 'posted' then
    select balance_zar into v_balance
    from public.handyman_access_wallets
    where handyman_id = p_handyman_id;
    return coalesce(v_balance, 0);
  end if;

  if v_transaction.status <> 'pending' then
    raise exception 'Top-up is not pending';
  end if;

  insert into public.handyman_access_wallets (handyman_id, balance_zar)
  values (p_handyman_id, 0)
  on conflict (handyman_id) do nothing;

  update public.handyman_access_wallets
  set balance_zar = balance_zar + p_amount_zar,
      updated_at = now()
  where handyman_id = p_handyman_id
  returning balance_zar into v_balance;

  update public.handyman_access_wallet_transactions
  set status = 'posted', posted_at = now()
  where id = v_transaction.id;

  return v_balance;
end;
$$;

revoke all on function public.post_verified_handyman_topup(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.post_verified_handyman_topup(uuid, text, integer) to service_role;

commit;
