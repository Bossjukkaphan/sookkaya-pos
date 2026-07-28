-- แก้หน้า /customers ล่มเพราะ query นานเกินจนฐานข้อมูลตัดทิ้ง (รันจริงบน production 29/7/2569)
--
-- อาการ: หน้าลูกค้าขึ้น "A server error occurred" ทุกครั้ง
-- error จริง: canceling statement due to statement timeout
--
-- ต้นเหตุ: dup_phone เดิมเขียนเป็น correlated subquery ที่ถามซ้ำทุกแถว
--     exists (select 1 from customers o where o.id <> c.id and btrim(o.phone) = btrim(c.phone))
-- ปกติ index customers_phone_btrim_idx ควรรับงานนี้ได้สบาย แต่ RLS ของตาราง customers
-- มีเงื่อนไข app_role() อยู่ด้วย ซึ่ง Postgres ต้องประเมินทีละแถว จึงเลือก Seq Scan แทน Index Scan
-- ผลคือสแกนตาราง customers ทั้ง 1,046 แถว ซ้ำอีก 1,046 รอบ ≈ ล้านครั้งต่อการโหลดหนึ่งหน้า
--
-- บทเรียนที่แพงที่สุดของงานนี้: ตอนวัดผลด้วย EXPLAIN ANALYZE ผ่าน MCP เราใช้สิทธิ์ผู้ดูแลระบบ
-- ซึ่ง "ข้าม RLS" จึงได้ 7 ms แล้วเข้าใจว่าเร็วพอ แต่หน้าเว็บเรียกด้วยสิทธิ์พนักงานที่ต้องผ่าน RLS
-- ทุกแถว ของจริงจึงช้าจนหมดเวลา — เวลาวัดความเร็ว query ต้องวัดในสิทธิ์เดียวกับที่ใช้จริงเสมอ
--
-- วิธีแก้: เลิกถามทีละแถว เปลี่ยนเป็นหาชุดเบอร์ที่ซ้ำ "ครั้งเดียว" ด้วย group by/having
-- แล้วให้แต่ละแถวแค่เช็คว่าเบอร์ตัวเองอยู่ในชุดนั้นไหม (Postgres ทำเป็น hash ครั้งเดียว)
--
-- coalesce ยังจำเป็นเหมือนเดิม: คนไม่มีเบอร์จะได้ null (null in (...) = null) ไม่ใช่ false
-- ถ้าปล่อยเป็น null ฝั่งเว็บที่กรองด้วย eq(false) จะทิ้งคน 73 คนนั้นหายเงียบ
--
-- ตรวจแล้วว่าผลลัพธ์เหมือนเดิมทุกแถว ไม่ใช่แค่ยอดรวมเท่ากัน:
-- เทียบแบบเดิมกับแบบใหม่ทีละแถวทั้ง 1,046 แถว ต่างกัน 0 แถว และไม่มี null สักตัว
--
-- เพิ่มธงตัวใหม่ที่นี่แล้ว ต้องไปเพิ่ม IssueKey กับ ISSUES ที่ src/lib/customer-issues.ts ด้วย
-- ไม่มีอะไรบังคับได้อัตโนมัติ — ลืมแล้วธงใหม่จะไม่มีวันโผล่บนหน้าเว็บ โดย build ยังเขียวปกติ

create or replace view public.v_customer_issues with (security_invoker = true) as
with dup_phones as (
  -- ชุดเบอร์ที่มีคนใช้มากกว่าหนึ่งคน — คำนวณครั้งเดียวต่อ query ไม่ใช่ต่อแถว
  select btrim(phone) as phone_key
  from public.customers
  where btrim(phone) <> ''
  group by btrim(phone)
  having count(*) > 1
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
  (coalesce(mb.credit_balance, 0) < 0)                                 as negative_credit,
  (coalesce(pb.balance, 0) < 0)                                        as negative_points,

  -- ผูกบัญชีไลน์กับร้านแล้วหรือยัง — ไม่ใช่ "ปัญหา" จึงไม่อยู่ในชุด ISSUES
  -- แต่พนักงานต้องเห็น เพราะลูกค้ากลุ่มนี้จองผ่านไลน์และรับแจ้งเตือนได้
  exists (select 1 from public.line_accounts l
           where l.customer_id = c.id)                                 as has_line
from public.customers c
left join public.member_balances  mb  on mb.customer_id  = c.id
left join public.v_customer_ltv   ltv on ltv.customer_id = c.id
left join public.v_point_balances pb  on pb.customer_id  = c.id;
