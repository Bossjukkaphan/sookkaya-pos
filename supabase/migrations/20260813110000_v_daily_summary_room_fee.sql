-- เพิ่ม room_fee_total เข้า v_daily_summary เพื่อให้การ์ดรายรับแยกค่าห้องสปา
-- ออกจากมูลค่าเต็มตามเมนูได้ โดยยังอ่านยอดรวมจาก view (ห้ามบวกจากแถวดิบ — เพดาน 1,000 แถว)
--
-- คอลัมน์เดิมหกตัวอยู่ครบและเรียงลำดับเดิม เพิ่มตัวที่เจ็ดต่อท้าย
-- ยอด volume / net_revenue / cash_in ไม่ขยับ เพราะค่าห้องรวมอยู่ใน net_amount อยู่แล้ว

create or replace view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sales.sale_date,
    count(*) as sessions,
    sum(sales.net_amount) as volume,
    sum(coalesce(sales.revenue_recognize, sales.net_amount)) as net_revenue,
    sum(sales.discount) as discount_total,
    sum(coalesce(sales.room_fee, 0)) as room_fee_total
  from sales
  group by sales.sale_date
), topup_day as (
  select
    member_topups.topup_date,
    sum(member_topups.cash_received) as topup_cash
  from member_topups
  group by member_topups.topup_date
), pay_day as (
  select
    v_bill_payments.received_date as sale_date,
    sum(v_bill_payments.amount) as sales_cash
  from v_bill_payments
  group by v_bill_payments.received_date
)
select
  coalesce(s.sale_date, t.topup_date, p.sale_date) as sale_date,
  coalesce(s.sessions, 0::bigint) as sessions,
  coalesce(s.volume, 0::numeric) as volume,
  coalesce(s.net_revenue, 0::numeric) as net_revenue,
  coalesce(s.discount_total, 0::numeric) as discount_total,
  (coalesce(p.sales_cash, 0::numeric) + coalesce(t.topup_cash, 0::numeric)) as cash_in,
  -- วันที่มีแต่รายการเติมเงินไม่มีบิลขาย s จะเป็น null ทั้งแถว ต้อง coalesce เป็น 0
  coalesce(s.room_fee_total, 0::numeric) as room_fee_total
from sales_day s
  full join topup_day t on t.topup_date = s.sale_date
  full join pay_day p on p.sale_date = coalesce(s.sale_date, t.topup_date);
