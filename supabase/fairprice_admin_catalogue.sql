-- FairPrice catalogue administration
-- Admin-only rate management. Customers and handymen may read active rates,
-- but only verified administrators can create, edit, or activate catalogue entries.

begin;

alter table public.fairprice_catalogue
  alter column hourly_rate_zar set not null,
  alter column callout_fee_zar set not null,
  alter column travel_fee_zar set not null,
  alter column emergency_multiplier set not null,
  alter column illustrative set not null,
  alter column active set not null,
  alter column version set not null;

-- No direct client writes: all catalogue changes go through admin-checked RPCs.
revoke insert, update, delete, truncate, references, trigger
  on table public.fairprice_catalogue from anon, authenticated;
grant select on table public.fairprice_catalogue to anon, authenticated;

create or replace function public.admin_list_fairprice_catalogue()
returns table (
  id uuid,
  service_category_id uuid,
  service_name text,
  region text,
  complexity text,
  hourly_rate_zar integer,
  callout_fee_zar integer,
  travel_fee_zar integer,
  emergency_multiplier numeric,
  illustrative boolean,
  active boolean,
  version text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can view FairPrice catalogue settings.';
  end if;

  return query
  select f.id, f.service_category_id, s.name, f.region, f.complexity,
         f.hourly_rate_zar, f.callout_fee_zar, f.travel_fee_zar,
         f.emergency_multiplier, f.illustrative, f.active, f.version, f.updated_at
  from public.fairprice_catalogue f
  join public.service_categories s on s.id = f.service_category_id
  order by s.name, f.region, f.complexity, f.updated_at desc;
end;
$$;

create or replace function public.admin_save_fairprice_rate(
  p_id uuid,
  p_service_category_id uuid,
  p_region text,
  p_complexity text,
  p_hourly_rate_zar integer,
  p_callout_fee_zar integer,
  p_travel_fee_zar integer,
  p_emergency_multiplier numeric,
  p_version text,
  p_illustrative boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can change FairPrice catalogue settings.';
  end if;
  if p_service_category_id is null or not exists (
    select 1 from public.service_categories
    where id = p_service_category_id and active = true
  ) then
    raise exception 'Choose an active service category.';
  end if;
  if nullif(btrim(p_region), '') is null or char_length(btrim(p_region)) > 100 then
    raise exception 'Enter a valid region.';
  end if;
  if p_complexity not in ('simple', 'standard', 'complex') then
    raise exception 'Choose a valid job complexity.';
  end if;
  if p_hourly_rate_zar is null or p_hourly_rate_zar <= 0
     or p_callout_fee_zar is null or p_callout_fee_zar < 0
     or p_travel_fee_zar is null or p_travel_fee_zar < 0
     or p_emergency_multiplier is null or p_emergency_multiplier < 1
     or p_emergency_multiplier > 5 then
    raise exception 'Enter valid rates and an emergency multiplier between 1 and 5.';
  end if;
  if nullif(btrim(p_version), '') is null or char_length(btrim(p_version)) > 40 then
    raise exception 'Enter a catalogue version (up to 40 characters).';
  end if;

  if p_id is null then
    insert into public.fairprice_catalogue (
      service_category_id, region, complexity, hourly_rate_zar,
      callout_fee_zar, travel_fee_zar, emergency_multiplier,
      illustrative, active, version, updated_at
    ) values (
      p_service_category_id, btrim(p_region), p_complexity, p_hourly_rate_zar,
      p_callout_fee_zar, p_travel_fee_zar, p_emergency_multiplier,
      coalesce(p_illustrative, true), false, btrim(p_version), now()
    ) returning id into v_id;
  else
    update public.fairprice_catalogue
    set service_category_id = p_service_category_id,
        region = btrim(p_region),
        complexity = p_complexity,
        hourly_rate_zar = p_hourly_rate_zar,
        callout_fee_zar = p_callout_fee_zar,
        travel_fee_zar = p_travel_fee_zar,
        emergency_multiplier = p_emergency_multiplier,
        illustrative = coalesce(p_illustrative, true),
        active = false,
        version = btrim(p_version),
        updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'FairPrice catalogue entry not found.';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_set_fairprice_rate_active(
  p_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category uuid;
  v_region text;
  v_complexity text;
  v_illustrative boolean;
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can activate FairPrice rates.';
  end if;
  if p_active is null then
    raise exception 'Choose whether to activate or deactivate this rate.';
  end if;

  select service_category_id, region, complexity, illustrative
  into v_category, v_region, v_complexity, v_illustrative
  from public.fairprice_catalogue
  where id = p_id
  for update;

  if not found then
    raise exception 'FairPrice catalogue entry not found.';
  end if;
  if p_active and v_illustrative then
    raise exception 'Illustrative rates cannot be activated. Edit the entry and mark it as verified first.';
  end if;

  if p_active then
    update public.fairprice_catalogue
    set active = false, updated_at = now()
    where service_category_id = v_category
      and lower(region) = lower(v_region)
      and complexity = v_complexity
      and active = true
      and id <> p_id;
  end if;

  update public.fairprice_catalogue
  set active = p_active, updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.admin_list_fairprice_catalogue() from public, anon;
revoke all on function public.admin_save_fairprice_rate(uuid, uuid, text, text, integer, integer, integer, numeric, text, boolean) from public, anon;
revoke all on function public.admin_set_fairprice_rate_active(uuid, boolean) from public, anon;
grant execute on function public.admin_list_fairprice_catalogue() to authenticated;
grant execute on function public.admin_save_fairprice_rate(uuid, uuid, text, text, integer, integer, integer, numeric, text, boolean) to authenticated;
grant execute on function public.admin_set_fairprice_rate_active(uuid, boolean) to authenticated;

commit;
