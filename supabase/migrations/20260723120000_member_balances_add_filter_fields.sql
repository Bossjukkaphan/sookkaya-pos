-- หน้าลูกค้า/สมาชิกต้องกรองตามประเภทและเรียงตามวันที่สมัคร — ตอนนี้ view ไม่มีให้
-- ต้อง join กับ customers เพิ่มอีกรอบในโค้ดหน้าเว็บทุกครั้ง เพิ่ม field ที่นี่ทีเดียวจบ
--
-- ต้องใส่ security_invoker ซ้ำทุกครั้งที่ create or replace เพราะ Postgres ล้าง reloptions ทิ้ง
-- เคยหลุดมาแล้วครั้งหนึ่งจนพนักงานอ่านกำไรทั้งร้านผ่าน REST API ได้
create or replace view public.member_balances
with (security_invoker = true) as
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  coalesce(t.credit_added, 0) - coalesce(s.credit_used, 0) as credit_balance,
  coalesce(t.credit_added, 0)   as credit_granted,
  coalesce(t.bonus_added, 0)    as bonus_granted,
  coalesce(t.cash_received, 0)  as cash_paid,
  t.next_expiry,
  -- ต่อท้ายเสมอ — create or replace view ห้ามเปลี่ยนชื่อ/ตำแหน่งคอลัมน์เดิม
  c.customer_type,
  c.created_at
from public.customers c
left join lateral (
  select
    sum(mt.credit_added)  filter (where mt.expiry_date >= (now() at time zone 'Asia/Bangkok')::date) as credit_added,
    sum(mt.bonus_added)   filter (where mt.expiry_date >= (now() at time zone 'Asia/Bangkok')::date) as bonus_added,
    sum(mt.cash_received) filter (where mt.expiry_date >= (now() at time zone 'Asia/Bangkok')::date) as cash_received,
    min(mt.expiry_date)   filter (where mt.expiry_date >= (now() at time zone 'Asia/Bangkok')::date) as next_expiry
  from public.member_topups mt
  where mt.customer_id = c.id
) t on true
left join lateral (
  select sum(sa.credit_used) as credit_used
  from public.sales sa
  where sa.customer_id = c.id
) s on true;
