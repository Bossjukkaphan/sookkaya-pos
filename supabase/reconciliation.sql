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
  -- ยอดตัดเครดิตที่ไม่มีก้อนเติมเงินรองรับ = คีย์ผิดใบลูกค้า (เคยเจอ 1,300 บาทของ "เดียร์"
  -- ที่ควรเป็นของ "เดียร์22" แก้แล้ว 2026-08-11) ต้องเป็นศูนย์เสมอ
  --
  -- ตรวจข้อนี้เพิ่มจากการดูยอดติดลบใน member_balances (ไม่ใช่แทนกัน): ยอดติดลบบอกว่า
  -- "มีคนโดนตัดเกิน" แต่ไม่ได้ชี้ว่าใบไหน ข้อนี้ชี้ตัวใบที่ตัดโดยไม่มีก้อนเติมเงินรองรับ
  --
  -- (แก้คอมเมนต์เดิม 2026-08-11: เคยเขียนว่าตั้งแต่เปลี่ยนเป็น FIFO ยอดคงเหลือจะไม่ติดลบอีกแล้ว
  --  ดีไซน์ FIFO นั้นถูกทิ้งไปก่อนขึ้นจริง ของที่ใช้อยู่คือกระปุกเดียว ยอด = ที่ให้ − ที่ใช้
  --  ไม่หนีบที่ 0 ยอดจึงติดลบได้ตามปกติเมื่อคีย์บิลผิดใบ)
  ('orphan_credit_used', 0),
  -- ใบเติมเงินที่ไม่มีวันหมดอายุ = ข้อมูลผิด เพราะ createTopup ใส่ค่าเสมอ
  -- สำคัญขึ้นมากตั้งแต่ 2026-08-11 เพราะวันหมดอายุของทั้งกระปุกคือ MAX ของทุกใบ
  -- ใบที่ค่าว่างจะถูก MAX ข้ามไปเงียบ ๆ ทำให้ลูกค้าอาจหมดอายุเร็วกว่าที่ควร
  ('topup_missing_expiry', 0),
  -- room_fee_total ใน view ต้องตรงกับผลรวมในตาราง sales ทุกวัน ถ้าไม่ตรงแปลว่า
  -- นิยาม view หลุดจากข้อมูลจริง แล้วบรรทัด "ค่าห้องสปา" ในการ์ดรายรับจะโกหก
  ('room_fee_total_mismatch', 0),
  ('commission_2026_06',  140415),
  ('expenses_fixed_06',   104648),
  -- Excel เดิมไม่มีงวด "ค่ามือพนักงานนวด 1-10/6/69" 42,935 บาท — เจ้าของร้านยืนยัน
  -- 27/7/2569 ว่าจ่ายจริง ฐานข้อมูลถูก Excel ตกหล่น: variable_06 และกำไร มิ.ย.
  -- จึงต่างจากชีท 42,935 พอดี (125,059 → 167,994 · กำไร 88,991 → 46,056)
  --
  -- 5/8/2569 กระทบยอด มิ.ย. กับสลิปโอนจริงใน Paypers พบรายจ่ายตกหล่นอีก 24,884 บาท
  -- (ค่าทำ content 15,000 · ค่าจ้างทีม Content 5,400 · ค่าทำบัญชี 1,940 · ของใช้ในร้าน 2,484 · สรรพากร 60)
  -- เจ้าของร้านยืนยันทุกรายการแล้ว เพิ่มเข้าฐานข้อมูลด้วย migration
  -- 20260805200000_backfill_june_expenses_from_paypers.sql
  -- ผลกระทบ: variable_06 167,994 → 170,478 · onetime_06 28,320 → 50,720
  --          กำไร มิ.ย. 46,056 → 21,172 · ytd −159,674 → −184,558
  ('expenses_variable_06',170478),
  ('expenses_onetime_06',  50720),
  -- เฟส 2: กำไรสุทธิแบบ Excel (รายได้ที่รับรู้ − รายจ่ายที่จ่ายจริงทั้งหมด)
  ('profit_cash_2026_03', -107695),
  ('profit_cash_2026_04',  -70428),
  -- 5/8/2569 กระทบยอด พ.ค. กับ Paypers พบตกหล่น 4,548 (ค่าซักผ้าลอนดรี้ยู 2,500 · กราฟิก 1,000
  -- · ขนมลูกค้า 850+178 · SUKHUMVIT CITY MALL 20) กำไร พ.ค. −27,606 → −32,154
  -- migration 20260805210000_backfill_may_expenses_from_paypers.sql
  ('profit_cash_2026_05',  -32154),
  ('profit_cash_2026_06',   21172),
  -- เฟส 3: การจับคู่ชื่อโปรโมชั่น — ตรวจเฉพาะข้อมูลถึง 19 ก.ค. ซึ่งเป็นข้อมูลที่ import มา
  -- ถ้าตัวเลขเหล่านี้ตก แปลว่า alias หลุดหรือ promo_key เปลี่ยนพฤติกรรม
  -- Happy Hours เคยรายงานได้แค่ 38 เพราะพนักงานพิมพ์ชื่อไว้ 8 แบบ
  ('promo_happy_hours_uses',     89),
  ('promo_happy_hours_discount', 17960),
  ('promo_1get1_uses',           253),
  ('promo_unmatched_rows',       20),
  -- รอบ 1 หน้าภาพรวม: ยอดสะสมต้นปีถึง มิ.ย. (ก.ค. ยังขยับทุกวัน จึงไม่เอามาตรวจ)
  ('ytd_net_revenue_2026_06',  1124141),
  -- ตามงวดค่ามือ 42,935 + รายจ่ายจาก Paypers ที่ Excel ตกหล่น (มิ.ย. 24,884 · พ.ค. 4,548)
  -- (ดูหมายเหตุ expenses_variable_06 และ profit_cash_2026_05)
  ('ytd_profit_cash_2026_06',  -189106),
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
  -- แก้ไปแล้วอีก 1 ราย: เดียร์ (0816619535) เคยใช้เครดิต 1,300 จากสองบิลวันที่ 25/6
  -- ทั้งที่ไม่เคยมีใบเติมเงินเลย ที่แท้เป็นคนละคนกับ "เดียร์22" ที่มีแพ็ก แก้แล้ว 2026-08-11
  --
  -- ย้ายมาตรวจจากตาราง sales/member_topups ดิบแทนการอ่าน credit_balance ของ view member_balances
  -- เพราะตั้งแต่ Task 1 เปลี่ยนยอดใช้เครดิตให้จัดสรรแบบ FIFO ยอดคงเหลือใน view จะไม่ติดลบอีกแล้ว
  -- ถ้ายังตรวจจาก credit_balance ข้อนี้จะผ่าน (0) ตลอดไปโดยไม่มีความหมาย ตรวจไม่เจออะไรอีกต่อไป
  -- ข้อนี้เลยนับลูกค้าที่ credit_used รวมมากกว่า credit_added รวมแทน — เงื่อนไขเดิมที่ตั้งใจจับ
  -- แต่วัดจากตารางดิบซึ่งยังเห็นปัญหาได้จริง
  --
  -- ถ้าเลขนี้ขึ้นมากกว่า 0 = มีเคสใหม่ที่เกิดจากแอป ต้องสืบทันที (ของเดิมมาจาก import ทั้งหมด)
  ('member_credit_negative_customers', 0),

  -- แบ่งชำระ (สเปก 2026-07-31): เครดิตห้ามเกินยอดบิล และต้องรู้ว่าตัดของใคร
  -- ด่านคู่นี้จับของจริงได้ทันทีที่ใส่เข้ามา (31/7/2569) — ทั้งคู่เป็นข้อมูล import จาก Excel:
  --   · #34139-949 (23/3 ได๋) net_amount = -100 — "คูปองลด100" บนราคา 0 ยอดบิลติดลบ
  --     (เข้าด่าน exceeds_net เพราะ 0 > -100 · Excel ต้นทางผิดแบบเดียวกัน แก้ข้อมูลจะทำ
  --      net_revenue มี.ค. ไม่ตรง Excel — รอเจ้าของร้านตัดสินว่ายอดจริงคือเท่าไหร่)
  --   · SK-20260710-005 (10/7) บิล Member Credit 790 ไม่ผูกลูกค้า — ตัดเครดิตไม่รู้ของใคร
  --     (bonus_used = 790 เต็มใบด้วย น่าจะช่องชีทเลื่อน — รอเทียบแถว Excel ต้นทาง)
  -- ขึ้นเป็น 2 เมื่อไหร่ = มีเคสใหม่เกิดจากแอป ต้องสืบทันที (โค้ดใหม่มีด่านกันครบแล้ว)
  ('credit_used_exceeds_net', 1),
  ('credit_used_without_customer', 1),

  -- คนหรือเตียงถูกจองซ้อนกันเกิน 20 นาที = เป็นไปไม่ได้จริง มีบิลกรอกผิดแน่นอน
  -- (เผื่อ 20 นาทีไว้ให้คิวต่อกันแบบชนขอบเล็กน้อย ซึ่งเกิดปกติเวลาคีย์เวลาคร่าวๆ)
  --
  -- ด่านคู่นี้จับของจริงได้ทันทีที่ใส่เข้ามา 2 เคส แก้เสร็จแล้ว 29/7/2569 หลังเจ้าของร้านถามพนักงาน:
  --   · 26/7 หมอบีบี — "รุ" ลงเวลาจอง 14:20 แต่นวดจริง 13:20 แก้เวลาการ์ดแล้ว
  --   · 28/7 เตียง 1 ห้องนวดไทย — "จิราพิชญ์" นวดจริงที่เตียง 2 แก้ทั้งการ์ดและบิลแล้ว
  -- ขึ้นเป็น 1 เมื่อไหร่ = มีคนคีย์เวลาหรือเตียงผิด ให้ไล่หาว่าใบไหนแล้วถามพนักงาน
  --
  -- ยกเว้นที่รู้อยู่แล้ว 1 คู่ — เก็บเป็น known exception เหมือน credit_used_exceeds_net/
  -- credit_used_without_customer ด้านบน (ไม่ใช่ศูนย์เพราะมีเคสที่สืบแล้วว่าไม่ใช่บั๊ก):
  --   คู่ 9 สิงหาคม 2569 — เอ็ม เมธี (จองไว้ 13:55 แต่ข้อตรวจนี้ใช้เวลาเริ่ม*จริง* 13:56 จาก
  --   started_at เพราะหมอกดเริ่มช้าไปหนึ่งนาที · เมนู 120 นาที) กับ กอล์ฟฟี่ (เริ่ม 15:00 ·
  --   เมนู 90 นาที) ทั้งคู่บันทึกเก้าอี้ 3
  --
  -- ไม่ใช่การจองซ้อนจริง — ตามกติกาที่ทำหน้าร้านจริง เอ็ม เมธีลุกจากเก้าอี้ 3 ตอน 14:56
  -- (ครึ่งทางของนวดจริงที่เริ่ม 13:56) ไปนอนต่อครึ่งหลังบนเตียงไทย กอล์ฟฟี่เริ่ม 15:00
  -- จึงไม่ได้ชนกับใครเลย พนักงานทำถูกมาตลอด
  -- ระบบตอนนั้นยังไม่มีช่องเก็บห้องที่สอง (bed_id_2 เพิ่งมีใน migration
  -- 20260815100000_two_room_queue.sql) จึงไม่มีทางบันทึกการย้ายห้องครั้งนั้นไว้ได้เลย
  --
  -- การ์ดใบนี้เกิดก่อนคอลัมน์ bed_id_2 จะมีอยู่ และตั้งใจ **ไม่ backfill ประวัติ** — เขียนเตียงไทย
  -- ใบใดใบหนึ่งลงไปตอนนี้เท่ากับกุเรื่องขึ้นมาเองโดยไม่มีใครยืนยันได้ว่าใช่เตียงไหนจริง ๆ
  --
  -- ดังนั้นค่าที่ถูกต้องคือ 1 เสมอ **ถ้าขึ้นมากกว่า 1 = มีคู่ใหม่ที่ต้องสืบทันที** อย่าเข้าใจว่า
  -- แถวนี้ถูกปิดตาไปตลอดกาล — การ์ดที่สร้างจากนี้ไปสามารถระบุ bed_id_2 ได้แล้ว
  -- ("ย้ายห้องกลางคัน" มีทางบันทึกจริงในระบบแล้ว) ข้อยกเว้นนี้จึงไม่ควรโตขึ้นอีก
  ('bed_double_booked', 1),
  ('therapist_double_booked', 0),

  -- บรรทัดชำระ (สเปก 2026-08-01): บรรทัดต้องมีบิลจริง · เกินรับต้องศูนย์เมื่อพัก · วิธีหลักตรงบรรทัด
  ('bill_payments_orphaned', 0),
  ('bill_overpaid', 0),
  ('tracked_bill_method_mismatch', 0),

  -- เดือนที่งวดจ่ายถูกรับรองครบ 4 งวด ยอด "จ่ายจริง" ที่แช่แข็งไว้ต้องนิ่งตลอดกาล
  -- เทียบระดับเดือน ไม่จำลองการจับคู่รายงวดใน SQL (กติกาเดียวกันเขียนสองภาษาจะเพี้ยนจากกัน
  -- — ตัวจริงอยู่ที่ commissionPeriodOfExpense ใน src/lib/payout-periods.ts)
  -- ขึ้นมากกว่า 0 = มีคนแก้รายจ่ายหมวดค่ามือ/เงินเดือนหลังเจ้าของร้านปิดงวดแล้ว ต้องสืบทันที
  ('endorsed_payout_drift', 0)
),
-- ใช้ร่วมกับข้อตรวจ bed_double_booked ด้านล่าง: กางการ์ดคิวแต่ละใบเป็น 1-2 ช่วง (ห้อง ·
-- เวลาเริ่ม · นาที) ด้วยกติกาเดียวกับ bedSegments() ในแอป (src/lib/queue.ts) — เวลาเริ่ม =
-- started_at แปลงเป็นเวลาไทยถ้ามี ไม่งั้น start_time ที่จอง · มี bed_id_2 = ครึ่งแรก
-- floor(duration_min/2) นาทีอยู่ bed_id ครึ่งหลังที่เหลืออยู่ bed_id_2 · ไม่มี bed_id_2 =
-- ครองห้องเดียวเต็มโปรแกรม (พฤติกรรมเดิมก่อนมีการย้ายห้อง) · ใบยกเลิก/ถูกปฏิเสธไม่ครองห้องใด ๆ
bed_segments as (
  select
    qe.id as entry_id,
    qe.queue_date,
    seg.room_id,
    seg.seg_start,
    seg.seg_dur
  from public.queue_entries qe
  cross join lateral (
    select qe.bed_id as room_id,
           coalesce((qe.started_at at time zone 'Asia/Bangkok')::time, qe.start_time) as seg_start,
           case when qe.bed_id_2 is null then qe.duration_min
                else floor(qe.duration_min / 2.0)::int end as seg_dur
    where qe.bed_id is not null
    union all
    select qe.bed_id_2,
           coalesce((qe.started_at at time zone 'Asia/Bangkok')::time, qe.start_time)
             + make_interval(mins => floor(qe.duration_min / 2.0)::int),
           qe.duration_min - floor(qe.duration_min / 2.0)::int
    -- ต้องมี bed_id ด้วยไม่ใช่แค่ bed_id_2 — bedSegments() ในแอปขึ้นต้นด้วย
    -- if (!e.bed_id) return [] การ์ดที่ไม่มีห้องแรกไม่ครองห้องอะไรเลยแม้ bed_id_2 จะมีค่า
    -- (ไม่มี state แบบนี้เกิดขึ้นจริงตอนนี้ แต่ต้องกันไว้ไม่ให้ SQL เพี้ยนจากกติกาแอป)
    where qe.bed_id_2 is not null and qe.bed_id is not null
  ) as seg(room_id, seg_start, seg_dur)
  where qe.status not in ('cancelled','rejected')
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
  select 'member_credit_negative_customers', count(*)::bigint
  from (
    select c.id
    from public.customers c
    where coalesce((select sum(sa.credit_used) from public.sales sa
                     where sa.customer_id = c.id and sa.credit_used > 0), 0)
        > coalesce((select sum(mt.credit_added) from public.member_topups mt
                     where mt.customer_id = c.id), 0)
  ) over_used

  union all
  select 'orphan_credit_used', coalesce(sum(x.orphan), 0)::bigint
  from (
    select greatest(
      coalesce((select sum(sa.credit_used) from public.sales sa
                where sa.customer_id = c.id and sa.credit_used > 0), 0)
      - coalesce((select sum(mt.credit_added) from public.member_topups mt
                  where mt.customer_id = c.id), 0), 0) as orphan
    from public.customers c
  ) x

  union all
  select 'topup_missing_expiry', count(*)::bigint
  from public.member_topups where expiry_date is null

  union all
  select 'credit_used_exceeds_net', count(*)
  from public.sales where credit_used > net_amount

  union all
  select 'credit_used_without_customer', count(*)
  from public.sales where credit_used > 0 and customer_id is null

  union all
  -- เตียงจองซ้อน: ต้องกางการ์ดเป็นช่วง ๆ ก่อนจับคู่ ไม่ใช่เทียบทั้งใบเป็นห้องเดียว
  -- เมนู "นวดคลายเท้า & คอบ่าไหล่" ลูกค้านวดเท้าครึ่งแรกแล้วย้ายเตียงไทยครึ่งหลัง (bed_id_2)
  -- ข้อตรวจเดิมมองเห็นแค่ bed_id ห้องเดียวทั้งใบ จึงฟ้องคู่นี้มาตั้งแต่ 9 ส.ค. 2569 ว่าชนกัน:
  --   เอ็ม เมธี · เริ่ม 13:55 · เมนู 120 นาที · เก้าอี้ 3
  --   กอล์ฟฟี่ · เริ่ม 15:00 · เมนู 90 นาที · เก้าอี้ 3
  -- ทั้งที่พนักงานทำถูก — เอ็ม เมธีย้ายออกจากเก้าอี้ 3 ไปเตียงไทยตั้งแต่กลางโปรแกรม
  -- ระบบเดิมเก็บได้แค่ห้องเดียวต่อการ์ดเท่านั้น จึงไม่มีทางบันทึกการย้ายห้องนี้ไว้ได้ตั้งแต่ต้น
  --
  -- กางแต่ละใบเป็น 1-2 ช่วง (ห้อง · เวลาเริ่ม · นาที) ด้วยกติกาเดียวกับ bedSegments()
  -- ที่แอปใช้จริง (src/lib/queue.ts): เวลาเริ่ม = started_at แปลงเป็นเวลาไทยถ้ามี ไม่งั้น
  -- start_time ที่จอง · มี bed_id_2 = ครึ่งแรก floor(duration_min/2) นาทีอยู่ bed_id
  -- ครึ่งหลังที่เหลืออยู่ bed_id_2 · ไม่มี bed_id_2 = ครองห้องเดียวเต็มโปรแกรม (พฤติกรรมเดิม)
  -- ใบยกเลิก/ถูกปฏิเสธไม่ครองห้องใด ๆ แล้วจับคู่ช่วงที่ bed_id เดียวกันทับกันเกิน 20 นาที
  select 'bed_double_booked', count(*)
  from (
    select distinct sa.entry_id, sb.entry_id
    from bed_segments sa
    join bed_segments sb
      on sb.entry_id > sa.entry_id
     and sb.queue_date = sa.queue_date
     and sb.room_id = sa.room_id
    where least(sa.seg_start + make_interval(mins => sa.seg_dur),
                sb.seg_start + make_interval(mins => sb.seg_dur))
        - greatest(sa.seg_start, sb.seg_start) > interval '20 min'
  ) bad

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
  select 'endorsed_payout_drift', count(*)
  from (
    -- เฉพาะเดือนที่ครบ 4 งวดและรับรองหมดแล้ว — เดือนที่ยังติ๊กไม่ครบไม่นับ (ตัวเลขยังขยับได้ปกติ)
    select pc.month, sum(pc.recorded_amount) as frozen
    from public.payout_confirmations pc
    group by pc.month
    having count(*) = 4 and count(*) filter (where pc.endorsed_at is not null) = 4
  ) m
  where m.frozen is distinct from (
    select coalesce(sum(e.amount), 0)
    from public.expenses e
    where e.category in ('HR / payroll (ค่ามือหมอ)', 'เงินเดือนพนักงานประจำ')
      -- หน้าต่างเดือน + ผ่อนผัน 3 วัน (ตรง accounting window ที่รายจ่ายเดือนก่อนคีย์ได้ถึงวันที่ 3)
      and e.expense_date >= (m.month || '-01')::date
      and e.expense_date <= (m.month || '-01')::date + interval '1 month' + interval '2 days'
      -- ตัดรายการที่ชื่อประทับเดือนอื่น (เช่น "ค่ามือหมอ21-31/7/69" ที่คีย์ 2/8 เป็นของ ก.ค. ไม่ใช่ ส.ค.)
      and not (
        e.item ~ '/\d{1,2}/'
        and e.item not like '%/' || extract(month from (m.month || '-01')::date)::int || '/%'
      )
  )

  union all
  select 'views_without_security_invoker', count(*)
  from pg_class c
  join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public'
    and c.relkind = 'v'
    and c.reloptions is distinct from array['security_invoker=true']::text[]

  union all
  select 'bill_payments_orphaned', count(*)
  from public.bill_payments p
  where not exists (select 1 from public.sales s where coalesce(s.bill_id, s.id) = p.bill_key)

  union all
  select 'bill_overpaid', count(*)
  from public.v_bill_due where due < -0.005

  union all
  -- ผ่านเมื่อ payment_method ตรงกับ "หนึ่งในบรรทัด" ที่ยอดสูงสุดเท่ากัน ไม่ใช่แค่บรรทัดเดียวที่สุ่มได้
  -- เดิม order by amount desc, created_at asc limit 1 หยิบมาแค่บรรทัดเดียว — บิลชุดที่แบ่งจ่ายเท่ากันเป๊ะ
  -- (created_at เหมือนกันเพราะ insert ทีเดียวเป็นก้อน จึงเรียงลำดับไม่เที่ยง) จะสุ่มได้ผลลัพธ์คนละบรรทัด
  -- แล้ว FAIL ทั้งที่ payment_method ถูกต้องอยู่แล้ว (445/445 ที่แบ่งจ่ายเท่ากันเป๊ะพังแบบสุ่ม)
  select 'tracked_bill_method_mismatch', count(*)
  from (
    select d.bill_key
    from public.v_bill_due d
    join public.sales s on coalesce(s.bill_id, s.id) = d.bill_key
    where d.paid_total > 0
    group by d.bill_key
    having min(s.payment_method) not in (
      select p.method from public.bill_payments p
      where p.bill_key = d.bill_key
        and p.amount = (select max(p2.amount) from public.bill_payments p2 where p2.bill_key = d.bill_key))
  ) bad

  union all
  select 'room_fee_total_mismatch', count(*)
  from (
    select d.sale_date
    from public.v_daily_summary d
    join (
      select sale_date, sum(coalesce(room_fee, 0)) as raw_room_fee
      from public.sales group by sale_date
    ) s on s.sale_date = d.sale_date
    where d.room_fee_total <> s.raw_room_fee
  ) bad
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
