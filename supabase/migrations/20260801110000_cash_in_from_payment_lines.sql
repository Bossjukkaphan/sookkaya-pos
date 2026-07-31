-- v_daily_summary: sales_cash ย้ายจากสูตร net_amount − credit_used ต่อแถวขาย
-- มาอ่านจากบรรทัดชำระจริง (v_bill_payments) group ตาม received_date แทน
--
-- ทำไม: บิลที่รับเงินช้ากว่าวันขาย (ค้างรับ addBillPayment ทีหลัง) ต้องนับเงินเข้าที่
-- "วันที่รับจริง" ไม่ใช่วันบิล ตัวสูตรเดิม sum(net_amount − credit_used) group by sale_date
-- ผูกเงินเข้ากับวันบิลเสมอ ผิดจากเงินจริงในลิ้นชัก/บัญชีเมื่อมีบิลค้างรับ
--
-- v_bill_payments เป็น union ของบรรทัดชำระจริง (bill_payments) + บรรทัดสังเคราะห์จากบิลเก่า/
-- Gowabi/KOL/เครดิตเต็มที่ยังไม่ track (สังเคราะห์ด้วย received_date = sale_date และสูตร
-- net_amount − credit_used เดิมเป๊ะ) ดังนั้น sum(v_bill_payments.amount) group by received_date
-- บนข้อมูลก่อนมีฟีเจอร์นี้ (ทุกบิล payments_tracked=false) ต้องเท่ากับสูตรเดิมทุกบาททุกวัน
--
-- คงตัวบนข้อมูลเก่า (พิสูจน์เหมือนรอบก่อน): บิลเก่าทุกใบสังเคราะห์เป็นบรรทัดเดียว received_date=sale_date
-- จึงถูก group เข้าวันเดียวกับที่สูตรเดิมเคยนับ ไม่มีวันไหนเลื่อน — sum เท่าเดิมเป๊ะ
--
-- นิยามที่เหลือ copy มาจาก 20260731130000_split_payment_cash_in.sql (เวอร์ชันล่าสุด) ทั้งก้อน
-- (ต้องใส่ security_invoker ซ้ำทุกครั้งที่ create or replace เพราะ Postgres ล้าง reloptions ทิ้ง)
create or replace view public.v_daily_summary
with (security_invoker = true) as
with sales_day as (
  select
    sale_date,
    count(*)                                                          as sessions,
    sum(net_amount)                                                   as volume,
    sum(coalesce(revenue_recognize, net_amount))                      as net_revenue,
    sum(discount)                                                     as discount_total
  from public.sales
  group by sale_date
),
topup_day as (
  select topup_date, sum(cash_received) as topup_cash
  from public.member_topups
  group by topup_date
),
pay_day as (
  -- เงินจริงตามบรรทัดชำระ นับวันที่รับจริง (received_date) ไม่ใช่วันบิล
  select received_date as sale_date, sum(amount) as sales_cash
  from public.v_bill_payments
  group by received_date
)
-- three-way full outer join: วันหนึ่งอาจมีแต่บรรทัดชำระ (บิลค้างรับที่มาจ่ายทีหลังในวันที่
-- ไม่มีบิลใหม่เกิดเลย) แต่ไม่มีทั้งยอดขายวันนั้นและเงินเติมสมาชิกวันนั้น — full outer join
-- ทั้งสามตัวกันวันแบบนี้หลุดออกจากรายงาน (ถ้าใช้ left join จาก sales_day วันนี้จะหายไปเงียบๆ)
-- เชื่อม pay_day ทีหลังด้วย coalesce(s.sale_date, t.topup_date) เพราะ full outer join ต่อกัน
-- เป็นลำดับ ทำให้ pay_day จับคู่ได้กับวันที่มาจาก sales_day หรือ topup_day ฝั่งใดก็ได้
select
  coalesce(s.sale_date, t.topup_date, p.sale_date)       as sale_date,
  coalesce(s.sessions, 0)                                as sessions,
  coalesce(s.volume, 0)                                  as volume,
  coalesce(s.net_revenue, 0)                             as net_revenue,
  coalesce(s.discount_total, 0)                          as discount_total,
  coalesce(p.sales_cash, 0) + coalesce(t.topup_cash, 0)  as cash_in
from sales_day s
full outer join topup_day t on t.topup_date = s.sale_date
full outer join pay_day p on p.sale_date = coalesce(s.sale_date, t.topup_date);
