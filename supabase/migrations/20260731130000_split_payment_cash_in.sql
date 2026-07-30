-- บิลแบ่งชำระ (payment_method = ช่องทางเงินจริง + credit_used > 0) ทำให้ sales_cash เดิม
-- (sum ยกเว้นแถว Member Credit ทั้งแถว) นับเงินเครดิตที่แถมในบิลนั้นเป็นเงินสดเข้าไปด้วย
-- สูตรใหม่หักเฉพาะส่วน credit_used ออกจากทุกแถว แทนที่จะข้ามทั้งแถวเมื่อเป็น Member Credit
--   sales_cash = sum(net_amount − credit_used)
-- คงตัวบนข้อมูลเก่า (พิสูจน์บน production แล้ว): บิล Member Credit เดิม credit_used = net_amount
-- เป๊ะ (ได้ 0) และบิลปกติเดิม credit_used = 0 (ไม่หักอะไร) จึงเท่าเดิมทุกบิตสำหรับข้อมูลก่อนมีบิลแบ่งชำระ
--
-- นิยามที่เหลือ copy มาจาก 20260720090414_create_analytics_views.sql ทั้งก้อน โดยเปลี่ยนชื่อคอลัมน์
-- gross_sales -> volume ให้ตรงกับที่ 20260722000000_rename_gross_sales_to_volume.sql เปลี่ยนไว้แล้ว
-- (ต้องใส่ security_invoker ซ้ำทุกครั้งที่ create or replace เพราะ Postgres ล้าง reloptions ทิ้ง)
create or replace view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sale_date,
    count(*)                                                          as sessions,
    sum(net_amount)                                                   as volume,
    sum(coalesce(revenue_recognize, net_amount))                      as net_revenue,
    sum(discount)                                                     as discount_total,
    sum(net_amount - coalesce(credit_used, 0))                        as sales_cash
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
  coalesce(s.volume, 0)                                  as volume,
  coalesce(s.net_revenue, 0)                             as net_revenue,
  coalesce(s.discount_total, 0)                          as discount_total,
  coalesce(s.sales_cash, 0) + coalesce(t.topup_cash, 0)  as cash_in
from sales_day s
full outer join topup_day t on t.topup_date = s.sale_date;
