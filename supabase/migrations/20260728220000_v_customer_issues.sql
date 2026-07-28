-- ธงบอกปัญหาข้อมูลลูกค้า — ที่เดียวที่ตัดสินว่าอะไรคือ "ปัญหา"
--
-- ทำไมต้องคำนวณใน SQL ไม่ใช่ในหน้าเว็บ: PostgREST คืนสูงสุด 1,000 แถวต่อครั้ง
-- แต่ลูกค้ามี 1,046 คนแล้ว ถ้าดึงมานับเองในหน้าเว็บ คนที่เรียงท้ายสุดจะหายเงียบ
-- แล้วเลขบนชิพจะต่ำกว่าความจริงโดยไม่มีอะไรเตือน (กับดักเดียวกับที่หน้าสมาชิกเคยเจอ)
--
-- ที่มา: ตรวจข้ามระบบ 28/7/2569 เจอลูกค้า 156 ระเบียนที่มีปัญหาโดยไม่มีอะไรในระบบบอก
-- เคสตัวอย่างคือ "กล้วย/สงกรานต์" คนเดียวกันแตกเป็นสองระเบียน แพ็กอยู่ระเบียนหนึ่ง
-- บิลไปลงอีกระเบียน เครดิตเลยติดลบ 2,380 โดยไม่มีใครรู้จนไปขุด
--
-- security_invoker = true บังคับ RLS ตามสิทธิ์ผู้เรียก — ห้ามลืม
-- ชุดตรวจ views_without_security_invoker จะ FAIL ทันทีถ้าหลุด
--
-- เพิ่มธงตัวใหม่ที่นี่แล้ว ต้องไปเพิ่ม IssueKey กับ ISSUES ที่ src/lib/customer-issues.ts ด้วย
-- ไม่มีอะไรบังคับได้อัตโนมัติ — ลืมแล้วธงใหม่จะไม่มีวันโผล่บนหน้าเว็บ โดย build ยังเขียวปกติ

create or replace view public.v_customer_issues with (security_invoker = true) as
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
  --
  -- btrim(null) คืน null และ null <> '' คืน null ซึ่ง SQL ถือว่าไม่จริง จึงไม่ต้องเช็ค is not null ซ้ำ
  (btrim(c.phone) <> ''
     and exists (select 1 from public.customers o
                  where o.id <> c.id
                    and btrim(o.phone) = btrim(c.phone)))      as dup_phone,
  (c.phone is null or btrim(c.phone) = '')                     as no_phone,
  -- เบอร์ไทยที่ใช้ได้คือ 0 ตามด้วยตัวเลข 8-9 หลัก · นอกนั้นค้นไม่เจอ เท่ากับไม่มีเบอร์
  -- (เจอจริง: "611230256" ของลูกค้าชื่อโอ๋ ขาดเลข 0 หน้า)
  -- เบอร์ที่เป็นช่องว่างล้วนจะตกไปเป็น no_phone ไม่ใช่ bad_phone ซึ่งตรงความหมายกว่า
  --
  -- ต้อง coalesce เพราะคนไม่มีเบอร์จะได้ null (null and null = null) ไม่ใช่ false
  -- ธงต้องเป็น true/false เสมอ ไม่งั้นฝั่งเรียกที่กรองด้วย eq(false) จะทิ้ง 73 คนนี้หายไปเงียบๆ
  coalesce(btrim(c.phone) <> ''
     and btrim(c.phone) !~ '^0[0-9]{8,9}$', false)             as bad_phone,

  -- กลุ่มเงิน: ตัวเลขไม่ตรง ต้องสืบ
  (coalesce(mb.credit_balance, 0) < 0)                         as negative_credit,
  (coalesce(pb.balance, 0) < 0)                                as negative_points,

  -- ผูกบัญชีไลน์กับร้านแล้วหรือยัง — ไม่ใช่ "ปัญหา" จึงไม่อยู่ในชุด ISSUES
  -- แต่พนักงานต้องเห็น เพราะลูกค้ากลุ่มนี้จองผ่านไลน์และรับแจ้งเตือนได้
  -- (ป้ายนี้มีในหน้าเดิมอยู่แล้ว ตอนเปลี่ยนเป็นตารางเคยทำหายไปหนึ่งรอบ)
  exists (select 1 from public.line_accounts l
           where l.customer_id = c.id)                          as has_line
from public.customers c
left join public.member_balances  mb  on mb.customer_id  = c.id
left join public.v_customer_ltv   ltv on ltv.customer_id = c.id
left join public.v_point_balances pb  on pb.customer_id  = c.id;
