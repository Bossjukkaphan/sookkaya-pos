-- ยอดเครดิตคงเหลือเคยคิดจาก "ก้อนที่ยังไม่หมดอายุ ลบ ยอดใช้ทุกยุค" สองข้างคนละเกณฑ์เวลา
-- พอก้อนหมดอายุ ยอดที่ให้หลุดจากสมการแต่ยอดใช้ยังอยู่ ยอดใช้ของก้อนเก่าจึงย้ายไปกิน
-- ก้อนใหม่ที่ยังไม่หมดอายุ (คุณพิมพ์ 0889469666 จะเหลือ -580 ทั้งที่มีสิทธิ์จริง 5,420 ในวันที่ 13 ต.ค. 2026)
--
-- แก้ด้วยการจัดสรรยอดใช้ลงก้อนแบบ FIFO เรียงตามวันหมดอายุ ก้อนที่จะหมดก่อนถูกใช้ก่อน
-- ทั้งยอดที่ให้และยอดที่ใช้ของก้อนเดียวกันจึงหายไปพร้อมกันตอนหมดอายุ
--
-- ณ วันที่เขียน ยังไม่มีก้อนใดหมดอายุ (ก้อนแรก 2026-10-12) ผลลัพธ์วันนี้จึงต้องเท่าเดิมเป๊ะ
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
    min(a.expiry_date)    filter (where a.expiry_date >= t.d) as next_expiry
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
