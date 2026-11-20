-- Admin-only, read-only search for jobs and their booking/payment context.
-- Does not expose street addresses or permit any booking/payment changes.

begin;

create or replace function public.admin_search_jobs_bookings(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  job_id uuid,
  title text,
  description text,
  service_category text,
  job_status text,
  customer_name text,
  customer_phone text,
  handyman_name text,
  handyman_phone text,
  suburb text,
  city text,
  province text,
  created_at timestamptz,
  accepted_offer_amount_zar integer,
  offer_count integer,
  payment_method text,
  payment_status text,
  paid_amount_zar bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(p_search), '');
  v_status text := nullif(btrim(p_status), '');
begin
  if auth.uid() is null or not public.is_hgo_admin() then
    raise exception 'Only an administrator can search jobs and bookings.';
  end if;

  if v_status is not null and v_status not in (
    'open', 'offer_selected', 'confirmed', 'in_progress',
    'completed', 'cancelled', 'disputed'
  ) then
    raise exception 'Choose a valid job or booking status.';
  end if;

  return query
  select
    j.id,
    j.title,
    j.description,
    sc.name,
    j.status::text,
    customer.full_name,
    customer.phone,
    handyman.full_name,
    handyman.phone,
    j.suburb,
    j.city,
    j.province,
    j.created_at,
    accepted.amount_zar,
    coalesce(offers.total, 0)::integer,
    j.payment_method,
    payments.statuses,
    coalesce(payments.paid_total, 0)::bigint
  from public.jobs j
  join public.service_categories sc on sc.id = j.service_category_id
  join public.profiles customer on customer.id = j.customer_id
  left join lateral (
    select o.handyman_id, o.amount_zar
    from public.job_offers o
    where o.job_id = j.id
      and o.status = 'accepted'::public.offer_status
    order by o.created_at desc
    limit 1
  ) accepted on true
  left join public.profiles handyman on handyman.id = accepted.handyman_id
  left join lateral (
    select count(*) as total
    from public.job_offers o
    where o.job_id = j.id
  ) offers on true
  left join lateral (
    select
      string_agg(distinct cp.status, ', ' order by cp.status) as statuses,
      sum(cp.amount_zar) filter (where cp.status = 'paid') as paid_total
    from public.customer_job_payments cp
    where cp.job_id = j.id
  ) payments on true
  where (v_status is null or j.status::text = v_status)
    and (
      v_search is null
      or j.title ilike '%' || v_search || '%'
      or j.description ilike '%' || v_search || '%'
      or customer.full_name ilike '%' || v_search || '%'
      or coalesce(customer.phone, '') ilike '%' || v_search || '%'
      or coalesce(handyman.full_name, '') ilike '%' || v_search || '%'
      or coalesce(handyman.phone, '') ilike '%' || v_search || '%'
      or j.id::text ilike '%' || v_search || '%'
    )
  order by j.created_at desc, j.id
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_search_jobs_bookings(text, text, integer, integer) from public, anon;
grant execute on function public.admin_search_jobs_bookings(text, text, integer, integer) to authenticated;

commit;
