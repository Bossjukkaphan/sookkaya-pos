-- 1) ความหนาแน่นชั่วโมง × วันในสัปดาห์
create view public.v_hourly_density
with (security_invoker = true) as
select
  extract(dow  from s.sale_date)::int as weekday,
  extract(hour from s.sale_time)::int as hour,
  count(*)                            as sessions,
  round(sum(coalesce(s.revenue_recognize, s.net_amount))) as revenue
from public.sales s
where s.sale_time is not null
group by 1, 2;

-- 2) ROI ต่อโปรโมชั่น
create view public.v_promo_roi
with (security_invoker = true) as
with used as (
  select p.id as promotion_id, p.name as promotion_name, p.kind,
         s.customer_id, s.sale_date, s.discount,
         coalesce(s.revenue_recognize, s.net_amount) as revenue
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p        on p.id = a.promotion_id
),
first_use as (
  select promotion_id, customer_id, min(sale_date) as first_date
  from used where customer_id is not null
  group by 1, 2
),
returned as (
  select f.promotion_id, count(*) as returning_customers
  from first_use f
  where exists (
    select 1 from public.sales s2
    where s2.customer_id = f.customer_id and s2.sale_date > f.first_date
  )
  group by 1
)
select
  u.promotion_id,
  u.promotion_name,
  u.kind,
  count(*)                        as uses,
  round(sum(u.discount))          as discount_given,
  round(sum(u.revenue))           as revenue,
  count(distinct u.customer_id)   as customers,
  coalesce(r.returning_customers, 0) as returning_customers,
  min(u.sale_date)                as first_used,
  max(u.sale_date)                as last_used
from used u
left join returned r on r.promotion_id = u.promotion_id
group by u.promotion_id, u.promotion_name, u.kind, r.returning_customers;

-- 3) LTV ต่อลูกค้า
create view public.v_customer_ltv
with (security_invoker = true) as
select
  c.id            as customer_id,
  c.name,
  c.nickname,
  c.phone,
  c.customer_type,
  count(s.id)     as visits,
  round(sum(coalesce(s.revenue_recognize, s.net_amount))) as lifetime_value,
  round(avg(coalesce(s.revenue_recognize, s.net_amount))) as avg_ticket,
  min(s.sale_date) as first_visit,
  max(s.sale_date) as last_visit
from public.customers c
join public.sales s on s.customer_id = c.id
group by c.id, c.name, c.nickname, c.phone, c.customer_type;
