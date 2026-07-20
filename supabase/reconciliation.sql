-- ตรวจตัวเลขในฐานข้อมูลกับ Excel เดิม — ต้องผ่านทุกข้อก่อนปิดงาน
-- รันแล้วดูคอลัมน์ result ต้องเป็น PASS ทั้งหมด
--
-- ค่าที่คาดหวังมาจากชีท 'รายจ่ายตามประเภท' และ 'Member Dashboard' ในไฟล์
-- Final_SOOKKAYA_บันทึกรับจ่าย_v15_Latest 3_5_69.xlsx
--
-- ถ้ามี FAIL แม้ข้อเดียว = มีบั๊กในสูตร ห้ามปิดงาน
with expected(check_name, expected_value) as (values
  ('net_revenue_2026_03', 174842),
  ('net_revenue_2026_04', 316123),
  ('net_revenue_2026_05', 286158),
  ('net_revenue_2026_06', 347018),
  -- ก.ค. ตรวจเฉพาะ 1-19 ซึ่งเป็นช่วงที่ไฟล์ Excel ครอบคลุม
  -- (ตั้งแต่ 20 ก.ค. เป็นต้นไปเป็นข้อมูลที่บันทึกผ่านแอป ยอดขยับทุกวัน
  --  ถ้าเอามารวมด้วย การตรวจจะ FAIL ทุกครั้งที่มีการขายใหม่)
  --
  -- Excel ระบุยอดทั้งเดือน 231,947 ค่าที่ถูกคือ 232,337 (ต่าง 390)
  -- สาเหตุ: ใบเสร็จ #97287-116 (5 ก.ค. · นวดแผนไทย 60 นาที · ปิ่น · QR Code · 390 บาท)
  -- ช่อง "รายได้ Recognize" ในชีทบันทึกขายเว้นว่างไว้ ทั้งที่รับเงินจริงผ่าน QR
  -- เป็นช่องโหว่ของสูตรใน Excel ไม่ใช่การตัดสินใจทางบัญชี — ฐานข้อมูลถูกกว่า
  ('net_revenue_2026_07_partial', 232337),
  ('member_credit_used',  209410),
  ('commission_2026_06',  140415),
  ('expenses_fixed_06',   104648),
  ('expenses_variable_06',125059),
  ('expenses_onetime_06',  28320),
  -- เฟส 2: กำไรสุทธิแบบ Excel (รายได้ที่รับรู้ − รายจ่ายที่จ่ายจริงทั้งหมด)
  ('profit_cash_2026_03', -107695),
  ('profit_cash_2026_04',  -70428),
  ('profit_cash_2026_05',  -27606),
  ('profit_cash_2026_06',   88991)
),
actual(check_name, actual_value) as (
  select 'net_revenue_' || replace(to_char(sale_date,'YYYY-MM'),'-','_'),
         round(sum(net_revenue))
  from public.v_daily_summary
  where sale_date between '2026-03-01' and '2026-06-30'
  group by to_char(sale_date,'YYYY-MM')

  union all
  select 'net_revenue_2026_07_partial', round(sum(net_revenue))
  from public.v_daily_summary
  where sale_date between '2026-07-01' and '2026-07-19'

  union all
  select 'member_credit_used', round(sum(credit_used)) from public.sales

  union all
  select 'commission_2026_06', round(sum(total_income))
  from public.v_therapist_daily
  where work_date between '2026-06-01' and '2026-06-30'

  union all
  select 'expenses_' || cost_type || '_06', round(sum(amount))
  from public.expenses
  where expense_date between '2026-06-01' and '2026-06-30'
  group by cost_type

  union all
  select 'profit_cash_' || replace(month,'-','_'), round(profit_cash)
  from public.v_monthly_pl where month between '2026-03' and '2026-06'
)
select
  e.check_name,
  e.expected_value,
  a.actual_value,
  case when a.actual_value = e.expected_value then 'PASS'
       else 'FAIL (ต่าง ' || coalesce((a.actual_value - e.expected_value)::text, 'ไม่มีข้อมูล') || ')'
  end as result
from expected e
left join actual a on a.check_name = e.check_name
order by result desc, e.check_name;
