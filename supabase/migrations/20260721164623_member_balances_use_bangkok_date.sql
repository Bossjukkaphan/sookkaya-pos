-- view นี้ใช้ CURRENT_DATE ตัดสินว่าเครดิตหมดอายุหรือยัง ซึ่งเป็นวันที่ของ server (UTC)
-- ร้านอยู่ไทย เร็วกว่า UTC 7 ชั่วโมง ช่วง 00:00-07:00 เวลาไทยจึงยังเป็น "เมื่อวาน" ในสายตา DB
-- ผลคือเครดิตที่หมดอายุไปแล้ววันนี้ ยังถูกนับว่าใช้ได้อยู่ทั้งเช้า แล้วหายไปตอนบ่าย
-- (กฎข้อ 2 ของโปรเจกต์: ห้ามใช้เวลาฝั่ง DB ตัดสินอะไรที่เกี่ยวกับ "วันนี้")
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
  t.next_expiry
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
