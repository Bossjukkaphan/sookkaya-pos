-- next_expiry เคยนับ "ก้อนที่ยังไม่หมดอายุก้อนแรก" โดยไม่เช็คว่าก้อนนั้นเหลือเครดิตจริงไหม
-- FIFO ดูดยอดใช้จากก้อนที่จะหมดอายุก่อนเสมอ ก้อนแรกที่ยังไม่หมดอายุจึงมักเป็นก้อนที่ถูกดูดจนว่างเปล่าพอดี
-- (คุณพิมพ์ 0889469666 ถือเครดิต 5,420 บาท แต่ระบบบอกว่าจะหมดอายุ 2026-10-12
--  ทั้งที่ก้อนนั้นถูกใช้หมดแล้ว เครดิตจริงอยู่ในก้อนที่หมดอายุ 2027-01-21)
--
-- แก้ด้วยการเติมเงื่อนไข credit_added - absorbed > 0 เข้าไปใน FILTER ของ next_expiry
-- ก้อนที่ว่างเปล่าจะไม่ถูกนับ ลูกค้าที่เครดิตหมดทุกก้อนจะได้ next_expiry เป็น NULL แทนวันที่หลอกๆ
--
-- ตรวจกับ production แล้ว: มีลูกค้า 11 คนที่ next_expiry เปลี่ยนไป (8 คนถือเครดิตอยู่ 3 คนเครดิต 0
-- ได้ NULL แทนวันหลอก) และหลังแก้ ไม่มีลูกค้าที่ถือเครดิต > 0 คนไหนได้วันที่ชี้ไปก้อนที่ว่างเปล่าอีกเลย
create or replace view public.member_balances
with (security_invoker = true) as
with shop_today as (
  -- เซิร์ฟเวอร์รันเป็น UTC — ต้องเทียบวันหมดอายุด้วยวันไทยเสมอ
  select (now() at time zone 'Asia/Bangkok')::date as d
),
used as (
  select sa.customer_id, sum(sa.credit_used) as used
  from public.sales sa
  where sa.credit_used > 0 and sa.customer_id is not null
  group by sa.customer_id
),
alloc as (
  -- absorbed = ส่วนของยอดใช้รวมที่ตกลงมาถึงก้อนนี้ หลังก้อนก่อนหน้าดูดไปเต็มที่แล้ว
  select
    mt.customer_id,
    mt.expiry_date,
    mt.credit_added,
    mt.bonus_added,
    mt.cash_received,
    least(
      mt.credit_added,
      greatest(
        coalesce(u.used, 0) - coalesce(sum(mt.credit_added) over (
          partition by mt.customer_id
          order by mt.expiry_date, mt.id
          rows between unbounded preceding and 1 preceding
        ), 0),
        0
      )
    ) as absorbed
  from public.member_topups mt
  left join used u on u.customer_id = mt.customer_id
),
agg as (
  select
    a.customer_id,
    sum(a.credit_added - a.absorbed) filter (where a.expiry_date >= t.d) as credit_balance,
    sum(a.credit_added)   filter (where a.expiry_date >= t.d) as credit_granted,
    sum(a.bonus_added)    filter (where a.expiry_date >= t.d) as bonus_granted,
    sum(a.cash_received)  filter (where a.expiry_date >= t.d) as cash_paid,
    -- ก้อนแรกที่ยังไม่หมดอายุ "และ" ยังมีเครดิตเหลือจริง (ไม่ใช่แค่ยังไม่หมดอายุ)
    min(a.expiry_date)    filter (where a.expiry_date >= t.d and a.credit_added - a.absorbed > 0) as next_expiry
  from alloc a
  cross join shop_today t
  group by a.customer_id
)
-- ต้องคืนทุกคนในตาราง customers ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  coalesce(g.credit_balance, 0::numeric) as credit_balance,
  coalesce(g.credit_granted, 0::numeric) as credit_granted,
  coalesce(g.bonus_granted, 0::numeric) as bonus_granted,
  coalesce(g.cash_paid, 0::numeric) as cash_paid,
  g.next_expiry,
  c.customer_type,
  c.created_at
from public.customers c
left join agg g on g.customer_id = c.id;
