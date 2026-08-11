-- negative_credit เคยเช็คจาก mb.credit_balance < 0 แต่ member_balances เวอร์ชัน FIFO (20260811150000)
-- ตัด credit_balance ให้ไม่ต่ำกว่า 0 เสมอ (sum ... filter เฉพาะก้อนไม่หมดอายุ ลบด้วย absorbed ที่ไม่เกิน credit_added)
-- เงื่อนไขเดิมจึงเป็นเท็จตลอดกาล ป้ายแดง "เครดิตติดลบ" ที่หน้า /customers เลยไม่มีวันขึ้นอีกต่อไป
-- ทั้งที่ยังมีลูกค้าที่ใช้เครดิตเกินยอดที่ซื้อไว้จริง (เคสจริงเช้านี้: "เดียร์" 0816619535 ก่อนแก้ใบบิลคีย์ผิด)
--
-- แก้ด้วยการย้ายเงื่อนไขไปวัดจากตารางดิบตรงๆ ซึ่งยังสังเกตได้: ยอด credit_used สะสมใน sales
-- เกินยอด credit_added สะสมใน member_topups หรือไม่ — ไม่ผ่าน member_balances ที่ floor ไว้แล้ว
--
-- ชื่อธง ตำแหน่งในลิสต์คอลัมน์ ชนิดข้อมูล และป้ายที่พนักงานเห็น (src/lib/customer-issues.ts) ไม่เปลี่ยน
-- เปลี่ยนแค่เงื่อนไขข้างในเท่านั้น
create or replace view public.v_customer_issues with (security_invoker = true) as
with dup_phones as (
  -- ชุดเบอร์ที่มีคนใช้มากกว่าหนึ่งคน — คำนวณครั้งเดียวต่อ query ไม่ใช่ต่อแถว
  select btrim(phone) as phone_key
  from public.customers
  where btrim(phone) <> ''
  group by btrim(phone)
  having count(*) > 1
),
credit_used_totals as (
  select sa.customer_id, sum(sa.credit_used) as used
  from public.sales sa
  where sa.credit_used > 0 and sa.customer_id is not null
  group by sa.customer_id
),
credit_added_totals as (
  select mt.customer_id, sum(mt.credit_added) as added
  from public.member_topups mt
  group by mt.customer_id
)
select
  c.id                           as customer_id,
  c.name,
  c.nickname,
  c.phone,
  c.customer_type,
  coalesce(mb.credit_balance, 0) as credit_balance,
  coalesce(ltv.visits, 0)        as visits,
  ltv.last_visit,

  -- กลุ่มตัวตน: ระบบระบุตัวลูกค้าผิดคนได้
  --
  -- ทำไมต้อง btrim: เบอร์ที่ต่างกันแค่ช่องว่างหน้า/หลังคือเบอร์เดียวกัน
  -- ถ้าเทียบตรงตัวอักษร ' 0812345678' กับ '0812345678' จะกลายเป็นคนละเบอร์
  -- แล้วคู่ซ้ำหลุดไปเงียบๆ — ซึ่งเป็นรูแบบเดียวกับที่ view นี้ตั้งใจจะปิด
  -- (ทางเขียนแต่ละทาง normalize ไม่เท่ากัน: book/actions.ts ตัดอักขระที่ไม่ใช่ตัวเลขทิ้ง ทางอื่นแค่ trim)
  coalesce(btrim(c.phone) <> ''
     and btrim(c.phone) in (select phone_key from dup_phones), false)  as dup_phone,
  (c.phone is null or btrim(c.phone) = '')                             as no_phone,
  -- เบอร์ไทยที่ใช้ได้คือ 0 ตามด้วยตัวเลข 8-9 หลัก · นอกนั้นค้นไม่เจอ เท่ากับไม่มีเบอร์
  -- (เจอจริง: "611230256" ของลูกค้าชื่อโอ๋ ขาดเลข 0 หน้า)
  -- เบอร์ที่เป็นช่องว่างล้วนจะตกไปเป็น no_phone ไม่ใช่ bad_phone ซึ่งตรงความหมายกว่า
  coalesce(btrim(c.phone) <> ''
     and btrim(c.phone) !~ '^0[0-9]{8,9}$', false)                     as bad_phone,

  -- กลุ่มเงิน: ตัวเลขไม่ตรง ต้องสืบ
  -- วัดจากตารางดิบ ไม่ใช่ member_balances (floor ที่ 0 แล้วตั้งแต่ 20260811150000)
  (coalesce(cut.used, 0) > coalesce(cat.added, 0))                     as negative_credit,
  (coalesce(pb.balance, 0) < 0)                                        as negative_points,

  -- ผูกบัญชีไลน์กับร้านแล้วหรือยัง — ไม่ใช่ "ปัญหา" จึงไม่อยู่ในชุด ISSUES
  -- แต่พนักงานต้องเห็น เพราะลูกค้ากลุ่มนี้จองผ่านไลน์และรับแจ้งเตือนได้
  exists (select 1 from public.line_accounts l
           where l.customer_id = c.id)                                 as has_line
from public.customers c
left join public.member_balances  mb  on mb.customer_id  = c.id
left join public.v_customer_ltv   ltv on ltv.customer_id = c.id
left join public.v_point_balances pb  on pb.customer_id  = c.id
left join credit_used_totals      cut on cut.customer_id = c.id
left join credit_added_totals     cat on cat.customer_id = c.id;
