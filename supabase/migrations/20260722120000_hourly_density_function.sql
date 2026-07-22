-- ความหนาแน่นรายชั่วโมงแบบเลือกช่วงวันได้ — view เดิม (v_hourly_density) ใส่พารามิเตอร์ไม่ได้
-- สูตรรายได้ต้องเหมือน view เดิมทุกประการ: coalesce(revenue_recognize, net_amount)
create or replace function public.hourly_density(from_date date default null)
returns table (weekday int, hour int, sessions bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(dow  from s.sale_date)::int as weekday,
    extract(hour from s.sale_time)::int as hour,
    count(*)                            as sessions,
    round(sum(coalesce(s.revenue_recognize, s.net_amount))) as revenue
  from public.sales s
  where s.sale_time is not null
    and (from_date is null or s.sale_date >= from_date)
  group by 1, 2
$$;
