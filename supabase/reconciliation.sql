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
  -- Excel เดิมไม่มีงวด "ค่ามือพนักงานนวด 1-10/6/69" 42,935 บาท — เจ้าของร้านยืนยัน
  -- 27/7/2569 ว่าจ่ายจริง ฐานข้อมูลถูก Excel ตกหล่น: variable_06 และกำไร มิ.ย.
  -- จึงต่างจากชีท 42,935 พอดี (125,059 → 167,994 · กำไร 88,991 → 46,056)
  ('expenses_variable_06',167994),
  ('expenses_onetime_06',  28320),
  -- เฟส 2: กำไรสุทธิแบบ Excel (รายได้ที่รับรู้ − รายจ่ายที่จ่ายจริงทั้งหมด)
  ('profit_cash_2026_03', -107695),
  ('profit_cash_2026_04',  -70428),
  ('profit_cash_2026_05',  -27606),
  ('profit_cash_2026_06',   46056),
  -- เฟส 3: การจับคู่ชื่อโปรโมชั่น — ตรวจเฉพาะข้อมูลถึง 19 ก.ค. ซึ่งเป็นข้อมูลที่ import มา
  -- ถ้าตัวเลขเหล่านี้ตก แปลว่า alias หลุดหรือ promo_key เปลี่ยนพฤติกรรม
  -- Happy Hours เคยรายงานได้แค่ 38 เพราะพนักงานพิมพ์ชื่อไว้ 8 แบบ
  ('promo_happy_hours_uses',     89),
  ('promo_happy_hours_discount', 17960),
  ('promo_1get1_uses',           253),
  ('promo_unmatched_rows',       20),
  -- รอบ 1 หน้าภาพรวม: ยอดสะสมต้นปีถึง มิ.ย. (ก.ค. ยังขยับทุกวัน จึงไม่เอามาตรวจ)
  ('ytd_net_revenue_2026_06',  1124141),
  -- ตามงวดค่ามือ 42,935 ที่ Excel ตกหล่น (ดูหมายเหตุ expenses_variable_06)
  ('ytd_profit_cash_2026_06',  -159674),
  -- ข้อนี้ไม่ใช่ตัวเลขเงิน แต่เป็นกับดักที่เคยติดมาแล้ว:
  -- `create or replace view` ล้าง reloptions ทิ้ง ทำให้ security_invoker หลุด
  -- view กลับเป็น SECURITY DEFINER แล้วพนักงาน staff ยิง REST API อ่านกำไรทั้งร้านได้
  -- ต้องเป็น 0 เสมอ = ทุก view ใน public บังคับ RLS ตามสิทธิ์ผู้เรียก
  ('views_without_security_invoker', 0),
  -- บิลชุด: ทุกแถวใน bill_id เดียวกันต้องเป็นลูกค้า/วันที่/วิธีจ่ายเดียวกัน
  ('bill_id_inconsistent_bills', 0),
  -- แต้มสะสม: ห้ามมีลูกค้าแต้มติดลบ และคูปองที่ used ต้องมีบิลผูกเสมอ
  ('points_negative_customers', 0),
  ('points_used_coupon_no_sale', 0),
  -- การ์ดคิวที่จ่ายเงินแล้วต้องมีหมอ/เตียงตรงกับบิลเสมอ
  -- (28/7/2569 การกดชำระจากการ์ดไม่ได้เขียนสองช่องนี้กลับ การ์ดเลยค้างแถว "ยังไม่ระบุหมอ"
  --  ทุกวันตั้งแต่เปิดใช้กระดาน โดยไม่มีอะไรจับได้เพราะเงินยังถูก)
  ('paid_queue_missing_therapist_or_bed', 0),
  -- ข้อบนจับได้แค่ "ช่องว่าง" ข้อนี้จับ "ค่าไม่ตรง" ซึ่งเงียบกว่ามาก
  -- (28/7/2569 ชวน 25/7 บิลแก้เป็น 120 นาที การ์ดค้าง 90 · ใบใบ 27/7 บิลห้องสปา 2 การ์ดห้องสปา 3
  --  ทุกห้องมีเตียงชื่อ "เตียง 1" หน้าจอเลยดูเหมือนตรงกัน)
  -- แก้ที่รากแล้วด้วย queueMirrorFromSale() — ที่เดียวที่บอกว่าการ์ดมิเรอร์อะไรจากบิลบ้าง
  ('paid_queue_mismatch_with_sale', 0),

  -- เครดิตสมาชิกห้ามติดลบ (คู่กับ points_negative_customers ที่มีอยู่แล้ว)
  --
  -- แก้ไปแล้ว 1 ราย: สงกรานต์ เคยติดลบ 2,380 เพราะเปลี่ยนชื่อมาจาก "กล้วย" แล้วชีทเติมเงิน
  -- ยังใช้ชื่อเก่า ตอน import เลยแตกเป็นสองระเบียน — รวมแล้ว 28/7/2569 เหลือ 840
  --
  -- ที่ยังเหลือ 1 ราย: เดียร์ (0816619535) ใช้เครดิต 1,300 จากสองบิลวันที่ 25/6
  -- ทั้งที่ไม่เคยมีใบเติมเงินเลย และเจ้าของร้านยืนยันแล้วว่าคนละคนกับ "เดียร์22" ที่มีแพ็ก
  -- สองบิลนั้นเป็นนวดฝ่าเท้า 120 นาที ใบละ 650 คนละหมอ (โมเม กับ แจง) = มาด้วยกันสองคน
  -- น่าจะตัดจากแพ็กของคนที่มาด้วย แต่ชีทเก่าลงชื่อผู้รับบริการแทนเจ้าของแพ็ก — รอตรวจสอบ
  --
  -- ถ้าเลขนี้ขึ้นเป็น 2 = มีเคสใหม่ที่เกิดจากแอป ต้องสืบทันที (ของเดิมมาจาก import ทั้งหมด)
  ('member_credit_negative_customers', 1),

  -- คนหรือเตียงถูกจองซ้อนกันเกิน 20 นาที = เป็นไปไม่ได้จริง มีบิลกรอกผิดแน่นอน
  -- (เผื่อ 20 นาทีไว้ให้คิวต่อกันแบบชนขอบเล็กน้อย ซึ่งเกิดปกติเวลาคีย์เวลาคร่าวๆ)
  --
  -- ด่านคู่นี้จับของจริงได้ทันทีที่ใส่เข้ามา 2 เคส แก้เสร็จแล้ว 29/7/2569 หลังเจ้าของร้านถามพนักงาน:
  --   · 26/7 หมอบีบี — "รุ" ลงเวลาจอง 14:20 แต่นวดจริง 13:20 แก้เวลาการ์ดแล้ว
  --   · 28/7 เตียง 1 ห้องนวดไทย — "จิราพิชญ์" นวดจริงที่เตียง 2 แก้ทั้งการ์ดและบิลแล้ว
  -- ขึ้นเป็น 1 เมื่อไหร่ = มีคนคีย์เวลาหรือเตียงผิด ให้ไล่หาว่าใบไหนแล้วถามพนักงาน
  ('bed_double_booked', 0),
  ('therapist_double_booked', 0)
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
  -- ผูกขอบเขตวันเหมือนข้ออื่น: ตัวเลขนี้ตรวจว่า "ข้อมูลที่ import มาถูกต้อง"
  -- ไม่ได้ตรวจยอดเครดิตคงเหลือปัจจุบัน ถ้าไม่ผูกวัน ทุกครั้งที่มีสมาชิกจ่ายด้วยเครดิต
  -- ชุดตรวจจะ FAIL ทั้งที่ไม่มีอะไรผิด แล้วคนจะเลิกเชื่อชุดตรวจ
  select 'member_credit_used', round(sum(credit_used)) from public.sales
  where sale_date <= '2026-07-19'

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

  union all
  select 'promo_happy_hours_uses', count(*)
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = 'Happy Hours' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_happy_hours_discount', round(sum(s.discount))
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = 'Happy Hours' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_1get1_uses', count(*)
  from public.sales s
  join public.promotion_aliases a on a.raw_key = public.promo_key(s.coupon_promo)
  join public.promotions p on p.id = a.promotion_id
  where p.name = '1 แถม 1' and s.sale_date <= '2026-07-19'

  union all
  select 'promo_unmatched_rows', count(*)
  from public.sales s
  where s.coupon_promo is not null and btrim(s.coupon_promo) <> ''
    and s.sale_date <= '2026-07-19'
    and not exists (
      select 1 from public.promotion_aliases a
      where a.raw_key = public.promo_key(s.coupon_promo)
    )

  union all
  select 'ytd_net_revenue_2026_06', round(ytd_net_revenue)
  from public.v_monthly_pl where month = '2026-06'

  union all
  select 'ytd_profit_cash_2026_06', round(ytd_profit_cash)
  from public.v_monthly_pl where month = '2026-06'

  union all
  select 'bill_id_inconsistent_bills', count(*)
  from (
    select bill_id
    from public.sales
    where bill_id is not null
    group by bill_id
    having count(distinct sale_date) > 1
        or count(distinct payment_method) > 1
        or count(distinct coalesce(customer_id::text, customer_name, '')) > 1
  ) bad_bills

  union all
  select 'paid_queue_missing_therapist_or_bed', count(*)
  from public.queue_entries q
  join public.sales s on s.id = q.sale_id
  where q.status = 'paid'
    and ((q.therapist_id is null and s.therapist_id is not null)
      or (q.bed_id is null and s.bed_id is not null))

  union all
  select 'paid_queue_mismatch_with_sale', count(*)
  from public.queue_entries q
  join public.sales s on s.id = q.sale_id
  where q.status = 'paid'
    and (q.service_id   is distinct from s.service_id
      or q.bed_id       is distinct from coalesce(s.bed_id, q.bed_id)
      or q.therapist_id is distinct from coalesce(s.therapist_id, q.therapist_id))

  union all
  select 'member_credit_negative_customers', count(*)
  from public.member_balances where credit_balance < 0

  union all
  select 'bed_double_booked', count(*)
  from public.queue_entries a
  join public.queue_entries b
    on b.id > a.id and b.queue_date = a.queue_date and b.bed_id = a.bed_id
  where a.bed_id is not null
    and a.status not in ('cancelled','rejected')
    and b.status not in ('cancelled','rejected')
    and least(a.start_time + make_interval(mins => a.duration_min),
              b.start_time + make_interval(mins => b.duration_min))
      - greatest(a.start_time, b.start_time) > interval '20 min'

  union all
  select 'therapist_double_booked', count(*)
  from public.queue_entries a
  join public.queue_entries b
    on b.id > a.id and b.queue_date = a.queue_date and b.therapist_id = a.therapist_id
  where a.therapist_id is not null
    and a.status not in ('cancelled','rejected')
    and b.status not in ('cancelled','rejected')
    and least(a.start_time + make_interval(mins => a.duration_min),
              b.start_time + make_interval(mins => b.duration_min))
      - greatest(a.start_time, b.start_time) > interval '20 min'

  union all
  select 'points_negative_customers', count(*)
  from public.v_point_balances where balance < 0

  union all
  select 'points_used_coupon_no_sale', count(*)
  from public.point_redemptions
  where status = 'used' and used_sale_id is null

  union all
  select 'views_without_security_invoker', count(*)
  from pg_class c
  join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public'
    and c.relkind = 'v'
    and c.reloptions is distinct from array['security_invoker=true']::text[]
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
