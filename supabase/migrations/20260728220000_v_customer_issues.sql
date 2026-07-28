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

create view public.v_customer_issues with (security_invoker = true) as
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
  (c.phone is not null and c.phone <> ''
     and exists (select 1 from public.customers o
                  where o.id <> c.id and o.phone = c.phone))   as dup_phone,
  (c.phone is null or c.phone = '')                            as no_phone,
  -- เบอร์ไทยที่ใช้ได้คือ 0 ตามด้วยตัวเลข 8-9 หลัก · นอกนั้นค้นไม่เจอ เท่ากับไม่มีเบอร์
  -- (เจอจริง: "611230256" ของลูกค้าชื่อโอ๋ ขาดเลข 0 หน้า)
  (c.phone is not null and c.phone <> ''
     and c.phone !~ '^0[0-9]{8,9}$')                           as bad_phone,

  -- กลุ่มเงิน: ตัวเลขไม่ตรง ต้องสืบ
  (coalesce(mb.credit_balance, 0) < 0)                         as negative_credit,
  (coalesce(pb.balance, 0) < 0)                                as negative_points
from public.customers c
left join public.member_balances  mb  on mb.customer_id  = c.id
left join public.v_customer_ltv   ltv on ltv.customer_id = c.id
left join public.v_point_balances pb  on pb.customer_id  = c.id;
