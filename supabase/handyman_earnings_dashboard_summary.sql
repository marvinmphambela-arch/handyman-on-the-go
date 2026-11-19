-- Accurate handyman earnings summary without relying on the dashboard's recent-job limit.
-- The function is restricted to the signed-in handyman's own records.

create or replace function public.get_handyman_earnings_summary(p_handyman_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or auth.uid() <> p_handyman_id then
    raise exception 'Not authorised to view these earnings';
  end if;

  v_week_start := date_trunc('week', now() at time zone 'Africa/Johannesburg')
                  at time zone 'Africa/Johannesburg';
  v_week_end := v_week_start + interval '1 week';

  select jsonb_build_object(
    'platform_held_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform' and status in ('held', 'available')
      ), 0),
    'platform_available_zar',
      coalesce((
        select sum(greatest(e2.net_earnings_zar - e2.paid_out_zar - e2.payout_reserved_zar, 0))
        from public.handyman_earnings e2
        join public.customer_job_payments cp on cp.job_id = e2.job_id
        join public.jobs j on j.id = e2.job_id
        where e2.handyman_id = p_handyman_id
          and e2.payment_method = 'platform'
          and e2.status in ('held', 'available')
          and cp.status = 'paid'
          and j.status::text = 'completed'
          and e2.net_earnings_zar > e2.paid_out_zar + e2.payout_reserved_zar
      ), 0),
    'platform_paid_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform' and status = 'paid'
      ), 0),
    'direct_payment_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'direct_eft'
      ), 0),
    'week_start', v_week_start,
    'week_end', v_week_end,
    'week_total_zar',
      coalesce(sum(net_earnings_zar) filter (
        where completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'week_platform_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'platform'
          and completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'week_direct_zar',
      coalesce(sum(net_earnings_zar) filter (
        where payment_method = 'direct_eft'
          and completed_at >= v_week_start and completed_at < v_week_end
      ), 0),
    'daily',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', d.day_start,
          'total_zar', coalesce(x.total_zar, 0),
          'platform_zar', coalesce(x.platform_zar, 0),
          'direct_zar', coalesce(x.direct_zar, 0)
        ) order by d.day_start)
        from generate_series(v_week_start, v_week_end - interval '1 day', interval '1 day')
          as d(day_start)
        left join lateral (
          select
            sum(e.net_earnings_zar) as total_zar,
            sum(e.net_earnings_zar) filter (where e.payment_method = 'platform') as platform_zar,
            sum(e.net_earnings_zar) filter (where e.payment_method = 'direct_eft') as direct_zar
          from public.handyman_earnings e
          where e.handyman_id = p_handyman_id
            and e.completed_at >= d.day_start
            and e.completed_at < d.day_start + interval '1 day'
        ) x on true
      ), '[]'::jsonb)
  )
  into v_result
  from public.handyman_earnings e
  where e.handyman_id = p_handyman_id;

  return v_result;
end;
$$;

revoke all on function public.get_handyman_earnings_summary(uuid) from public, anon;
grant execute on function public.get_handyman_earnings_summary(uuid) to authenticated;
