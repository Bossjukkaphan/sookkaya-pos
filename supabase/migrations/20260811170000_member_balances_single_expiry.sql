-- เครดิตสมาชิกเปลี่ยนเป็น "กระปุกเดียว หมดอายุพร้อมกัน" (ตัดสินใจ 2026-08-11)
--
-- เดิม: คงเหลือ = credit_added ของก้อนที่ยังไม่หมดอายุ − credit_used ทุกบิลทุกยุค
--       สองข้างคนละเกณฑ์เวลา พอก้อนหมดอายุ ยอดใช้ของก้อนนั้นย้ายไปกินก้อนใหม่
-- แล้วลองแก้ด้วย FIFO ตามวันหมดอายุ (migration 20260811150000/20260811160000) ซึ่งผิดอีกแบบ
--       เพราะจัดสรรโดยไม่ดูวันขาย บิลไปดูดก้อนที่ตอนนั้นลูกค้ายังไม่ได้ซื้อ
--
-- กติกาใหม่: เครดิตของลูกค้าคนหนึ่งคือกระปุกเดียว ไม่แยกก้อน
--   วันหมดอายุ = MAX(expiry_date) → การเติมเงินต่ออายุยอดเก่าให้อัตโนมัติ และไม่มีวันทำให้สั้นลง
--   หมดอายุแล้ว = ใช้ไม่ได้ แต่ยอดไม่หายไป · เติมใหม่เมื่อไหร่ฟื้นทั้งหมดทันที
--   คำถาม "บิลนี้ตัดจากก้อนไหน" จึงหมดความหมาย ไม่ต้องจัดสรรอีกต่อไป
create or replace view public.member_balances
with (security_invoker = true) as
with shop_today as (
  -- เซิร์ฟเวอร์รันเป็น UTC — วันหมดอายุต้องเทียบด้วยวันไทยเสมอ
  select (now() at time zone 'Asia/Bangkok')::date as d
),
topup_agg as (
  select
    mt.customer_id,
    sum(mt.credit_added)  as credit_added,
    sum(mt.bonus_added)   as bonus_added,
    sum(mt.cash_received) as cash_received,
    max(mt.expiry_date)   as last_expiry
  from public.member_topups mt
  group by mt.customer_id
),
used_agg as (
  -- ไม่กรอง credit_used > 0 โดยตั้งใจ — ค่าติดลบคือการคืนเงิน ต้องบวกกลับเข้ายอด
  select sa.customer_id, sum(sa.credit_used) as credit_used
  from public.sales sa
  where sa.customer_id is not null
  group by sa.customer_id
)
-- ต้องคืนทุกคนในตาราง customers ไม่ใช่เฉพาะสมาชิก — หน้า POS พึ่งพาพฤติกรรมนี้
select
  c.id as customer_id,
  c.name,
  c.nickname,
  c.phone,
  -- ปัดสองตำแหน่งกันเศษทศนิยมทำให้ "จ่ายเต็มยอด" ถูกปฏิเสธเพราะขาดไปเศษเสี้ยวสตางค์
  round(coalesce(t.credit_added, 0::numeric) - coalesce(u.credit_used, 0::numeric), 2) as credit_balance,
  coalesce(t.credit_added, 0::numeric)  as credit_granted,
  coalesce(t.bonus_added, 0::numeric)   as bonus_granted,
  coalesce(t.cash_received, 0::numeric) as cash_paid,
  t.last_expiry as next_expiry,
  c.customer_type,
  c.created_at,
  -- ไม่เคยเติมเงิน (NULL) = ใช้ไม่ได้ ไม่ใช่ "ไม่มีวันหมดอายุ"
  -- วันหมดอายุวันนี้พอดี = ยังใช้ได้ทั้งวัน จึงเป็น > ไม่ใช่ >=
  (t.last_expiry is null or s.d > t.last_expiry) as credit_expired
from public.customers c
cross join shop_today s
left join topup_agg t on t.customer_id = c.id
left join used_agg  u on u.customer_id = c.id;
