-- ค่ามือรายวันต่อหมอ 1 คน — แหล่งความจริงเดียวของตรรกะประกันมือ
--
-- กฎสำคัญ 2 ข้อที่ฝังไว้ที่นี่ที่เดียว:
--   1. ประกันใช้เฉพาะวันที่หมอเข้างานจริง (มีอย่างน้อย 1 เซสชัน)
--   2. รายการที่ไม่ได้ระบุหมอ ไม่นับเป็น "วันทำงาน" จึงไม่ได้ประกัน
--      (ก่อนหน้านี้หน้ารายงานให้ประกันกับรายการพวกนี้ รวมค่ามือปลอม 3,500 บาท)
create view public.v_therapist_daily
with (security_invoker = true) as
select
  s.sale_date                                                         as work_date,
  s.therapist_id,
  count(*)                                                            as sessions,
  sum(coalesce(s.commission, 0))                                      as total_commission,
  sum(s.request_fee)                                                  as request_fee,
  g.guarantee                                                         as guarantee_amount,
  greatest(sum(coalesce(s.commission, 0)), g.guarantee)               as net_commission,
  greatest(sum(coalesce(s.commission, 0)), g.guarantee)
    + sum(s.request_fee)                                              as total_income,
  case when sum(coalesce(s.commission, 0)) < g.guarantee
       then 'ใช้ประกัน' else 'ค่ามือจริง' end                          as status,
  coalesce(d.is_paid, false)                                          as is_paid
from public.sales s
cross join lateral (
  select coalesce((select value::numeric from public.settings
                   where key = 'min_commission_guarantee'), 500) as guarantee
) g
left join public.therapist_daily_commission d
  on d.work_date = s.sale_date and d.therapist_id = s.therapist_id
where s.therapist_id is not null
group by s.sale_date, s.therapist_id, g.guarantee, d.is_paid;

-- ยอดขายรายวัน
--   net_revenue = รายได้ที่รับรู้ (ตัดส่วนโบนัสสมาชิกที่ไม่ใช่เงินจริงออกแล้ว)
--   cash_in     = เงินสดเข้าจริง = ยอดที่ไม่ใช่ Member Credit + เงินเติมสมาชิกวันนั้น
create view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sale_date,
    count(*)                                                          as sessions,
    sum(net_amount)                                                   as gross_sales,
    sum(coalesce(revenue_recognize, net_amount))                      as net_revenue,
    sum(discount)                                                     as discount_total,
    sum(case when payment_method = 'Member Credit' then 0
             else net_amount end)                                     as sales_cash
  from public.sales
  group by sale_date
),
topup_day as (
  select topup_date, sum(cash_received) as topup_cash
  from public.member_topups
  group by topup_date
)
select
  coalesce(s.sale_date, t.topup_date)                    as sale_date,
  coalesce(s.sessions, 0)                                as sessions,
  coalesce(s.gross_sales, 0)                             as gross_sales,
  coalesce(s.net_revenue, 0)                             as net_revenue,
  coalesce(s.discount_total, 0)                          as discount_total,
  coalesce(s.sales_cash, 0) + coalesce(t.topup_cash, 0)  as cash_in
from sales_day s
full outer join topup_day t on t.topup_date = s.sale_date;
